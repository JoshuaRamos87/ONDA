/**
 * ONDA — Desktop Floating Mini-Tuner (Document Picture-in-Picture API)
 *
 * Opens a compact, always-on-top Mini-Tuner window via documentPictureInPicture.requestWindow()
 * on desktop Chromium browsers while keeping the underlying audio stream uninterrupted.
 */

import { isDesktopPipSupported } from './utils.js';
export { isDesktopPipSupported };

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
    gap: 10px;
    padding: 12px 14px 11px;
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
    font-size: 0.62rem;
    letter-spacing: 0.03em;
    color: var(--deck-ink-muted);
    background: var(--deck-surface);
    border: 1px solid var(--deck-border);
    border-radius: var(--radius-pill);
    padding: 2px 7px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 135px;
  }

  #pip-dock-btn {
    opacity: 0.72;
  }

  #pip-dock-btn:hover {
    opacity: 1;
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
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
  }

  .pip-transport-core {
    justify-self: center;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pip-side-btn {
    width: 30px;
    height: 30px;
  }

  #pip-surprise-btn {
    justify-self: start;
  }

  #pip-fav-btn {
    justify-self: end;
  }

  .pip-btn {
    width: 32px;
    height: 32px;
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
    width: 42px;
    height: 42px;
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

  .pip-vu-bars {
    --vu-scale: 1;
    display: flex;
    align-items: flex-end;
    gap: 2.5px;
    height: 15px;
  }

  .pip-vu-bars span {
    width: 2.5px;
    height: 100%;
    border-radius: 1.5px;
    background: rgba(229, 223, 211, 0.25);
    transform-origin: bottom;
    transform: scaleY(0.18);
    transition: background-color 0.2s ease, transform 0.2s ease;
  }

  .pip-vu-bars[data-state="playing"] span {
    background: linear-gradient(to top, #e5dfd3 0%, #e5dfd3 62%, var(--accent-bright) 100%);
    animation: pip-vu-bounce var(--dur, 0.55s) ease-in-out var(--delay, 0s) infinite alternate;
  }

  .pip-vu-bars[data-state="loading"] span {
    background: #f6b73c;
    animation: pip-vu-load 0.9s ease-in-out var(--delay, 0s) infinite alternate;
  }

  .pip-vu-bars span:nth-child(1) { --dur: 0.52s; --delay: -0.10s; --peak: 0.65; }
  .pip-vu-bars span:nth-child(2) { --dur: 0.44s; --delay: -0.32s; --peak: 0.88; }
  .pip-vu-bars span:nth-child(3) { --dur: 0.60s; --delay: -0.18s; --peak: 0.96; }
  .pip-vu-bars span:nth-child(4) { --dur: 0.48s; --delay: -0.45s; --peak: 1.00; }
  .pip-vu-bars span:nth-child(5) { --dur: 0.56s; --delay: -0.22s; --peak: 0.92; }
  .pip-vu-bars span:nth-child(6) { --dur: 0.42s; --delay: -0.38s; --peak: 0.98; }
  .pip-vu-bars span:nth-child(7) { --dur: 0.58s; --delay: -0.14s; --peak: 0.82; }
  .pip-vu-bars span:nth-child(8) { --dur: 0.50s; --delay: -0.29s; --peak: 0.62; }

  @keyframes pip-vu-bounce {
    0% { transform: scaleY(0.2); }
    100% { transform: scaleY(calc(var(--peak, 0.85) * var(--vu-scale, 1))); }
  }

  @keyframes pip-vu-load {
    0% { transform: scaleY(0.22); opacity: 0.55; }
    100% { transform: scaleY(0.58); opacity: 1; }
  }

  .pip-timer {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    color: var(--deck-ink-muted);
    min-width: 36px;
    text-align: right;
  }

  .pip-footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 6px;
    border-top: 1px solid var(--deck-border);
    min-width: 0;
  }

  .pip-volume-group {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .pip-volume-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 76px;
    flex: 0 0 76px;
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
    min-width: 32px;
    text-align: left;
  }

  @media (max-width: 315px) {
    .pip-shell {
      padding: 9px 10px 8px;
      gap: 6px;
    }

    .pip-tech {
      max-width: 96px;
    }

    .pip-transport-core {
      gap: 6px;
    }

    .pip-volume-slider {
      width: 64px;
      flex: 0 0 64px;
    }

    .pip-volume-pct {
      display: none;
    }
  }

  @media (max-width: 245px) {
    .pip-volume-slider {
      width: 52px;
      flex: 0 0 52px;
    }

    .pip-vu-bars span:nth-child(n+6) {
      display: none;
    }

    .pip-timer {
      display: none;
    }
  }

  @media (max-height: 185px) {
    .pip-shell {
      padding: 7px 10px;
      gap: 4px;
    }

    .pip-art {
      width: 38px;
      height: 38px;
    }

    .pip-play-btn {
      width: 34px;
      height: 34px;
    }

    .pip-footer-row {
      padding-top: 4px;
    }
  }

  @media (max-height: 150px) {
    .pip-subtitle {
      display: none;
    }
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
      </div>

      <div class="pip-error" id="pip-error" role="alert">
        <span class="pip-error-text" id="pip-error-text">Unable to play stream.</span>
        <button type="button" id="pip-error-next-btn" class="pip-error-next">Next</button>
      </div>

      <div class="pip-controls-row">
        <button type="button" id="pip-surprise-btn" class="pip-btn pip-side-btn" aria-label="Tune into a random live station" title="Surprise Me (R)">
          <svg id="pip-surprise-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
            <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
            <line x1="4" y1="4" x2="9" y2="9"/>
          </svg>
          <span id="pip-surprise-spinner" class="spinner" style="display:none;width:14px;height:14px" aria-hidden="true"></span>
        </button>

        <div class="pip-transport-core">
          <button type="button" id="pip-prev-btn" class="pip-btn" aria-label="Previous station" title="Previous station ([)" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </button>

          <button type="button" id="pip-play-btn" class="pip-play-btn" aria-label="Play or pause" title="Play / Pause (Space)" disabled>
            <svg id="pip-icon-play" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <svg id="pip-icon-pause" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="display:none" aria-hidden="true">
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

        <button type="button" id="pip-fav-btn" class="pip-btn pip-side-btn" aria-label="Save current station" title="Save to favorites" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
          </svg>
        </button>
      </div>

      <div class="pip-footer-row">
        <div class="pip-volume-group">
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

        <div class="pip-vu-wrap" aria-hidden="true">
          <div class="pip-vu-bars" id="pip-vu-bars" data-state="idle">
            <span></span><span></span><span></span><span></span>
            <span></span><span></span><span></span><span></span>
          </div>
          <span class="pip-timer" id="pip-timer">00:00</span>
        </div>
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
  let isOpening = false;
  let surpriseLoading = false;

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

  function handlePipClose() {
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
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const pState = deps.player.getState();
        const baseVol = pState.muted ? 0 : Number(pState.volume) || 0;
        const delta = e.key === 'ArrowUp' ? 0.05 : -0.05;
        const nextVol = Math.round(Math.max(0, Math.min(1, baseVol + delta)) * 100) / 100;
        deps.onVolumeChange?.(nextVol);
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
      vuBars: doc.getElementById('pip-vu-bars'),
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
        width: 348,
        height: 226,
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

    if (pipDom.vuBars) {
      const vuState =
        status === 'playing' && !muted && volume > 0.01
          ? 'playing'
          : status === 'loading'
          ? 'loading'
          : 'idle';
      pipDom.vuBars.dataset.state = vuState;
      pipDom.vuBars.style.setProperty(
        '--vu-scale',
        String((0.45 + Math.max(0, Math.min(1, Number(volume) || 0)) * 0.55).toFixed(2))
      );
    }

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
    pipDom.nextBtn.disabled = queueLen < 2 && surpriseLoading;
    pipDom.nextBtn.setAttribute(
      'aria-label',
      queueLen < 2 ? 'Next random station' : 'Next station'
    );
    pipDom.nextBtn.setAttribute(
      'title',
      queueLen < 2 ? 'Next random station (])' : 'Next station (])'
    );
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
    if (pipDom.nextBtn && deps.player.currentStation) {
      const queueLen = Number(deps.getQueueLength?.()) || 0;
      pipDom.nextBtn.disabled = queueLen < 2 && surpriseLoading;
    }
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
