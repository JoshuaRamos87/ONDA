/**
 * ONDA — Live Audio Stream Engine
 *
 * Handles direct Icecast/Shoutcast audio streams (MP3, AAC, OGG, FLAC) via HTML5 <audio>
 * AND adaptive HLS (.m3u8) streams via hls.js (with native Safari HLS support).
 *
 * Edge-case hardening:
 * - Playback session token ignores stale async/HLS/error events during rapid station switching.
 * - 12-second connection watchdog prevents getting stuck on "TUNING" on blackholed servers.
 * - Smart candidate URL list prioritizes HTTPS streams on HTTPS pages (e.g., GitHub Pages)
 *   so an HTTP url_resolved still falls back to an HTTPS station.url before failing.
 * - Pausing a live broadcast tears down the stale buffer; resuming reconnects to the live edge.
 * - Separate 1-second tick channel prevents DOM churn and keeps CSS animations smooth.
 */

import { radioApi } from './api.js';

const CONNECT_TIMEOUT_MS = 12000;

export class RadioPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'none';

    this.hls = null;
    this.currentStation = null;
    this.status = 'idle'; // idle | loading | playing | paused | error
    this.errorMessage = '';

    this.sessionId = 0;
    this.candidateUrls = [];
    this.candidateIndex = 0;
    this.connectTimer = null;

    this.elapsedSeconds = 0;
    this.elapsedInterval = null;

    this.sleepEndTime = null;
    this.sleepInterval = null;
    this.sleepMinutes = 0;

    this.listeners = new Set();
    this.tickListeners = new Set();

    this.vuCanvas = null;
    this.vuRaf = null;
    this.vuBars = new Array(14).fill(0.08);
    this.vuTargets = new Array(14).fill(0.08);

    this.bindAudioEvents();
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  onTick(callback) {
    this.tickListeners.add(callback);
    return () => this.tickListeners.delete(callback);
  }

  emit() {
    const snapshot = this.getState();
    for (const cb of this.listeners) {
      cb(snapshot);
    }
  }

  emitTick() {
    const tick = {
      elapsedSeconds: this.elapsedSeconds,
      sleepRemainingMs: this.sleepEndTime ? Math.max(0, this.sleepEndTime - Date.now()) : 0,
      sleepMinutes: this.sleepMinutes,
    };
    for (const cb of this.tickListeners) {
      cb(tick);
    }
  }

  getState() {
    return {
      station: this.currentStation,
      status: this.status,
      errorMessage: this.errorMessage,
      volume: this.audio.volume,
      muted: this.audio.muted,
      elapsedSeconds: this.elapsedSeconds,
      sleepRemainingMs: this.sleepEndTime ? Math.max(0, this.sleepEndTime - Date.now()) : 0,
      sleepMinutes: this.sleepMinutes,
    };
  }

  setVolume(value, muted = false) {
    const clamped = Math.max(0, Math.min(1, Number(value)));
    this.audio.volume = Number.isFinite(clamped) ? clamped : 0.8;
    this.audio.muted = Boolean(muted);
    this.emit();
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.emit();
    return this.audio.muted;
  }

  clearConnectTimeout() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  armConnectTimeout(sessionId) {
    this.clearConnectTimeout();
    this.connectTimer = setTimeout(() => {
      if (sessionId !== this.sessionId || this.status !== 'loading') return;
      this.handlePlaybackFailure(sessionId, 'timed out');
    }, CONNECT_TIMEOUT_MS);
  }

  bindAudioEvents() {
    this.audio.addEventListener('playing', () => {
      if (!this.currentStation || this.status === 'paused' || this.status === 'idle') return;
      this.clearConnectTimeout();
      this.status = 'playing';
      this.errorMessage = '';
      this.startTimer();
      this.updateMediaSessionState('playing');
      this.emit();
    });

    this.audio.addEventListener('waiting', () => {
      if (this.currentStation && this.status === 'playing') {
        this.status = 'loading';
        this.armConnectTimeout(this.sessionId);
        this.emit();
      }
    });

    this.audio.addEventListener('stalled', () => {
      if (this.currentStation && this.status === 'loading') {
        this.armConnectTimeout(this.sessionId);
      }
    });

    this.audio.addEventListener('pause', () => {
      if (this.status === 'playing') {
        this.clearConnectTimeout();
        this.status = 'paused';
        this.stopTimer();
        this.updateMediaSessionState('paused');
        this.emit();
      }
    });

    this.audio.addEventListener('error', () => {
      if (!this.currentStation || this.status === 'paused' || this.status === 'idle') return;
      // Ignore error fired when we intentionally clear src on pause/stop
      if (!this.audio.getAttribute('src') && !this.hls) return;
      this.handlePlaybackFailure(this.sessionId);
    });
  }

  destroyHls() {
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        // Ignore teardown errors
      }
      this.hls = null;
    }
  }

  teardownStream() {
    this.clearConnectTimeout();
    this.destroyHls();
    this.audio.pause();
    this.audio.removeAttribute('src');
    try {
      this.audio.load();
    } catch {
      // Ignore
    }
  }

  /**
   * Build ordered candidate URLs for a station, preferring HTTPS on HTTPS origins.
   */
  buildCandidateUrls(station) {
    const rawList = [station.url_resolved, station.url]
      .map((u) => (u ? String(u).trim() : ''))
      .filter((u) => /^https?:\/\//i.test(u));

    const unique = Array.from(new Set(rawList));
    const isHttpsPage = window.location.protocol === 'https:';

    if (!isHttpsPage) {
      return { playable: unique, blockedHttpOnly: false };
    }

    const httpsUrls = unique.filter((u) => u.toLowerCase().startsWith('https://'));
    if (httpsUrls.length > 0) {
      return { playable: httpsUrls, blockedHttpOnly: false };
    }

    return { playable: [], blockedHttpOnly: unique.length > 0 };
  }

  /**
   * Play a station object from the Radio Browser API.
   * Pass { forcePlay: true } to ensure an already-playing station stays playing instead of pausing.
   */
  async playStation(station, { forcePlay = false } = {}) {
    if (!station) return;

    const isSame =
      this.currentStation && this.currentStation.stationuuid === station.stationuuid;

    if (isSame && this.status === 'playing') {
      if (!forcePlay) this.pause();
      return;
    }

    if (isSame && this.status === 'paused') {
      this.resume();
      return;
    }

    if (isSame && this.status === 'loading') {
      if (!forcePlay) this.pause();
      return;
    }

    const sessionId = ++this.sessionId;
    this.teardownStream();
    this.stopTimer();
    this.elapsedSeconds = 0;
    this.currentStation = station;
    this.status = 'loading';
    this.errorMessage = '';
    this.emit();
    this.emitTick();

    this.updateMediaSessionMetadata(station);
    radioApi.registerClick(station.stationuuid);

    const { playable, blockedHttpOnly } = this.buildCandidateUrls(station);

    if (playable.length === 0) {
      if (blockedHttpOnly) {
        this.failWithMessage(
          sessionId,
          'Blocked by browser mixed-content security (HTTP-only stream on an HTTPS site). Keep "HTTPS only" enabled or open the station site.'
        );
      } else {
        this.failWithMessage(sessionId, 'This station does not provide a valid stream URL.');
      }
      return;
    }

    this.candidateUrls = playable;
    this.candidateIndex = 0;
    await this.loadUrl(this.candidateUrls[0], station, sessionId);
  }

  async loadUrl(streamUrl, station, sessionId) {
    if (sessionId !== this.sessionId) return;

    this.armConnectTimeout(sessionId);

    const isHls =
      Number(station.hls) === 1 || /\.m3u8(\?.*)?$/i.test(streamUrl);

    if (isHls) {
      // Safari / iOS supports HLS natively
      if (this.audio.canPlayType('application/vnd.apple.mpegurl')) {
        this.audio.src = streamUrl;
        this.tryPlay(sessionId);
        return;
      }

      // Chromium / Firefox via hls.js
      if (typeof window.Hls !== 'undefined' && window.Hls.isSupported()) {
        this.destroyHls();
        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
        });
        this.hls = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(this.audio);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          if (sessionId !== this.sessionId) return;
          this.tryPlay(sessionId);
        });
        hls.on(window.Hls.Events.ERROR, (_event, data) => {
          if (sessionId !== this.sessionId) return;
          if (data && data.fatal) {
            this.handlePlaybackFailure(sessionId);
          }
        });
        return;
      }
    }

    this.audio.src = streamUrl;
    this.audio.load();
    this.tryPlay(sessionId);
  }

  async tryPlay(sessionId) {
    try {
      await this.audio.play();
    } catch (err) {
      if (sessionId !== this.sessionId) return;
      if (err && err.name === 'AbortError') {
        return;
      }
      if (err && err.name === 'NotAllowedError') {
        this.clearConnectTimeout();
        this.status = 'paused';
        this.errorMessage = 'Click Play to start audio (browser autoplay policy).';
        this.emit();
        return;
      }
      this.handlePlaybackFailure(sessionId);
    }
  }

  handlePlaybackFailure(sessionId, reason = '') {
    if (sessionId !== this.sessionId || !this.currentStation) return;

    this.clearConnectTimeout();
    this.candidateIndex += 1;

    if (this.candidateIndex < this.candidateUrls.length) {
      this.destroyHls();
      this.loadUrl(this.candidateUrls[this.candidateIndex], this.currentStation, sessionId);
      return;
    }

    this.teardownStream();
    this.stopTimer();
    const msg =
      reason === 'timed out'
        ? 'Connection timed out — this broadcaster is taking too long to respond.'
        : 'Unable to tune into this stream right now — the broadcaster may be offline, geo-restricted, or blocking browser playback.';
    this.failWithMessage(sessionId, msg);
  }

  failWithMessage(sessionId, msg) {
    if (sessionId !== this.sessionId) return;
    this.clearConnectTimeout();
    this.status = 'error';
    this.errorMessage = msg;
    this.stopTimer();
    this.updateMediaSessionState('paused');
    this.emit();
  }

  /**
   * Pause live stream cleanly by releasing the stream socket so resuming later jumps to the live edge.
   */
  pause() {
    this.sessionId += 1;
    this.teardownStream();
    this.status = 'paused';
    this.stopTimer();
    this.updateMediaSessionState('paused');
    this.emit();
  }

  /**
   * Reconnect cleanly to the live broadcast edge.
   */
  resume() {
    if (!this.currentStation) return;
    const station = this.currentStation;
    const sessionId = ++this.sessionId;
    this.teardownStream();
    this.status = 'loading';
    this.errorMessage = '';
    this.emit();

    const { playable, blockedHttpOnly } = this.buildCandidateUrls(station);
    if (playable.length === 0) {
      this.failWithMessage(
        sessionId,
        blockedHttpOnly
          ? 'Blocked by browser mixed-content security (HTTP-only stream on an HTTPS site).'
          : 'This station does not provide a valid stream URL.'
      );
      return;
    }

    this.candidateUrls = playable;
    this.candidateIndex = 0;
    this.loadUrl(this.candidateUrls[0], station, sessionId);
  }

  togglePlayPause() {
    if (!this.currentStation) return;
    if (this.status === 'playing' || this.status === 'loading') {
      this.pause();
    } else {
      this.resume();
    }
  }

  stop() {
    this.sessionId += 1;
    this.teardownStream();
    this.stopTimer();
    this.elapsedSeconds = 0;
    this.status = 'idle';
    this.errorMessage = '';
    this.updateMediaSessionState('none');
    this.emit();
    this.emitTick();
  }

  startTimer() {
    if (this.elapsedInterval) return;
    this.elapsedInterval = setInterval(() => {
      if (this.status === 'playing') {
        this.elapsedSeconds += 1;
        this.emitTick();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
    }
  }

  setSleepTimer(minutes) {
    if (this.sleepInterval) {
      clearInterval(this.sleepInterval);
      this.sleepInterval = null;
    }
    const mins = Number(minutes) || 0;
    this.sleepMinutes = mins;

    if (mins <= 0) {
      this.sleepEndTime = null;
      this.emit();
      this.emitTick();
      return;
    }

    this.sleepEndTime = Date.now() + mins * 60 * 1000;
    this.sleepInterval = setInterval(() => {
      if (!this.sleepEndTime) return;
      if (Date.now() >= this.sleepEndTime) {
        this.sleepEndTime = null;
        this.sleepMinutes = 0;
        clearInterval(this.sleepInterval);
        this.sleepInterval = null;
        this.pause();
        this.emitTick();
      } else {
        this.emitTick();
      }
    }, 1000);
    this.emit();
    this.emitTick();
  }

  bindMediaSessionHandlers({ onPrev, onNext }) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => this.resume());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('stop', () => this.stop());
      if (onPrev) navigator.mediaSession.setActionHandler('previoustrack', onPrev);
      if (onNext) navigator.mediaSession.setActionHandler('nexttrack', onNext);
    } catch {
      // Some browsers restrict specific action handlers
    }
  }

  updateMediaSessionMetadata(station) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      const artwork =
        station.favicon && station.favicon.startsWith('https://')
          ? [{ src: station.favicon, sizes: '192x192', type: 'image/png' }]
          : [];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name || 'ONDA World Radio',
        artist:
          [station.country, station.tags?.split(',')[0]].filter(Boolean).join(' · ') || 'Live Radio',
        album: 'ONDA Broadcast Tuner',
        artwork,
      });
    } catch {
      // Ignore metadata errors
    }
  }

  updateMediaSessionState(state) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      // Ignore
    }
  }

  attachVuCanvas(canvas) {
    this.vuCanvas = canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    const render = () => {
      frame++;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const isPlaying = this.status === 'playing' && !this.audio.muted && this.audio.volume > 0.01;
      const isLoading = this.status === 'loading';
      const energy = isPlaying ? 0.35 + this.audio.volume * 0.65 : 0;

      const count = this.vuBars.length;
      const gap = 3;
      const barW = Math.floor((width - gap * (count - 1)) / count);

      if (frame % 6 === 0) {
        for (let i = 0; i < count; i++) {
          if (isPlaying) {
            const centerBias = 1 - Math.abs(i - (count - 1) / 2) / (count * 0.72);
            this.vuTargets[i] = Math.min(
              1,
              Math.max(0.14, (Math.random() * 0.85 + 0.15) * centerBias * energy)
            );
          } else if (isLoading) {
            const wave = (Math.sin(frame * 0.14 + i * 0.55) + 1) * 0.25 + 0.12;
            this.vuTargets[i] = wave;
          } else {
            this.vuTargets[i] = 0.09;
          }
        }
      }

      for (let i = 0; i < count; i++) {
        this.vuBars[i] += (this.vuTargets[i] - this.vuBars[i]) * 0.22;
        const barH = Math.max(2, Math.round(this.vuBars[i] * height));
        const x = i * (barW + gap);
        const y = height - barH;

        if (isPlaying) {
          ctx.fillStyle = this.vuBars[i] > 0.78 ? '#ff5733' : '#e5dfd3';
        } else if (isLoading) {
          ctx.fillStyle = '#f6b73c';
        } else {
          ctx.fillStyle = 'rgba(229, 223, 211, 0.24)';
        }

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, barW, barH, 1.5);
        } else {
          ctx.rect(x, y, barW, barH);
        }
        ctx.fill();
      }

      this.vuRaf = requestAnimationFrame(render);
    };

    if (this.vuRaf) cancelAnimationFrame(this.vuRaf);
    this.vuRaf = requestAnimationFrame(render);
  }
}

export const radioPlayer = new RadioPlayer();
