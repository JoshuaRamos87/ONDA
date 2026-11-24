/**
 * ONDA — Shared Pure Utilities
 * Single source of truth for escaping, URL sanitization, formatting, artwork,
 * and feature detection across app, Atlas, PiP, and mobile player modules.
 */

const MONOGRAM_PALETTE = [
  '#C84B31',
  '#2D6A4F',
  '#2B4C7E',
  '#9A5B13',
  '#4A5568',
  '#8C3B4A',
  '#1F6E7A',
  '#6B5B3E',
];

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeHttpUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(String(url).trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
  } catch {
    // invalid URL
  }
  return '';
}

export function getSafeFaviconUrl(url) {
  const clean = sanitizeHttpUrl(url);
  if (!clean) return '';
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && clean.startsWith('http://')) {
    return '';
  }
  return clean;
}

export function countryCodeToFlag(code) {
  if (!code || !/^[a-zA-Z]{2}$/.test(code)) return '🌐';
  const upper = code.toUpperCase();
  return String.fromCodePoint(...[...upper].map((c) => 127397 + c.charCodeAt(0)));
}

export function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 10000) return `${(num / 1000).toFixed(1)}k`;
  return num.toLocaleString();
}

export function formatExactNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
}

export function formatElapsed(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getStationMonogram(station) {
  const name = (station?.name || 'FM').trim();
  const words = name.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  let initials = 'FM';
  if (words.length >= 2) {
    initials = (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    initials = words[0].slice(0, 2).toUpperCase();
  }
  const color = MONOGRAM_PALETTE[hashString(station?.stationuuid || name) % MONOGRAM_PALETTE.length];
  return { initials, color };
}

export function parseTags(tagsString) {
  if (!tagsString) return [];
  return Array.from(
    new Set(
      String(tagsString)
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 1 && t.length <= 28)
    )
  );
}

export function buildArtworkHtml(station, size = 58) {
  const favicon = getSafeFaviconUrl(station.favicon);
  const { initials, color } = getStationMonogram(station);
  const monogram = `<span class="station-monogram" style="background:${color}">${escapeHtml(initials)}</span>`;

  if (!favicon) return monogram;

  return `
    <img
      class="station-art-img"
      src="${escapeHtml(favicon)}"
      alt=""
      width="${size}"
      height="${size}"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"
    >
    <span class="station-monogram" style="background:${color};display:none">${escapeHtml(initials)}</span>
  `;
}

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
