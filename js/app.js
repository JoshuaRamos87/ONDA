/**
 * ONDA — World Radio Broadcast Tuner
 * Application Controller: views, filters, search, directories, station details,
 * favorites sync, deep-linking, and keyboard navigation.
 */

import { radioApi } from './api.js';
import { radioPlayer } from './player.js';
import { storage } from './storage.js';

const PAGE_SIZE = 36;

const QUICK_GENRES = [
  'jazz',
  'classical',
  'lofi',
  'electronic',
  'rock',
  'ambient',
  'news',
  'indie',
  'pop',
  'hiphop',
  'chillout',
  'folk',
  'blues',
  'funk',
  'synthwave',
  'reggae',
  'latin',
  'talk',
  'world',
  '80s',
];

const CURATED_PRESETS = {
  popular: {
    label: 'Most Popular Worldwide',
    filters: { name: '', tag: '', countrycode: '', language: '', codec: '', bitrateMin: 0, order: 'clickcount', reverse: true },
  },
  trending: {
    label: 'Trending Worldwide Right Now',
    filters: { name: '', tag: '', countrycode: '', language: '', codec: '', bitrateMin: 0, order: 'clicktrend', reverse: true },
  },
  hifi: {
    label: 'Hi-Fi Broadcasts (256+ kbps)',
    filters: { name: '', tag: '', countrycode: '', language: '', codec: '', bitrateMin: 256, order: 'clickcount', reverse: true },
  },
  topvoted: {
    label: 'Community Top Voted',
    filters: { name: '', tag: '', countrycode: '', language: '', codec: '', bitrateMin: 0, order: 'votes', reverse: true },
  },
  latejazz: {
    label: 'Late Night Jazz',
    filters: { name: '', tag: 'jazz', countrycode: '', language: '', codec: '', bitrateMin: 0, order: 'clickcount', reverse: true },
  },
};

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

/* ==========================================================================
   App State
   ========================================================================== */

const prefs = storage.getPrefs();

const state = {
  view: 'discover', // discover | genres | countries | languages | favorites
  activePreset: 'popular',
  filters: {
    name: '',
    tag: '',
    countrycode: '',
    language: '',
    codec: '',
    bitrateMin: 0,
    order: 'clickcount',
    reverse: true,
    httpsOnly: Boolean(prefs.httpsOnly),
  },
  stations: [],
  offset: 0,
  hasMore: false,
  loadingStations: false,
  abortController: null,

  // Cached directories
  tags: [],
  countries: [],
  languages: [],
  directoriesLoaded: false,

  // Active playback queue (matches current visible list)
  queue: [],
  modalStation: null,
  votedUuids: new Set(),
};

/* ==========================================================================
   DOM References
   ========================================================================== */

const dom = {
  brandHomeBtn: document.getElementById('brand-home-btn'),
  searchForm: document.getElementById('global-search-form'),
  searchInput: document.getElementById('global-search-input'),
  searchClearBtn: document.getElementById('search-clear-btn'),
  navTabs: document.querySelectorAll('.nav-tab[data-view]'),
  favBadges: [
    document.getElementById('favorites-count-badge'),
    document.getElementById('favorites-count-badge-mobile'),
  ],
  surpriseBtn: document.getElementById('surprise-btn'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  themeIconSun: document.getElementById('theme-icon-sun'),
  themeIconMoon: document.getElementById('theme-icon-moon'),

  // Stats & mirror
  statStations: document.getElementById('stat-stations'),
  statCountries: document.getElementById('stat-countries'),
  statTags: document.getElementById('stat-tags'),
  mirrorSwitchBtn: document.getElementById('mirror-switch-btn'),
  mirrorStatusDot: document.getElementById('mirror-status-dot'),
  mirrorHostLabel: document.getElementById('mirror-host-label'),

  // Views
  views: {
    discover: document.getElementById('view-discover'),
    genres: document.getElementById('view-genres'),
    countries: document.getElementById('view-countries'),
    languages: document.getElementById('view-languages'),
    favorites: document.getElementById('view-favorites'),
  },

  // Discover controls
  quickGenreRail: document.getElementById('quick-genre-rail'),
  seeAllGenresBtn: document.getElementById('see-all-genres-btn'),
  presetCards: document.querySelectorAll('.preset-card[data-preset]'),
  filterCountry: document.getElementById('filter-country'),
  filterTag: document.getElementById('filter-tag'),
  filterLanguage: document.getElementById('filter-language'),
  filterQuality: document.getElementById('filter-quality'),
  filterSort: document.getElementById('filter-sort'),
  filterHttpsOnly: document.getElementById('filter-https-only'),
  resetFiltersBtn: document.getElementById('reset-filters-btn'),
  resultsHeading: document.getElementById('results-heading'),
  resultsCount: document.getElementById('results-count'),
  activeFilters: document.getElementById('active-filters'),
  stationsGrid: document.getElementById('stations-grid'),
  loadMoreWrap: document.getElementById('load-more-wrap'),
  loadMoreBtn: document.getElementById('load-more-btn'),

  // Directories
  genresDirCount: document.getElementById('genres-dir-count'),
  genresDirSearch: document.getElementById('genres-dir-search'),
  genresDirGrid: document.getElementById('genres-dir-grid'),
  countriesDirCount: document.getElementById('countries-dir-count'),
  countriesDirSearch: document.getElementById('countries-dir-search'),
  countriesDirGrid: document.getElementById('countries-dir-grid'),
  languagesDirCount: document.getElementById('languages-dir-count'),
  languagesDirSearch: document.getElementById('languages-dir-search'),
  languagesDirGrid: document.getElementById('languages-dir-grid'),

  // Favorites
  favoritesDirCount: document.getElementById('favorites-dir-count'),
  favoritesGrid: document.getElementById('favorites-grid'),
  refreshFavoritesBtn: document.getElementById('refresh-favorites-btn'),
  exportFavoritesBtn: document.getElementById('export-favorites-btn'),
  importFavoritesInput: document.getElementById('import-favorites-input'),
  recentSection: document.getElementById('recent-section'),
  recentGrid: document.getElementById('recent-grid'),
  clearRecentBtn: document.getElementById('clear-recent-btn'),

  // Player Deck
  deckErrorStrip: document.getElementById('deck-error-strip'),
  deckErrorText: document.getElementById('deck-error-text'),
  deckErrorNextBtn: document.getElementById('deck-error-next-btn'),
  deckErrorHomeLink: document.getElementById('deck-error-home-link'),
  deckErrorDismissBtn: document.getElementById('deck-error-dismiss-btn'),
  deckArt: document.getElementById('deck-art'),
  deckOnAir: document.getElementById('deck-on-air'),
  deckStatusLabel: document.getElementById('deck-status-label'),
  deckTech: document.getElementById('deck-tech'),
  deckTitle: document.getElementById('deck-title'),
  deckSubtitle: document.getElementById('deck-subtitle'),
  deckPrevBtn: document.getElementById('deck-prev-btn'),
  deckPlayBtn: document.getElementById('deck-play-btn'),
  deckNextBtn: document.getElementById('deck-next-btn'),
  deckIconPlay: document.getElementById('deck-icon-play'),
  deckIconPause: document.getElementById('deck-icon-pause'),
  deckIconSpinner: document.getElementById('deck-icon-spinner'),
  vuCanvas: document.getElementById('vu-canvas'),
  deckTimer: document.getElementById('deck-timer'),
  deckFavBtn: document.getElementById('deck-fav-btn'),
  deckShareBtn: document.getElementById('deck-share-btn'),
  sleepTimerSelect: document.getElementById('sleep-timer-select'),
  deckMuteBtn: document.getElementById('deck-mute-btn'),
  volIconOn: document.getElementById('vol-icon-on'),
  volIconMuted: document.getElementById('vol-icon-muted'),
  volumeSlider: document.getElementById('volume-slider'),

  // Modal & Toast
  modal: document.getElementById('station-modal'),
  modalArt: document.getElementById('modal-art'),
  modalTitle: document.getElementById('modal-station-title'),
  modalSubtitle: document.getElementById('modal-station-subtitle'),
  modalTags: document.getElementById('modal-tags'),
  modalSpecs: document.getElementById('modal-specs'),
  modalActions: document.getElementById('modal-actions'),
  modalCloseBtn: document.getElementById('modal-close-btn'),
  toastContainer: document.getElementById('toast-container'),
};

/* ==========================================================================
   Utility Helpers
   ========================================================================== */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHttpUrl(url) {
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

/**
 * Avoid mixed-content warnings for http:// favicons when hosted on https:// GitHub Pages.
 */
function getSafeFaviconUrl(url) {
  const clean = sanitizeHttpUrl(url);
  if (!clean) return '';
  if (window.location.protocol === 'https:' && clean.startsWith('http://')) {
    return '';
  }
  return clean;
}

function countryCodeToFlag(code) {
  if (!code || !/^[a-zA-Z]{2}$/.test(code)) return '🌐';
  const upper = code.toUpperCase();
  return String.fromCodePoint(...[...upper].map((c) => 127397 + c.charCodeAt(0)));
}

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 10000) return `${(num / 1000).toFixed(1)}k`;
  return num.toLocaleString();
}

function formatElapsed(totalSeconds) {
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

function getStationMonogram(station) {
  const name = (station.name || 'FM').trim();
  const words = name.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  let initials = 'FM';
  if (words.length >= 2) {
    initials = (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    initials = words[0].slice(0, 2).toUpperCase();
  }
  const color = MONOGRAM_PALETTE[hashString(station.stationuuid || name) % MONOGRAM_PALETTE.length];
  return { initials, color };
}

function parseTags(tagsString) {
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

function buildArtworkHtml(station, size = 58) {
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

function showToast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  dom.toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    setTimeout(() => el.remove(), 220);
  }, 2800);
}

/* ==========================================================================
   Theme Management
   ========================================================================== */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  dom.themeIconSun.style.display = isDark ? 'block' : 'none';
  dom.themeIconMoon.style.display = isDark ? 'none' : 'block';
  storage.setPref('theme', theme);
}

/* ==========================================================================
   URL Deep-Link Synchronization
   ========================================================================== */

function readInitialQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  const tag = params.get('tag');
  const country = params.get('country');
  const lang = params.get('lang');
  const stationUuid = params.get('station');

  if (q) {
    state.filters.name = q;
    state.activePreset = null;
  }
  if (tag) {
    state.filters.tag = tag;
    state.activePreset = null;
  }
  if (country) {
    state.filters.countrycode = country.toUpperCase();
    state.activePreset = null;
  }
  if (lang) {
    state.filters.language = lang;
    state.activePreset = null;
  }

  return { stationUuid };
}

function syncUrlWithFilters() {
  const params = new URLSearchParams();
  if (state.filters.name) params.set('q', state.filters.name);
  if (state.filters.tag) params.set('tag', state.filters.tag);
  if (state.filters.countrycode) params.set('country', state.filters.countrycode);
  if (state.filters.language) params.set('lang', state.filters.language);

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, '', nextUrl);
}

function getStationShareUrl(station) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('station', station.stationuuid);
  return url.toString();
}

/* ==========================================================================
   Navigation & View Switching
   ========================================================================== */

function switchView(viewName) {
  if (!dom.views[viewName]) return;
  state.view = viewName;

  for (const [key, section] of Object.entries(dom.views)) {
    section.style.display = key === viewName ? 'block' : 'none';
  }

  dom.navTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });

  if (viewName === 'genres') {
    renderGenresDirectory(dom.genresDirSearch.value);
  } else if (viewName === 'countries') {
    renderCountriesDirectory(dom.countriesDirSearch.value);
  } else if (viewName === 'languages') {
    renderLanguagesDirectory(dom.languagesDirSearch.value);
  } else if (viewName === 'favorites') {
    renderFavoritesView();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==========================================================================
   Quick Genre Rail & Filter Controls Sync
   ========================================================================== */

function renderQuickGenreRail() {
  const tagMap = new Map(state.tags.map((t) => [t.name.toLowerCase(), Number(t.stationcount)]));

  const items = QUICK_GENRES.map((genre) => {
    const count = tagMap.get(genre);
    const active = state.filters.tag.toLowerCase() === genre;
    return `
      <button type="button" class="genre-chip ${active ? 'active' : ''}" data-quick-genre="${escapeHtml(genre)}" role="listitem">
        <span>${escapeHtml(genre.charAt(0).toUpperCase() + genre.slice(1))}</span>
        ${count ? `<span class="genre-chip-count">${formatNumber(count)}</span>` : ''}
      </button>
    `;
  });

  dom.quickGenreRail.innerHTML = items.join('');
}

function ensureSelectOption(selectEl, value, label = value) {
  if (!value) return;
  const exists = Array.from(selectEl.options).some((opt) => opt.value === value);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    selectEl.appendChild(opt);
  }
}

function syncControlsFromState() {
  dom.searchInput.value = state.filters.name;
  dom.searchClearBtn.classList.toggle('visible', Boolean(state.filters.name));
  ensureSelectOption(dom.filterCountry, state.filters.countrycode);
  ensureSelectOption(dom.filterTag, state.filters.tag);
  ensureSelectOption(dom.filterLanguage, state.filters.language);
  dom.filterCountry.value = state.filters.countrycode;
  dom.filterTag.value = state.filters.tag;
  dom.filterLanguage.value = state.filters.language;
  dom.filterHttpsOnly.checked = state.filters.httpsOnly;

  // Quality select
  if (state.filters.codec) {
    dom.filterQuality.value = `codec:${state.filters.codec}`;
  } else if (state.filters.bitrateMin) {
    dom.filterQuality.value = `bitrate:${state.filters.bitrateMin}`;
  } else {
    dom.filterQuality.value = '';
  }

  // Sort select
  const sortVal = `${state.filters.order}:${state.filters.reverse ? 'desc' : 'asc'}`;
  dom.filterSort.value = dom.filterSort.querySelector(`option[value="${sortVal}"]`)
    ? sortVal
    : 'clickcount:desc';

  // Presets highlight
  dom.presetCards.forEach((card) => {
    card.classList.toggle('active', card.dataset.preset === state.activePreset);
  });

  renderQuickGenreRail();
  renderActiveFilterChips();
}

function renderActiveFilterChips() {
  const chips = [];

  if (state.filters.name) {
    chips.push({ key: 'name', label: `Search: "${state.filters.name}"` });
  }
  if (state.filters.tag) {
    chips.push({ key: 'tag', label: `Genre: ${state.filters.tag}` });
  }
  if (state.filters.countrycode) {
    const match = state.countries.find(
      (c) => (c.iso_3166_1 || '').toUpperCase() === state.filters.countrycode
    );
    const label = match
      ? `${countryCodeToFlag(state.filters.countrycode)} ${match.name}`
      : state.filters.countrycode;
    chips.push({ key: 'countrycode', label });
  }
  if (state.filters.language) {
    chips.push({ key: 'language', label: `Language: ${state.filters.language}` });
  }
  if (state.filters.codec) {
    chips.push({ key: 'codec', label: `Codec: ${state.filters.codec}` });
  }
  if (state.filters.bitrateMin) {
    chips.push({ key: 'bitrateMin', label: `${state.filters.bitrateMin}+ kbps` });
  }

  dom.activeFilters.innerHTML = chips
    .map(
      (c) => `
      <button type="button" class="active-filter-pill" data-remove-filter="${c.key}" title="Remove filter">
        <span>${escapeHtml(c.label)}</span>
        <span aria-hidden="true">✕</span>
      </button>
    `
    )
    .join('');

  // Dynamic heading
  if (state.activePreset && CURATED_PRESETS[state.activePreset]) {
    dom.resultsHeading.textContent = CURATED_PRESETS[state.activePreset].label;
  } else if (chips.length > 0) {
    dom.resultsHeading.textContent = chips.map((c) => c.label).slice(0, 2).join(' · ');
  } else {
    dom.resultsHeading.textContent = 'Worldwide Stations';
  }
}

/* ==========================================================================
   Station Fetching & Rendering
   ========================================================================== */

function renderSkeletons(count = 12) {
  dom.stationsGrid.innerHTML = Array.from({ length: count })
    .map(() => '<div class="skeleton-card" aria-hidden="true"></div>')
    .join('');
}

async function fetchStations({ append = false } = {}) {
  if (state.abortController) {
    state.abortController.abort();
  }
  state.abortController = new AbortController();

  if (!append) {
    state.offset = 0;
    state.stations = [];
    renderSkeletons(12);
    dom.resultsCount.textContent = 'Tuning…';
    dom.loadMoreWrap.style.display = 'none';
  } else {
    dom.loadMoreBtn.disabled = true;
    dom.loadMoreBtn.textContent = 'Loading…';
  }

  state.loadingStations = true;
  syncUrlWithFilters();

  try {
    const batch = await radioApi.searchStations(
      {
        ...state.filters,
        limit: PAGE_SIZE,
        offset: state.offset,
      },
      state.abortController.signal
    );

    if (append) {
      const existingIds = new Set(state.stations.map((s) => s.stationuuid));
      const deduped = batch.filter((s) => !existingIds.has(s.stationuuid));
      state.stations = [...state.stations, ...deduped];
    } else {
      state.stations = batch;
    }

    state.offset += batch.length;
    state.hasMore = batch.length === PAGE_SIZE;

    if (state.view === 'discover') {
      state.queue = state.stations;
    }

    renderStationList(dom.stationsGrid, state.stations, {
      emptyTitle: 'No matching stations found',
      emptyDesc: state.filters.httpsOnly
        ? 'Try broadening your search, removing a filter, or turning off "HTTPS only" to include HTTP broadcasts.'
        : 'Try another station name, genre, or country filter.',
      showReset: true,
    });

    dom.resultsCount.textContent =
      state.stations.length === 0
        ? '0 stations'
        : `Showing ${state.stations.length}${state.hasMore ? '+' : ''} live stations`;

    dom.loadMoreWrap.style.display = state.hasMore ? 'flex' : 'none';
    dom.loadMoreBtn.disabled = false;
    dom.loadMoreBtn.textContent = 'Load more stations';
  } catch (err) {
    if (err && err.name === 'AbortError') return;

    dom.resultsCount.textContent = 'Connection error';
    dom.stationsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1">
        <div class="empty-state-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
          </svg>
        </div>
        <h3>Could not reach Radio Browser mirrors</h3>
        <p>${escapeHtml(err?.message || 'Please check your internet connection or try switching API mirrors.')}</p>
        <button type="button" class="btn-primary" id="retry-fetch-btn">Switch Mirror &amp; Retry</button>
      </div>
    `;
    const retryBtn = document.getElementById('retry-fetch-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        radioApi.rotateMirror();
        fetchStations({ append: false });
      });
    }
  } finally {
    state.loadingStations = false;
  }
}

function renderStationList(container, stations, emptyOpts = {}) {
  if (!stations || stations.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1">
        <div class="empty-state-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
            <circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
          </svg>
        </div>
        <h3>${escapeHtml(emptyOpts.emptyTitle || 'No stations here yet')}</h3>
        <p>${escapeHtml(emptyOpts.emptyDesc || '')}</p>
        ${emptyOpts.showReset ? '<button type="button" class="btn-secondary" data-action="reset-all">Reset filters</button>' : ''}
      </div>
    `;
    return;
  }

  const playerState = radioPlayer.getState();
  const favSet = new Set(storage.getFavorites().map((f) => f.stationuuid));

  container.innerHTML = stations
    .map((station) => buildStationCardHtml(station, playerState, favSet.has(station.stationuuid)))
    .join('');
}

function buildStationCardHtml(station, playerState, isFav) {
  const isCurrent =
    playerState.station && playerState.station.stationuuid === station.stationuuid;
  const isPlaying = isCurrent && playerState.status === 'playing';
  const isLoading = isCurrent && playerState.status === 'loading';

  const flag = countryCodeToFlag(station.countrycode);
  const locationParts = [station.country, station.state].filter(Boolean);
  const locationText = locationParts.length > 0 ? locationParts.join(' · ') : 'International';
  const tags = parseTags(station.tags).slice(0, 3);

  const codec = (station.codec || '').toUpperCase();
  const bitrate = Number(station.bitrate) > 0 ? `${station.bitrate}k` : '';
  const isHls = Number(station.hls) === 1;
  const streamUrl = station.url_resolved || station.url || '';
  const isHttpOnHttps =
    window.location.protocol === 'https:' && streamUrl.startsWith('http://');

  const playOverlayInner = isLoading
    ? '<span class="spinner"></span>'
    : isPlaying
    ? '<span class="eq-bars" aria-hidden="true"><span></span><span></span><span></span></span>'
    : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

  return `
    <article
      class="station-card ${isPlaying ? 'is-playing' : ''} ${isLoading ? 'is-loading' : ''}"
      data-station-uuid="${escapeHtml(station.stationuuid)}"
    >
      <div class="station-card-top">
        <button
          type="button"
          class="station-art-btn"
          data-action="play"
          data-uuid="${escapeHtml(station.stationuuid)}"
          aria-label="${isPlaying ? 'Pause' : 'Play'} ${escapeHtml(station.name)}"
        >
          ${buildArtworkHtml(station, 58)}
          <span class="station-play-overlay">${playOverlayInner}</span>
        </button>

        <div class="station-info">
          <button
            type="button"
            class="station-name-btn"
            data-action="play"
            data-uuid="${escapeHtml(station.stationuuid)}"
            title="${escapeHtml(station.name)}"
          >
            ${escapeHtml(station.name)}
          </button>
          <div class="station-location" title="${escapeHtml(locationText)}">
            <span>${flag}</span>
            <span>${escapeHtml(locationText)}</span>
          </div>
        </div>

        <div class="station-card-actions">
          <button
            type="button"
            class="card-action-btn ${isFav ? 'favorited' : ''}"
            data-action="favorite"
            data-uuid="${escapeHtml(station.stationuuid)}"
            aria-label="${isFav ? 'Remove from saved' : 'Save station'}"
            title="${isFav ? 'Saved' : 'Save station'}"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
            </svg>
          </button>
          <button
            type="button"
            class="card-action-btn"
            data-action="info"
            data-uuid="${escapeHtml(station.stationuuid)}"
            aria-label="Station details"
            title="Station details &amp; link"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
          </button>
        </div>
      </div>

      ${
        tags.length > 0
          ? `<div class="station-tags">
              ${tags
                .map(
                  (t) =>
                    `<button type="button" class="tag-pill" data-action="tag" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`
                )
                .join('')}
            </div>`
          : ''
      }

      <div class="station-meta-footer">
        <div class="tech-specs">
          ${codec ? `<span class="spec-badge">${escapeHtml(codec)}</span>` : ''}
          ${bitrate ? `<span class="spec-badge">${escapeHtml(bitrate)}</span>` : ''}
          ${isHls ? '<span class="spec-badge hls">HLS</span>' : ''}
          ${isHttpOnHttps ? '<span class="spec-badge http-warn" title="HTTP stream may be blocked on HTTPS pages">HTTP</span>' : ''}
        </div>
        <div class="station-stats-inline">
          <span class="station-stat-item" title="Votes">▲ ${formatNumber(station.votes)}</span>
          <span class="station-stat-item" title="24h clicks">▶ ${formatNumber(station.clickcount)}</span>
        </div>
      </div>
    </article>
  `;
}

function findStationByUuid(uuid) {
  return (
    state.stations.find((s) => s.stationuuid === uuid) ||
    storage.getFavorites().find((s) => s.stationuuid === uuid) ||
    storage.getRecent().find((s) => s.stationuuid === uuid) ||
    (radioPlayer.currentStation?.stationuuid === uuid ? radioPlayer.currentStation : null)
  );
}

/* ==========================================================================
   Directories (Genres, Countries, Languages)
   ========================================================================== */

async function loadDirectoriesAndStats() {
  try {
    const [stats, tags, countries, languages] = await Promise.all([
      radioApi.getStats().catch(() => null),
      radioApi.getTags(160).catch(() => []),
      radioApi.getCountries().catch(() => []),
      radioApi.getLanguages(120).catch(() => []),
    ]);

    if (stats) {
      dom.statStations.textContent = formatNumber(stats.stations);
      dom.statCountries.textContent = formatNumber(stats.countries);
      dom.statTags.textContent = formatNumber(stats.tags);
    }

    state.tags = tags;
    state.countries = countries;
    state.languages = languages;
    state.directoriesLoaded = true;

    populateFilterDropdowns();
    renderQuickGenreRail();
    renderActiveFilterChips();

    if (state.view === 'genres') renderGenresDirectory(dom.genresDirSearch.value);
    if (state.view === 'countries') renderCountriesDirectory(dom.countriesDirSearch.value);
    if (state.view === 'languages') renderLanguagesDirectory(dom.languagesDirSearch.value);
  } catch {
    // Non-fatal; station search still works independently
  }
}

function populateFilterDropdowns() {
  // Countries dropdown
  const countryOptions = state.countries
    .map((c) => {
      const code = (c.iso_3166_1 || '').toUpperCase();
      return `<option value="${escapeHtml(code)}">${countryCodeToFlag(code)} ${escapeHtml(c.name)} (${formatNumber(c.stationcount)})</option>`;
    })
    .join('');
  dom.filterCountry.innerHTML = `<option value="">All countries</option>${countryOptions}`;
  dom.filterCountry.value = state.filters.countrycode;

  // Tags dropdown
  const tagOptions = state.tags
    .slice(0, 120)
    .map(
      (t) =>
        `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)} (${formatNumber(t.stationcount)})</option>`
    )
    .join('');
  dom.filterTag.innerHTML = `<option value="">All genres</option>${tagOptions}`;
  if (state.filters.tag && !dom.filterTag.querySelector(`option[value="${CSS.escape(state.filters.tag)}"]`)) {
    const opt = document.createElement('option');
    opt.value = state.filters.tag;
    opt.textContent = state.filters.tag;
    dom.filterTag.appendChild(opt);
  }
  dom.filterTag.value = state.filters.tag;

  // Languages dropdown
  const langOptions = state.languages
    .slice(0, 100)
    .map(
      (l) =>
        `<option value="${escapeHtml(l.name)}">${escapeHtml(l.name)} (${formatNumber(l.stationcount)})</option>`
    )
    .join('');
  dom.filterLanguage.innerHTML = `<option value="">All languages</option>${langOptions}`;
  dom.filterLanguage.value = state.filters.language;
}

function renderGenresDirectory(query = '') {
  if (!state.directoriesLoaded) {
    dom.genresDirCount.textContent = 'Loading genres…';
    dom.genresDirGrid.innerHTML = Array.from({ length: 12 })
      .map(() => '<div class="skeleton-card" style="height:52px" aria-hidden="true"></div>')
      .join('');
    return;
  }
  const q = query.trim().toLowerCase();
  const filtered = q
    ? state.tags.filter((t) => t.name.toLowerCase().includes(q))
    : state.tags;

  dom.genresDirCount.textContent = `${filtered.length} genres`;
  dom.genresDirGrid.innerHTML = filtered
    .map(
      (t) => `
      <button type="button" class="directory-card" data-pick-genre="${escapeHtml(t.name)}">
        <span class="directory-card-main">
          <span class="directory-name">${escapeHtml(t.name)}</span>
        </span>
        <span class="directory-count">${formatNumber(t.stationcount)}</span>
      </button>
    `
    )
    .join('');
}

function renderCountriesDirectory(query = '') {
  if (!state.directoriesLoaded) {
    dom.countriesDirCount.textContent = 'Loading countries…';
    dom.countriesDirGrid.innerHTML = Array.from({ length: 12 })
      .map(() => '<div class="skeleton-card" style="height:52px" aria-hidden="true"></div>')
      .join('');
    return;
  }
  const q = query.trim().toLowerCase();
  const filtered = q
    ? state.countries.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.iso_3166_1 || '').toLowerCase().includes(q)
      )
    : state.countries;

  dom.countriesDirCount.textContent = `${filtered.length} countries`;
  dom.countriesDirGrid.innerHTML = filtered
    .map((c) => {
      const code = (c.iso_3166_1 || '').toUpperCase();
      return `
        <button type="button" class="directory-card" data-pick-country="${escapeHtml(code)}">
          <span class="directory-card-main">
            <span class="directory-flag" aria-hidden="true">${countryCodeToFlag(code)}</span>
            <span class="directory-name">${escapeHtml(c.name)}</span>
          </span>
          <span class="directory-count">${formatNumber(c.stationcount)}</span>
        </button>
      `;
    })
    .join('');
}

function renderLanguagesDirectory(query = '') {
  if (!state.directoriesLoaded) {
    dom.languagesDirCount.textContent = 'Loading languages…';
    dom.languagesDirGrid.innerHTML = Array.from({ length: 12 })
      .map(() => '<div class="skeleton-card" style="height:52px" aria-hidden="true"></div>')
      .join('');
    return;
  }
  const q = query.trim().toLowerCase();
  const filtered = q
    ? state.languages.filter((l) => l.name.toLowerCase().includes(q))
    : state.languages;

  dom.languagesDirCount.textContent = `${filtered.length} languages`;
  dom.languagesDirGrid.innerHTML = filtered
    .map(
      (l) => `
      <button type="button" class="directory-card" data-pick-language="${escapeHtml(l.name)}">
        <span class="directory-card-main">
          <span class="directory-name">${escapeHtml(l.name)}</span>
        </span>
        <span class="directory-count">${formatNumber(l.stationcount)}</span>
      </button>
    `
    )
    .join('');
}

/* ==========================================================================
   Favorites & Recently Tuned View
   ========================================================================== */

function updateFavoriteBadges() {
  const count = storage.getFavorites().length;
  dom.favBadges.forEach((b) => {
    if (b) b.textContent = String(count);
  });
}

function renderFavoritesView() {
  const favorites = storage.getFavorites();
  const recent = storage.getRecent();

  dom.favoritesDirCount.textContent = `${favorites.length} saved station${favorites.length === 1 ? '' : 's'}`;

  renderStationList(dom.favoritesGrid, favorites, {
    emptyTitle: 'No saved stations yet',
    emptyDesc: 'Tap the heart icon on any station card or in the player bar to build your personal dial.',
    showReset: false,
  });

  if (recent.length > 0) {
    dom.recentSection.style.display = 'block';
    renderStationList(dom.recentGrid, recent);
  } else {
    dom.recentSection.style.display = 'none';
  }
}

async function refreshFavoritesFromApi() {
  const current = storage.getFavorites();
  if (current.length === 0) {
    showToast('No saved stations to refresh.');
    return;
  }

  dom.refreshFavoritesBtn.disabled = true;
  dom.refreshFavoritesBtn.textContent = 'Refreshing…';

  try {
    const fresh = await radioApi.getStationsByUuids(current.map((s) => s.stationuuid));
    if (fresh.length > 0) {
      const freshMap = new Map(fresh.map((s) => [s.stationuuid, s]));
      const merged = current.map((saved) => freshMap.get(saved.stationuuid) || saved);
      storage.replaceFavorites(merged);
      renderFavoritesView();
      showToast(`Refreshed ${fresh.length} saved station${fresh.length === 1 ? '' : 's'}.`);
    } else {
      showToast('Saved stations are already up to date.');
    }
  } catch {
    showToast('Could not refresh saved stations right now.');
  } finally {
    dom.refreshFavoritesBtn.disabled = false;
    dom.refreshFavoritesBtn.textContent = 'Refresh links';
  }
}

/* ==========================================================================
   Player UI Synchronization
   ========================================================================== */

function updateDeckUI(pState) {
  const { station, status, errorMessage, volume, muted, elapsedSeconds } = pState;

  // Sync volume controls
  dom.volumeSlider.value = String(muted ? 0 : volume);
  dom.volIconOn.style.display = muted || volume === 0 ? 'none' : 'block';
  dom.volIconMuted.style.display = muted || volume === 0 ? 'block' : 'none';

  // Timer
  dom.deckTimer.textContent = formatElapsed(elapsedSeconds);

  // Error strip
  if (status === 'error' && errorMessage) {
    dom.deckErrorText.textContent = errorMessage;
    dom.deckErrorStrip.classList.add('visible');
    const homeUrl = sanitizeHttpUrl(station?.homepage);
    if (homeUrl) {
      dom.deckErrorHomeLink.href = homeUrl;
      dom.deckErrorHomeLink.style.display = 'inline-block';
    } else {
      dom.deckErrorHomeLink.style.display = 'none';
    }
  } else {
    dom.deckErrorStrip.classList.remove('visible');
  }

  // Sleep timer select state
  dom.sleepTimerSelect.value = String(pState.sleepMinutes || 0);
  dom.sleepTimerSelect.classList.toggle('active', pState.sleepMinutes > 0);

  if (!station) {
    dom.deckPlayBtn.disabled = true;
    dom.deckPrevBtn.disabled = true;
    dom.deckNextBtn.disabled = true;
    dom.deckFavBtn.disabled = true;
    dom.deckShareBtn.disabled = true;
    return;
  }

  dom.deckPlayBtn.disabled = false;
  dom.deckPrevBtn.disabled = state.queue.length < 2;
  dom.deckNextBtn.disabled = state.queue.length < 2;
  dom.deckFavBtn.disabled = false;
  dom.deckShareBtn.disabled = false;

  // Artwork & metadata (only rewrite artwork when station changes to avoid image flicker)
  if (dom.deckArt.dataset.uuid !== station.stationuuid) {
    dom.deckArt.dataset.uuid = station.stationuuid;
    dom.deckArt.innerHTML = buildArtworkHtml(station, 50);
  }

  dom.deckTitle.textContent = station.name || 'Untitled Station';
  const loc = [countryCodeToFlag(station.countrycode), station.country, parseTags(station.tags)[0]]
    .filter(Boolean)
    .join(' · ');
  dom.deckSubtitle.textContent = loc || 'Live Radio Stream';

  const techParts = [
    (station.codec || '').toUpperCase(),
    Number(station.bitrate) > 0 ? `${station.bitrate} kbps` : '',
    Number(station.hls) === 1 ? 'HLS' : '',
  ].filter(Boolean);
  dom.deckTech.textContent = techParts.join(' · ') || 'LIVE STREAM';

  // ON AIR indicator
  dom.deckOnAir.classList.remove('live', 'buffering', 'error');
  if (status === 'playing') {
    dom.deckOnAir.classList.add('live');
    dom.deckStatusLabel.textContent = 'ON AIR';
  } else if (status === 'loading') {
    dom.deckOnAir.classList.add('buffering');
    dom.deckStatusLabel.textContent = 'TUNING';
  } else if (status === 'error') {
    dom.deckOnAir.classList.add('error');
    dom.deckStatusLabel.textContent = 'SIGNAL LOST';
  } else if (status === 'paused') {
    dom.deckStatusLabel.textContent = 'PAUSED';
  } else {
    dom.deckStatusLabel.textContent = 'STANDBY';
  }

  // Play/Pause/Spinner button icons
  dom.deckIconPlay.style.display = status === 'playing' || status === 'loading' ? 'none' : 'block';
  dom.deckIconPause.style.display = status === 'playing' ? 'block' : 'none';
  dom.deckIconSpinner.style.display = status === 'loading' ? 'inline-block' : 'none';

  // Favorite icon state
  const isFav = storage.isFavorite(station.stationuuid);
  dom.deckFavBtn.classList.toggle('active', isFav);

  // Sync active state on visible station cards without full re-render
  syncVisibleCardStates(station.stationuuid, status);
}

function syncVisibleCardStates(activeUuid, status) {
  document.querySelectorAll('.station-card[data-station-uuid]').forEach((card) => {
    const uuid = card.dataset.stationUuid;
    const isMatch = uuid === activeUuid;
    const isPlaying = isMatch && status === 'playing';
    const isLoading = isMatch && status === 'loading';

    card.classList.toggle('is-playing', isPlaying);
    card.classList.toggle('is-loading', isLoading);

    const overlay = card.querySelector('.station-play-overlay');
    if (overlay) {
      if (isLoading) {
        overlay.innerHTML = '<span class="spinner"></span>';
      } else if (isPlaying) {
        overlay.innerHTML =
          '<span class="eq-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
      } else {
        overlay.innerHTML =
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      }
    }
  });
}

function playStationFromList(station, sourceList) {
  if (!station) return;
  if (Array.isArray(sourceList) && sourceList.length > 0) {
    state.queue = sourceList;
  }
  storage.addRecent(station);
  radioPlayer.playStation(station);
}

function stepQueue(delta) {
  if (state.queue.length === 0) return;
  const currentUuid = radioPlayer.currentStation?.stationuuid;
  const currentIdx = state.queue.findIndex((s) => s.stationuuid === currentUuid);
  const nextIdx =
    currentIdx === -1
      ? 0
      : (currentIdx + delta + state.queue.length) % state.queue.length;
  playStationFromList(state.queue[nextIdx], state.queue);
}

async function tuneSurpriseStation() {
  dom.surpriseBtn.disabled = true;
  try {
    const candidates = await radioApi.getRandomStations(state.filters.httpsOnly, 10);
    if (candidates.length === 0) {
      showToast('Could not find a random station right now.');
      return;
    }
    const pick = candidates[0];
    state.queue = candidates;
    playStationFromList(pick, candidates);
    showToast(`Tuned to ${pick.name} (${pick.country || 'Worldwide'})`);
  } catch {
    showToast('Failed to fetch a random station. Try again.');
  } finally {
    dom.surpriseBtn.disabled = false;
  }
}

/* ==========================================================================
   Station Detail Modal
   ========================================================================== */

function openStationModal(station) {
  if (!station) return;
  state.modalStation = station;

  dom.modalArt.innerHTML = buildArtworkHtml(station, 64);
  dom.modalTitle.textContent = station.name || 'Untitled Station';
  dom.modalSubtitle.textContent = [
    countryCodeToFlag(station.countrycode),
    station.country || 'International',
    station.state,
    station.language ? `(${station.language})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const tags = parseTags(station.tags);
  dom.modalTags.innerHTML = tags
    .slice(0, 10)
    .map(
      (t) =>
        `<button type="button" class="tag-pill" data-modal-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`
    )
    .join('');

  const streamUrl = sanitizeHttpUrl(station.url_resolved || station.url);
  const homepageUrl = sanitizeHttpUrl(station.homepage);
  const hasGeo =
    station.geo_lat !== null &&
    station.geo_lat !== undefined &&
    station.geo_long !== null &&
    station.geo_long !== undefined &&
    (Number(station.geo_lat) !== 0 || Number(station.geo_long) !== 0);

  const specs = [
    { label: 'Format & Bitrate', value: `${(station.codec || 'Audio').toUpperCase()}${Number(station.bitrate) > 0 ? ` · ${station.bitrate} kbps` : ''}${Number(station.hls) === 1 ? ' (HLS)' : ''}` },
    { label: 'Community Stats', value: `${formatNumber(station.votes)} votes · ${formatNumber(station.clickcount)} clicks/24h` },
    { label: 'Protocol', value: streamUrl.startsWith('https://') ? 'HTTPS (Secure)' : 'HTTP (Unencrypted)' },
    { label: 'Station UUID', value: station.stationuuid.slice(0, 18) + '…' },
  ];

  dom.modalSpecs.innerHTML = specs
    .map(
      (s) => `
      <div class="modal-spec-box">
        <span class="modal-spec-label">${escapeHtml(s.label)}</span>
        <span class="modal-spec-val">${escapeHtml(s.value)}</span>
      </div>
    `
    )
    .join('');

  const isFav = storage.isFavorite(station.stationuuid);
  const voted = state.votedUuids.has(station.stationuuid);

  dom.modalActions.innerHTML = `
    <button type="button" class="btn-primary" id="modal-play-btn">▶ Tune In</button>
    <button type="button" class="btn-ghost-sm" id="modal-fav-btn">${isFav ? '♥ Saved' : '♡ Save'}</button>
    <button type="button" class="btn-ghost-sm" id="modal-vote-btn" ${voted ? 'disabled' : ''}>${voted ? '✓ Upvoted' : '▲ Upvote'}</button>
    <button type="button" class="btn-ghost-sm" id="modal-share-btn">Copy Link</button>
    ${streamUrl ? '<button type="button" class="btn-ghost-sm" id="modal-copy-stream-btn">Copy Stream URL</button>' : ''}
    ${homepageUrl ? `<a class="btn-ghost-sm" href="${escapeHtml(homepageUrl)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : ''}
    ${hasGeo ? `<a class="btn-ghost-sm" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(station.geo_lat)}&mlon=${encodeURIComponent(station.geo_long)}#map=8/${encodeURIComponent(station.geo_lat)}/${encodeURIComponent(station.geo_long)}" target="_blank" rel="noopener noreferrer">Map ↗</a>` : ''}
  `;

  dom.modal.classList.add('open');

  document.getElementById('modal-play-btn')?.addEventListener('click', () => {
    playStationFromList(station, state.stations.length ? state.stations : [station]);
    closeStationModal();
  });

  document.getElementById('modal-fav-btn')?.addEventListener('click', (e) => {
    const res = storage.toggleFavorite(station);
    e.currentTarget.textContent = res.added ? '♥ Saved' : '♡ Save';
    updateFavoriteBadges();
    updateDeckUI(radioPlayer.getState());
    if (state.view === 'favorites') renderFavoritesView();
    showToast(res.added ? 'Saved to favorites.' : 'Removed from favorites.');
  });

  document.getElementById('modal-vote-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Voting…';
    try {
      const result = await radioApi.voteStation(station.stationuuid);
      if (result && result.ok) {
        state.votedUuids.add(station.stationuuid);
        station.votes = (Number(station.votes) || 0) + 1;
        btn.textContent = '✓ Upvoted';
        showToast('Thanks! Your upvote was recorded on Radio Browser.');
      } else {
        btn.textContent = 'Vote noted';
        showToast(result?.message || 'You already voted for this station recently.');
      }
    } catch {
      btn.disabled = false;
      btn.textContent = '▲ Upvote';
      showToast('Could not submit vote right now.');
    }
  });

  document.getElementById('modal-share-btn')?.addEventListener('click', async () => {
    await copyToClipboard(getStationShareUrl(station), 'Station share link copied!');
  });

  document.getElementById('modal-copy-stream-btn')?.addEventListener('click', async () => {
    await copyToClipboard(streamUrl, 'Direct stream URL copied!');
  });
}

function closeStationModal() {
  dom.modal.classList.remove('open');
  state.modalStation = null;
}

async function copyToClipboard(text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
  } catch {
    showToast('Copy failed — please copy from the address bar.');
  }
}

/* ==========================================================================
   Event Bindings
   ========================================================================== */

function resetAllFilters() {
  state.activePreset = 'popular';
  state.filters = {
    ...CURATED_PRESETS.popular.filters,
    httpsOnly: state.filters.httpsOnly,
  };
  syncControlsFromState();
  fetchStations({ append: false });
}

function bindEvents() {
  // Mirror indicator updates
  radioApi.onMirrorChange(({ host, status }) => {
    const shortHost = host.replace('.api.radio-browser.info', '');
    dom.mirrorHostLabel.textContent = status === 'connecting' ? 'discovering…' : `${shortHost} mirror`;
    dom.mirrorStatusDot.className = `status-dot ${status === 'connected' ? '' : status}`;
  });

  dom.mirrorSwitchBtn.addEventListener('click', () => {
    const next = radioApi.rotateMirror();
    showToast(`Switched API mirror to ${next}`);
    if (state.view === 'discover') {
      fetchStations({ append: false });
    }
  });

  // Brand click returns to Discover reset
  dom.brandHomeBtn.addEventListener('click', () => {
    switchView('discover');
    resetAllFilters();
  });

  // Nav tabs
  dom.navTabs.forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  dom.seeAllGenresBtn.addEventListener('click', () => switchView('genres'));

  // Theme toggle
  dom.themeToggleBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  // Surprise Me
  dom.surpriseBtn.addEventListener('click', tuneSurpriseStation);

  // Global search (debounced + Enter)
  let searchDebounce = null;
  dom.searchInput.addEventListener('input', () => {
    const value = dom.searchInput.value.trim();
    dom.searchClearBtn.classList.toggle('visible', Boolean(value));
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.filters.name = value;
      state.activePreset = null;
      if (state.view !== 'discover') switchView('discover');
      syncControlsFromState();
      fetchStations({ append: false });
    }, 340);
  });

  dom.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(searchDebounce);
    state.filters.name = dom.searchInput.value.trim();
    state.activePreset = null;
    if (state.view !== 'discover') switchView('discover');
    syncControlsFromState();
    fetchStations({ append: false });
  });

  dom.searchClearBtn.addEventListener('click', () => {
    dom.searchInput.value = '';
    dom.searchClearBtn.classList.remove('visible');
    state.filters.name = '';
    syncControlsFromState();
    fetchStations({ append: false });
    dom.searchInput.focus();
  });

  // Quick genres rail
  dom.quickGenreRail.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick-genre]');
    if (!btn) return;
    const genre = btn.dataset.quickGenre;
    state.filters.tag = state.filters.tag.toLowerCase() === genre ? '' : genre;
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false });
  });

  // Curated presets
  dom.presetCards.forEach((card) => {
    card.addEventListener('click', () => {
      const key = card.dataset.preset;
      const preset = CURATED_PRESETS[key];
      if (!preset) return;
      state.activePreset = key;
      state.filters = {
        ...preset.filters,
        httpsOnly: state.filters.httpsOnly,
      };
      syncControlsFromState();
      fetchStations({ append: false });
    });
  });

  // Faceted dropdowns
  dom.filterCountry.addEventListener('change', () => {
    state.filters.countrycode = dom.filterCountry.value;
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false });
  });

  dom.filterTag.addEventListener('change', () => {
    state.filters.tag = dom.filterTag.value;
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false });
  });

  dom.filterLanguage.addEventListener('change', () => {
    state.filters.language = dom.filterLanguage.value;
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false });
  });

  dom.filterQuality.addEventListener('change', () => {
    const val = dom.filterQuality.value;
    state.filters.codec = '';
    state.filters.bitrateMin = 0;
    if (val.startsWith('codec:')) {
      state.filters.codec = val.slice(6);
    } else if (val.startsWith('bitrate:')) {
      state.filters.bitrateMin = Number(val.slice(8)) || 0;
    }
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false });
  });

  dom.filterSort.addEventListener('change', () => {
    const [order, dir] = dom.filterSort.value.split(':');
    state.filters.order = order || 'clickcount';
    state.filters.reverse = dir !== 'asc';
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false });
  });

  dom.filterHttpsOnly.addEventListener('change', () => {
    state.filters.httpsOnly = dom.filterHttpsOnly.checked;
    storage.setPref('httpsOnly', state.filters.httpsOnly);
    fetchStations({ append: false });
  });

  dom.resetFiltersBtn.addEventListener('click', resetAllFilters);

  // Active filter chip removal
  dom.activeFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-filter]');
    if (!btn) return;
    const key = btn.dataset.removeFilter;
    if (key === 'bitrateMin') {
      state.filters.bitrateMin = 0;
    } else if (key in state.filters) {
      state.filters[key] = '';
    }
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false });
  });

  // Load more
  dom.loadMoreBtn.addEventListener('click', () => fetchStations({ append: true }));

  // Delegated clicks on station grids (Discover, Favorites, Recent)
  const handleStationGridClick = (e, sourceGetter) => {
    const resetBtn = e.target.closest('[data-action="reset-all"]');
    if (resetBtn) {
      resetAllFilters();
      return;
    }

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;

    if (action === 'tag') {
      const tag = actionEl.dataset.tag;
      if (tag) {
        state.filters.tag = tag;
        state.activePreset = null;
        switchView('discover');
        syncControlsFromState();
        fetchStations({ append: false });
      }
      return;
    }

    const uuid = actionEl.dataset.uuid;
    const station = findStationByUuid(uuid);
    if (!station) return;

    if (action === 'play') {
      playStationFromList(station, sourceGetter());
    } else if (action === 'favorite') {
      const { added } = storage.toggleFavorite(station);
      actionEl.classList.toggle('favorited', added);
      updateFavoriteBadges();
      updateDeckUI(radioPlayer.getState());
      if (state.view === 'favorites') renderFavoritesView();
      showToast(added ? `Saved "${station.name}"` : `Removed "${station.name}"`);
    } else if (action === 'info') {
      openStationModal(station);
    }
  };

  dom.stationsGrid.addEventListener('click', (e) =>
    handleStationGridClick(e, () => state.stations)
  );
  dom.favoritesGrid.addEventListener('click', (e) =>
    handleStationGridClick(e, () => storage.getFavorites())
  );
  dom.recentGrid.addEventListener('click', (e) =>
    handleStationGridClick(e, () => storage.getRecent())
  );

  // Directory filters & selections
  dom.genresDirSearch.addEventListener('input', () =>
    renderGenresDirectory(dom.genresDirSearch.value)
  );
  dom.countriesDirSearch.addEventListener('input', () =>
    renderCountriesDirectory(dom.countriesDirSearch.value)
  );
  dom.languagesDirSearch.addEventListener('input', () =>
    renderLanguagesDirectory(dom.languagesDirSearch.value)
  );

  dom.genresDirGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick-genre]');
    if (!btn) return;
    state.filters.tag = btn.dataset.pickGenre;
    state.activePreset = null;
    switchView('discover');
    syncControlsFromState();
    fetchStations({ append: false });
  });

  dom.countriesDirGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick-country]');
    if (!btn) return;
    state.filters.countrycode = btn.dataset.pickCountry;
    state.activePreset = null;
    switchView('discover');
    syncControlsFromState();
    fetchStations({ append: false });
  });

  dom.languagesDirGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick-language]');
    if (!btn) return;
    state.filters.language = btn.dataset.pickLanguage;
    state.activePreset = null;
    switchView('discover');
    syncControlsFromState();
    fetchStations({ append: false });
  });

  // Favorites export / import / refresh / clear recent
  dom.refreshFavoritesBtn.addEventListener('click', refreshFavoritesFromApi);

  dom.exportFavoritesBtn.addEventListener('click', () => {
    const data = storage.getFavorites();
    if (data.length === 0) {
      showToast('No saved stations to export.');
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'onda-radio-favorites.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${data.length} saved stations.`);
  });

  dom.importFavoritesInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Invalid JSON format');
      const existing = storage.getFavorites();
      const mergedMap = new Map(existing.map((s) => [s.stationuuid, s]));
      let addedCount = 0;
      for (const item of parsed) {
        if (item && item.stationuuid && !mergedMap.has(item.stationuuid)) {
          mergedMap.set(item.stationuuid, item);
          addedCount++;
        }
      }
      storage.replaceFavorites(Array.from(mergedMap.values()));
      updateFavoriteBadges();
      renderFavoritesView();
      showToast(`Imported ${addedCount} new station${addedCount === 1 ? '' : 's'}.`);
    } catch {
      showToast('Could not import file — expected a valid ONDA favorites JSON array.');
    } finally {
      dom.importFavoritesInput.value = '';
    }
  });

  dom.clearRecentBtn.addEventListener('click', () => {
    storage.clearRecent();
    renderFavoritesView();
    showToast('Cleared recently tuned history.');
  });

  // Player Deck Controls
  dom.deckPlayBtn.addEventListener('click', () => radioPlayer.togglePlayPause());
  dom.deckPrevBtn.addEventListener('click', () => stepQueue(-1));
  dom.deckNextBtn.addEventListener('click', () => stepQueue(1));

  dom.deckTitle.addEventListener('click', () => {
    if (radioPlayer.currentStation) {
      openStationModal(radioPlayer.currentStation);
    }
  });

  dom.deckFavBtn.addEventListener('click', () => {
    const station = radioPlayer.currentStation;
    if (!station) return;
    const { added } = storage.toggleFavorite(station);
    updateFavoriteBadges();
    updateDeckUI(radioPlayer.getState());
    if (state.view === 'favorites') renderFavoritesView();
    // Update visible card heart icon too
    const cardFav = document.querySelector(
      `.station-card[data-station-uuid="${CSS.escape(station.stationuuid)}"] [data-action="favorite"]`
    );
    if (cardFav) cardFav.classList.toggle('favorited', added);
    showToast(added ? `Saved "${station.name}"` : `Removed "${station.name}"`);
  });

  dom.deckShareBtn.addEventListener('click', () => {
    if (!radioPlayer.currentStation) return;
    copyToClipboard(getStationShareUrl(radioPlayer.currentStation), 'Direct station link copied!');
  });

  dom.volumeSlider.addEventListener('input', () => {
    const val = Number(dom.volumeSlider.value);
    radioPlayer.setVolume(val, val === 0);
    storage.setPref('volume', val);
    storage.setPref('muted', val === 0);
  });

  dom.deckMuteBtn.addEventListener('click', () => {
    const muted = radioPlayer.toggleMute();
    storage.setPref('muted', muted);
  });

  dom.sleepTimerSelect.addEventListener('change', () => {
    const mins = Number(dom.sleepTimerSelect.value);
    radioPlayer.setSleepTimer(mins);
    showToast(mins > 0 ? `Sleep timer set for ${mins} minutes.` : 'Sleep timer turned off.');
  });

  dom.deckErrorNextBtn.addEventListener('click', () => {
    if (state.queue.length > 1) {
      stepQueue(1);
    } else {
      tuneSurpriseStation();
    }
  });

  dom.deckErrorDismissBtn.addEventListener('click', () => {
    dom.deckErrorStrip.classList.remove('visible');
  });

  // Modal close & tag clicks
  dom.modalCloseBtn.addEventListener('click', closeStationModal);
  dom.modal.addEventListener('click', (e) => {
    if (e.target === dom.modal) closeStationModal();
    const tagBtn = e.target.closest('[data-modal-tag]');
    if (tagBtn) {
      state.filters.tag = tagBtn.dataset.modalTag;
      state.activePreset = null;
      closeStationModal();
      switchView('discover');
      syncControlsFromState();
      fetchStations({ append: false });
    }
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const target = e.target;
    const isTyping =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

    if (e.key === 'Escape' && dom.modal.classList.contains('open')) {
      closeStationModal();
      return;
    }

    if (isTyping) return;

    if (e.key === '/') {
      e.preventDefault();
      dom.searchInput.focus();
      dom.searchInput.select();
    } else if (e.key === ' ') {
      if (radioPlayer.currentStation) {
        e.preventDefault();
        radioPlayer.togglePlayPause();
      }
    } else if (e.key === 'm' || e.key === 'M') {
      const muted = radioPlayer.toggleMute();
      storage.setPref('muted', muted);
    } else if (e.key === '[') {
      stepQueue(-1);
    } else if (e.key === ']') {
      stepQueue(1);
    } else if (e.key === 'r' || e.key === 'R') {
      tuneSurpriseStation();
    }
  });
}

/* ==========================================================================
   Bootstrap
   ========================================================================== */

async function init() {
  applyTheme(prefs.theme);
  radioPlayer.setVolume(prefs.volume, prefs.muted);
  radioPlayer.attachVuCanvas(dom.vuCanvas);
  radioPlayer.onChange(updateDeckUI);
  radioPlayer.bindMediaSessionHandlers({
    onPrev: () => stepQueue(-1),
    onNext: () => stepQueue(1),
  });

  const { stationUuid } = readInitialQueryParams();

  updateFavoriteBadges();
  bindEvents();
  syncControlsFromState();
  updateDeckUI(radioPlayer.getState());

  // Kick off initial station fetch and directory metadata concurrently
  fetchStations({ append: false });
  loadDirectoriesAndStats();

  // If opened via a shared ?station=<uuid> link, fetch & load that station
  if (stationUuid) {
    try {
      const [station] = await radioApi.getStationsByUuids([stationUuid]);
      if (station) {
        playStationFromList(station, [station]);
        showToast(`Loaded shared station: ${station.name}`);
      }
    } catch {
      // Ignore invalid/unreachable shared station UUID
    }
  }
}

init();
