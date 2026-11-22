/**
 * ONDA — Live Audio Stream Engine
 *
 * Handles direct Icecast/Shoutcast audio streams (MP3, AAC, OGG, FLAC) via a DOM-mounted
 * HTML5 <audio playsinline> element AND adaptive HLS (.m3u8) streams via hls.js / native Safari HLS.
 *
 * Mobile & PWA Background Playback Hardening:
 * - Preserves audio.src on pause() so Android Chrome keeps the notification shade & lock-screen
 *   player card alive; resume() cleanly jumps back to the live broadcast edge.
 * - Automatic exponential-backoff reconnect on unexpected stream drops (ended, error, stalls)
 *   plus automatic recovery when the device regains connectivity (window 'online' event).
 * - Built-in hls.js network/media error recovery before falling back or reconnecting.
 * - Background-aware stall watchdog (longer tolerance when document.hidden).
 * - Guaranteed ONDA PNG fallback artwork in MediaSession metadata.
 * - Suspends VU canvas animation while document.hidden to minimize background battery/CPU usage.
 */

import { radioApi } from './api.js';

const FOREGROUND_TIMEOUT_MS = 14000;
const BACKGROUND_TIMEOUT_MS = 28000;
const RECONNECT_DELAYS_MS = [1500, 3000, 6000, 12000];
const LIVE_RECONNECT_PAUSE_THRESHOLD_MS = 3000;

export class RadioPlayer {
  constructor() {
    this.audio = this.createMountedAudioElement();

    this.hls = null;
    this.currentStation = null;
    this.status = 'idle'; // idle | loading | playing | paused | error
    this.errorMessage = '';

    this.sessionId = 0;
    this.shouldBePlaying = false;
    this.pausedAt = 0;

    this.candidateUrls = [];
    this.candidateIndex = 0;
    this.connectTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.hlsNetworkRecoveries = 0;
    this.hlsMediaRecoveries = 0;

    this.elapsedSeconds = 0;
    this.elapsedInterval = null;

    this.sleepEndTime = null;
    this.sleepInterval = null;
    this.sleepMinutes = 0;

    this.listeners = new Set();
    this.tickListeners = new Set();

    this.vuCanvas = null;
    this.vuRaf = null;
    this.vuRenderFn = null;
    this.vuBars = new Array(14).fill(0.08);
    this.vuTargets = new Array(14).fill(0.08);

    this.bindAudioEvents();
    this.bindLifecycleEvents();
  }

  /**
   * Mount a hidden <audio playsinline> element in the DOM for stronger Android Chrome / WebAPK
   * background audio and MediaSession persistence compared to a detached Audio() instance.
   */
  createMountedAudioElement() {
    let audio;
    if (typeof document !== 'undefined' && document.createElement) {
      audio = document.createElement('audio');
      audio.id = 'onda-audio-engine';
      audio.preload = 'none';
      audio.playsInline = true;
      audio.setAttribute('playsinline', '');
      audio.style.display = 'none';
      if (document.body) {
        document.body.appendChild(audio);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (!audio.isConnected && document.body) {
            document.body.appendChild(audio);
          }
        });
      }
    } else {
      audio = new Audio();
      audio.preload = 'none';
    }
    return audio;
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

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  armConnectTimeout(sessionId) {
    this.clearConnectTimeout();
    const timeoutMs =
      typeof document !== 'undefined' && document.hidden
        ? BACKGROUND_TIMEOUT_MS
        : FOREGROUND_TIMEOUT_MS;

    this.connectTimer = setTimeout(() => {
      if (sessionId !== this.sessionId || !this.shouldBePlaying || this.status !== 'loading') {
        return;
      }
      this.handlePlaybackFailure(sessionId, 'timed out');
    }, timeoutMs);
  }

  bindAudioEvents() {
    this.audio.addEventListener('playing', () => {
      if (!this.currentStation || !this.shouldBePlaying) return;
      this.clearConnectTimeout();
      this.clearReconnectTimer();
      this.reconnectAttempt = 0;
      this.hlsNetworkRecoveries = 0;
      this.hlsMediaRecoveries = 0;
      this.status = 'playing';
      this.errorMessage = '';
      this.startTimer();
      this.updateMediaSessionState('playing');
      this.emit();
    });

    this.audio.addEventListener('waiting', () => {
      if (this.currentStation && this.shouldBePlaying && this.status === 'playing') {
        this.status = 'loading';
        this.armConnectTimeout(this.sessionId);
        this.emit();
      }
    });

    this.audio.addEventListener('stalled', () => {
      if (this.currentStation && this.shouldBePlaying && this.status === 'loading') {
        this.armConnectTimeout(this.sessionId);
      }
    });

    // Live radio streams should never "end"; an 'ended' event means the server dropped the socket
    this.audio.addEventListener('ended', () => {
      if (!this.currentStation || !this.shouldBePlaying) return;
      this.scheduleAutoReconnect(this.sessionId, 'stream ended');
    });

    // Reflect external OS pauses (e.g., Android Audio Focus taken by another app or headset unplug)
    this.audio.addEventListener('pause', () => {
      if (this.status === 'playing') {
        this.shouldBePlaying = false;
        this.pausedAt = Date.now();
        this.clearConnectTimeout();
        this.clearReconnectTimer();
        if (this.hls) {
          try {
            this.hls.stopLoad();
          } catch {
            // Ignore
          }
        }
        this.status = 'paused';
        this.stopTimer();
        this.updateMediaSessionState('paused');
        this.emit();
      }
    });

    this.audio.addEventListener('error', () => {
      if (!this.currentStation || !this.shouldBePlaying) return;
      if (!this.audio.getAttribute('src') && !this.hls) return;
      this.handlePlaybackFailure(this.sessionId);
    });
  }

  bindLifecycleEvents() {
    if (typeof window === 'undefined') return;

    // Automatically recover playback after Wi-Fi <-> 5G handoff or returning from a dead zone
    window.addEventListener('online', () => {
      if (!this.currentStation || !this.shouldBePlaying) return;
      if (this.status === 'error' || this.status === 'loading') {
        this.reconnectAttempt = 0;
        this.clearReconnectTimer();
        this.reconnectLive(this.sessionId);
      }
    });

    // Pause VU animation while backgrounded to save Pixel battery and prevent OS process eviction
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.vuRenderFn) return;
        if (document.hidden) {
          if (this.vuRaf) {
            cancelAnimationFrame(this.vuRaf);
            this.vuRaf = null;
          }
        } else if (!this.vuRaf) {
          this.vuRaf = requestAnimationFrame(this.vuRenderFn);
        }
      });
    }
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

  /**
   * Full teardown used only for stop() or unrecoverable station errors — NEVER on pause(),
   * because stripping audio.src causes Android Chrome to dismiss the notification shade card.
   */
  teardownStream() {
    this.clearConnectTimeout();
    this.clearReconnectTimer();
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
    this.clearConnectTimeout();
    this.clearReconnectTimer();
    this.destroyHls();
    this.stopTimer();

    this.shouldBePlaying = true;
    this.pausedAt = 0;
    this.reconnectAttempt = 0;
    this.hlsNetworkRecoveries = 0;
    this.hlsMediaRecoveries = 0;
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
      this.shouldBePlaying = false;
      this.teardownStream();
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
    if (sessionId !== this.sessionId || !this.shouldBePlaying) return;

    this.armConnectTimeout(sessionId);

    const isHls =
      Number(station.hls) === 1 || /\.m3u8(\?.*)?$/i.test(streamUrl);

    if (isHls) {
      // Safari / iOS supports HLS natively
      if (this.audio.canPlayType('application/vnd.apple.mpegurl')) {
        this.destroyHls();
        this.audio.src = streamUrl;
        this.tryPlay(sessionId);
        return;
      }

      // Chromium / Firefox via hls.js with mobile-resilient buffering & recovery
      if (typeof window.Hls !== 'undefined' && window.Hls.isSupported()) {
        this.destroyHls();
        this.hlsNetworkRecoveries = 0;
        this.hlsMediaRecoveries = 0;
        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          backBufferLength: 30,
          manifestLoadingMaxRetry: 4,
          levelLoadingMaxRetry: 4,
          fragLoadingMaxRetry: 4,
        });
        this.hls = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(this.audio);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          if (sessionId !== this.sessionId || !this.shouldBePlaying) return;
          this.tryPlay(sessionId);
        });
        hls.on(window.Hls.Events.ERROR, (_event, data) => {
          if (sessionId !== this.sessionId || !this.shouldBePlaying) return;
          if (!data || !data.fatal) return;

          if (
            data.type === window.Hls.ErrorTypes.NETWORK_ERROR &&
            this.hlsNetworkRecoveries < 2
          ) {
            this.hlsNetworkRecoveries += 1;
            this.status = 'loading';
            this.armConnectTimeout(sessionId);
            this.emit();
            hls.startLoad();
            return;
          }

          if (
            data.type === window.Hls.ErrorTypes.MEDIA_ERROR &&
            this.hlsMediaRecoveries < 2
          ) {
            this.hlsMediaRecoveries += 1;
            this.status = 'loading';
            this.armConnectTimeout(sessionId);
            this.emit();
            hls.recoverMediaError();
            return;
          }

          this.handlePlaybackFailure(sessionId);
        });
        return;
      }
    }

    // Assign directly without removing src first so Android keeps the active MediaSession alive
    this.destroyHls();
    this.audio.src = streamUrl;
    this.audio.load();
    this.tryPlay(sessionId);
  }

  async tryPlay(sessionId) {
    try {
      await this.audio.play();
    } catch (err) {
      if (sessionId !== this.sessionId || !this.shouldBePlaying) return;
      if (err && err.name === 'AbortError') {
        return;
      }
      if (err && err.name === 'NotAllowedError') {
        this.shouldBePlaying = false;
        this.clearConnectTimeout();
        this.status = 'paused';
        this.errorMessage = 'Click Play to start audio (browser autoplay policy).';
        this.updateMediaSessionState('paused');
        this.emit();
        return;
      }
      this.handlePlaybackFailure(sessionId);
    }
  }

  /**
   * Reconnect cleanly to the current station's live stream URL without breaking MediaSession.
   */
  reconnectLive(sessionId) {
    if (sessionId !== this.sessionId || !this.currentStation || !this.shouldBePlaying) return;
    const { playable } = this.buildCandidateUrls(this.currentStation);
    if (playable.length === 0) return;

    this.candidateUrls = playable;
    this.candidateIndex = 0;
    this.status = 'loading';
    this.errorMessage = '';
    this.emit();
    this.loadUrl(this.candidateUrls[0], this.currentStation, sessionId);
  }

  /**
   * Retry transient mid-stream drops with exponential backoff (1.5s -> 3s -> 6s -> 12s).
   * Keeps audio.src attached so the Android notification card remains available.
   */
  scheduleAutoReconnect(sessionId, reason = '') {
    if (sessionId !== this.sessionId || !this.currentStation || !this.shouldBePlaying) return;

    if (this.reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
      const msg =
        reason === 'timed out'
          ? 'Connection timed out — tap Play to retry or switch to the next station.'
          : 'Stream connection lost — tap Play to reconnect or try the next station.';
      this.failWithMessage(sessionId, msg);
      return;
    }

    const delayMs = RECONNECT_DELAYS_MS[this.reconnectAttempt];
    this.reconnectAttempt += 1;
    this.clearConnectTimeout();
    this.clearReconnectTimer();
    this.status = 'loading';
    this.errorMessage = '';
    this.emit();

    this.reconnectTimer = setTimeout(() => {
      if (sessionId !== this.sessionId || !this.shouldBePlaying) return;
      this.reconnectLive(sessionId);
    }, delayMs);
  }

  handlePlaybackFailure(sessionId, reason = '') {
    if (sessionId !== this.sessionId || !this.currentStation || !this.shouldBePlaying) return;

    this.clearConnectTimeout();
    this.candidateIndex += 1;

    if (this.candidateIndex < this.candidateUrls.length) {
      this.destroyHls();
      this.loadUrl(this.candidateUrls[this.candidateIndex], this.currentStation, sessionId);
      return;
    }

    // If this station was already playing (transient mobile drop), auto-reconnect with backoff!
    if (this.elapsedSeconds > 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      this.scheduleAutoReconnect(sessionId, reason);
      return;
    }

    // Initial tune failed on all candidate URLs — report error cleanly without wiping MediaSession
    this.destroyHls();
    this.audio.pause();
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
    this.clearReconnectTimer();
    this.status = 'error';
    this.errorMessage = msg;
    this.stopTimer();
    this.updateMediaSessionState('paused');
    this.emit();
  }

  /**
   * Pause playback while keeping audio.src intact so the Android notification shade
   * and lock-screen player card remain visible for one-tap resume.
   */
  pause() {
    this.sessionId += 1;
    this.shouldBePlaying = false;
    this.pausedAt = Date.now();
    this.clearConnectTimeout();
    this.clearReconnectTimer();

    if (this.hls) {
      try {
        this.hls.stopLoad();
      } catch {
        // Ignore
      }
    }

    this.audio.pause();
    this.status = 'paused';
    this.stopTimer();
    this.updateMediaSessionState('paused');
    this.emit();
  }

  /**
   * Resume playback. If paused briefly (< 3s), resumes instantly; otherwise reconnects cleanly
   * to the live broadcast edge without stripping audio.src first.
   */
  resume() {
    if (!this.currentStation) return;
    const station = this.currentStation;
    const sessionId = ++this.sessionId;
    const pauseDuration = this.pausedAt ? Date.now() - this.pausedAt : Infinity;

    this.shouldBePlaying = true;
    this.pausedAt = 0;
    this.reconnectAttempt = 0;
    this.clearConnectTimeout();
    this.clearReconnectTimer();
    this.status = 'loading';
    this.errorMessage = '';
    this.emit();

    // Fast path for HLS: jump straight to live edge using existing hls.js instance
    if (this.hls) {
      this.armConnectTimeout(sessionId);
      try {
        this.hls.startLoad(-1);
        this.tryPlay(sessionId);
        return;
      } catch {
        // Fall through to full live reload
      }
    }

    // Fast path for very short pause (< 3s) on a healthy direct stream
    if (
      pauseDuration < LIVE_RECONNECT_PAUSE_THRESHOLD_MS &&
      this.audio.getAttribute('src') &&
      this.audio.readyState >= 2
    ) {
      this.armConnectTimeout(sessionId);
      this.tryPlay(sessionId);
      return;
    }

    // Standard live-edge reconnect (never clears src to empty first)
    const { playable, blockedHttpOnly } = this.buildCandidateUrls(station);
    if (playable.length === 0) {
      this.shouldBePlaying = false;
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
    this.shouldBePlaying = false;
    this.pausedAt = 0;
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
      // Map hardware/OS 'stop' to pause() so the notification card remains resumable
      navigator.mediaSession.setActionHandler('stop', () => this.pause());
      if (onPrev) navigator.mediaSession.setActionHandler('previoustrack', onPrev);
      if (onNext) navigator.mediaSession.setActionHandler('nexttrack', onNext);
    } catch {
      // Some browsers restrict specific action handlers
    }
  }

  updateMediaSessionMetadata(station) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      const artwork = [];
      if (station.favicon && station.favicon.startsWith('https://')) {
        artwork.push({ src: station.favicon, sizes: '192x192' });
      }
      // Always provide ONDA's own crisp PNG icons as fallback artwork for the Android media card
      const base = window.location.href;
      artwork.push(
        { src: new URL('./icons/icon-192.png', base).href, sizes: '192x192', type: 'image/png' },
        { src: new URL('./icons/icon-512.png', base).href, sizes: '512x512', type: 'image/png' }
      );

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
      if (typeof document !== 'undefined' && document.hidden) {
        this.vuRaf = null;
        return;
      }

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

    this.vuRenderFn = render;
    if (this.vuRaf) cancelAnimationFrame(this.vuRaf);
    if (typeof document === 'undefined' || !document.hidden) {
      this.vuRaf = requestAnimationFrame(render);
    }
  }
}

export const radioPlayer = new RadioPlayer();
