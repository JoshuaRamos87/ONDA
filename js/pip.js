/**
 * ONDA — Desktop Floating Mini-Tuner (Document Picture-in-Picture API)
 *
 * Opens a compact, always-on-top Mini-Tuner window via documentPictureInPicture.requestWindow()
 * on desktop Chromium browsers while keeping the underlying audio stream uninterrupted.
 */

export function isDesktopPipSupported() {
  if (typeof window === 'undefined') return false;
  if (
    !('documentPictureInPicture' in window) ||
    typeof window.documentPictureInPicture?.requestWindow !== 'function'
  ) {
    return false;
  }

  if (navigator.userAgentData && navigator.userAgentData.mobile) {
    return false;
  }

  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')) {
    return false;
  }

  return (
    window.matchMedia('(hover: hover) and (pointer: fine)').matches ||
    window.matchMedia('(any-pointer: fine)').matches
  );
}

const PIP_WIDGET_CSS = `
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100%;
    height: 100%;
    overflow: hidden !important;
    background: var(--deck-bg) !important;
    color: var(--deck-ink) !important;
    font-family: var(--font-sans);
    user-select: none;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .pip-shell {
    height: 100vh;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
    padding: 11px 13px 10px;
    background: var(--deck-bg);
    color: var(--deck-ink);
  }

  .pip-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .pip-status-group {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .pip-brand-dot {
    display: inline-grid;
    place-items: center;
    color: var(--deck-ink-muted);
    flex-shrink: 0;
  }

  .pip-top-right {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .pip-tech {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    color: var(--deck-ink-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 135px;
  }

  .pip-sleep-badge {
    display: none;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 0.64rem;
    color: #f6b73c;
    background: rgba(246, 183, 60, 0.14);
    border: 1px solid rgba(246, 183, 60, 0.35);
    border-radius: var(--radius-pill);
    padding: 1px 6px;
    flex-shrink: 0;
  }

  .pip-station {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .pip-art {
    width: 48px;
    height: 48px;
    border-radius: 9px;
    background: var(--deck-surface);
    border: 1px solid var(--deck-border);
    overflow: hidden;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    color: var(--deck-ink-muted);
  }

  .pip-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #fff;
  }

  .pip-meta {
    min-width: 0;
    flex: 1;
  }

  .pip-title {
    font-family: var(--font-display);
    font-size: 0.94rem;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--deck-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.25;
  }

  .pip-subtitle {
    margin-top: 2px;
    font-size: 0.74rem;
    color: var(--deck-ink-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pip-error {
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    background: hsl(11, 68%, 22%);
    color: #ffdcd5;
    font-size: 0.7rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .pip-error.visible {
    display: flex;
  }

  .pip-error-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
  }

  .pip-error-next {
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    border-radius: var(--radius-sm);
    padding: 2px 7px;
    font-size: 0.68rem;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
  }

  .pip-error-next:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .pip-controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .pip-transport {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pip-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid transparent;
    background: transparent;
    color: var(--deck-ink-muted);
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease, transform 0.14s ease;
  }

  .pip-btn:hover:not(:disabled) {
    background: var(--deck-surface);
    color: var(--deck-ink);
  }

  .pip-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .pip-btn.is-fav {
    color: var(--accent-bright);
  }

  .pip-btn.is-fav svg {
    fill: currentColor;
  }

  .pip-btn-sm {
    width: 26px;
    height: 26px;
  }

  .pip-play-btn {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: none;
    background: var(--accent);
    color: #fff;
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    box-shadow: 0 3px 12px var(--accent-shadow);
    transition: transform 0.14s var(--ease-out), background-color 0.15s ease;
  }

  .pip-play-btn:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: scale(1.04);
  }

  .pip-play-btn:disabled {
    background: var(--deck-surface);
    color: var(--deck-ink-muted);
    box-shadow: none;
    cursor: not-allowed;
  }

  .pip-vu-wrap {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    background: var(--deck-surface);
    border: 1px solid var(--deck-border);
    flex-shrink: 0;
  }

  #pip-vu-canvas {
    display: block;
    width: 54px;
    height: 18px;
  }

  .pip-timer {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--deck-ink-muted);
    min-width: 40px;
    text-align: right;
  }

  .pip-volume-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 2px;
    border-top: 1px solid var(--deck-border);
  }

  .pip-volume-slider {
    -webkit-appearance: none;
    appearance: none;
    flex: 1;
    height: 4px;
    border-radius: 99px;
    background: var(--deck-border);
    outline: none;
    cursor: pointer;
  }

  .pip-volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--deck-ink);
    border: 2px solid var(--deck-bg);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .pip-volume-pct {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--deck-ink-muted);
    min-width: 34px;
    text-align: right;
  }
`;

function buildMiniTunerMarkup() {
  return `
    <main class="pip-shell" aria-label="ONDA Floating Mini-Tuner">
      <div class="pip-topbar">
        <div class="pip-status-group">
          <span class="pip-brand-dot" aria-hidden="true" title="ONDA World Radio">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="14" r="2.6" fill="var(--accent)" stroke="none"/>
              <path d="M7.8 18.2a6 6 0 0 1 0-8.4"/>
              <path d="M16.2 9.8a6 6 0 0 1 0 8.4"/>
              <line x1="12" y1="3" x2="12" y2="9" stroke="var(--accent)"/>
            </svg>
          </span>
          <span class="on-air-indicator" id="pip-on-air">
            <span class="on-air-dot"></span>
            <span id="pip-status-label">STANDBY</span>
          </span>
          <span class="pip-sleep-badge" id="pip-sleep-badge" title="Sleep timer remaining"></span>
        </div>
        <div class="pip-top-right">
          <span class="pip-tech" id="pip-tech">READY</span>
          <button type="button" id="pip-dock-btn" class="pip-btn pip-btn-sm" aria-label="Return to ONDA window" title="Return to ONDA (Esc / P)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="15" rx="2"/>
              <polyline points="14 14 14 9 9 9"/>
              <line x1="14" y1="9" x2="8" y2="15"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="pip-station">
        <div class="pip-art" id="pip-art"></div>
        <div class="pip-meta">
          <div class="pip-title" id="pip-title">No station selected</div>
          <div class="pip-subtitle" id="pip-subtitle">Press Surprise Me or pick a station</div>
        </div>
        <button type="button" id="pip-fav-btn" class="pip-btn" aria-label="Save current station" title="Save to favorites" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
          </svg>
        </button>
      </div>

      <div class="pip-error" id="pip-error" role="alert">
        <span class="pip-error-text" id="pip-error-text">Unable to play stream.</span>
        <button type="button" id="pip-error-next-btn" class="pip-error-next">Next</button>
      </div>

      <div class="pip-controls-row">
        <div class="pip-transport">
          <button type="button" id="pip-surprise-btn" class="pip-btn" aria-label="Tune into a random live station" title="Surprise Me (R)">
            <svg id="pip-surprise-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
            <span id="pip-surprise-spinner" class="spinner" style="display:none;width:14px;height:14px" aria-hidden="true"></span>
          </button>

          <button type="button" id="pip-prev-btn" class="pip-btn" aria-label="Previous station" title="Previous station ([)" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </button>

          <button type="button" id="pip-play-btn" class="pip-play-btn" aria-label="Play or pause" title="Play / Pause (Space)" disabled>
            <svg id="pip-icon-play" width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <svg id="pip-icon-pause" width="17" height="17" viewBox="0 0 24 24" fill="currentColor" style="display:none" aria-hidden="true">
              <path d="M6 5h4v14H6zm8 0h4v14h-4z"/>
            </svg>
            <span id="pip-icon-spinner" class="spinner" style="display:none;width:16px;height:16px" aria-hidden="true"></span>
          </button>

          <button type="button" id="pip-next-btn" class="pip-btn" aria-label="Next station" title="Next station (])" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/>
            </svg>
          </button>
        </div>

        <div class="pip-vu-wrap" aria-hidden="true">
          <canvas id="pip-vu-canvas" width="54" height="18"></canvas>
          <span class="pip-timer" id="pip-timer">00:00</span>
        </div>
      </div>

      <div class="pip-volume-row">
        <button type="button" id="pip-mute-btn" class="pip-btn pip-btn-sm" aria-label="Mute or unmute" title="Mute (M)">
          <svg id="pip-vol-on" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
          <svg id="pip-vol-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>
          </svg>
        </button>
        <input type="range" id="pip-volume-slider" class="pip-volume-slider" aria-label="Volume" min="0" max="1" step="0.02" value="0.82">
        <span class="pip-volume-pct" id="pip-volume-pct">82%</span>
      </div>
    </main>
  `;
}

const IDLE_ART_SVG = `
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.45" aria-hidden="true">
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
    <circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>
  </svg>
`;

export function createMiniTunerController(deps) {
  let pipWindow = null;
  let pipDom = null;
  let pipRaf = null;
  let isOpening = false;
  let surpriseLoading = false;

  const vuBars = new Array(10).fill(0.08);
  const vuTargets = new Array(10).fill(0.08);

  function isOpen() {
    return Boolean(pipWindow && !pipWindow.closed);
  }

  function mirrorThemeAttributes(targetDoc) {
    const srcRoot = document.documentElement;
    const dstRoot = targetDoc.documentElement;
    const theme = srcRoot.getAttribute('data-theme');
    const accent = srcRoot.getAttribute('data-accent');

    if (theme) {
      dstRoot.setAttribute('data-theme', theme);
    } else {
      dstRoot.removeAttribute('data-theme');
    }

    if (accent) {
      dstRoot.setAttribute('data-accent', accent);
    } else {
      dstRoot.removeAttribute('data-accent');
    }
  }

  function copyHeadStyles(targetWindow) {
    const targetHead = targetWindow.document.head;
    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      if (!link.href) return;
      const clone = targetWindow.document.createElement('link');
      clone.rel = 'stylesheet';
      clone.href = link.href;
      targetHead.appendChild(clone);
    });

    const styleEl = targetWindow.document.createElement('style');
    styleEl.id = 'onda-pip-styles';
    styleEl.textContent = PIP_WIDGET_CSS;
    targetHead.appendChild(styleEl);
  }

  function stopVuLoop() {
    if (pipRaf && pipWindow && !pipWindow.closed) {
      pipWindow.cancelAnimationFrame(pipRaf);
    }
    pipRaf = null;
  }

  function startVuLoop(win, canvas) {
    stopVuLoop();
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let peakColor = '#ff5733';
    const refreshPeakColor = () => {
      try {
        const val = win
          .getComputedStyle(win.document.documentElement)
          .getPropertyValue('--accent-bright')
          .trim();
        if (val) peakColor = val;
      } catch {
        // Keep fallback color
      }
    };
    refreshPeakColor();

    const render = () => {
      if (!isOpen() || win !== pipWindow) {
        pipRaf = null;
        return;
      }

      frame += 1;
      if (frame % 30 === 0) refreshPeakColor();

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const { player } = deps;
      const isPlaying =
        player.status === 'playing' && !player.audio.muted && player.audio.volume > 0.01;
      const isLoading = player.status === 'loading';
      const energy = isPlaying ? 0.35 + player.audio.volume * 0.65 : 0;

      const count = vuBars.length;
      const gap = 2;
      const barW = Math.floor((width - gap * (count - 1)) / count);

      if (frame % 6 === 0) {
        for (let i = 0; i < count; i++) {
          if (isPlaying) {
            const centerBias = 1 - Math.abs(i - (count - 1) / 2) / (count * 0.72);
            vuTargets[i] = Math.min(
              1,
              Math.max(0.14, (Math.random() * 0.85 + 0.15) * centerBias * energy)
            );
          } else if (isLoading) {
            vuTargets[i] = (Math.sin(frame * 0.14 + i * 0.55) + 1) * 0.25 + 0.12;
          } else {
            vuTargets[i] = 0.09;
          }
        }
      }

      for (let i = 0; i < count; i++) {
        vuBars[i] += (vuTargets[i] - vuBars[i]) * 0.22;
        const barH = Math.max(2, Math.round(vuBars[i] * height));
        const x = i * (barW + gap);
        const y = height - barH;

        if (isPlaying) {
          ctx.fillStyle = vuBars[i] > 0.78 ? peakColor : '#e5dfd3';
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

      pipRaf = win.requestAnimationFrame(render);
    };

    pipRaf = win.requestAnimationFrame(render);
  }

  function handlePipClose() {
    stopVuLoop();
    pipDom = null;
    pipWindow = null;
    deps.onOpenStateChange?.(false);
  }

  function bindPipEvents(win, doc) {
    pipDom.dockBtn.addEventListener('click', () => {
      try {
        window.focus();
      } catch {
        // Ignore focus restriction
      }
      close();
    });

    pipDom.playBtn.addEventListener('click', () => deps.player.togglePlayPause());
    pipDom.prevBtn.addEventListener('click', () => deps.onPrev?.());
    pipDom.nextBtn.addEventListener('click', () => deps.onNext?.());
    pipDom.errorNextBtn.addEventListener('click', () => deps.onNext?.());
    pipDom.favBtn.addEventListener('click', () => deps.onToggleFavorite?.());
    pipDom.surpriseBtn.addEventListener('click', () => deps.onSurprise?.());
    pipDom.muteBtn.addEventListener('click', () => deps.onToggleMute?.());

    pipDom.volumeSlider.addEventListener('input', () => {
      deps.onVolumeChange?.(Number(pipDom.volumeSlider.value));
    });

    doc.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        close();
      } else if (e.key === ' ') {
        if (deps.player.currentStation) {
          e.preventDefault();
          deps.player.togglePlayPause();
        }
      } else if (e.key === '[') {
        e.preventDefault();
        deps.onPrev?.();
      } else if (e.key === ']') {
        e.preventDefault();
        deps.onNext?.();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        deps.onToggleMute?.();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        deps.onSurprise?.();
      }
    });

    win.addEventListener('pagehide', handlePipClose, { once: true });
  }

  function queryPipDom(doc) {
    return {
      onAir: doc.getElementById('pip-on-air'),
      statusLabel: doc.getElementById('pip-status-label'),
      sleepBadge: doc.getElementById('pip-sleep-badge'),
      tech: doc.getElementById('pip-tech'),
      dockBtn: doc.getElementById('pip-dock-btn'),
      art: doc.getElementById('pip-art'),
      title: doc.getElementById('pip-title'),
      subtitle: doc.getElementById('pip-subtitle'),
      favBtn: doc.getElementById('pip-fav-btn'),
      error: doc.getElementById('pip-error'),
      errorText: doc.getElementById('pip-error-text'),
      errorNextBtn: doc.getElementById('pip-error-next-btn'),
      surpriseBtn: doc.getElementById('pip-surprise-btn'),
      surpriseIcon: doc.getElementById('pip-surprise-icon'),
      surpriseSpinner: doc.getElementById('pip-surprise-spinner'),
      prevBtn: doc.getElementById('pip-prev-btn'),
      playBtn: doc.getElementById('pip-play-btn'),
      nextBtn: doc.getElementById('pip-next-btn'),
      iconPlay: doc.getElementById('pip-icon-play'),
      iconPause: doc.getElementById('pip-icon-pause'),
      iconSpinner: doc.getElementById('pip-icon-spinner'),
      vuCanvas: doc.getElementById('pip-vu-canvas'),
      timer: doc.getElementById('pip-timer'),
      muteBtn: doc.getElementById('pip-mute-btn'),
      volOn: doc.getElementById('pip-vol-on'),
      volMuted: doc.getElementById('pip-vol-muted'),
      volumeSlider: doc.getElementById('pip-volume-slider'),
      volumePct: doc.getElementById('pip-volume-pct'),
    };
  }

  async function open() {
    if (!isDesktopPipSupported() || isOpening) return false;
    if (isOpen()) {
      try {
        pipWindow.focus();
      } catch {
        // Ignore
      }
      return true;
    }

    isOpening = true;
    let win;
    try {
      // Must be called immediately before any other await to preserve user activation
      win = await window.documentPictureInPicture.requestWindow({
        width: 364,
        height: 222,
      });
    } catch {
      isOpening = false;
      deps.onToast?.('Could not open Floating Mini-Tuner window.');
      return false;
    }

    isOpening = false;
    if (!win || win.closed) return false;

    pipWindow = win;
    const doc = win.document;
    doc.title = 'ONDA — Mini-Tuner';
    mirrorThemeAttributes(doc);
    copyHeadStyles(win);
    doc.body.innerHTML = buildMiniTunerMarkup();

    pipDom = queryPipDom(doc);
    bindPipEvents(win, doc);
    startVuLoop(win, pipDom.vuCanvas);

    syncPlayback(deps.player.getState());
    setSurpriseLoading(surpriseLoading);
    deps.onOpenStateChange?.(true);
    return true;
  }

  function close() {
    if (!pipWindow) return;
    const win = pipWindow;
    if (!win.closed) {
      try {
        win.close();
      } catch {
        // Ignore close errors
      }
    }
    if (pipWindow === win) {
      handlePipClose();
    }
  }

  function toggle() {
    if (isOpen()) {
      close();
      return false;
    }
    return open();
  }

  function syncTick({ elapsedSeconds = 0, sleepRemainingMs = 0 } = {}) {
    if (!isOpen() || !pipDom) return;
    pipDom.timer.textContent = deps.formatElapsed(elapsedSeconds);
    if (sleepRemainingMs > 0) {
      const secsLeft = Math.ceil(sleepRemainingMs / 1000);
      pipDom.sleepBadge.textContent = `⏱ ${deps.formatElapsed(secsLeft)}`;
      pipDom.sleepBadge.style.display = 'inline-flex';
    } else {
      pipDom.sleepBadge.style.display = 'none';
    }
  }

  function syncFavorite(uuid, isFav) {
    if (!isOpen() || !pipDom) return;
    if (deps.player.currentStation?.stationuuid !== uuid) return;
    pipDom.favBtn.classList.toggle('is-fav', isFav);
    pipDom.favBtn.setAttribute('aria-label', isFav ? 'Remove from saved' : 'Save current station');
    pipDom.favBtn.setAttribute('title', isFav ? 'Saved' : 'Save to favorites');
  }

  function syncPlayback(pState) {
    if (!isOpen() || !pipDom) return;
    const { station, status, errorMessage, volume, muted } = pState;

    const effectiveVol = muted ? 0 : volume;
    pipDom.volumeSlider.value = String(effectiveVol);
    pipDom.volOn.style.display = muted || volume === 0 ? 'none' : 'block';
    pipDom.volMuted.style.display = muted || volume === 0 ? 'block' : 'none';
    pipDom.volumePct.textContent =
      muted || volume === 0 ? 'MUTE' : `${Math.round(volume * 100)}%`;

    syncTick(pState);

    if (status === 'error' && errorMessage) {
      pipDom.errorText.textContent = errorMessage;
      pipDom.error.classList.add('visible');
    } else {
      pipDom.error.classList.remove('visible');
    }

    if (!station) {
      pipWindow.document.title = 'ONDA — Mini-Tuner';
      pipDom.playBtn.disabled = true;
      pipDom.prevBtn.disabled = true;
      pipDom.nextBtn.disabled = true;
      pipDom.favBtn.disabled = true;
      pipDom.favBtn.classList.remove('is-fav');
      if (pipDom.art.dataset.uuid !== '') {
        pipDom.art.dataset.uuid = '';
        pipDom.art.innerHTML = IDLE_ART_SVG;
      }
      pipDom.onAir.classList.remove('live', 'buffering', 'error');
      pipDom.statusLabel.textContent = 'STANDBY';
      pipDom.tech.textContent = 'READY';
      pipDom.title.textContent = 'No station selected';
      pipDom.title.removeAttribute('title');
      pipDom.subtitle.textContent = 'Press Surprise Me or pick a station';
      pipDom.iconPlay.style.display = 'block';
      pipDom.iconPause.style.display = 'none';
      pipDom.iconSpinner.style.display = 'none';
      return;
    }

    const custom = Boolean(deps.isCustom?.(station));
    const queueLen = Number(deps.getQueueLength?.()) || 0;
    pipWindow.document.title = `ONDA — ${station.name || 'Mini-Tuner'}`;

    pipDom.playBtn.disabled = false;
    pipDom.prevBtn.disabled = queueLen < 2;
    pipDom.nextBtn.disabled = queueLen < 2;
    pipDom.favBtn.disabled = false;

    if (pipDom.art.dataset.uuid !== station.stationuuid) {
      pipDom.art.dataset.uuid = station.stationuuid;
      pipDom.art.innerHTML = deps.buildArtworkHtml(station, 48);
    }

    const stationName = station.name || 'Untitled Station';
    pipDom.title.textContent = stationName;
    pipDom.title.title = stationName;

    const loc = [
      custom && !station.countrycode ? '✦' : deps.countryCodeToFlag(station.countrycode),
      station.country || (custom ? 'Custom Stream' : ''),
      deps.parseTags(station.tags)[0],
    ]
      .filter(Boolean)
      .join(' · ');
    pipDom.subtitle.textContent = loc || 'Live Radio Stream';

    const techParts = [
      custom ? '✦ CUSTOM' : '',
      (station.codec || '').toUpperCase(),
      Number(station.bitrate) > 0 ? `${station.bitrate} kbps` : '',
      Number(station.hls) === 1 ? 'HLS' : '',
    ].filter(Boolean);
    pipDom.tech.textContent = techParts.join(' · ') || 'LIVE';

    pipDom.onAir.classList.remove('live', 'buffering', 'error');
    if (status === 'playing') {
      pipDom.onAir.classList.add('live');
      pipDom.statusLabel.textContent = 'ON AIR';
    } else if (status === 'loading') {
      pipDom.onAir.classList.add('buffering');
      pipDom.statusLabel.textContent = 'TUNING';
    } else if (status === 'error') {
      pipDom.onAir.classList.add('error');
      pipDom.statusLabel.textContent = 'SIGNAL LOST';
    } else if (status === 'paused') {
      pipDom.statusLabel.textContent = 'PAUSED';
    } else {
      pipDom.statusLabel.textContent = 'STANDBY';
    }

    pipDom.iconPlay.style.display = status === 'playing' || status === 'loading' ? 'none' : 'block';
    pipDom.iconPause.style.display = status === 'playing' ? 'block' : 'none';
    pipDom.iconSpinner.style.display = status === 'loading' ? 'inline-block' : 'none';

    syncFavorite(station.stationuuid, Boolean(deps.isFavorite?.(station.stationuuid)));
  }

  function syncTheme() {
    if (!isOpen()) return;
    mirrorThemeAttributes(pipWindow.document);
  }

  function setSurpriseLoading(loading) {
    surpriseLoading = Boolean(loading);
    if (!isOpen() || !pipDom) return;
    pipDom.surpriseBtn.disabled = surpriseLoading;
    pipDom.surpriseIcon.style.display = surpriseLoading ? 'none' : 'block';
    pipDom.surpriseSpinner.style.display = surpriseLoading ? 'inline-block' : 'none';
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => close());
  }

  return {
    isOpen,
    open,
    close,
    toggle,
    syncPlayback,
    syncTick,
    syncFavorite,
    syncTheme,
    setSurpriseLoading,
  };
}
