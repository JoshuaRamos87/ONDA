/**
 * ONDA — Custom Stream URLs (Direct / HLS / M3U / PLS)
 * Handles playlist parsing, remote .m3u/.pls resolution, and the Add/Edit Custom Stream modal.
 */

import { sanitizeHttpUrl } from './utils.js';
import { storage, createCustomUuid, isCustomStation } from './storage.js';

export function isPlaylistUrl(url) {
  return /\.(pls|m3u)(\?.*)?$/i.test(url) && !/\.m3u8(\?.*)?$/i.test(url);
}

export function isHlsUrl(url) {
  return /\.m3u8(\?.*)?$/i.test(url);
}

export function inferCodecFromUrl(url) {
  const lower = String(url || '').toLowerCase();
  if (/\.m3u8(\?|$)/.test(lower)) return 'HLS';
  if (/flac/.test(lower)) return 'FLAC';
  if (/aacp|aac\+|aac/.test(lower)) return 'AAC';
  if (/ogg|opus/.test(lower)) return 'OGG';
  if (/mp3/.test(lower)) return 'MP3';
  return '';
}

export function inferNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '');
    const segment = parsed.pathname.split('/').filter(Boolean).pop() || '';
    const cleanedSeg = segment
      .replace(/\.(mp3|aac|ogg|flac|m3u8?|pls)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    return cleanedSeg ? `${host} · ${cleanedSeg}` : host;
  } catch {
    return 'Custom Radio Stream';
  }
}

/**
 * Parse raw .pls or .m3u playlist text and extract stream URL(s) and optional title.
 * Prefers HTTPS URLs when multiple mirror entries exist.
 */
export function parsePlaylistText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries = [];
  let pendingM3uTitle = '';
  const plsFiles = new Map();
  const plsTitles = new Map();

  for (const line of lines) {
    // PLS format: File1=https://..., Title1=Station Name
    const fileMatch = /^File(\d+)\s*=\s*(.+)$/i.exec(line);
    if (fileMatch) {
      const clean = sanitizeHttpUrl(fileMatch[2]);
      if (clean) plsFiles.set(fileMatch[1], clean);
      continue;
    }

    const titleMatch = /^Title(\d+)\s*=\s*(.+)$/i.exec(line);
    if (titleMatch) {
      plsTitles.set(titleMatch[1], titleMatch[2].trim());
      continue;
    }

    // M3U format: #EXTINF:-1,Station Name
    const extinfMatch = /^#EXTINF:[^,]*,(.+)$/i.exec(line);
    if (extinfMatch) {
      pendingM3uTitle = extinfMatch[1].trim();
      continue;
    }

    if (line.startsWith('#') || line.startsWith('[')) continue;

    const clean = sanitizeHttpUrl(line);
    if (clean) {
      entries.push({ url: clean, title: pendingM3uTitle });
      pendingM3uTitle = '';
    }
  }

  for (const [idx, url] of plsFiles.entries()) {
    entries.push({ url, title: plsTitles.get(idx) || '' });
  }

  if (entries.length === 0) return null;

  const isHttpsPage =
    typeof window !== 'undefined' && window.location?.protocol === 'https:';
  const preferred = isHttpsPage
    ? entries.find((e) => e.url.startsWith('https://')) || entries[0]
    : entries[0];

  return {
    streamUrl: preferred.url,
    title: preferred.title || entries.find((e) => e.title)?.title || '',
    count: entries.length,
  };
}

/**
 * Resolve user input: supports direct URLs, HLS .m3u8 URLs, remote .pls/.m3u URLs,
 * or raw pasted .pls/.m3u file contents.
 */
export async function resolveStreamInput(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) {
    return { error: 'Please enter a stream URL or paste a .m3u / .pls playlist.' };
  }

  // Case 1: User pasted raw .pls or .m3u file contents
  const looksLikeRawPlaylist =
    trimmed.includes('\n') ||
    /\[playlist\]/i.test(trimmed) ||
    /^#EXTM3U/i.test(trimmed) ||
    /^File\d+\s*=/im.test(trimmed);

  if (looksLikeRawPlaylist) {
    const parsed = parsePlaylistText(trimmed);
    if (!parsed) {
      return { error: 'No valid http:// or https:// stream URL was found in that playlist text.' };
    }
    return {
      url: parsed.streamUrl,
      urlResolved: parsed.streamUrl,
      suggestedTitle: parsed.title,
      formatNote: `Extracted stream from playlist (${parsed.count} entr${parsed.count === 1 ? 'y' : 'ies'}).`,
      status: 'ok',
    };
  }

  // Case 2: Single URL
  const singleUrl = sanitizeHttpUrl(trimmed);
  if (!singleUrl) {
    return { error: 'Enter a valid http:// or https:// stream URL (or paste .m3u / .pls text).' };
  }

  // Direct .m3u8 (HLS) or direct audio stream
  if (!isPlaylistUrl(singleUrl)) {
    return {
      url: singleUrl,
      urlResolved: singleUrl,
      suggestedTitle: '',
      formatNote: isHlsUrl(singleUrl)
        ? 'Detected HLS (.m3u8) live stream.'
        : 'Direct audio stream URL ready.',
      status: 'ok',
    };
  }

  // Case 3: Remote .pls or .m3u playlist URL — attempt best-effort CORS fetch & unpack
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(singleUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const body = await res.text();
      const parsed = parsePlaylistText(body);
      if (parsed) {
        return {
          url: singleUrl,
          urlResolved: parsed.streamUrl,
          suggestedTitle: parsed.title,
          formatNote: `Resolved playlist → ${parsed.streamUrl}`,
          status: 'ok',
        };
      }
    }
  } catch {
    // CORS or network error fetching playlist directly
  }

  return {
    url: singleUrl,
    urlResolved: singleUrl,
    suggestedTitle: '',
    formatNote:
      'Could not auto-read playlist (CORS blocked). Saved URL directly — if it does not play, open the .pls/.m3u file and paste its contents here.',
    status: 'warn',
  };
}

export function createCustomStreamModalController(deps) {
  const {
    onBeforeOpen,
    onLockScroll,
    onUnlockScroll,
    onSaved,
    onShowToast,
  } = deps;

  const dom = {
    modal: document.getElementById('custom-station-modal'),
    modalTitle: document.getElementById('custom-modal-title'),
    closeBtn: document.getElementById('custom-close-btn'),
    cancelBtn: document.getElementById('custom-cancel-btn'),
    form: document.getElementById('custom-station-form'),
    urlInput: document.getElementById('custom-url-input'),
    urlHint: document.getElementById('custom-url-hint'),
    parseBtn: document.getElementById('custom-parse-btn'),
    nameInput: document.getElementById('custom-name-input'),
    tagsInput: document.getElementById('custom-tags-input'),
    countryInput: document.getElementById('custom-country-input'),
    homepageInput: document.getElementById('custom-homepage-input'),
    faviconInput: document.getElementById('custom-favicon-input'),
    savePlayBtn: document.getElementById('custom-save-play-btn'),
    saveBtn: document.getElementById('custom-save-btn'),
  };

  let editingUuid = null;
  let lastFocusedEl = null;

  function setHint(text, tone = '') {
    dom.urlHint.textContent = text;
    dom.urlHint.className = `form-hint${tone ? ` ${tone}` : ''}`;
  }

  function updateUrlHintLive() {
    const val = dom.urlInput.value.trim();
    if (!val) {
      setHint('Supports MP3, AAC, OGG, FLAC, HLS (.m3u8), .m3u, and .pls streams.');
      return;
    }

    if (val.includes('\n') || /\[playlist\]|^#EXTM3U|^File1=/im.test(val)) {
      const parsed = parsePlaylistText(val);
      if (parsed) {
        setHint(`Detected playlist text → ${parsed.streamUrl}`, 'ok');
      } else {
        setHint('Playlist text detected, but no http/https stream URL found yet.', 'warn');
      }
      return;
    }

    const clean = sanitizeHttpUrl(val);
    if (!clean) {
      setHint('URL must start with https:// or http:// (or paste raw .m3u / .pls text).', 'warn');
      return;
    }

    if (window.location.protocol === 'https:' && clean.startsWith('http://')) {
      setHint(
        'Heads up: http:// streams are blocked by browsers on HTTPS pages. Use https:// if the station supports it.',
        'warn'
      );
    } else if (isPlaylistUrl(clean)) {
      setHint(
        'Playlist URL detected (.m3u / .pls) — will auto-resolve on save, or click "Resolve" now.',
        'ok'
      );
    } else if (isHlsUrl(clean)) {
      setHint('HLS adaptive stream (.m3u8) detected — ready to save.', 'ok');
    } else {
      setHint('Direct HTTPS stream URL ready.', 'ok');
    }
  }

  async function handleManualResolve() {
    const raw = dom.urlInput.value.trim();
    if (!raw) {
      setHint('Paste a .m3u / .pls link or playlist contents first.', 'warn');
      dom.urlInput.focus();
      return;
    }

    dom.parseBtn.disabled = true;
    dom.parseBtn.textContent = 'Resolving…';
    try {
      const res = await resolveStreamInput(raw);
      if (res.error) {
        setHint(res.error, 'error');
        return;
      }
      if (res.urlResolved && res.urlResolved !== raw) {
        dom.urlInput.value = res.urlResolved;
      }
      if (res.suggestedTitle && !dom.nameInput.value.trim()) {
        dom.nameInput.value = res.suggestedTitle;
      }
      setHint(res.formatNote, res.status);
    } finally {
      dom.parseBtn.disabled = false;
      dom.parseBtn.textContent = 'Resolve .m3u / .pls';
    }
  }

  function open(existingStation = null) {
    onBeforeOpen?.();
    lastFocusedEl = document.activeElement;
    const isEdit = Boolean(existingStation && isCustomStation(existingStation));
    editingUuid = isEdit ? existingStation.stationuuid : null;

    dom.modalTitle.textContent = isEdit ? 'Edit Custom Stream' : 'Add Custom Stream';
    dom.savePlayBtn.textContent = '▶ Save & Play';
    dom.saveBtn.textContent = isEdit ? 'Save Changes' : 'Save Only';

    dom.urlInput.value = isEdit ? existingStation.url_resolved || existingStation.url || '' : '';
    dom.nameInput.value = isEdit ? existingStation.name || '' : '';
    dom.tagsInput.value = isEdit ? existingStation.tags || '' : '';
    dom.countryInput.value = isEdit ? existingStation.country || '' : '';
    dom.homepageInput.value = isEdit ? existingStation.homepage || '' : '';
    dom.faviconInput.value = isEdit ? existingStation.favicon || '' : '';

    updateUrlHintLive();
    dom.modal.classList.add('open');
    onLockScroll?.();
    dom.urlInput.focus();
  }

  function close({ restoreFocus = true, skipUnlock = false } = {}) {
    dom.modal.classList.remove('open');
    editingUuid = null;
    if (!skipUnlock) onUnlockScroll?.();
    if (restoreFocus && lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
      lastFocusedEl.focus();
    }
    lastFocusedEl = null;
  }

  function isOpen() {
    return dom.modal.classList.contains('open');
  }

  async function submit({ playAfterSave = true } = {}) {
    dom.savePlayBtn.disabled = true;
    dom.saveBtn.disabled = true;

    try {
      const resolved = await resolveStreamInput(dom.urlInput.value);
      if (resolved.error) {
        setHint(resolved.error, 'error');
        dom.urlInput.focus();
        return;
      }

      const nameRaw =
        dom.nameInput.value.trim() ||
        resolved.suggestedTitle ||
        inferNameFromUrl(resolved.urlResolved);

      const homepageRaw = dom.homepageInput.value.trim();
      const faviconRaw = dom.faviconInput.value.trim();
      const homepage = homepageRaw ? sanitizeHttpUrl(homepageRaw) : '';
      const favicon = faviconRaw ? sanitizeHttpUrl(faviconRaw) : '';

      if (homepageRaw && !homepage) {
        onShowToast?.('Website URL must start with https:// or http://');
        dom.homepageInput.focus();
        return;
      }
      if (faviconRaw && !favicon) {
        onShowToast?.('Logo URL must start with https:// or http://');
        dom.faviconInput.focus();
        return;
      }

      const station = {
        stationuuid: editingUuid || createCustomUuid(),
        name: nameRaw,
        url: resolved.url,
        url_resolved: resolved.urlResolved,
        homepage,
        favicon,
        tags: dom.tagsInput.value.trim(),
        country: dom.countryInput.value.trim(),
        countrycode: '',
        state: '',
        language: '',
        codec: inferCodecFromUrl(resolved.urlResolved),
        bitrate: 0,
        hls: isHlsUrl(resolved.urlResolved) ? 1 : 0,
        votes: 0,
        clickcount: 0,
        isCustom: true,
      };

      const { station: saved, updated } = storage.upsertFavorite(station);
      close();
      onSaved?.({ station: saved, updated, playAfterSave });
    } finally {
      dom.savePlayBtn.disabled = false;
      dom.saveBtn.disabled = false;
    }
  }

  // Bind modal events once
  let pointerDownTarget = null;
  dom.modal.addEventListener('pointerdown', (e) => {
    pointerDownTarget = e.target;
  });
  dom.closeBtn.addEventListener('click', () => close());
  dom.cancelBtn.addEventListener('click', () => close());
  dom.modal.addEventListener('click', (e) => {
    if (e.target === dom.modal && pointerDownTarget === dom.modal) {
      close();
    }
  });
  dom.urlInput.addEventListener('input', updateUrlHintLive);
  dom.parseBtn.addEventListener('click', handleManualResolve);
  dom.form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit({ playAfterSave: true });
  });
  dom.saveBtn.addEventListener('click', () => {
    submit({ playAfterSave: false });
  });

  return {
    open,
    close,
    isOpen,
    element: dom.modal,
  };
}
