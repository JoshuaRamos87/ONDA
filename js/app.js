/**
 * ONDA — World Radio Broadcast Tuner
 * Application Controller: views, smart search suggestions, filters, directories,
 * station details modal, favorites sync, browser history, and keyboard navigation.
 */

import { APP_CONFIG, ACCENT_THEMES } from './config.js';
import { radioApi } from './api.js';
import { radioPlayer } from './player.js';
import { storage, createCustomUuid, isCustomStation } from './storage.js';
import { isDesktopPipSupported, createMiniTunerController } from './pip.js';
import { createMobilePlayerController } from './mobile-player.js';

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
  sharedStationUuid: null,
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
  directoriesError: false,

  // Active playback queue, modal & PWA tracking
  queue: [],
  modalStation: null,
  editingCustomUuid: null,
  lastFocusedEl: null,
  votedUuids: new Set(),
  surpriseHistory: new Set(),
  deferredInstallPrompt: null,
};

let atlasController = null;
let atlasLoadingPromise = null;
let miniTuner = null;
let mobilePlayer = null;

/* ==========================================================================
   DOM References
   ========================================================================== */

const dom = {
  brandHomeBtn: document.getElementById('brand-home-btn'),
  searchForm: document.getElementById('global-search-form'),
  searchInput: document.getElementById('global-search-input'),
  searchClearBtn: document.getElementById('search-clear-btn'),
  searchSuggestions: document.getElementById('search-suggestions'),
  navTabs: document.querySelectorAll('.nav-tab[data-view]'),
  favBadges: [
    document.getElementById('favorites-count-badge'),
    document.getElementById('favorites-count-badge-mobile'),
  ],
  surpriseBtn: document.getElementById('surprise-btn'),
  surpriseIcon: document.getElementById('surprise-icon'),
  surpriseSpinner: document.getElementById('surprise-spinner'),
  installAppBtn: document.getElementById('install-app-btn'),
  aboutBtn: document.getElementById('about-btn'),
  accentPickerWrap: document.getElementById('accent-picker-wrap'),
  accentPickerBtn: document.getElementById('accent-picker-btn'),
  accentPopover: document.getElementById('accent-popover'),
  accentSwatchList: document.getElementById('accent-swatch-list'),
  footerAboutBtn: document.getElementById('footer-about-btn'),
  footerVersion: document.getElementById('footer-version'),
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
    atlas: document.getElementById('view-atlas'),
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
  addCustomStationBtn: document.getElementById('add-custom-station-btn'),
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
  deckSleepBadge: document.getElementById('deck-sleep-badge'),
  deckTech: document.getElementById('deck-tech'),
  deckTitle: document.getElementById('deck-title'),
  deckSubtitle: document.getElementById('deck-subtitle'),
  deckMobileFavBtn: document.getElementById('deck-mobile-fav-btn'),
  deckMobileMoreBtn: document.getElementById('deck-mobile-more-btn'),
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
  deckPipBtn: document.getElementById('deck-pip-btn'),
  kbdHintPip: document.getElementById('kbd-hint-pip'),
  playerDeck: document.getElementById('player-deck'),
  deckStation: document.querySelector('#player-deck .deck-station'),
  mobileSheet: document.getElementById('mobile-player-sheet'),

  // Modals & Toast
  modal: document.getElementById('station-modal'),
  modalArt: document.getElementById('modal-art'),
  modalTitle: document.getElementById('modal-station-title'),
  modalSubtitle: document.getElementById('modal-station-subtitle'),
  modalTags: document.getElementById('modal-tags'),
  modalSpecs: document.getElementById('modal-specs'),
  modalActions: document.getElementById('modal-actions'),
  modalCloseBtn: document.getElementById('modal-close-btn'),

  aboutModal: document.getElementById('about-modal'),
  aboutCloseBtn: document.getElementById('about-close-btn'),
  aboutModalTitle: document.getElementById('about-modal-title'),
  aboutVersionBadge: document.getElementById('about-version-badge'),
  aboutTagline: document.getElementById('about-tagline'),
  aboutSpecVersion: document.getElementById('about-spec-version'),
  aboutSpecMode: document.getElementById('about-spec-mode'),
  aboutSpecMirror: document.getElementById('about-spec-mirror'),
  aboutSpecRepo: document.getElementById('about-spec-repo'),
  aboutRepoBtn: document.getElementById('about-repo-btn'),
  aboutInstallBtn: document.getElementById('about-install-btn'),
  aboutApiBtn: document.getElementById('about-api-btn'),
  aboutIosTip: document.getElementById('about-ios-tip'),

  customModal: document.getElementById('custom-station-modal'),
  customModalTitle: document.getElementById('custom-modal-title'),
  customCloseBtn: document.getElementById('custom-close-btn'),
  customForm: document.getElementById('custom-station-form'),
  customUrlInput: document.getElementById('custom-url-input'),
  customParseBtn: document.getElementById('custom-parse-btn'),
  customUrlHint: document.getElementById('custom-url-hint'),
  customNameInput: document.getElementById('custom-name-input'),
  customTagsInput: document.getElementById('custom-tags-input'),
  customCountryInput: document.getElementById('custom-country-input'),
  customHomepageInput: document.getElementById('custom-homepage-input'),
  customFaviconInput: document.getElementById('custom-favicon-input'),
  customSavePlayBtn: document.getElementById('custom-save-play-btn'),
  customSaveBtn: document.getElementById('custom-save-btn'),
  customCancelBtn: document.getElementById('custom-cancel-btn'),

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
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', isDark ? '#141619' : '#F5F2EC');
  }
  storage.setPref('theme', theme);
  atlasController?.setTheme(theme);
  miniTuner?.syncTheme();
}

function applyAccent(accentId) {
  const match = ACCENT_THEMES.find((t) => t.id === accentId) || ACCENT_THEMES[0];
  if (match.id === 'vermilion') {
    document.documentElement.removeAttribute('data-accent');
  } else {
    document.documentElement.setAttribute('data-accent', match.id);
  }
  storage.setPref('accent', match.id);
  renderAccentSwatches(match.id);
  atlasController?.setAccent();
  miniTuner?.syncTheme();
  return match;
}

function renderAccentSwatches(activeId) {
  dom.accentSwatchList.innerHTML = ACCENT_THEMES.map(
    (t) => `
      <button
        type="button"
        class="accent-option ${t.id === activeId ? 'active' : ''}"
        role="menuitemradio"
        aria-checked="${t.id === activeId ? 'true' : 'false'}"
        data-accent-pick="${escapeHtml(t.id)}"
      >
        <span class="accent-option-dot" style="background:${escapeHtml(t.swatch)}" aria-hidden="true"></span>
        <span class="accent-option-name">${escapeHtml(t.name.split(' ')[0])}</span>
      </button>
    `
  ).join('');
}

function closeAccentPopover() {
  dom.accentPopover.classList.remove('open');
  dom.accentPickerBtn.setAttribute('aria-expanded', 'false');
}

/* ==========================================================================
   URL Deep-Link & Browser History Synchronization
   ========================================================================== */

function readQueryParamsIntoState() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const q = params.get('q') || '';
  const tag = params.get('tag') || '';
  const country = (params.get('country') || '').toUpperCase();
  const lang = params.get('lang') || '';
  const codec = params.get('codec') || '';
  const bitrateMin = Number(params.get('bitrate')) || 0;
  const sort = params.get('sort') || '';
  const stationUuid = params.get('station') || null;

  state.view = view && dom.views[view] ? view : 'discover';
  state.sharedStationUuid = stationUuid;

  const hasCustomFilter = Boolean(q || tag || country || lang || codec || bitrateMin || sort);
  if (hasCustomFilter) {
    state.activePreset = null;
    const [order, dir] = sort ? sort.split(':') : ['clickcount', 'desc'];
    state.filters = {
      ...state.filters,
      name: q,
      tag,
      countrycode: country,
      language: lang,
      codec,
      bitrateMin,
      order: order || 'clickcount',
      reverse: dir !== 'asc',
    };
  } else {
    state.activePreset = 'popular';
    state.filters = {
      ...CURATED_PRESETS.popular.filters,
      httpsOnly: state.filters.httpsOnly,
    };
  }

  return { stationUuid };
}

function buildUrlFromState() {
  const params = new URLSearchParams();
  if (state.view && state.view !== 'discover') params.set('view', state.view);
  if (state.filters.name) params.set('q', state.filters.name);
  if (state.filters.tag) params.set('tag', state.filters.tag);
  if (state.filters.countrycode) params.set('country', state.filters.countrycode);
  if (state.filters.language) params.set('lang', state.filters.language);
  if (state.filters.codec) params.set('codec', state.filters.codec);
  if (state.filters.bitrateMin) params.set('bitrate', String(state.filters.bitrateMin));

  const sortStr = `${state.filters.order}:${state.filters.reverse ? 'desc' : 'asc'}`;
  if (sortStr !== 'clickcount:desc') params.set('sort', sortStr);

  // Preserve shared ?station=<uuid> while still tuned to or loading that station
  if (state.sharedStationUuid) {
    params.set('station', state.sharedStationUuid);
  }

  const query = params.toString();
  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

function syncHistory({ push = false } = {}) {
  const nextUrl = buildUrlFromState();
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl) return;
  if (push) {
    window.history.pushState(null, '', nextUrl);
  } else {
    window.history.replaceState(null, '', nextUrl);
  }
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

async function ensureAtlasMounted() {
  if (atlasController) return atlasController;
  if (atlasLoadingPromise) return atlasLoadingPromise;

  atlasLoadingPromise = import('./map.js')
    .then(({ createAtlasController }) =>
      createAtlasController({
        radioApi,
        playStation: (station, sourceList) => playStationFromList(station, sourceList),
        toggleFavorite: (station) => {
          const { added } = storage.toggleFavorite(station);
          syncFavoriteIcons(station.stationuuid, added);
          if (state.view === 'favorites') renderFavoritesView();
          showToast(added ? `Saved "${station.name}"` : `Removed "${station.name}"`);
        },
        openInfo: (station) => openStationModal(station),
        isFavorite: (uuid) => storage.isFavorite(uuid),
        getPlayerState: () => radioPlayer.getState(),
        getCountries: () => state.countries,
        getHttpsOnly: () => state.filters.httpsOnly,
        getTheme: () => document.documentElement.getAttribute('data-theme') || 'light',
        showToast,
        openCountryInDiscover: (code) => {
          state.filters.countrycode = code;
          state.activePreset = null;
          switchView('discover', { pushHistory: false });
          syncControlsFromState();
          fetchStations({ append: false, pushHistory: true });
        },
        buildArtworkHtml,
      })
    )
    .then((ctrl) => {
      atlasController = ctrl;
      return ctrl;
    })
    .catch((err) => {
      atlasLoadingPromise = null;
      showToast(err?.message || 'Could not load World Atlas module.');
      return null;
    });

  return atlasLoadingPromise;
}

function switchView(viewName, { pushHistory = true } = {}) {
  if (!dom.views[viewName]) return;
  state.view = viewName;

  for (const [key, section] of Object.entries(dom.views)) {
    section.style.display = key === viewName ? 'block' : 'none';
  }

  dom.navTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });

  if (viewName !== 'atlas') {
    atlasController?.onHide();
  }

  if (viewName === 'atlas') {
    ensureAtlasMounted().then((ctrl) => {
      if (state.view === 'atlas') {
        ctrl?.onShow();
      }
    });
  } else if (viewName === 'genres') {
    renderGenresDirectory(dom.genresDirSearch.value);
  } else if (viewName === 'countries') {
    renderCountriesDirectory(dom.countriesDirSearch.value);
  } else if (viewName === 'languages') {
    renderLanguagesDirectory(dom.languagesDirSearch.value);
  } else if (viewName === 'favorites') {
    renderFavoritesView();
  }

  if (pushHistory) {
    syncHistory({ push: true });
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==========================================================================
   Smart Search Suggestions (Matches Genres, Countries & Languages)
   ========================================================================== */

function hideSearchSuggestions() {
  dom.searchSuggestions.classList.remove('open');
  dom.searchSuggestions.innerHTML = '';
}

function renderSearchSuggestions(rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) {
    hideSearchSuggestions();
    return;
  }

  const suggestions = [];

  // Matching countries
  const countryMatches = state.countries
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.iso_3166_1 || '').toLowerCase() === q
    )
    .slice(0, 3);

  for (const c of countryMatches) {
    suggestions.push({
      type: 'country',
      value: c.iso_3166_1,
      kind: 'Country',
      label: `${countryCodeToFlag(c.iso_3166_1)} ${c.name}`,
      meta: `${formatNumber(c.stationcount)} stations`,
    });
  }

  // Matching genres/tags
  const tagMatches = state.tags
    .filter((t) => t.name.toLowerCase().includes(q))
    .slice(0, 3);

  for (const t of tagMatches) {
    suggestions.push({
      type: 'tag',
      value: t.name,
      kind: 'Genre',
      label: `#${t.name}`,
      meta: `${formatNumber(t.stationcount)} stations`,
    });
  }

  // Matching languages
  const langMatches = state.languages
    .filter((l) => l.name.toLowerCase().includes(q))
    .slice(0, 2);

  for (const l of langMatches) {
    suggestions.push({
      type: 'language',
      value: l.name,
      kind: 'Language',
      label: l.name.charAt(0).toUpperCase() + l.name.slice(1),
      meta: `${formatNumber(l.stationcount)} stations`,
    });
  }

  // Always offer direct station name search
  suggestions.push({
    type: 'name',
    value: rawQuery.trim(),
    kind: 'Search',
    label: `Station names containing "${rawQuery.trim()}"`,
    meta: 'Enter ↵',
  });

  if (suggestions.length <= 1) {
    hideSearchSuggestions();
    return;
  }

  dom.searchSuggestions.innerHTML = suggestions
    .map(
      (s) => `
      <button
        type="button"
        class="search-suggestion-item"
        role="option"
        data-suggest-type="${escapeHtml(s.type)}"
        data-suggest-value="${escapeHtml(s.value)}"
      >
        <span class="suggestion-left">
          <span class="suggestion-kind">${escapeHtml(s.kind)}</span>
          <span class="suggestion-label">${escapeHtml(s.label)}</span>
        </span>
        <span class="suggestion-meta">${escapeHtml(s.meta)}</span>
      </button>
    `
    )
    .join('');

  dom.searchSuggestions.classList.add('open');
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

  if (state.filters.codec) {
    dom.filterQuality.value = `codec:${state.filters.codec}`;
  } else if (state.filters.bitrateMin) {
    dom.filterQuality.value = `bitrate:${state.filters.bitrateMin}`;
  } else {
    dom.filterQuality.value = '';
  }

  const sortVal = `${state.filters.order}:${state.filters.reverse ? 'desc' : 'asc'}`;
  dom.filterSort.value = dom.filterSort.querySelector(`option[value="${sortVal}"]`)
    ? sortVal
    : 'clickcount:desc';

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

  const reshuffleChip =
    state.filters.order === 'random'
      ? '<button type="button" class="active-filter-pill" data-reshuffle="true" title="Load a fresh random shuffle">↻ Reshuffle</button>'
      : '';

  dom.activeFilters.innerHTML =
    chips
      .map(
        (c) => `
      <button type="button" class="active-filter-pill" data-remove-filter="${c.key}" title="Remove filter">
        <span>${escapeHtml(c.label)}</span>
        <span aria-hidden="true">✕</span>
      </button>
    `
      )
      .join('') + reshuffleChip;

  if (state.activePreset && CURATED_PRESETS[state.activePreset]) {
    dom.resultsHeading.textContent = CURATED_PRESETS[state.activePreset].label;
  } else if (chips.length > 0) {
    dom.resultsHeading.textContent = chips.map((c) => c.label).slice(0, 2).join(' · ');
  } else if (state.filters.order === 'random') {
    dom.resultsHeading.textContent = 'Random Shuffle Worldwide';
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

async function fetchStations({ append = false, pushHistory = false, preserveOffset = false } = {}) {
  if (state.abortController) {
    state.abortController.abort();
  }
  state.abortController = new AbortController();

  if (!append) {
    if (!preserveOffset) {
      state.offset = 0;
    }
    state.stations = [];
    renderSkeletons(12);
    dom.resultsCount.textContent = 'Tuning…';
    dom.loadMoreWrap.style.display = 'none';
  } else {
    dom.loadMoreBtn.disabled = true;
    dom.loadMoreBtn.textContent = 'Loading…';
  }

  state.loadingStations = true;
  if (pushHistory) {
    syncHistory({ push: true });
  }

  try {
    let { stations: batch, rawCount } = await radioApi.searchStations(
      {
        ...state.filters,
        limit: PAGE_SIZE,
        offset: state.offset,
      },
      state.abortController.signal
    );

    // If a randomized reshuffle offset overshot a narrow filter, fall back cleanly to offset 0
    if (!append && preserveOffset && batch.length === 0 && state.offset > 0) {
      state.offset = 0;
      const retry = await radioApi.searchStations(
        {
          ...state.filters,
          limit: PAGE_SIZE,
          offset: 0,
        },
        state.abortController.signal
      );
      batch = retry.stations;
      rawCount = retry.rawCount;
    }

    if (append) {
      const existingIds = new Set(state.stations.map((s) => s.stationuuid));
      const existingUrls = new Set(
        state.stations.map((s) => (s.url_resolved || s.url || '').toLowerCase()).filter(Boolean)
      );
      const deduped = batch.filter((s) => {
        if (existingIds.has(s.stationuuid)) return false;
        const urlKey = (s.url_resolved || s.url || '').toLowerCase();
        if (urlKey && existingUrls.has(urlKey)) return false;
        return true;
      });
      state.stations = [...state.stations, ...deduped];
    } else {
      state.stations = batch;
    }

    state.offset += rawCount;
    state.hasMore = rawCount === PAGE_SIZE && state.filters.order !== 'random';

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

    // If "Load more" failed, preserve already-loaded stations and let the user retry!
    if (append && state.stations.length > 0) {
      dom.loadMoreBtn.disabled = false;
      dom.loadMoreBtn.textContent = 'Retry loading more';
      showToast('Could not load more stations right now — please try again.');
      return;
    }

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
    document.getElementById('retry-fetch-btn')?.addEventListener('click', () => {
      radioApi.rotateMirror();
      fetchStations({ append: false });
    });
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
        ${emptyOpts.showAddCustom ? '<button type="button" class="btn-primary" data-action="open-add-custom">+ Add Custom Stream</button>' : ''}
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
  const playState = isLoading ? 'loading' : isPlaying ? 'playing' : 'idle';
  const custom = isCustomStation(station);

  const flag = custom && !station.countrycode ? '✦' : countryCodeToFlag(station.countrycode);
  const locationParts = [station.country, station.state].filter(Boolean);
  const locationText =
    locationParts.length > 0 ? locationParts.join(' · ') : custom ? 'Custom Stream' : 'International';
  const tags = parseTags(station.tags).slice(0, 3);

  const codec = (station.codec || '').toUpperCase();
  const bitrate = Number(station.bitrate) > 0 ? `${station.bitrate}k` : '';
  const isHls = Number(station.hls) === 1;
  const streamUrl = station.url_resolved || station.url || '';
  const hasHttpsAlt =
    streamUrl.startsWith('https://') || (station.url || '').startsWith('https://');
  const isHttpOnHttps = window.location.protocol === 'https:' && !hasHttpsAlt;

  const playOverlayInner = isLoading
    ? '<span class="spinner"></span>'
    : isPlaying
    ? '<span class="eq-bars" aria-hidden="true"><span></span><span></span><span></span></span>'
    : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

  return `
    <article
      class="station-card ${isPlaying ? 'is-playing' : ''} ${isLoading ? 'is-loading' : ''}"
      data-station-uuid="${escapeHtml(station.stationuuid)}"
      data-play-state="${playState}"
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
          ${custom ? '<span class="spec-badge custom" title="Manually added custom stream">✦ Custom</span>' : ''}
          ${codec ? `<span class="spec-badge">${escapeHtml(codec)}</span>` : ''}
          ${bitrate ? `<span class="spec-badge">${escapeHtml(bitrate)}</span>` : ''}
          ${isHls ? '<span class="spec-badge hls">HLS</span>' : ''}
          ${isHttpOnHttps ? '<span class="spec-badge http-warn" title="HTTP stream may be blocked on HTTPS pages">HTTP</span>' : ''}
        </div>
        <div class="station-stats-inline">
          ${
            custom
              ? `<button type="button" class="text-link-btn" style="font-size:0.72rem;font-family:var(--font-mono)" data-action="edit-custom" data-uuid="${escapeHtml(station.stationuuid)}">✎ Edit</button>`
              : `<span class="station-stat-item" title="Votes">▲ ${formatNumber(station.votes)}</span>
                 <span class="station-stat-item" title="24h clicks">▶ ${formatNumber(station.clickcount)}</span>`
          }
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
    atlasController?.findStation(uuid) ||
    (radioPlayer.currentStation?.stationuuid === uuid ? radioPlayer.currentStation : null)
  );
}

/**
 * Keep favorite heart states synchronized across all visible cards, deck, and badges.
 */
function syncFavoriteIcons(uuid, isFav) {
  updateFavoriteBadges();
  document
    .querySelectorAll(`.station-card[data-station-uuid="${CSS.escape(uuid)}"] [data-action="favorite"]`)
    .forEach((btn) => {
      btn.classList.toggle('favorited', isFav);
      btn.setAttribute('aria-label', isFav ? 'Remove from saved' : 'Save station');
      btn.setAttribute('title', isFav ? 'Saved' : 'Save station');
    });

  atlasController?.syncFavorite(uuid, isFav);

  if (radioPlayer.currentStation?.stationuuid === uuid) {
    dom.deckFavBtn.classList.toggle('active', isFav);
    dom.deckMobileFavBtn.classList.toggle('active', isFav);
  }
  miniTuner?.syncFavorite(uuid, isFav);
  mobilePlayer?.syncFavorite(uuid, isFav);
}

/* ==========================================================================
   Directories (Genres, Countries, Languages) with Retry Recovery
   ========================================================================== */

async function loadDirectoriesAndStats() {
  state.directoriesError = false;
  try {
    const [stats, tags, countries, languages] = await Promise.all([
      radioApi.getStats().catch(() => null),
      radioApi.getTags(180),
      radioApi.getCountries(),
      radioApi.getLanguages(140),
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
    state.directoriesError = false;

    atlasController?.setCountries(countries);
    populateFilterDropdowns();
    renderQuickGenreRail();
    renderActiveFilterChips();

    if (state.view === 'genres') renderGenresDirectory(dom.genresDirSearch.value);
    if (state.view === 'countries') renderCountriesDirectory(dom.countriesDirSearch.value);
    if (state.view === 'languages') renderLanguagesDirectory(dom.languagesDirSearch.value);
  } catch {
    state.directoriesError = true;
    if (state.view === 'genres') renderGenresDirectory(dom.genresDirSearch.value);
    if (state.view === 'countries') renderCountriesDirectory(dom.countriesDirSearch.value);
    if (state.view === 'languages') renderLanguagesDirectory(dom.languagesDirSearch.value);
  }
}

function renderDirectoryRetry(gridEl, countEl, label) {
  countEl.textContent = 'Unavailable';
  gridEl.innerHTML = `
    <div class="empty-state" style="grid-column: 1 / -1">
      <h3>Could not load ${escapeHtml(label)}</h3>
      <p>The active Radio Browser mirror did not respond in time.</p>
      <button type="button" class="btn-primary" data-retry-directories="true">Switch Mirror &amp; Retry</button>
    </div>
  `;
}

function populateFilterDropdowns() {
  const countryOptions = state.countries
    .map((c) => {
      const code = (c.iso_3166_1 || '').toUpperCase();
      return `<option value="${escapeHtml(code)}">${countryCodeToFlag(code)} ${escapeHtml(c.name)} (${formatNumber(c.stationcount)})</option>`;
    })
    .join('');
  dom.filterCountry.innerHTML = `<option value="">All countries</option>${countryOptions}`;
  ensureSelectOption(dom.filterCountry, state.filters.countrycode);
  dom.filterCountry.value = state.filters.countrycode;

  const tagOptions = state.tags
    .slice(0, 140)
    .map(
      (t) =>
        `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)} (${formatNumber(t.stationcount)})</option>`
    )
    .join('');
  dom.filterTag.innerHTML = `<option value="">All genres</option>${tagOptions}`;
  ensureSelectOption(dom.filterTag, state.filters.tag);
  dom.filterTag.value = state.filters.tag;

  const langOptions = state.languages
    .slice(0, 110)
    .map(
      (l) =>
        `<option value="${escapeHtml(l.name)}">${escapeHtml(l.name)} (${formatNumber(l.stationcount)})</option>`
    )
    .join('');
  dom.filterLanguage.innerHTML = `<option value="">All languages</option>${langOptions}`;
  ensureSelectOption(dom.filterLanguage, state.filters.language);
  dom.filterLanguage.value = state.filters.language;
}

function renderGenresDirectory(query = '') {
  if (!state.directoriesLoaded) {
    if (state.directoriesError) {
      renderDirectoryRetry(dom.genresDirGrid, dom.genresDirCount, 'genres');
      return;
    }
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
    if (state.directoriesError) {
      renderDirectoryRetry(dom.countriesDirGrid, dom.countriesDirCount, 'countries');
      return;
    }
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
    if (state.directoriesError) {
      renderDirectoryRetry(dom.languagesDirGrid, dom.languagesDirCount, 'languages');
      return;
    }
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
  const customCount = favorites.filter((s) => isCustomStation(s)).length;

  dom.favoritesDirCount.textContent = `${favorites.length} saved station${favorites.length === 1 ? '' : 's'}${customCount > 0 ? ` · ${customCount} custom` : ''}`;

  renderStationList(dom.favoritesGrid, favorites, {
    emptyTitle: 'No saved stations yet',
    emptyDesc: 'Tap the heart icon on any station, or add your own custom direct / M3U / PLS stream URL.',
    showReset: false,
    showAddCustom: true,
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

  const apiStations = current.filter((s) => !isCustomStation(s));
  if (apiStations.length === 0) {
    showToast('All saved stations are custom streams.');
    return;
  }

  dom.refreshFavoritesBtn.disabled = true;
  dom.refreshFavoritesBtn.textContent = 'Refreshing…';

  try {
    const fresh = await radioApi.getStationsByUuids(apiStations.map((s) => s.stationuuid));
    if (fresh.length > 0) {
      const freshMap = new Map(fresh.map((s) => [s.stationuuid, s]));
      const merged = current.map((saved) =>
        isCustomStation(saved) ? saved : freshMap.get(saved.stationuuid) || saved
      );
      storage.replaceFavorites(merged);
      renderFavoritesView();
      showToast(`Refreshed ${fresh.length} Radio Browser station${fresh.length === 1 ? '' : 's'}.`);
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
   Player UI Synchronization (Separated State vs 1s Tick)
   ========================================================================== */

function updateDeckTick({ elapsedSeconds, sleepRemainingMs }) {
  dom.deckTimer.textContent = formatElapsed(elapsedSeconds);

  if (sleepRemainingMs > 0) {
    const secsLeft = Math.ceil(sleepRemainingMs / 1000);
    dom.deckSleepBadge.textContent = `⏱ ${formatElapsed(secsLeft)}`;
    dom.deckSleepBadge.style.display = 'inline-flex';
  } else {
    dom.deckSleepBadge.style.display = 'none';
  }
  miniTuner?.syncTick({ elapsedSeconds, sleepRemainingMs });
  mobilePlayer?.syncTick({ elapsedSeconds, sleepRemainingMs });
}

function updateDeckUI(pState) {
  const { station, status, errorMessage, volume, muted } = pState;

  dom.volumeSlider.value = String(muted ? 0 : volume);
  dom.volIconOn.style.display = muted || volume === 0 ? 'none' : 'block';
  dom.volIconMuted.style.display = muted || volume === 0 ? 'block' : 'none';

  updateDeckTick(pState);

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

  dom.sleepTimerSelect.value = String(pState.sleepMinutes || 0);
  dom.sleepTimerSelect.classList.toggle('active', pState.sleepMinutes > 0);

  if (!station) {
    dom.deckPlayBtn.disabled = true;
    dom.deckPrevBtn.disabled = true;
    dom.deckNextBtn.disabled = true;
    dom.deckFavBtn.disabled = true;
    dom.deckMobileFavBtn.disabled = true;
    dom.deckMobileMoreBtn.disabled = true;
    dom.deckShareBtn.disabled = true;
    miniTuner?.syncPlayback(pState);
    mobilePlayer?.syncPlayback(pState);
    return;
  }

  const custom = isCustomStation(station);
  dom.deckPlayBtn.disabled = false;
  dom.deckPrevBtn.disabled = state.queue.length < 2;
  dom.deckNextBtn.disabled = state.queue.length < 2;
  dom.deckFavBtn.disabled = false;
  dom.deckMobileFavBtn.disabled = false;
  dom.deckMobileMoreBtn.disabled = false;
  dom.deckShareBtn.disabled = custom;
  dom.deckShareBtn.title = custom
    ? 'Custom streams are stored locally — export JSON to share'
    : 'Copy direct station link';

  if (dom.deckArt.dataset.uuid !== station.stationuuid) {
    dom.deckArt.dataset.uuid = station.stationuuid;
    dom.deckArt.innerHTML = buildArtworkHtml(station, 50);
  }

  dom.deckTitle.textContent = station.name || 'Untitled Station';
  const loc = [
    custom && !station.countrycode ? '✦' : countryCodeToFlag(station.countrycode),
    station.country || (custom ? 'Custom Stream' : ''),
    parseTags(station.tags)[0],
  ]
    .filter(Boolean)
    .join(' · ');
  dom.deckSubtitle.textContent = loc || 'Live Radio Stream';

  const techParts = [
    custom ? '✦ CUSTOM' : '',
    (station.codec || '').toUpperCase(),
    Number(station.bitrate) > 0 ? `${station.bitrate} kbps` : '',
    Number(station.hls) === 1 ? 'HLS' : '',
  ].filter(Boolean);
  dom.deckTech.textContent = techParts.join(' · ') || 'LIVE STREAM';

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

  dom.deckIconPlay.style.display = status === 'playing' || status === 'loading' ? 'none' : 'block';
  dom.deckIconPause.style.display = status === 'playing' ? 'block' : 'none';
  dom.deckIconSpinner.style.display = status === 'loading' ? 'inline-block' : 'none';

  const isFav = storage.isFavorite(station.stationuuid);
  dom.deckFavBtn.classList.toggle('active', isFav);
  dom.deckMobileFavBtn.classList.toggle('active', isFav);

  syncVisibleCardStates(station.stationuuid, status);
  atlasController?.syncPlayback(pState);
  miniTuner?.syncPlayback(pState);
  mobilePlayer?.syncPlayback(pState);
}

/**
 * Only rewrite a card's play overlay when its visual playState actually changes,
 * preserving smooth CSS equalizer animations without resetting frames.
 */
function syncVisibleCardStates(activeUuid, status) {
  document.querySelectorAll('.station-card[data-station-uuid]').forEach((card) => {
    const uuid = card.dataset.stationUuid;
    const isMatch = uuid === activeUuid;
    const nextState =
      isMatch && status === 'loading'
        ? 'loading'
        : isMatch && status === 'playing'
        ? 'playing'
        : 'idle';

    if (card.dataset.playState === nextState) return;
    card.dataset.playState = nextState;

    card.classList.toggle('is-playing', nextState === 'playing');
    card.classList.toggle('is-loading', nextState === 'loading');

    const overlay = card.querySelector('.station-play-overlay');
    if (overlay) {
      if (nextState === 'loading') {
        overlay.innerHTML = '<span class="spinner"></span>';
      } else if (nextState === 'playing') {
        overlay.innerHTML =
          '<span class="eq-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
      } else {
        overlay.innerHTML =
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      }
    }
  });
}

function playStationFromList(station, sourceList, options = {}) {
  if (!station) return;
  if (Array.isArray(sourceList) && sourceList.length > 0) {
    state.queue = sourceList;
  }
  if (state.sharedStationUuid && state.sharedStationUuid !== station.stationuuid) {
    state.sharedStationUuid = null;
    syncHistory({ push: false });
  }
  storage.addRecent(station);
  radioPlayer.playStation(station, options);
}

function stepQueue(delta) {
  if (state.queue.length === 0) return;
  const currentUuid = radioPlayer.currentStation?.stationuuid;
  const currentIdx = state.queue.findIndex((s) => s.stationuuid === currentUuid);
  const nextIdx =
    currentIdx === -1
      ? 0
      : (currentIdx + delta + state.queue.length) % state.queue.length;
  playStationFromList(state.queue[nextIdx], state.queue, { forcePlay: true });
}

async function tuneSurpriseStation() {
  dom.surpriseBtn.disabled = true;
  dom.surpriseIcon.style.display = 'none';
  dom.surpriseSpinner.style.display = 'inline-block';
  miniTuner?.setSurpriseLoading(true);
  mobilePlayer?.setSurpriseLoading(true);

  try {
    const candidates = await radioApi.getRandomStations(state.filters.httpsOnly, 40);
    if (candidates.length === 0) {
      showToast('Could not find a random station right now.');
      return;
    }

    const currentUuid = radioPlayer.currentStation?.stationuuid;
    let unseen = candidates.filter(
      (s) => s.stationuuid !== currentUuid && !state.surpriseHistory.has(s.stationuuid)
    );

    if (unseen.length === 0) {
      state.surpriseHistory.clear();
      unseen = candidates.filter((s) => s.stationuuid !== currentUuid);
    }

    const pool = unseen.length > 0 ? unseen : candidates;
    const pick = pool[Math.floor(Math.random() * pool.length)];

    state.surpriseHistory.add(pick.stationuuid);
    if (state.surpriseHistory.size > 200) {
      state.surpriseHistory.clear();
      state.surpriseHistory.add(pick.stationuuid);
    }

    // Place chosen station at the front of the shuffled queue so Prev/Next steps through varied picks
    state.queue = [pick, ...candidates.filter((s) => s.stationuuid !== pick.stationuuid)];
    playStationFromList(pick, state.queue, { forcePlay: true });
    showToast(`Tuned to ${pick.name} (${pick.country || 'Worldwide'})`);
  } catch {
    showToast('Failed to fetch a random station. Try again.');
  } finally {
    dom.surpriseBtn.disabled = false;
    dom.surpriseIcon.style.display = 'block';
    dom.surpriseSpinner.style.display = 'none';
    miniTuner?.setSurpriseLoading(false);
    mobilePlayer?.setSurpriseLoading(false);
  }
}

/* ==========================================================================
   Station Detail Modal (Includes Mobile-Friendly Sleep Timer & Mute)
   ========================================================================== */

function openStationModal(station) {
  if (!station) return;
  state.lastFocusedEl = document.activeElement;
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

  const custom = isCustomStation(station);
  const specs = [
    {
      label: 'Format & Bitrate',
      value: `${(station.codec || 'Audio').toUpperCase()}${Number(station.bitrate) > 0 ? ` · ${station.bitrate} kbps` : ''}${Number(station.hls) === 1 ? ' (HLS)' : ''}`,
    },
    {
      label: custom ? 'Source' : 'Community Stats',
      value: custom
        ? '✦ Manually Added Custom Stream'
        : `${formatNumber(station.votes)} votes · ${formatNumber(station.clickcount)} clicks/24h`,
    },
    {
      label: 'Protocol',
      value: streamUrl.startsWith('https://') ? 'HTTPS (Secure)' : 'HTTP (Unencrypted)',
    },
    {
      label: custom ? 'Local ID' : 'Station UUID',
      value: station.stationuuid.slice(0, 18) + '…',
    },
  ];

  const pState = radioPlayer.getState();
  const isThisPlaying =
    pState.station?.stationuuid === station.stationuuid && pState.status === 'playing';
  const isFav = storage.isFavorite(station.stationuuid);
  const voted = state.votedUuids.has(station.stationuuid);

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

  dom.modalActions.innerHTML = `
    <div class="modal-tuner-bar" style="width:100%;margin-top:0;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:8px">
        <label for="modal-sleep-select">Sleep Timer</label>
        <select id="modal-sleep-select" class="modal-sleep-select">
          <option value="0" ${pState.sleepMinutes === 0 ? 'selected' : ''}>Off</option>
          <option value="15" ${pState.sleepMinutes === 15 ? 'selected' : ''}>15 min</option>
          <option value="30" ${pState.sleepMinutes === 30 ? 'selected' : ''}>30 min</option>
          <option value="60" ${pState.sleepMinutes === 60 ? 'selected' : ''}>60 min</option>
        </select>
      </div>
      <button type="button" class="btn-ghost-sm" id="modal-mute-btn">
        ${pState.muted ? '🔇 Unmute Audio' : '🔊 Mute Audio'}
      </button>
    </div>
    <button type="button" class="btn-primary" id="modal-play-btn">${isThisPlaying ? '⏸ Pause' : '▶ Tune In'}</button>
    <button type="button" class="btn-ghost-sm" id="modal-fav-btn">${isFav ? '♥ Saved' : '♡ Save'}</button>
    ${custom ? '<button type="button" class="btn-ghost-sm" id="modal-edit-custom-btn">✎ Edit Stream</button>' : `<button type="button" class="btn-ghost-sm" id="modal-vote-btn" ${voted ? 'disabled' : ''}>${voted ? '✓ Upvoted' : '▲ Upvote'}</button>`}
    ${!custom ? '<button type="button" class="btn-ghost-sm" id="modal-share-btn">Copy Link</button>' : ''}
    ${streamUrl ? '<button type="button" class="btn-ghost-sm" id="modal-copy-stream-btn">Copy Stream URL</button>' : ''}
    ${hasGeo || station.countrycode ? `<button type="button" class="btn-ghost-sm" id="modal-atlas-btn">${hasGeo ? '◎ Show on Atlas' : '◎ Country on Atlas'}</button>` : ''}
    ${homepageUrl ? `<a class="btn-ghost-sm" href="${escapeHtml(homepageUrl)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : ''}
    ${hasGeo ? `<a class="btn-ghost-sm" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(station.geo_lat)}&mlon=${encodeURIComponent(station.geo_long)}#map=8/${encodeURIComponent(station.geo_lat)}/${encodeURIComponent(station.geo_long)}" target="_blank" rel="noopener noreferrer">OSM ↗</a>` : ''}
  `;

  if (dom.aboutModal.classList.contains('open')) {
    dom.aboutModal.classList.remove('open');
  }
  if (dom.customModal.classList.contains('open')) {
    dom.customModal.classList.remove('open');
  }
  dom.modal.classList.add('open');
  lockPageScroll();
  dom.modalCloseBtn.focus();

  document.getElementById('modal-atlas-btn')?.addEventListener('click', () => {
    closeStationModal();
    mobilePlayer?.close();
    switchView('atlas', { pushHistory: true });
    ensureAtlasMounted().then((ctrl) => {
      if (state.view === 'atlas') {
        ctrl?.focusStation(station);
      }
    });
  });

  document.getElementById('modal-edit-custom-btn')?.addEventListener('click', () => {
    closeStationModal();
    openCustomStationModal(station);
  });

  document.getElementById('modal-sleep-select')?.addEventListener('change', (e) => {
    const mins = Number(e.target.value);
    radioPlayer.setSleepTimer(mins);
    showToast(mins > 0 ? `Sleep timer set for ${mins} minutes.` : 'Sleep timer turned off.');
  });

  document.getElementById('modal-mute-btn')?.addEventListener('click', (e) => {
    const muted = radioPlayer.toggleMute();
    storage.setPref('muted', muted);
    e.currentTarget.textContent = muted ? '🔇 Unmute Audio' : '🔊 Mute Audio';
  });

  document.getElementById('modal-play-btn')?.addEventListener('click', () => {
    if (isThisPlaying) {
      radioPlayer.pause();
    } else {
      playStationFromList(station, state.stations.length ? state.stations : [station], {
        forcePlay: true,
      });
    }
    closeStationModal();
  });

  document.getElementById('modal-fav-btn')?.addEventListener('click', (e) => {
    const res = storage.toggleFavorite(station);
    e.currentTarget.textContent = res.added ? '♥ Saved' : '♡ Save';
    syncFavoriteIcons(station.stationuuid, res.added);
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
  if (!isAnyModalOpen()) {
    unlockPageScroll();
  }
  if (state.lastFocusedEl && typeof state.lastFocusedEl.focus === 'function') {
    state.lastFocusedEl.focus();
  }
  state.lastFocusedEl = null;
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

function resetAllFilters({ pushHistory = true } = {}) {
  state.activePreset = 'popular';
  state.filters = {
    ...CURATED_PRESETS.popular.filters,
    httpsOnly: state.filters.httpsOnly,
  };
  syncControlsFromState();
  fetchStations({ append: false, pushHistory });
}

function toggleCurrentStationFavorite() {
  const station = radioPlayer.currentStation;
  if (!station) return;
  const { added } = storage.toggleFavorite(station);
  syncFavoriteIcons(station.stationuuid, added);
  if (state.view === 'favorites') renderFavoritesView();
  showToast(added ? `Saved "${station.name}"` : `Removed "${station.name}"`);
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
    } else if (!state.directoriesLoaded) {
      loadDirectoriesAndStats();
    }
  });

  // Brand click returns to Discover reset
  dom.brandHomeBtn.addEventListener('click', () => {
    switchView('discover', { pushHistory: false });
    resetAllFilters({ pushHistory: true });
  });

  // Nav tabs
  dom.navTabs.forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view, { pushHistory: true }));
  });

  dom.seeAllGenresBtn.addEventListener('click', () => switchView('genres', { pushHistory: true }));

  // Theme & Accent Color controls
  dom.themeToggleBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  dom.accentPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dom.accentPopover.classList.toggle('open');
    dom.accentPickerBtn.setAttribute('aria-expanded', String(isOpen));
  });

  dom.accentSwatchList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accent-pick]');
    if (!btn) return;
    const chosen = applyAccent(btn.dataset.accentPick);
    closeAccentPopover();
    showToast(`Accent set to ${chosen.name}`);
  });

  document.addEventListener('click', (e) => {
    if (!dom.accentPickerWrap.contains(e.target)) {
      closeAccentPopover();
    }
  });

  // Surprise Me
  dom.surpriseBtn.addEventListener('click', tuneSurpriseStation);

  // Global search + smart suggestions
  let searchDebounce = null;
  dom.searchInput.addEventListener('input', () => {
    const raw = dom.searchInput.value;
    const value = raw.trim();
    dom.searchClearBtn.classList.toggle('visible', Boolean(value));
    renderSearchSuggestions(raw);

    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.filters.name = value;
      state.activePreset = null;
      if (state.view !== 'discover') switchView('discover', { pushHistory: false });
      syncControlsFromState();
      fetchStations({ append: false, pushHistory: false });
      syncHistory({ push: false });
    }, 360);
  });

  dom.searchInput.addEventListener('focus', () => {
    if (dom.searchInput.value.trim().length >= 2) {
      renderSearchSuggestions(dom.searchInput.value);
    }
  });

  dom.searchSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('[data-suggest-type]');
    if (!item) return;
    clearTimeout(searchDebounce);
    const type = item.dataset.suggestType;
    const value = item.dataset.suggestValue;

    if (type === 'country') {
      state.filters.name = '';
      state.filters.countrycode = value;
    } else if (type === 'tag') {
      state.filters.name = '';
      state.filters.tag = value;
    } else if (type === 'language') {
      state.filters.name = '';
      state.filters.language = value;
    } else {
      state.filters.name = value;
    }

    state.activePreset = null;
    hideSearchSuggestions();
    if (state.view !== 'discover') switchView('discover', { pushHistory: false });
    syncControlsFromState();
    fetchStations({ append: false, pushHistory: true });
  });

  document.addEventListener('click', (e) => {
    if (!dom.searchForm.contains(e.target)) {
      hideSearchSuggestions();
    }
  });

  dom.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(searchDebounce);
    hideSearchSuggestions();
    state.filters.name = dom.searchInput.value.trim();
    state.activePreset = null;
    if (state.view !== 'discover') switchView('discover', { pushHistory: false });
    syncControlsFromState();
    fetchStations({ append: false, pushHistory: true });
  });

  dom.searchClearBtn.addEventListener('click', () => {
    clearTimeout(searchDebounce);
    hideSearchSuggestions();
    dom.searchInput.value = '';
    dom.searchClearBtn.classList.remove('visible');
    state.filters.name = '';
    syncControlsFromState();
    fetchStations({ append: false, pushHistory: true });
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
    fetchStations({ append: false, pushHistory: true });
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
      fetchStations({ append: false, pushHistory: true });
    });
  });

  // Faceted dropdowns
  dom.filterCountry.addEventListener('change', () => {
    state.filters.countrycode = dom.filterCountry.value;
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false, pushHistory: true });
  });

  dom.filterTag.addEventListener('change', () => {
    state.filters.tag = dom.filterTag.value;
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false, pushHistory: true });
  });

  dom.filterLanguage.addEventListener('change', () => {
    state.filters.language = dom.filterLanguage.value;
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false, pushHistory: true });
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
    fetchStations({ append: false, pushHistory: true });
  });

  dom.filterSort.addEventListener('change', () => {
    const [order, dir] = dom.filterSort.value.split(':');
    state.filters.order = order || 'clickcount';
    state.filters.reverse = dir !== 'asc';
    state.activePreset = null;
    syncControlsFromState();
    fetchStations({ append: false, pushHistory: true });
  });

  dom.filterHttpsOnly.addEventListener('change', () => {
    state.filters.httpsOnly = dom.filterHttpsOnly.checked;
    storage.setPref('httpsOnly', state.filters.httpsOnly);
    atlasController?.setHttpsOnly(state.filters.httpsOnly);
    fetchStations({ append: false });
  });

  dom.resetFiltersBtn.addEventListener('click', () => resetAllFilters({ pushHistory: true }));

  // Active filter chip removal & reshuffle
  dom.activeFilters.addEventListener('click', (e) => {
    if (e.target.closest('[data-reshuffle]')) {
      state.offset = Math.floor(Math.random() * 1200);
      fetchStations({ append: false, preserveOffset: true });
      return;
    }
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
    fetchStations({ append: false, pushHistory: true });
  });

  // Load more
  dom.loadMoreBtn.addEventListener('click', () => fetchStations({ append: true }));

  // Delegated clicks on station grids
  const handleStationGridClick = (e, sourceGetter) => {
    const resetBtn = e.target.closest('[data-action="reset-all"]');
    if (resetBtn) {
      resetAllFilters({ pushHistory: true });
      return;
    }

    const addCustomBtn = e.target.closest('[data-action="open-add-custom"]');
    if (addCustomBtn) {
      openCustomStationModal(null);
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
        switchView('discover', { pushHistory: false });
        syncControlsFromState();
        fetchStations({ append: false, pushHistory: true });
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
      syncFavoriteIcons(station.stationuuid, added);
      if (state.view === 'favorites') renderFavoritesView();
      showToast(added ? `Saved "${station.name}"` : `Removed "${station.name}"`);
    } else if (action === 'info') {
      openStationModal(station);
    } else if (action === 'edit-custom') {
      openCustomStationModal(station);
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

  // Directory filters, retry & selections
  dom.genresDirSearch.addEventListener('input', () =>
    renderGenresDirectory(dom.genresDirSearch.value)
  );
  dom.countriesDirSearch.addEventListener('input', () =>
    renderCountriesDirectory(dom.countriesDirSearch.value)
  );
  dom.languagesDirSearch.addEventListener('input', () =>
    renderLanguagesDirectory(dom.languagesDirSearch.value)
  );

  const handleDirRetry = (e) => {
    if (e.target.closest('[data-retry-directories]')) {
      radioApi.rotateMirror();
      state.directoriesError = false;
      renderGenresDirectory(dom.genresDirSearch.value);
      renderCountriesDirectory(dom.countriesDirSearch.value);
      renderLanguagesDirectory(dom.languagesDirSearch.value);
      loadDirectoriesAndStats();
      return true;
    }
    return false;
  };

  dom.genresDirGrid.addEventListener('click', (e) => {
    if (handleDirRetry(e)) return;
    const btn = e.target.closest('[data-pick-genre]');
    if (!btn) return;
    state.filters.tag = btn.dataset.pickGenre;
    state.activePreset = null;
    switchView('discover', { pushHistory: false });
    syncControlsFromState();
    fetchStations({ append: false, pushHistory: true });
  });

  dom.countriesDirGrid.addEventListener('click', (e) => {
    if (handleDirRetry(e)) return;
    const btn = e.target.closest('[data-pick-country]');
    if (!btn) return;
    state.filters.countrycode = btn.dataset.pickCountry;
    state.activePreset = null;
    switchView('discover', { pushHistory: false });
    syncControlsFromState();
    fetchStations({ append: false, pushHistory: true });
  });

  dom.languagesDirGrid.addEventListener('click', (e) => {
    if (handleDirRetry(e)) return;
    const btn = e.target.closest('[data-pick-language]');
    if (!btn) return;
    state.filters.language = btn.dataset.pickLanguage;
    state.activePreset = null;
    switchView('discover', { pushHistory: false });
    syncControlsFromState();
    fetchStations({ append: false, pushHistory: true });
  });

  // Favorites add custom / export / import / refresh / clear recent
  dom.addCustomStationBtn.addEventListener('click', () => openCustomStationModal(null));
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
    const customCount = data.filter((s) => isCustomStation(s)).length;
    showToast(
      `Exported ${data.length} station${data.length === 1 ? '' : 's'}${customCount > 0 ? ` (incl. ${customCount} custom)` : ''}.`
    );
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
      const existingCustomUrls = new Set(
        existing
          .filter((s) => isCustomStation(s))
          .map((s) => (s.url_resolved || s.url || '').toLowerCase())
          .filter(Boolean)
      );

      let addedCount = 0;
      let addedCustomCount = 0;

      for (const rawItem of parsed) {
        if (!rawItem || typeof rawItem !== 'object') continue;
        const cleanUrl = sanitizeHttpUrl(rawItem.url_resolved || rawItem.url);
        const hasUuid = Boolean(rawItem.stationuuid);

        if (!hasUuid && !cleanUrl) continue;

        const custom =
          isCustomStation(rawItem) || !hasUuid;
        const item = {
          ...rawItem,
          stationuuid: hasUuid ? String(rawItem.stationuuid) : createCustomUuid(),
          url: sanitizeHttpUrl(rawItem.url) || cleanUrl,
          url_resolved: cleanUrl || sanitizeHttpUrl(rawItem.url),
          isCustom: custom,
        };

        if (mergedMap.has(item.stationuuid)) continue;
        const urlKey = (item.url_resolved || item.url || '').toLowerCase();
        if (custom && urlKey && existingCustomUrls.has(urlKey)) continue;

        mergedMap.set(item.stationuuid, item);
        if (custom && urlKey) existingCustomUrls.add(urlKey);
        addedCount++;
        if (custom) addedCustomCount++;
      }

      storage.replaceFavorites(Array.from(mergedMap.values()));
      updateFavoriteBadges();
      renderFavoritesView();
      showToast(
        addedCount > 0
          ? `Imported ${addedCount} station${addedCount === 1 ? '' : 's'}${addedCustomCount > 0 ? ` (${addedCustomCount} custom)` : ''}.`
          : 'All stations in that file are already saved.'
      );
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

  // Player Deck Controls (Desktop + Mobile)
  dom.deckPlayBtn.addEventListener('click', () => radioPlayer.togglePlayPause());
  dom.deckPrevBtn.addEventListener('click', () => stepQueue(-1));
  dom.deckNextBtn.addEventListener('click', () => stepQueue(1));

  dom.deckTitle.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 1024px)').matches) return;
    if (radioPlayer.currentStation) openStationModal(radioPlayer.currentStation);
  });

  dom.deckMobileMoreBtn.addEventListener('click', () => {
    if (radioPlayer.currentStation) openStationModal(radioPlayer.currentStation);
  });

  dom.deckFavBtn.addEventListener('click', toggleCurrentStationFavorite);
  dom.deckMobileFavBtn.addEventListener('click', toggleCurrentStationFavorite);

  dom.deckShareBtn.addEventListener('click', () => {
    if (!radioPlayer.currentStation || isCustomStation(radioPlayer.currentStation)) return;
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

  dom.deckPipBtn?.addEventListener('click', () => {
    miniTuner?.toggle();
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

  // Modal close & tag clicks (guard against drag-from-inside accidental dismiss)
  let modalPointerDownTarget = null;
  dom.modal.addEventListener('pointerdown', (e) => {
    modalPointerDownTarget = e.target;
  });
  dom.modalCloseBtn.addEventListener('click', closeStationModal);
  dom.modal.addEventListener('click', (e) => {
    if (e.target === dom.modal && modalPointerDownTarget === dom.modal) {
      closeStationModal();
    }
    const tagBtn = e.target.closest('[data-modal-tag]');
    if (tagBtn) {
      state.filters.tag = tagBtn.dataset.modalTag;
      state.activePreset = null;
      closeStationModal();
      mobilePlayer?.close();
      switchView('discover', { pushHistory: false });
      syncControlsFromState();
      fetchStations({ append: false, pushHistory: true });
    }
  });

  // About modal & PWA install buttons
  let aboutPointerDownTarget = null;
  dom.aboutModal.addEventListener('pointerdown', (e) => {
    aboutPointerDownTarget = e.target;
  });
  dom.aboutBtn.addEventListener('click', openAboutModal);
  dom.footerAboutBtn.addEventListener('click', openAboutModal);
  dom.aboutCloseBtn.addEventListener('click', closeAboutModal);
  dom.aboutModal.addEventListener('click', (e) => {
    if (e.target === dom.aboutModal && aboutPointerDownTarget === dom.aboutModal) {
      closeAboutModal();
    }
  });

  // Add / Edit Custom Stream Modal events
  let customPointerDownTarget = null;
  dom.customModal.addEventListener('pointerdown', (e) => {
    customPointerDownTarget = e.target;
  });
  dom.customCloseBtn.addEventListener('click', closeCustomStationModal);
  dom.customCancelBtn.addEventListener('click', closeCustomStationModal);
  dom.customModal.addEventListener('click', (e) => {
    if (e.target === dom.customModal && customPointerDownTarget === dom.customModal) {
      closeCustomStationModal();
    }
  });
  dom.customUrlInput.addEventListener('input', updateCustomUrlHintLive);
  dom.customParseBtn.addEventListener('click', handleManualPlaylistResolve);
  dom.customForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitCustomStationForm({ playAfterSave: true });
  });
  dom.customSaveBtn.addEventListener('click', () => {
    submitCustomStationForm({ playAfterSave: false });
  });

  dom.installAppBtn.addEventListener('click', promptInstallPwa);
  dom.aboutInstallBtn.addEventListener('click', promptInstallPwa);

  // Browser Back / Forward navigation support
  window.addEventListener('popstate', () => {
    if (mobilePlayer?.isOpen()) {
      mobilePlayer.close();
    }
    readQueryParamsIntoState();
    switchView(state.view, { pushHistory: false });
    syncControlsFromState();
    if (state.view === 'discover') {
      fetchStations({ append: false, pushHistory: false });
    }
  });

  // Global keyboard shortcuts & modal focus trap
  document.addEventListener('keydown', (e) => {
    const target = e.target;
    const isTyping =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

    if (e.key === 'Escape') {
      if (dom.customModal.classList.contains('open')) {
        closeCustomStationModal();
        return;
      }
      if (dom.aboutModal.classList.contains('open')) {
        closeAboutModal();
        return;
      }
      if (dom.modal.classList.contains('open')) {
        closeStationModal();
        return;
      }
      if (dom.searchSuggestions.classList.contains('open')) {
        hideSearchSuggestions();
        return;
      }
      if (dom.accentPopover.classList.contains('open')) {
        closeAccentPopover();
        return;
      }
      if (mobilePlayer?.isOpen()) {
        mobilePlayer.close();
        return;
      }
    }

    // Keep Tab focus trapped inside any active modal and disable background shortcuts
    const activeModal = getActiveModal();
    if (activeModal) {
      if (e.key === 'Tab') {
        trapFocusInModal(activeModal, e);
      }
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
    } else if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (miniTuner) {
        e.preventDefault();
        miniTuner.toggle();
      }
    }
  });
}

/* ==========================================================================
   Cross-Browser Modal Scroll Lock & Focus Trap
   ========================================================================== */

let pageScrollLocked = false;
let lockedScrollY = 0;

function isAnyModalOpen() {
  return (
    dom.modal.classList.contains('open') ||
    dom.aboutModal.classList.contains('open') ||
    dom.customModal.classList.contains('open') ||
    Boolean(mobilePlayer?.isOpen())
  );
}

function getActiveModal() {
  if (dom.customModal.classList.contains('open')) return dom.customModal;
  if (dom.aboutModal.classList.contains('open')) return dom.aboutModal;
  if (dom.modal.classList.contains('open')) return dom.modal;
  if (mobilePlayer?.isOpen()) return dom.mobileSheet;
  return null;
}

function lockPageScroll() {
  hideSearchSuggestions();
  closeAccentPopover();
  if (pageScrollLocked) return;
  lockedScrollY = window.scrollY || window.pageYOffset || 0;
  const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;

  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.setProperty('--locked-scroll-y', `${lockedScrollY}px`);
  if (scrollbarGap > 0) {
    document.body.style.paddingRight = `${scrollbarGap}px`;
  }
  pageScrollLocked = true;
}

function unlockPageScroll() {
  if (!pageScrollLocked) return;
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  document.body.style.removeProperty('--locked-scroll-y');
  document.body.style.paddingRight = '';
  pageScrollLocked = false;
  window.scrollTo({ top: lockedScrollY, behavior: 'instant' });
}

function trapFocusInModal(modalBackdrop, event) {
  const focusable = Array.from(
    modalBackdrop.querySelectorAll(
      'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el.offsetParent !== null);

  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ==========================================================================
   About Modal & PWA Install Lifecycle
   ========================================================================== */

function isStandalonePwa() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIosSafari() {
  const ua = window.navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
  return isIos && isSafari;
}

function syncInstallButtons() {
  const canInstall = Boolean(state.deferredInstallPrompt) && !isStandalonePwa();
  dom.installAppBtn.style.display = canInstall ? 'grid' : 'none';
  dom.aboutInstallBtn.style.display = canInstall ? 'inline-flex' : 'none';
}

function populateAppConfigMetadata() {
  const versionLabel = `v${APP_CONFIG.version}`;
  dom.footerVersion.textContent = versionLabel;
  dom.aboutModalTitle.textContent = APP_CONFIG.name;
  dom.aboutVersionBadge.textContent = versionLabel;
  dom.aboutTagline.textContent = APP_CONFIG.tagline;
  dom.aboutSpecVersion.textContent = versionLabel;
  dom.aboutSpecRepo.href = APP_CONFIG.repoUrl;
  dom.aboutSpecRepo.textContent = `${APP_CONFIG.repoLabel} ↗`;
  dom.aboutRepoBtn.href = APP_CONFIG.repoUrl;
  dom.aboutApiBtn.href = APP_CONFIG.apiDocsUrl;
}

function openAboutModal() {
  if (dom.modal.classList.contains('open')) {
    dom.modal.classList.remove('open');
    state.modalStation = null;
  }
  if (dom.customModal.classList.contains('open')) {
    dom.customModal.classList.remove('open');
    state.editingCustomUuid = null;
  }
  state.lastFocusedEl = document.activeElement;
  populateAppConfigMetadata();
  dom.aboutSpecMirror.textContent = radioApi.getActiveMirror();
  dom.aboutSpecMode.textContent = isStandalonePwa() ? 'Installed PWA' : 'Web Browser';
  dom.aboutIosTip.style.display = !isStandalonePwa() && isIosSafari() ? 'block' : 'none';
  syncInstallButtons();

  dom.aboutModal.classList.add('open');
  lockPageScroll();
  dom.aboutCloseBtn.focus();
}

function closeAboutModal() {
  dom.aboutModal.classList.remove('open');
  if (!isAnyModalOpen()) {
    unlockPageScroll();
  }
  if (state.lastFocusedEl && typeof state.lastFocusedEl.focus === 'function') {
    state.lastFocusedEl.focus();
  }
  state.lastFocusedEl = null;
}

async function promptInstallPwa() {
  const promptEvent = state.deferredInstallPrompt;
  if (!promptEvent) return;

  promptEvent.prompt();
  try {
    const choice = await promptEvent.userChoice;
    if (choice && choice.outcome === 'accepted') {
      showToast('Installing ONDA…');
    }
  } catch {
    // Ignore dismissed prompt errors
  } finally {
    state.deferredInstallPrompt = null;
    syncInstallButtons();
  }
}

function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    syncInstallButtons();
  });

  window.addEventListener('appinstalled', () => {
    state.deferredInstallPrompt = null;
    syncInstallButtons();
    showToast('ONDA installed as an app!');
  });

  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
        // Non-fatal if browser blocks service workers (e.g., strict private mode)
      });
    });
  }
}

/* ==========================================================================
   Custom Streams (Direct / HLS / M3U / PLS)
   ========================================================================== */

function isPlaylistUrl(url) {
  return /\.(pls|m3u)(\?.*)?$/i.test(url) && !/\.m3u8(\?.*)?$/i.test(url);
}

function isHlsUrl(url) {
  return /\.m3u8(\?.*)?$/i.test(url);
}

function inferCodecFromUrl(url) {
  const lower = String(url || '').toLowerCase();
  if (/\.m3u8(\?|$)/.test(lower)) return 'HLS';
  if (/flac/.test(lower)) return 'FLAC';
  if (/aacp|aac\+|aac/.test(lower)) return 'AAC';
  if (/ogg|opus/.test(lower)) return 'OGG';
  if (/mp3/.test(lower)) return 'MP3';
  return '';
}

function inferNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '');
    const segment = parsed.pathname.split('/').filter(Boolean).pop() || '';
    const cleanedSeg = segment.replace(/\.(mp3|aac|ogg|flac|m3u8?|pls)$/i, '').replace(/[-_]+/g, ' ').trim();
    return cleanedSeg ? `${host} · ${cleanedSeg}` : host;
  } catch {
    return 'Custom Radio Stream';
  }
}

/**
 * Parse raw .pls or .m3u playlist text and extract stream URL(s) and optional title.
 * Prefers HTTPS URLs when multiple mirror entries exist.
 */
function parsePlaylistText(text) {
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

  // Prefer HTTPS entry when running on HTTPS (e.g. GitHub Pages)
  const preferred =
    window.location.protocol === 'https:'
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
async function resolveStreamInput(rawText) {
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
      formatNote: isHlsUrl(singleUrl) ? 'Detected HLS (.m3u8) live stream.' : 'Direct audio stream URL ready.',
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

function setCustomHint(text, tone = '') {
  dom.customUrlHint.textContent = text;
  dom.customUrlHint.className = `form-hint${tone ? ` ${tone}` : ''}`;
}

function updateCustomUrlHintLive() {
  const val = dom.customUrlInput.value.trim();
  if (!val) {
    setCustomHint('Supports MP3, AAC, OGG, FLAC, HLS (.m3u8), .m3u, and .pls streams.');
    return;
  }

  if (val.includes('\n') || /\[playlist\]|^#EXTM3U|^File1=/im.test(val)) {
    const parsed = parsePlaylistText(val);
    if (parsed) {
      setCustomHint(`Detected playlist text → ${parsed.streamUrl}`, 'ok');
    } else {
      setCustomHint('Playlist text detected, but no http/https stream URL found yet.', 'warn');
    }
    return;
  }

  const clean = sanitizeHttpUrl(val);
  if (!clean) {
    setCustomHint('URL must start with https:// or http:// (or paste raw .m3u / .pls text).', 'warn');
    return;
  }

  if (window.location.protocol === 'https:' && clean.startsWith('http://')) {
    setCustomHint(
      'Heads up: http:// streams are blocked by browsers on HTTPS pages. Use https:// if the station supports it.',
      'warn'
    );
  } else if (isPlaylistUrl(clean)) {
    setCustomHint('Playlist URL detected (.m3u / .pls) — will auto-resolve on save, or click "Resolve" now.', 'ok');
  } else if (isHlsUrl(clean)) {
    setCustomHint('HLS adaptive stream (.m3u8) detected — ready to save.', 'ok');
  } else {
    setCustomHint('Direct HTTPS stream URL ready.', 'ok');
  }
}

async function handleManualPlaylistResolve() {
  const raw = dom.customUrlInput.value.trim();
  if (!raw) {
    setCustomHint('Paste a .m3u / .pls link or playlist contents first.', 'warn');
    dom.customUrlInput.focus();
    return;
  }

  dom.customParseBtn.disabled = true;
  dom.customParseBtn.textContent = 'Resolving…';
  try {
    const res = await resolveStreamInput(raw);
    if (res.error) {
      setCustomHint(res.error, 'error');
      return;
    }
    if (res.urlResolved && res.urlResolved !== raw) {
      dom.customUrlInput.value = res.urlResolved;
    }
    if (res.suggestedTitle && !dom.customNameInput.value.trim()) {
      dom.customNameInput.value = res.suggestedTitle;
    }
    setCustomHint(res.formatNote, res.status);
  } finally {
    dom.customParseBtn.disabled = false;
    dom.customParseBtn.textContent = 'Resolve .m3u / .pls';
  }
}

function openCustomStationModal(existingStation = null) {
  if (dom.modal.classList.contains('open')) {
    dom.modal.classList.remove('open');
    state.modalStation = null;
  }
  if (dom.aboutModal.classList.contains('open')) {
    dom.aboutModal.classList.remove('open');
  }

  state.lastFocusedEl = document.activeElement;
  const isEdit = Boolean(existingStation && isCustomStation(existingStation));
  state.editingCustomUuid = isEdit ? existingStation.stationuuid : null;

  dom.customModalTitle.textContent = isEdit ? 'Edit Custom Stream' : 'Add Custom Stream';
  dom.customSavePlayBtn.textContent = isEdit ? '▶ Save & Play' : '▶ Save & Play';
  dom.customSaveBtn.textContent = isEdit ? 'Save Changes' : 'Save Only';

  dom.customUrlInput.value = isEdit ? existingStation.url_resolved || existingStation.url || '' : '';
  dom.customNameInput.value = isEdit ? existingStation.name || '' : '';
  dom.customTagsInput.value = isEdit ? existingStation.tags || '' : '';
  dom.customCountryInput.value = isEdit ? existingStation.country || '' : '';
  dom.customHomepageInput.value = isEdit ? existingStation.homepage || '' : '';
  dom.customFaviconInput.value = isEdit ? existingStation.favicon || '' : '';

  updateCustomUrlHintLive();
  dom.customModal.classList.add('open');
  lockPageScroll();
  dom.customUrlInput.focus();
}

function closeCustomStationModal() {
  dom.customModal.classList.remove('open');
  state.editingCustomUuid = null;
  if (!isAnyModalOpen()) {
    unlockPageScroll();
  }
  if (state.lastFocusedEl && typeof state.lastFocusedEl.focus === 'function') {
    state.lastFocusedEl.focus();
  }
  state.lastFocusedEl = null;
}

async function submitCustomStationForm({ playAfterSave = true } = {}) {
  dom.customSavePlayBtn.disabled = true;
  dom.customSaveBtn.disabled = true;

  try {
    const resolved = await resolveStreamInput(dom.customUrlInput.value);
    if (resolved.error) {
      setCustomHint(resolved.error, 'error');
      dom.customUrlInput.focus();
      return;
    }

    const nameRaw =
      dom.customNameInput.value.trim() ||
      resolved.suggestedTitle ||
      inferNameFromUrl(resolved.urlResolved);

    const homepageRaw = dom.customHomepageInput.value.trim();
    const faviconRaw = dom.customFaviconInput.value.trim();
    const homepage = homepageRaw ? sanitizeHttpUrl(homepageRaw) : '';
    const favicon = faviconRaw ? sanitizeHttpUrl(faviconRaw) : '';

    if (homepageRaw && !homepage) {
      showToast('Website URL must start with https:// or http://');
      dom.customHomepageInput.focus();
      return;
    }
    if (faviconRaw && !favicon) {
      showToast('Logo URL must start with https:// or http://');
      dom.customFaviconInput.focus();
      return;
    }

    const isHls = isHlsUrl(resolved.urlResolved) ? 1 : 0;
    const station = {
      stationuuid: state.editingCustomUuid || createCustomUuid(),
      name: nameRaw,
      url: resolved.url,
      url_resolved: resolved.urlResolved,
      homepage,
      favicon,
      tags: dom.customTagsInput.value.trim(),
      country: dom.customCountryInput.value.trim(),
      countrycode: '',
      state: '',
      language: '',
      codec: inferCodecFromUrl(resolved.urlResolved),
      bitrate: 0,
      hls: isHls,
      votes: 0,
      clickcount: 0,
      isCustom: true,
    };

    const { station: saved, updated } = storage.upsertFavorite(station);
    updateFavoriteBadges();
    renderFavoritesView();

    // If editing the currently active station, keep player metadata in sync
    if (updated && radioPlayer.currentStation?.stationuuid === saved.stationuuid) {
      radioPlayer.currentStation = saved;
      radioPlayer.updateMediaSessionMetadata(saved);
      updateDeckUI(radioPlayer.getState());
    }

    closeCustomStationModal();

    if (playAfterSave) {
      playStationFromList(saved, storage.getFavorites(), { forcePlay: true });
      showToast(updated ? `Updated & tuned to "${saved.name}"` : `Added & tuned to "${saved.name}"`);
    } else {
      showToast(updated ? `Updated "${saved.name}"` : `Added "${saved.name}" to Saved`);
    }
  } finally {
    dom.customSavePlayBtn.disabled = false;
    dom.customSaveBtn.disabled = false;
  }
}

/* ==========================================================================
   Bootstrap
   ========================================================================== */

async function init() {
  populateAppConfigMetadata();
  initPwa();
  applyTheme(prefs.theme);
  applyAccent(prefs.accent);
  radioPlayer.setVolume(prefs.volume, prefs.muted);
  radioPlayer.attachVuCanvas(dom.vuCanvas);
  radioPlayer.onChange(updateDeckUI);
  radioPlayer.onTick(updateDeckTick);
  radioPlayer.bindMediaSessionHandlers({
    onPrev: () => stepQueue(-1),
    onNext: () => stepQueue(1),
  });

  if (isDesktopPipSupported()) {
    miniTuner = createMiniTunerController({
      player: radioPlayer,
      getQueueLength: () => state.queue.length,
      isFavorite: (uuid) => storage.isFavorite(uuid),
      isCustom: (station) => isCustomStation(station),
      buildArtworkHtml,
      formatElapsed,
      countryCodeToFlag,
      parseTags,
      onPrev: () => stepQueue(-1),
      onNext: () => {
        if (state.queue.length > 1) {
          stepQueue(1);
        } else {
          tuneSurpriseStation();
        }
      },
      onToggleFavorite: toggleCurrentStationFavorite,
      onSurprise: tuneSurpriseStation,
      onVolumeChange: (val) => {
        radioPlayer.setVolume(val, val === 0);
        storage.setPref('volume', val);
        storage.setPref('muted', val === 0);
      },
      onToggleMute: () => {
        const muted = radioPlayer.toggleMute();
        storage.setPref('muted', muted);
      },
      onOpenStateChange: (isOpen) => {
        if (!dom.deckPipBtn) return;
        dom.deckPipBtn.classList.toggle('is-open', isOpen);
        dom.deckPipBtn.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
        const label = isOpen ? 'Dock Floating Mini-Tuner' : 'Pop out Floating Mini-Tuner';
        const title = isOpen ? 'Dock Mini-Tuner (P)' : 'Pop out Mini-Tuner (P)';
        dom.deckPipBtn.setAttribute('aria-label', label);
        dom.deckPipBtn.setAttribute('title', title);
      },
      onToast: showToast,
    });

    if (dom.deckPipBtn) dom.deckPipBtn.style.display = '';
    if (dom.kbdHintPip) dom.kbdHintPip.style.display = '';
  }

  mobilePlayer = createMobilePlayerController({
    deckEl: dom.playerDeck,
    deckStationEl: dom.deckStation,
    sheetEl: dom.mobileSheet,
    player: radioPlayer,
    getQueueLength: () => state.queue.length,
    isFavorite: (uuid) => storage.isFavorite(uuid),
    isCustom: (station) => isCustomStation(station),
    getStationAccentColor: (station) => getStationMonogram(station).color,
    buildArtworkHtml,
    formatElapsed,
    countryCodeToFlag,
    parseTags,
    onPrev: () => stepQueue(-1),
    onNext: () => {
      if (state.queue.length > 1) {
        stepQueue(1);
      } else {
        tuneSurpriseStation();
      }
    },
    onToggleFavorite: toggleCurrentStationFavorite,
    onSurprise: tuneSurpriseStation,
    onCycleSleepTimer: () => {
      const steps = [0, 15, 30, 60];
      const idx = steps.indexOf(radioPlayer.sleepMinutes);
      const next = steps[(idx + 1) % steps.length];
      radioPlayer.setSleepTimer(next);
      showToast(next > 0 ? `Sleep timer set for ${next} minutes.` : 'Sleep timer turned off.');
    },
    onShare: () => {
      if (!radioPlayer.currentStation || isCustomStation(radioPlayer.currentStation)) return;
      copyToClipboard(getStationShareUrl(radioPlayer.currentStation), 'Direct station link copied!');
    },
    onOpenStationInfo: () => {
      if (radioPlayer.currentStation) openStationModal(radioPlayer.currentStation);
    },
    onLockScroll: lockPageScroll,
    onUnlockScroll: () => {
      if (!isAnyModalOpen()) unlockPageScroll();
    },
  });

  const { stationUuid } = readQueryParamsIntoState();

  updateFavoriteBadges();
  bindEvents();
  switchView(state.view, { pushHistory: false });
  syncControlsFromState();
  updateDeckUI(radioPlayer.getState());

  fetchStations({ append: false, pushHistory: false });
  loadDirectoriesAndStats();

  if (stationUuid) {
    try {
      const [station] = await radioApi.getStationsByUuids([stationUuid]);
      if (station) {
        playStationFromList(station, [station], { forcePlay: true });
        showToast(`Loaded shared station: ${station.name}`);
      }
    } catch {
      // Ignore unreachable shared station UUID
    }
  }
}

init();
