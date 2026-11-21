/**
 * ONDA — Live Audio Stream Engine
 *
 * Handles direct Icecast/Shoutcast audio streams (MP3, AAC, OGG, FLAC) via HTML5 <audio>
 * AND adaptive HLS (.m3u8) streams via hls.js (with native Safari HLS support).
 *
 * Note: Intentionally omits `crossOrigin="anonymous"` on <audio> so CORS-free
 * Icecast/Shoutcast servers worldwide play reliably without silent CORS blocks.
 */

import { radioApi } from './api.js';

export class RadioPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'none';

    this.hls = null;
    this.currentStation = null;
    this.status = 'idle'; // idle | loading | playing | paused | error
    this.errorMessage = '';
    this.fallbackAttempted = false;

    this.elapsedSeconds = 0;
    this.elapsedInterval = null;

    this.sleepEndTime = null;
    this.sleepInterval = null;
    this.sleepMinutes = 0;

    this.listeners = new Set();
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

  emit() {
    const snapshot = this.getState();
    for (const cb of this.listeners) {
      cb(snapshot);
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

  bindAudioEvents() {
    this.audio.addEventListener('playing', () => {
      this.status = 'playing';
      this.errorMessage = '';
      this.startTimer();
      this.updateMediaSessionState('playing');
      this.emit();
    });

    this.audio.addEventListener('waiting', () => {
      if (this.currentStation && this.status !== 'paused' && this.status !== 'error') {
        this.status = 'loading';
        this.emit();
      }
    });

    this.audio.addEventListener('pause', () => {
      if (this.status !== 'error' && this.status !== 'idle') {
        this.status = 'paused';
        this.stopTimer();
        this.updateMediaSessionState('paused');
        this.emit();
      }
    });

    this.audio.addEventListener('error', () => {
      if (!this.currentStation) return;
      this.handlePlaybackFailure();
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

  /**
   * Play a station object from the Radio Browser API.
   */
  async playStation(station) {
    if (!station) return;

    // Toggle pause/resume if clicking the currently active station
    if (
      this.currentStation &&
      this.currentStation.stationuuid === station.stationuuid &&
      this.status === 'playing'
    ) {
      this.pause();
      return;
    }

    if (
      this.currentStation &&
      this.currentStation.stationuuid === station.stationuuid &&
      this.status === 'paused'
    ) {
      this.resume();
      return;
    }

    this.destroyHls();
    this.stopTimer();
    this.elapsedSeconds = 0;
    this.fallbackAttempted = false;
    this.currentStation = station;
    this.status = 'loading';
    this.errorMessage = '';
    this.emit();

    this.updateMediaSessionMetadata(station);

    // Report click to Radio Browser per API guidelines
    radioApi.registerClick(station.stationuuid);

    const primaryUrl = station.url_resolved || station.url;
    if (!primaryUrl) {
      this.failWithMessage('This station does not provide a stream URL.');
      return;
    }

    // Warn cleanly if an HTTP stream is attempted on an HTTPS host (like GitHub Pages)
    if (window.location.protocol === 'https:' && primaryUrl.startsWith('http://')) {
      this.failWithMessage(
        'Blocked by browser mixed-content security (HTTP stream on an HTTPS page). Enable "HTTPS only" or open the station homepage.'
      );
      return;
    }

    await this.loadUrl(primaryUrl, station);
  }

  async loadUrl(streamUrl, station) {
    const isHls =
      Number(station.hls) === 1 || /\.m3u8(\?.*)?$/i.test(streamUrl);

    if (isHls) {
      // Safari / iOS supports HLS natively
      if (this.audio.canPlayType('application/vnd.apple.mpegurl')) {
        this.audio.src = streamUrl;
        this.tryPlay();
        return;
      }

      // Other modern browsers use hls.js if loaded
      if (typeof window.Hls !== 'undefined' && window.Hls.isSupported()) {
        this.destroyHls();
        this.hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
        });
        this.hls.loadSource(streamUrl);
        this.hls.attachMedia(this.audio);
        this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          this.tryPlay();
        });
        this.hls.on(window.Hls.Events.ERROR, (_event, data) => {
          if (data && data.fatal) {
            this.handlePlaybackFailure();
          }
        });
        return;
      }
    }

    this.audio.src = streamUrl;
    this.audio.load();
    this.tryPlay();
  }

  async tryPlay() {
    try {
      await this.audio.play();
    } catch (err) {
      if (err && err.name === 'AbortError') {
        // Interrupted by switching to another station
        return;
      }
      if (err && err.name === 'NotAllowedError') {
        this.status = 'paused';
        this.errorMessage = 'Click Play to start audio (browser autoplay policy).';
        this.emit();
        return;
      }
      this.handlePlaybackFailure();
    }
  }

  handlePlaybackFailure() {
    if (!this.currentStation) return;

    // Try fallback to raw station.url once if it differs from url_resolved
    const altUrl = this.currentStation.url;
    const primaryUrl = this.currentStation.url_resolved;
    if (
      !this.fallbackAttempted &&
      altUrl &&
      altUrl !== primaryUrl &&
      !(window.location.protocol === 'https:' && altUrl.startsWith('http://'))
    ) {
      this.fallbackAttempted = true;
      this.destroyHls();
      this.loadUrl(altUrl, this.currentStation);
      return;
    }

    this.destroyHls();
    this.stopTimer();
    this.failWithMessage(
      'Unable to tune into this stream right now — the broadcaster may be offline, geo-restricted, or blocking browser playback.'
    );
  }

  failWithMessage(msg) {
    this.status = 'error';
    this.errorMessage = msg;
    this.stopTimer();
    this.emit();
  }

  pause() {
    this.audio.pause();
    this.status = 'paused';
    this.stopTimer();
    this.emit();
  }

  resume() {
    if (!this.currentStation) return;
    if (this.status === 'error') {
      const station = this.currentStation;
      this.currentStation = null;
      this.playStation(station);
      return;
    }
    this.status = 'loading';
    this.emit();
    this.tryPlay();
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
    this.destroyHls();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.stopTimer();
    this.elapsedSeconds = 0;
    this.status = 'idle';
    this.errorMessage = '';
    this.emit();
  }

  startTimer() {
    if (this.elapsedInterval) return;
    this.elapsedInterval = setInterval(() => {
      if (this.status === 'playing') {
        this.elapsedSeconds += 1;
        this.emit();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
    }
  }

  /**
   * Sleep timer: automatically pauses playback after N minutes.
   */
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
      } else {
        this.emit();
      }
    }, 1000);
    this.emit();
  }

  /**
   * OS / Hardware Media Session integration (keyboard media keys & lock screen).
   */
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
        artist: [station.country, station.tags?.split(',')[0]].filter(Boolean).join(' · ') || 'Live Radio',
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

  /**
   * Tactile broadcast VU / level meter canvas animation driven by playback state & volume.
   */
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
            // Natural bell-curve frequency weighting across bars
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
