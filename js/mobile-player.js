/**
 * ONDA — Mobile Swipe-Up Full-Screen Player Sheet (<= 1024px)
 *
 * Provides interactive swipe-up expansion from the bottom player deck,
 * tap-to-expand on the station info area, swipe-down dismissal, and live UI sync.
 */

const IDLE_ART_SVG = `
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.4" aria-hidden="true">
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
    <circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>
  </svg>
`;

function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string') return '';
  const clean = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function createMobilePlayerController(deps) {
  const { deckEl, deckStationEl, sheetEl } = deps;
  if (!deckEl || !sheetEl) {
    return {
      isOpen: () => false,
      open: () => {},
      close: () => {},
      syncPlayback: () => {},
      syncTick: () => {},
      syncFavorite: () => {},
      setSurpriseLoading: () => {},
    };
  }

  const mobileMq = window.matchMedia('(max-width: 1024px)');
  let openState = false;
  let surpriseLoading = false;
  let suppressClickUntil = 0;

  const dom = {
    closeBtn: document.getElementById('mps-close-btn'),
    moreBtn: document.getElementById('mps-more-btn'),
    onAir: document.getElementById('mps-on-air'),
    statusLabel: document.getElementById('mps-status-label'),
    sleepBadge: document.getElementById('mps-sleep-badge'),
    art: document.getElementById('mps-art'),
    titleBtn: document.getElementById('mps-title-btn'),
    title: document.getElementById('mps-title'),
    subtitle: document.getElementById('mps-subtitle'),
    techPill: document.getElementById('mps-tech-pill'),
    sleepBtn: document.getElementById('mps-sleep-btn'),
    sleepLabel: document.getElementById('mps-sleep-label'),
    shareBtn: document.getElementById('mps-share-btn'),
    infoBtn: document.getElementById('mps-info-btn'),
    error: document.getElementById('mps-error'),
    errorText: document.getElementById('mps-error-text'),
    errorNextBtn: document.getElementById('mps-error-next-btn'),
    signalTrack: document.getElementById('mps-signal-track'),
    vuBars: document.getElementById('mps-vu-bars'),
    liveCaption: document.getElementById('mps-live-caption'),
    timer: document.getElementById('mps-timer'),
    surpriseBtn: document.getElementById('mps-surprise-btn'),
    surpriseIcon: document.getElementById('mps-surprise-icon'),
    surpriseSpinner: document.getElementById('mps-surprise-spinner'),
    prevBtn: document.getElementById('mps-prev-btn'),
    playBtn: document.getElementById('mps-play-btn'),
    nextBtn: document.getElementById('mps-next-btn'),
    iconPlay: document.getElementById('mps-icon-play'),
    iconPause: document.getElementById('mps-icon-pause'),
    iconSpinner: document.getElementById('mps-icon-spinner'),
    favBtn: document.getElementById('mps-fav-btn'),
    footerCaption: document.getElementById('mps-footer-caption'),
    swipeHandle: deckEl.querySelector('.deck-swipe-handle'),
  };

  function isOpen() {
    return openState;
  }

  function clearDragStyles() {
    sheetEl.classList.remove('dragging');
    sheetEl.style.transform = '';
    sheetEl.style.opacity = '';
  }

  function open() {
    if (!mobileMq.matches || !deps.player.currentStation) return;
    clearDragStyles();
    if (!openState) {
      openState = true;
      sheetEl.classList.add('open');
      sheetEl.setAttribute('aria-hidden', 'false');
      deps.onLockScroll?.();
    }
    syncPlayback(deps.player.getState());
    setSurpriseLoading(surpriseLoading);
  }

  function close() {
    clearDragStyles();
    if (!openState) return;
    openState = false;
    sheetEl.classList.remove('open');
    sheetEl.setAttribute('aria-hidden', 'true');
    deps.onUnlockScroll?.();
  }

  // Collapse automatically if viewport widens to desktop
  const handleMediaChange = (e) => {
    if (!e.matches && openState) {
      close();
    }
  };
  if (typeof mobileMq.addEventListener === 'function') {
    mobileMq.addEventListener('change', handleMediaChange);
  } else if (typeof mobileMq.addListener === 'function') {
    mobileMq.addListener(handleMediaChange);
  }

  // Swipe-up gesture from bottom player deck
  let deckDrag = null;

  deckEl.addEventListener(
    'touchstart',
    (e) => {
      if (!mobileMq.matches || openState || !deps.player.currentStation) return;
      if (e.touches.length !== 1) return;
      if (e.target.closest('.deck-error-strip')) return;

      const touch = e.touches[0];
      deckDrag = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastY: touch.clientY,
        lastTime: performance.now(),
        velocityY: 0,
        locked: false,
        aborted: false,
      };
    },
    { passive: true }
  );

  deckEl.addEventListener(
    'touchmove',
    (e) => {
      if (!deckDrag || deckDrag.aborted || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - deckDrag.startX;
      const dy = touch.clientY - deckDrag.startY;

      if (!deckDrag.locked) {
        if (dy < -8 && Math.abs(dy) > Math.abs(dx) * 1.2) {
          deckDrag.locked = true;
          sheetEl.classList.add('dragging');
        } else if (Math.abs(dx) > 10 || dy > 10) {
          deckDrag.aborted = true;
          return;
        } else {
          return;
        }
      }

      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      const dt = Math.max(1, now - deckDrag.lastTime);
      deckDrag.velocityY = (touch.clientY - deckDrag.lastY) / dt;
      deckDrag.lastY = touch.clientY;
      deckDrag.lastTime = now;

      const vh = window.innerHeight || 800;
      const offset = Math.max(0, vh + Math.min(0, dy));
      sheetEl.style.transform = `translate3d(0, ${offset}px, 0)`;
      sheetEl.style.opacity = String(Math.min(1, 0.25 + Math.abs(dy) / (vh * 0.45)));
    },
    { passive: false }
  );

  function endDeckDrag(e) {
    if (!deckDrag) return;
    const drag = deckDrag;
    deckDrag = null;
    if (!drag.locked) return;

    suppressClickUntil = Date.now() + 300;
    const endY = e.changedTouches?.[0]?.clientY ?? drag.lastY;
    const dy = endY - drag.startY;
    clearDragStyles();

    if (-dy >= 65 || drag.velocityY < -0.45) {
      open();
    }
  }

  deckEl.addEventListener('touchend', endDeckDrag, { passive: true });
  deckEl.addEventListener('touchcancel', () => {
    if (!deckDrag) return;
    const wasLocked = deckDrag.locked;
    deckDrag = null;
    if (wasLocked) clearDragStyles();
  }, { passive: true });

  // Tap station info or top swipe handle on mobile deck to expand
  const handleDeckTapExpand = () => {
    if (!mobileMq.matches || !deps.player.currentStation) return;
    if (Date.now() < suppressClickUntil) return;
    open();
  };

  deckStationEl?.addEventListener('click', handleDeckTapExpand);
  dom.swipeHandle?.addEventListener('click', handleDeckTapExpand);

  // Swipe-down gesture inside expanded sheet to collapse
  let sheetDrag = null;

  sheetEl.addEventListener(
    'touchstart',
    (e) => {
      if (!openState || e.touches.length !== 1) return;
      if (e.target.closest('.mps-action-pills')) return;
      const touch = e.touches[0];
      sheetDrag = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastY: touch.clientY,
        lastTime: performance.now(),
        velocityY: 0,
        locked: false,
        aborted: false,
      };
    },
    { passive: true }
  );

  sheetEl.addEventListener(
    'touchmove',
    (e) => {
      if (!sheetDrag || sheetDrag.aborted || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - sheetDrag.startX;
      const dy = touch.clientY - sheetDrag.startY;

      if (!sheetDrag.locked) {
        if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.2) {
          sheetDrag.locked = true;
          sheetEl.classList.add('dragging');
        } else if (Math.abs(dx) > 10 || dy < -10) {
          sheetDrag.aborted = true;
          return;
        } else {
          return;
        }
      }

      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      const dt = Math.max(1, now - sheetDrag.lastTime);
      sheetDrag.velocityY = (touch.clientY - sheetDrag.lastY) / dt;
      sheetDrag.lastY = touch.clientY;
      sheetDrag.lastTime = now;

      const vh = window.innerHeight || 800;
      const clampedDy = Math.max(0, dy);
      sheetEl.style.transform = `translate3d(0, ${clampedDy}px, 0)`;
      sheetEl.style.opacity = String(Math.max(0.35, 1 - clampedDy / (vh * 1.1)));
    },
    { passive: false }
  );

  function endSheetDrag(e) {
    if (!sheetDrag) return;
    const drag = sheetDrag;
    sheetDrag = null;
    if (!drag.locked) return;

    const endY = e.changedTouches?.[0]?.clientY ?? drag.lastY;
    const dy = endY - drag.startY;
    clearDragStyles();

    if (dy >= 85 || drag.velocityY > 0.45) {
      close();
    }
  }

  sheetEl.addEventListener('touchend', endSheetDrag, { passive: true });
  sheetEl.addEventListener('touchcancel', () => {
    if (!sheetDrag) return;
    const wasLocked = sheetDrag.locked;
    sheetDrag = null;
    if (wasLocked) clearDragStyles();
  }, { passive: true });

  // Button bindings inside sheet
  dom.closeBtn?.addEventListener('click', close);
  dom.moreBtn?.addEventListener('click', () => deps.onOpenStationInfo?.());
  dom.titleBtn?.addEventListener('click', () => deps.onOpenStationInfo?.());
  dom.infoBtn?.addEventListener('click', () => deps.onOpenStationInfo?.());
  dom.sleepBtn?.addEventListener('click', () => deps.onCycleSleepTimer?.());
  dom.shareBtn?.addEventListener('click', () => deps.onShare?.());
  dom.errorNextBtn?.addEventListener('click', () => deps.onNext?.());
  dom.surpriseBtn?.addEventListener('click', () => deps.onSurprise?.());
  dom.prevBtn?.addEventListener('click', () => deps.onPrev?.());
  dom.playBtn?.addEventListener('click', () => deps.player.togglePlayPause());
  dom.nextBtn?.addEventListener('click', () => deps.onNext?.());
  dom.favBtn?.addEventListener('click', () => deps.onToggleFavorite?.());

  function syncTick({ elapsedSeconds = 0, sleepRemainingMs = 0 } = {}) {
    if (dom.timer) {
      dom.timer.textContent = deps.formatElapsed(elapsedSeconds);
    }

    if (sleepRemainingMs > 0) {
      const secsLeft = Math.ceil(sleepRemainingMs / 1000);
      const formatted = deps.formatElapsed(secsLeft);
      if (dom.sleepBadge) {
        dom.sleepBadge.textContent = `⏱ ${formatted}`;
        dom.sleepBadge.style.display = 'inline-flex';
      }
      if (dom.sleepLabel) {
        dom.sleepLabel.textContent = `Sleep ${formatted}`;
      }
      dom.sleepBtn?.classList.add('active');
    } else {
      if (dom.sleepBadge) {
        dom.sleepBadge.style.display = 'none';
      }
      if (dom.sleepLabel) {
        dom.sleepLabel.textContent = 'Sleep';
      }
      dom.sleepBtn?.classList.remove('active');
    }
  }

  function syncFavorite(uuid, isFav) {
    if (!dom.favBtn || deps.player.currentStation?.stationuuid !== uuid) return;
    dom.favBtn.classList.toggle('is-fav', isFav);
    dom.favBtn.setAttribute('aria-label', isFav ? 'Remove from saved' : 'Save current station');
    dom.favBtn.setAttribute('title', isFav ? 'Saved' : 'Save to favorites');
  }

  function syncPlayback(pState) {
    const { station, status, errorMessage } = pState;
    deckEl.classList.toggle('has-station', Boolean(station));

    syncTick(pState);

    if (dom.error) {
      if (status === 'error' && errorMessage) {
        dom.errorText.textContent = errorMessage;
        dom.error.classList.add('visible');
      } else {
        dom.error.classList.remove('visible');
      }
    }

    if (!station) {
      sheetEl.style.removeProperty('--sheet-glow');
      if (dom.art && dom.art.dataset.uuid !== '') {
        dom.art.dataset.uuid = '';
        dom.art.innerHTML = IDLE_ART_SVG;
      }
      dom.art?.classList.remove('is-paused');
      if (dom.title) dom.title.textContent = 'No station selected';
      if (dom.subtitle) dom.subtitle.textContent = 'Select any station to tune in';
      if (dom.techPill) dom.techPill.textContent = 'STANDBY';
      if (dom.footerCaption) dom.footerCaption.textContent = 'ONDA World Radio · Live Broadcast';
      if (dom.playBtn) dom.playBtn.disabled = true;
      if (dom.prevBtn) dom.prevBtn.disabled = true;
      if (dom.nextBtn) dom.nextBtn.disabled = true;
      if (dom.favBtn) {
        dom.favBtn.disabled = true;
        dom.favBtn.classList.remove('is-fav');
      }
      if (dom.shareBtn) dom.shareBtn.disabled = true;
      if (dom.signalTrack) dom.signalTrack.dataset.state = 'idle';
      if (dom.vuBars) dom.vuBars.dataset.state = 'idle';
      if (dom.liveCaption) dom.liveCaption.textContent = 'STANDBY';
      if (dom.onAir) dom.onAir.classList.remove('live', 'buffering', 'error');
      if (dom.statusLabel) dom.statusLabel.textContent = 'STANDBY';
      if (dom.iconPlay) dom.iconPlay.style.display = 'block';
      if (dom.iconPause) dom.iconPause.style.display = 'none';
      if (dom.iconSpinner) dom.iconSpinner.style.display = 'none';
      return;
    }

    const custom = Boolean(deps.isCustom?.(station));
    const queueLen = Number(deps.getQueueLength?.()) || 0;
    const accentHex = deps.getStationAccentColor?.(station);
    const glow = hexToRgba(accentHex, 0.34);
    if (glow) {
      sheetEl.style.setProperty('--sheet-glow', glow);
    } else {
      sheetEl.style.removeProperty('--sheet-glow');
    }

    if (dom.art && dom.art.dataset.uuid !== station.stationuuid) {
      dom.art.dataset.uuid = station.stationuuid;
      dom.art.innerHTML = deps.buildArtworkHtml(station, 312);
    }
    dom.art?.classList.toggle('is-paused', status === 'paused' || status === 'error');

    if (dom.title) dom.title.textContent = station.name || 'Untitled Station';
    const loc = [
      custom && !station.countrycode ? '✦' : deps.countryCodeToFlag(station.countrycode),
      station.country || (custom ? 'Custom Stream' : ''),
      station.language,
    ]
      .filter(Boolean)
      .join(' · ');
    if (dom.subtitle) dom.subtitle.textContent = loc || 'Live Radio Stream';

    const techParts = [
      custom ? '✦ CUSTOM' : '',
      (station.codec || '').toUpperCase(),
      Number(station.bitrate) > 0 ? `${station.bitrate}k` : '',
      Number(station.hls) === 1 ? 'HLS' : '',
    ].filter(Boolean);
    if (dom.techPill) dom.techPill.textContent = techParts.join(' · ') || 'LIVE';

    const tags = deps.parseTags?.(station.tags) || [];
    if (dom.footerCaption) {
      dom.footerCaption.textContent =
        tags.length > 0
          ? tags.slice(0, 3).map((t) => `#${t}`).join(' · ')
          : 'ONDA World Radio · Live Broadcast';
    }

    if (dom.playBtn) dom.playBtn.disabled = false;
    if (dom.prevBtn) dom.prevBtn.disabled = queueLen < 2;
    if (dom.nextBtn) dom.nextBtn.disabled = queueLen < 2;
    if (dom.favBtn) dom.favBtn.disabled = false;
    if (dom.shareBtn) dom.shareBtn.disabled = custom;

    if (dom.onAir) {
      dom.onAir.classList.remove('live', 'buffering', 'error');
      if (status === 'playing') {
        dom.onAir.classList.add('live');
        dom.statusLabel.textContent = 'ON AIR';
      } else if (status === 'loading') {
        dom.onAir.classList.add('buffering');
        dom.statusLabel.textContent = 'TUNING';
      } else if (status === 'error') {
        dom.onAir.classList.add('error');
        dom.statusLabel.textContent = 'SIGNAL LOST';
      } else if (status === 'paused') {
        dom.statusLabel.textContent = 'PAUSED';
      } else {
        dom.statusLabel.textContent = 'STANDBY';
      }
    }

    const animState =
      status === 'playing' ? 'playing' : status === 'loading' ? 'loading' : 'idle';
    if (dom.signalTrack) dom.signalTrack.dataset.state = animState;
    if (dom.vuBars) dom.vuBars.dataset.state = animState;
    if (dom.liveCaption) {
      dom.liveCaption.textContent =
        status === 'playing'
          ? 'LIVE BROADCAST'
          : status === 'loading'
          ? 'CONNECTING STREAM'
          : status === 'error'
          ? 'SIGNAL INTERRUPTED'
          : 'PAUSED';
    }

    if (dom.iconPlay) {
      dom.iconPlay.style.display = status === 'playing' || status === 'loading' ? 'none' : 'block';
    }
    if (dom.iconPause) {
      dom.iconPause.style.display = status === 'playing' ? 'block' : 'none';
    }
    if (dom.iconSpinner) {
      dom.iconSpinner.style.display = status === 'loading' ? 'inline-block' : 'none';
    }

    syncFavorite(station.stationuuid, Boolean(deps.isFavorite?.(station.stationuuid)));
  }

  function setSurpriseLoading(loading) {
    surpriseLoading = Boolean(loading);
    if (dom.surpriseBtn) dom.surpriseBtn.disabled = surpriseLoading;
    if (dom.surpriseIcon) dom.surpriseIcon.style.display = surpriseLoading ? 'none' : 'block';
    if (dom.surpriseSpinner) {
      dom.surpriseSpinner.style.display = surpriseLoading ? 'inline-block' : 'none';
    }
  }

  return {
    isOpen,
    open,
    close,
    syncPlayback,
    syncTick,
    syncFavorite,
    setSurpriseLoading,
  };
}
