/**
 * ONDA — Interactive World Atlas & "Near Me" Module (Lazy-Loaded)
 *
 * Loaded dynamically via import('./map.js') only when the user opens the Atlas tab.
 * Features:
 * - Dynamically injected Leaflet 1.9.4 rendered via L.canvas() for 60fps mobile performance
 * - Two-tier geographic coverage: Exact GPS-pinned station clusters + Country Hub fallbacks
 * - "Near Me" geolocation with Haversine distance sorting + honest country fallback section
 * - Real-time astronomical Day/Night solar terminator + approximate local solar time bands
 * - Keyless OpenStreetMap tiles graded via CSS for Light/Dark modes + dynamic --accent styling
 */

import {
  escapeHtml,
  countryCodeToFlag,
  formatExactNumber as formatNumber,
} from './utils.js';
import {
  WIDE_MULTI_TZ_COUNTRIES,
  COUNTRY_CENTROIDS,
  TIME_BAND_META,
  hasValidGeo,
  normalizeLongitude,
  haversineKm,
  formatDistanceKm,
  getSolarTimeInfo,
  getStationSolarTime,
  getLongitudeForSolarHour,
  buildNightTerminatorPolygon,
  getClusterCellSize,
} from './geo.js';

export { hasValidGeo };

const LEAFLET_SOURCES = [
  {
    css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  },
  {
    css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  },
];

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

const RADIUS_OPTIONS = [50, 150, 500, 0]; // 0 = Any distance

/* ==========================================================================
   Dynamic Leaflet 1.9.4 Loader
   ========================================================================== */

let leafletLoadPromise = null;

function loadStylesheet(href) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[data-onda-leaflet="${href}"]`);
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.ondaLeaflet = href;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      reject(new Error(`Failed to load stylesheet ${href}`));
    };
    document.head.appendChild(link);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-onda-leaflet="${src}"]`);
    if (existing && window.L) {
      resolve(window.L);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.ondaLeaflet = src;
    script.onload = () => {
      if (window.L) resolve(window.L);
      else reject(new Error('Leaflet script loaded without window.L'));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load script ${src}`));
    };
    document.head.appendChild(script);
  });
}

async function ensureLeaflet() {
  if (window.L) return window.L;
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = (async () => {
    let lastError = null;
    for (const src of LEAFLET_SOURCES) {
      try {
        await Promise.all([loadStylesheet(src.css), loadScript(src.js)]);
        if (window.L) return window.L;
      } catch (err) {
        lastError = err;
      }
    }
    leafletLoadPromise = null;
    throw lastError || new Error('Could not load Leaflet map library.');
  })();

  return leafletLoadPromise;
}

function readCssVar(name, fallback) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}

/* ==========================================================================
   Atlas Controller Factory
   ========================================================================== */

export async function createAtlasController(deps) {
  const {
    radioApi,
    playStation,
    toggleFavorite,
    openInfo,
    isFavorite,
    getPlayerState,
    getCountries,
    getHttpsOnly,
    getTheme,
    showToast,
    openCountryInDiscover,
    buildArtworkHtml,
  } = deps;

  const dom = {
    mapContainer: document.getElementById('atlas-map'),
    loadingOverlay: document.getElementById('atlas-loading'),
    loadingText: document.getElementById('atlas-loading-text'),
    hydratePill: document.getElementById('atlas-hydrate-pill'),
    hydrateText: document.getElementById('atlas-hydrate-text'),
    summaryBadge: document.getElementById('atlas-summary'),
    jumpWrap: document.getElementById('atlas-jump-wrap'),
    jumpInput: document.getElementById('atlas-jump-input'),
    jumpResults: document.getElementById('atlas-jump-results'),
    nearMeBtn: document.getElementById('atlas-near-me-btn'),
    nearMeIcon: document.getElementById('atlas-near-me-icon'),
    nearMeSpinner: document.getElementById('atlas-near-me-spinner'),
    locateActiveBtn: document.getElementById('atlas-locate-active-btn'),
    inViewBtn: document.getElementById('atlas-in-view-btn'),
    dayNightBtn: document.getElementById('atlas-daynight-btn'),
    hubsBtn: document.getElementById('atlas-hubs-btn'),
    timeChips: document.querySelectorAll('.atlas-time-chip[data-time-band]'),
    drawerKicker: document.getElementById('atlas-drawer-kicker'),
    drawerTitle: document.getElementById('atlas-drawer-title'),
    drawerSubtitle: document.getElementById('atlas-drawer-subtitle'),
    drawerControls: document.getElementById('atlas-drawer-controls'),
    drawerBanner: document.getElementById('atlas-drawer-banner'),
    drawerList: document.getElementById('atlas-drawer-list'),
  };

  const state = {
    visible: false,
    initialized: false,
    loadingGlobal: false,
    httpsOnly: Boolean(getHttpsOnly()),
    theme: getTheme() === 'dark' ? 'dark' : 'light',
    showTerminator: true,
    showCountryHubs: true,
    timeBand: 'all', // all | morning | afternoon | evening | night

    // Data pools
    geoStationsMap: new Map(), // stationuuid -> station (merged global + country deep-fetches)
    geoStations: [],
    countries: Array.isArray(getCountries()) ? getCountries() : [],
    countryStationsCache: new Map(), // countrycode -> station[]
    hydratedCountries: new Set(), // country codes whose local GPS pins have been loaded
    hydratingCountries: new Set(), // country codes currently being fetched
    drawerStations: [], // flat array for lookup & queue
    drawerMode: 'intro', // intro | cluster | country | nearme | inview
    drawerContext: null,
    jumpItems: [],

    // Near Me / Dropped Spot state
    userCoords: null,
    userLocationIsGps: true,
    nearMeRadiusKm: 150,
    nearMeCountryCode: '',

    // Leaflet handles
    L: null,
    map: null,
    tileLayer: null,
    canvasRenderer: null,
    terminatorLayer: null,
    hubsLayer: null,
    pinsLayer: null,
    activeLayer: null,
    userLayer: null,
    terminatorTimer: null,
    hydrateTimer: null,
    abortController: null,
    drawerAbortController: null,
  };

  function showLoading(message) {
    if (dom.loadingText) dom.loadingText.textContent = message || 'Loading world atlas…';
    if (dom.loadingOverlay) dom.loadingOverlay.classList.add('visible');
  }

  function hideLoading() {
    if (dom.loadingOverlay) dom.loadingOverlay.classList.remove('visible');
  }

  function updateHydratePill() {
    if (!dom.hydratePill || !dom.hydrateText) return;
    if (state.hydratingCountries.size === 0) {
      dom.hydratePill.classList.remove('visible');
      return;
    }
    const labels = Array.from(state.hydratingCountries)
      .slice(0, 2)
      .map((code) => getCountryMeta(code)?.name || code);
    dom.hydrateText.textContent = `Loading ${labels.join(' & ')}…`;
    dom.hydratePill.classList.add('visible');
  }

  function getCountryMeta(code) {
    const upper = (code || '').toUpperCase();
    if (!upper) return null;
    return state.countries.find((c) => (c.iso_3166_1 || '').toUpperCase() === upper) || null;
  }

  function mergeGeoStations(list) {
    let added = 0;
    for (const s of list || []) {
      if (!hasValidGeo(s)) continue;
      if (!state.geoStationsMap.has(s.stationuuid)) {
        added += 1;
      }
      state.geoStationsMap.set(s.stationuuid, s);
    }
    if (added > 0 || state.geoStations.length !== state.geoStationsMap.size) {
      state.geoStations = Array.from(state.geoStationsMap.values()).sort(
        (a, b) => (b.clickcount || 0) - (a.clickcount || 0)
      );
    }
  }

  function updateSummaryBadge() {
    if (!dom.summaryBadge) return;
    const pinnedCount = state.geoStations.length;
    const countriesWithHubs = state.countries.filter(
      (c) => COUNTRY_CENTROIDS[(c.iso_3166_1 || '').toUpperCase()]
    ).length;

    const parts = [];
    if (pinnedCount > 0) parts.push(`${formatNumber(pinnedCount)} pinned`);
    if (countriesWithHubs > 0) parts.push(`${formatNumber(countriesWithHubs)} country hubs`);
    if (state.timeBand !== 'all') {
      const band = TIME_BAND_META[state.timeBand];
      if (band) parts.push(`${band.icon} ${band.label} filter`);
    }
    dom.summaryBadge.textContent = parts.join(' · ') || 'Ready';
  }

  function updateLocateActiveButton() {
    if (!dom.locateActiveBtn) return;
    const current = getPlayerState()?.station;
    const canLocate = hasValidGeo(current);
    dom.locateActiveBtn.disabled = !canLocate;
    dom.locateActiveBtn.title = canLocate
      ? `Fly to ${current.name}`
      : 'Currently playing station has no GPS coordinates';
  }

  /* --------------------------------------------------------------------------
     Map Initialization & Layers
     -------------------------------------------------------------------------- */

  let initPromise = null;

  async function initMapIfNeeded() {
    if (state.initialized && state.map) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      showLoading('Loading interactive map engine…');
      const L = await ensureLeaflet();
      state.L = L;

      state.canvasRenderer = L.canvas({ padding: 0.5 });

      state.map = L.map(dom.mapContainer, {
        center: [22, 12],
        zoom: 2,
        minZoom: 2,
        maxZoom: 14,
        worldCopyJump: true,
        preferCanvas: true,
        tapHold: true,
        maxBounds: [
          [-85, -Infinity],
          [85, Infinity],
        ],
        maxBoundsViscosity: 0.7,
      });

      state.tileLayer = L.tileLayer(OSM_TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(state.map);

      state.terminatorLayer = L.layerGroup().addTo(state.map);
      state.hubsLayer = L.layerGroup().addTo(state.map);
      state.pinsLayer = L.layerGroup().addTo(state.map);
      state.userLayer = L.layerGroup().addTo(state.map);
      state.activeLayer = L.layerGroup().addTo(state.map);

      let zoomRedrawTimer = null;
      state.map.on('zoomend', () => {
        clearTimeout(zoomRedrawTimer);
        zoomRedrawTimer = setTimeout(() => {
          renderCountryHubs();
          renderStationPins();
        }, 60);
      });

      state.map.on('moveend', () => {
        scheduleViewportHydration();
      });

      // Right-click (desktop) or press-and-hold (mobile) to run "Near this spot" without GPS
      let lastSpotTriggerAt = 0;
      const triggerSpotAtLatLng = (latlng) => {
        if (!latlng || Date.now() - lastSpotTriggerAt < 450) return;
        lastSpotTriggerAt = Date.now();
        const lat = Math.max(-85, Math.min(85, Number(latlng.lat)));
        const lng = normalizeLongitude(Number(latlng.lng));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        exploreSpot(lat, lng, { isUserLocation: false, fly: false });
      };

      state.map.on('contextmenu', (e) => {
        if (e?.originalEvent) e.originalEvent.preventDefault();
        triggerSpotAtLatLng(e?.latlng);
      });

      // Reliable touch long-press fallback for Android Chrome / iOS Safari
      let touchHoldTimer = null;
      let touchStartPoint = null;
      dom.mapContainer?.addEventListener(
        'touchstart',
        (e) => {
          if (!e.touches || e.touches.length !== 1) {
            clearTimeout(touchHoldTimer);
            return;
          }
          const touch = e.touches[0];
          touchStartPoint = { x: touch.clientX, y: touch.clientY };
          clearTimeout(touchHoldTimer);
          touchHoldTimer = setTimeout(() => {
            if (!state.map || !touchStartPoint) return;
            const rect = dom.mapContainer.getBoundingClientRect();
            const pt = L.point(touchStartPoint.x - rect.left, touchStartPoint.y - rect.top);
            const latlng = state.map.containerPointToLatLng(pt);
            triggerSpotAtLatLng(latlng);
          }, 560);
        },
        { passive: true }
      );

      dom.mapContainer?.addEventListener(
        'touchmove',
        (e) => {
          if (!touchHoldTimer || !touchStartPoint || !e.touches || e.touches.length !== 1) {
            clearTimeout(touchHoldTimer);
            return;
          }
          const t = e.touches[0];
          if (Math.hypot(t.clientX - touchStartPoint.x, t.clientY - touchStartPoint.y) > 10) {
            clearTimeout(touchHoldTimer);
          }
        },
        { passive: true }
      );

      const cancelTouchHold = () => {
        clearTimeout(touchHoldTimer);
        touchStartPoint = null;
      };
      dom.mapContainer?.addEventListener('touchend', cancelTouchHold, { passive: true });
      dom.mapContainer?.addEventListener('touchcancel', cancelTouchHold, { passive: true });

      state.initialized = true;
      renderTerminator();
      renderActiveStationBeacon();
      updateLocateActiveButton();
    })().catch((err) => {
      initPromise = null;
      throw err;
    });

    return initPromise;
  }

  async function loadGlobalGeoStations({ forceReload = false } = {}) {
    if (state.loadingGlobal) return;
    if (!forceReload && state.geoStations.length > 0) {
      renderCountryHubs();
      renderStationPins();
      updateSummaryBadge();
      scheduleViewportHydration();
      return;
    }

    if (state.abortController) state.abortController.abort();
    state.abortController = new AbortController();

    state.loadingGlobal = true;
    showLoading('Plotting live broadcasts worldwide…');

    try {
      const stations = await radioApi.getGeoStations(
        {
          httpsOnly: state.httpsOnly,
          limit: 2000,
        },
        state.abortController.signal
      );

      if (forceReload) {
        state.geoStationsMap.clear();
        state.countryStationsCache.clear();
        state.hydratedCountries.clear();
      }
      mergeGeoStations(stations);

      renderCountryHubs();
      renderStationPins();
      renderActiveStationBeacon();
      updateSummaryBadge();

      if (state.drawerMode === 'intro') {
        renderIntroDrawer();
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      showToast('Could not load geo-tagged stations. Country hubs are still browsable.');
      renderCountryHubs();
      if (state.drawerMode === 'intro') {
        renderIntroDrawer();
      }
    } finally {
      state.loadingGlobal = false;
      hideLoading();
      scheduleViewportHydration();
    }
  }

  /**
   * Background-load deeper GPS-pinned stations for a single country (cached once per session).
   */
  async function hydrateCountryPins(rawCode) {
    const code = (rawCode || '').toUpperCase();
    if (!code || state.hydratedCountries.has(code) || state.hydratingCountries.has(code)) {
      return;
    }
    const meta = getCountryMeta(code);
    if (meta && !meta.stationcount) {
      state.hydratedCountries.add(code);
      return;
    }

    const requestHttpsOnly = state.httpsOnly;
    state.hydratingCountries.add(code);
    updateHydratePill();

    try {
      const pinned = await radioApi.getGeoStations({
        httpsOnly: requestHttpsOnly,
        countrycode: code,
        limit: 450,
      });

      // Discard stale response if user toggled HTTPS-only mid-flight
      if (requestHttpsOnly !== state.httpsOnly) return;

      state.hydratedCountries.add(code);
      if (pinned.length > 0) {
        const beforeCount = state.geoStations.length;
        mergeGeoStations(pinned);
        if (state.geoStations.length !== beforeCount) {
          renderStationPins();
          updateSummaryBadge();
        }
      }
    } catch {
      // Transient mirror error: leave unhydrated so panning back can retry cleanly
    } finally {
      state.hydratingCountries.delete(code);
      updateHydratePill();
    }
  }

  /**
   * Automatically hydrate local GPS pins for the 1–2 countries closest to the map viewport
   * whenever the user pans or zooms into a region (zoom >= 4).
   */
  function scheduleViewportHydration() {
    if (!state.visible || !state.initialized || !state.map) return;
    clearTimeout(state.hydrateTimer);

    if (state.map.getZoom() < 4) return;

    state.hydrateTimer = setTimeout(() => {
      if (!state.visible || !state.map || state.map.getZoom() < 4) return;
      if (state.hydratingCountries.size >= 2) return;

      const center = state.map.getCenter();
      const normLng = normalizeLongitude(center.lng);
      const bounds = state.map.getBounds();

      const candidates = [];
      const seen = new Set();

      // 1. Prioritize the country directly beneath/closest to the map center
      const centerCode = inferNearestCountryCode(center.lat, normLng);
      if (
        centerCode &&
        !state.hydratedCountries.has(centerCode) &&
        !state.hydratingCountries.has(centerCode)
      ) {
        const centroid = COUNTRY_CENTROIDS[centerCode];
        const dist = centroid
          ? haversineKm(center.lat, normLng, centroid[0], centroid[1])
          : 0;
        if (dist <= 2200) {
          candidates.push({ code: centerCode, dist: -1 });
          seen.add(centerCode);
        }
      }

      // 2. Include visible country centroids inside the current map bounds
      for (const [code, centroid] of Object.entries(COUNTRY_CENTROIDS)) {
        if (
          seen.has(code) ||
          state.hydratedCountries.has(code) ||
          state.hydratingCountries.has(code)
        ) {
          continue;
        }
        const meta = getCountryMeta(code);
        if (state.countries.length > 0 && (!meta || !meta.stationcount)) continue;

        const dist = haversineKm(center.lat, normLng, centroid[0], centroid[1]);
        const inView =
          bounds.contains(centroid) ||
          bounds.contains([centroid[0], centroid[1] + 360]) ||
          bounds.contains([centroid[0], centroid[1] - 360]);

        if (inView || dist <= 1200) {
          candidates.push({ code, dist });
          seen.add(code);
        }
      }

      candidates.sort((a, b) => a.dist - b.dist);
      const slots = Math.max(0, 2 - state.hydratingCountries.size);
      const picks = candidates.slice(0, slots);
      for (const pick of picks) {
        hydrateCountryPins(pick.code);
      }
    }, 340);
  }

  function renderTerminator() {
    if (!state.initialized || !state.terminatorLayer) return;
    state.terminatorLayer.clearLayers();
    if (!state.showTerminator) return;

    const L = state.L;
    const isDark = state.theme === 'dark';
    const coords = buildNightTerminatorPolygon(new Date());

    L.polygon(coords, {
      renderer: state.canvasRenderer,
      interactive: false,
      color: isDark ? 'rgba(246, 183, 60, 0.36)' : 'rgba(29, 32, 38, 0.28)',
      weight: 1.25,
      dashArray: '4 5',
      fillColor: isDark ? '#07090E' : '#141926',
      fillOpacity: isDark ? 0.34 : 0.14,
    }).addTo(state.terminatorLayer);
  }

  function renderCountryHubs() {
    if (!state.initialized || !state.hubsLayer || !state.map) return;
    state.hubsLayer.clearLayers();

    if (!state.showCountryHubs) return;
    // Fade out Country Hubs when zoomed in so they never clutter cities/rural centers
    const zoom = state.map.getZoom();
    if (zoom > 4) return;

    const L = state.L;
    const isDark = state.theme === 'dark';
    const now = new Date();
    const hubStroke = isDark ? 'rgba(232, 236, 244, 0.45)' : 'rgba(29, 32, 38, 0.42)';
    const hubFill = isDark ? 'rgba(232, 236, 244, 0.10)' : 'rgba(29, 32, 38, 0.08)';

    for (const country of state.countries) {
      const code = (country.iso_3166_1 || '').toUpperCase();
      const centroid = COUNTRY_CENTROIDS[code];
      if (!centroid || !country.stationcount) continue;

      const solar = WIDE_MULTI_TZ_COUNTRIES.has(code) ? null : getSolarTimeInfo(centroid[1], now);
      if (state.timeBand !== 'all') {
        const checkSolar = solar || getSolarTimeInfo(centroid[1], now);
        if (checkSolar && checkSolar.period !== state.timeBand) continue;
      }

      const radius = Math.max(5.5, Math.min(16, 4.2 + Math.log10(country.stationcount + 1) * 3.1));
      const marker = L.circleMarker(centroid, {
        renderer: state.canvasRenderer,
        radius,
        color: hubStroke,
        weight: 1.4,
        dashArray: '2 2',
        fillColor: hubFill,
        fillOpacity: 1,
      });

      const flag = countryCodeToFlag(code);
      const clockPart = solar ? ` · ${solar.icon} ${solar.formatted}` : '';
      marker.bindTooltip(
        `<strong>${flag} ${escapeHtml(country.name)}</strong><br>${formatNumber(country.stationcount)} stations${escapeHtml(clockPart)}`,
        { direction: 'top', offset: [0, -6], opacity: 0.96 }
      );

      marker.on('click', () => {
        openCountryInDrawer(code, country.name, centroid);
      });

      marker.addTo(state.hubsLayer);
    }
  }

  function renderStationPins() {
    if (!state.initialized || !state.pinsLayer || !state.map) return;
    state.pinsLayer.clearLayers();

    const L = state.L;
    const zoom = state.map.getZoom();
    const cellSize = getClusterCellSize(zoom);
    const now = new Date();
    const accent = readCssVar('--accent', '#E33E1B');
    const accentBright = readCssVar('--accent-bright', '#FF5F3D');
    const isDark = state.theme === 'dark';
    const borderCol = isDark ? 'rgba(20, 22, 25, 0.92)' : 'rgba(255, 255, 255, 0.95)';

    // Fast spatial grid bucketing
    const buckets = new Map();
    for (const s of state.geoStations) {
      const lat = Number(s.geo_lat);
      const lng = Number(s.geo_long);
      if (state.timeBand !== 'all') {
        const solar = getSolarTimeInfo(lng, now);
        if (!solar || solar.period !== state.timeBand) continue;
      }

      const gx = Math.floor((lat + 90) / cellSize);
      const gy = Math.floor((lng + 180) / cellSize);
      const key = `${gx}:${gy}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { sumLat: 0, sumLng: 0, stations: [] };
        buckets.set(key, bucket);
      }
      bucket.sumLat += lat;
      bucket.sumLng += lng;
      bucket.stations.push(s);
    }

    for (const bucket of buckets.values()) {
      const count = bucket.stations.length;
      const lat = bucket.sumLat / count;
      const lng = bucket.sumLng / count;
      const top = bucket.stations[0];
      const solar = getSolarTimeInfo(lng, now);
      const radius =
        count === 1 ? 4.8 : Math.min(12.5, 5.4 + Math.log2(count) * 1.65);

      const marker = L.circleMarker([lat, lng], {
        renderer: state.canvasRenderer,
        radius,
        color: borderCol,
        weight: count > 1 ? 1.5 : 1.1,
        fillColor: count > 1 ? accent : accentBright,
        fillOpacity: count > 1 ? 0.88 : 0.82,
      });

      const flag = countryCodeToFlag(top.countrycode);
      const clockStr = solar ? ` · ${solar.icon} ${solar.formatted}` : '';
      const tipHtml =
        count === 1
          ? `<strong>${escapeHtml(top.name)}</strong><br>${flag} ${escapeHtml(
              [top.state, top.country].filter(Boolean).join(', ') || 'Live Broadcast'
            )}${escapeHtml(clockStr)}`
          : `<strong>${flag} ${count} stations</strong><br>${escapeHtml(
              [top.state, top.country].filter(Boolean).join(', ') || top.name
            )}${escapeHtml(clockStr)}`;

      marker.bindTooltip(tipHtml, { direction: 'top', offset: [0, -6], opacity: 0.96 });

      marker.on('click', () => {
        openClusterInDrawer({
          lat,
          lng,
          stations: bucket.stations,
          canZoomCloser: count > 4 && zoom < 8,
        });
      });

      marker.addTo(state.pinsLayer);
    }
  }

  function renderActiveStationBeacon() {
    if (!state.initialized || !state.activeLayer) return;
    state.activeLayer.clearLayers();

    const pState = getPlayerState();
    const station = pState?.station;
    if (!hasValidGeo(station)) return;

    const L = state.L;
    const accentBright = readCssVar('--accent-bright', '#FF5F3D');
    const pos = [Number(station.geo_lat), Number(station.geo_long)];

    L.circleMarker(pos, {
      renderer: state.canvasRenderer,
      radius: 13,
      color: accentBright,
      weight: 2,
      fillColor: accentBright,
      fillOpacity: 0.18,
      interactive: false,
    }).addTo(state.activeLayer);

    L.circleMarker(pos, {
      renderer: state.canvasRenderer,
      radius: 5.5,
      color: '#FFFFFF',
      weight: 2,
      fillColor: accentBright,
      fillOpacity: 1,
      interactive: false,
    }).addTo(state.activeLayer);
  }

  function renderUserRadiusOverlay() {
    if (!state.initialized || !state.userLayer) return;
    state.userLayer.clearLayers();
    if (!state.userCoords) return;

    const L = state.L;
    const accent = readCssVar('--accent', '#E33E1B');
    const pos = [state.userCoords.lat, state.userCoords.lng];

    if (state.nearMeRadiusKm > 0) {
      L.circle(pos, {
        renderer: state.canvasRenderer,
        radius: state.nearMeRadiusKm * 1000,
        color: accent,
        weight: 1.5,
        dashArray: '5 5',
        fillColor: accent,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(state.userLayer);
    }

    L.circleMarker(pos, {
      renderer: state.canvasRenderer,
      radius: 6.5,
      color: '#FFFFFF',
      weight: 2.5,
      fillColor: state.userLocationIsGps ? '#1B6CE3' : accent,
      fillOpacity: 1,
      interactive: false,
    })
      .bindTooltip(state.userLocationIsGps ? 'Your location' : 'Selected spot', {
        direction: 'top',
        offset: [0, -8],
      })
      .addTo(state.userLayer);
  }

  /* --------------------------------------------------------------------------
     Drawer Rendering & Actions
     -------------------------------------------------------------------------- */

  function buildAtlasRowHtml(station, { distanceKm = null, badgeText = '' } = {}) {
    const pState = getPlayerState();
    const isCurrent = pState.station && pState.station.stationuuid === station.stationuuid;
    const isPlaying = isCurrent && pState.status === 'playing';
    const isLoading = isCurrent && pState.status === 'loading';
    const playState = isLoading ? 'loading' : isPlaying ? 'playing' : 'idle';
    const fav = isFavorite(station.stationuuid);

    const flag = countryCodeToFlag(station.countrycode);
    const loc = [station.state, station.country].filter(Boolean).join(', ') || 'Worldwide';
    const solar = getStationSolarTime(station);
    const codec = (station.codec || '').toUpperCase();
    const bitrate = Number(station.bitrate) > 0 ? `${station.bitrate}k` : '';
    const isHls = Number(station.hls) === 1;

    const playOverlayInner = isLoading
      ? '<span class="spinner"></span>'
      : isPlaying
      ? '<span class="eq-bars" aria-hidden="true"><span></span><span></span><span></span></span>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

    return `
      <article
        class="atlas-station-row ${isPlaying ? 'is-playing' : ''} ${isLoading ? 'is-loading' : ''}"
        data-atlas-uuid="${escapeHtml(station.stationuuid)}"
        data-play-state="${playState}"
      >
        <button
          type="button"
          class="atlas-row-art"
          data-atlas-action="play"
          data-uuid="${escapeHtml(station.stationuuid)}"
          aria-label="${isPlaying ? 'Pause' : 'Play'} ${escapeHtml(station.name)}"
        >
          ${buildArtworkHtml(station, 42)}
          <span class="atlas-play-overlay">${playOverlayInner}</span>
        </button>

        <div class="atlas-row-main">
          <button
            type="button"
            class="atlas-row-name"
            data-atlas-action="play"
            data-uuid="${escapeHtml(station.stationuuid)}"
            title="${escapeHtml(station.name)}"
          >
            ${escapeHtml(station.name)}
          </button>
          <div class="atlas-row-meta">
            <span>${flag} ${escapeHtml(loc)}</span>
            ${solar ? `<span class="atlas-solar-pill" title="Approximate local solar time (${escapeHtml(solar.offsetLabel)})">${solar.icon} ${escapeHtml(solar.formatted)}</span>` : ''}
          </div>
          <div class="atlas-row-specs">
            ${distanceKm !== null ? `<span class="spec-badge accent">${escapeHtml(formatDistanceKm(distanceKm))}</span>` : ''}
            ${badgeText ? `<span class="spec-badge muted">${escapeHtml(badgeText)}</span>` : ''}
            ${codec ? `<span class="spec-badge">${escapeHtml(codec)}</span>` : ''}
            ${bitrate ? `<span class="spec-badge">${escapeHtml(bitrate)}</span>` : ''}
            ${isHls ? '<span class="spec-badge hls">HLS</span>' : ''}
          </div>
        </div>

        <div class="atlas-row-actions">
          <button
            type="button"
            class="card-action-btn ${fav ? 'favorited' : ''}"
            data-atlas-action="favorite"
            data-uuid="${escapeHtml(station.stationuuid)}"
            aria-label="${fav ? 'Remove from saved' : 'Save station'}"
            title="${fav ? 'Saved' : 'Save station'}"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
            </svg>
          </button>
          <button
            type="button"
            class="card-action-btn"
            data-atlas-action="info"
            data-uuid="${escapeHtml(station.stationuuid)}"
            aria-label="Station details"
            title="Station details"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
          </button>
        </div>
      </article>
    `;
  }

  function renderIntroDrawer() {
    state.drawerMode = 'intro';
    state.drawerContext = null;

    const now = new Date();
    const filtered = state.geoStations.filter((s) => {
      if (state.timeBand === 'all') return true;
      const solar = getSolarTimeInfo(Number(s.geo_long), now);
      return solar && solar.period === state.timeBand;
    });

    const featured = filtered.slice(0, 24);
    state.drawerStations = featured;

    const bandMeta = state.timeBand !== 'all' ? TIME_BAND_META[state.timeBand] : null;
    dom.drawerKicker.textContent = bandMeta ? `${bandMeta.icon} ${bandMeta.label} Band` : 'Global Atlas';
    dom.drawerTitle.textContent = bandMeta
      ? `Live in ${bandMeta.label} Regions`
      : 'Explore Stations Worldwide';
    dom.drawerSubtitle.textContent =
      'Tap any accent pin for exact city stations, any dashed ring for a full country, or hit Near Me.';
    dom.drawerControls.innerHTML = '';
    dom.drawerBanner.style.display = 'none';
    dom.drawerBanner.innerHTML = '';

    if (featured.length === 0) {
      dom.drawerList.innerHTML = `
        <div class="atlas-empty">
          <p>Tap a Country Hub ring on the map or click <strong>Near Me</strong> to tune into local broadcasts.</p>
        </div>
      `;
      return;
    }

    dom.drawerList.innerHTML = featured.map((s) => buildAtlasRowHtml(s)).join('');
  }

  function openClusterInDrawer({ lat, lng, stations, canZoomCloser = false }) {
    state.drawerMode = 'cluster';
    state.drawerContext = { lat, lng, stations, canZoomCloser };

    const sorted = [...stations].sort((a, b) => (b.clickcount || 0) - (a.clickcount || 0));
    state.drawerStations = sorted;

    const top = sorted[0];
    const solar = getSolarTimeInfo(lng);
    const flag = countryCodeToFlag(top?.countrycode);
    const placeName =
      [top?.state, top?.country].filter(Boolean).join(', ') || top?.name || 'Selected Area';

    dom.drawerKicker.textContent = solar
      ? `${solar.icon} ${solar.formatted} · ${solar.periodLabel}`
      : 'Pinned Location';
    dom.drawerTitle.textContent =
      sorted.length === 1 ? top.name : `${flag} ${placeName}`;
    dom.drawerSubtitle.textContent =
      sorted.length === 1
        ? `${flag} ${placeName} · ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`
        : `${sorted.length} pinned station${sorted.length === 1 ? '' : 's'} near ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;

    dom.drawerControls.innerHTML = canZoomCloser
      ? `<button type="button" class="btn-ghost-sm" id="atlas-zoom-cluster-btn">Zoom in closer +</button>`
      : '';

    const zoomBtn = document.getElementById('atlas-zoom-cluster-btn');
    if (zoomBtn && state.map) {
      zoomBtn.addEventListener('click', () => {
        state.map.flyTo([lat, lng], Math.min(state.map.getZoom() + 3, 10), { duration: 0.65 });
      });
    }

    // Country fallback banner: offer full country catalog including unpinned stations
    const countryCode = (top?.countrycode || '').toUpperCase();
    const countryMeta = getCountryMeta(countryCode);
    if (countryCode && countryMeta && countryMeta.stationcount > sorted.length) {
      dom.drawerBanner.style.display = 'flex';
      dom.drawerBanner.innerHTML = `
        <span>Showing ${sorted.length} pinned here · <strong>${formatNumber(countryMeta.stationcount)}</strong> total in ${escapeHtml(countryMeta.name)}</span>
        <button type="button" class="text-link-btn" data-atlas-browse-country="${escapeHtml(countryCode)}">Browse all →</button>
      `;
    } else {
      dom.drawerBanner.style.display = 'none';
      dom.drawerBanner.innerHTML = '';
    }

    dom.drawerList.innerHTML = sorted.map((s) => buildAtlasRowHtml(s)).join('');
  }

  async function openCountryInDrawer(countryCode, countryName, centroid = null) {
    const code = (countryCode || '').toUpperCase();
    if (!code) return;

    if (state.drawerAbortController) state.drawerAbortController.abort();
    state.drawerAbortController = new AbortController();

    const meta = getCountryMeta(code);
    const displayName = countryName || meta?.name || code;
    const targetCentroid = centroid || COUNTRY_CENTROIDS[code];
    const flag = countryCodeToFlag(code);

    if (state.map && targetCentroid) {
      const targetZoom = WIDE_MULTI_TZ_COUNTRIES.has(code) ? 4 : 5;
      state.map.flyTo(targetCentroid, Math.max(state.map.getZoom(), targetZoom), { duration: 0.75 });
    }

    state.drawerMode = 'country';
    state.drawerContext = { code, name: displayName };

    const solar =
      targetCentroid && !WIDE_MULTI_TZ_COUNTRIES.has(code)
        ? getSolarTimeInfo(targetCentroid[1])
        : null;

    dom.drawerKicker.textContent = solar
      ? `Country Hub · ${solar.icon} ${solar.formatted}`
      : 'Country Hub';
    dom.drawerTitle.textContent = `${flag} ${displayName}`;
    dom.drawerSubtitle.textContent = 'Loading pinned & unpinned broadcasts…';
    dom.drawerControls.innerHTML = `
      <button type="button" class="btn-ghost-sm" id="atlas-open-discover-country-btn">Filter in Discover →</button>
    `;
    document
      .getElementById('atlas-open-discover-country-btn')
      ?.addEventListener('click', () => openCountryInDiscover(code));

    dom.drawerBanner.style.display = 'none';
    dom.drawerBanner.innerHTML = '';
    dom.drawerList.innerHTML = Array.from({ length: 5 })
      .map(() => '<div class="atlas-row-skeleton" aria-hidden="true"></div>')
      .join('');

    try {
      let countryStations = state.countryStationsCache.get(code);
      if (!countryStations) {
        const [{ stations: allInCountry }, pinnedInCountry] = await Promise.all([
          radioApi.searchStations(
            {
              countrycode: code,
              httpsOnly: state.httpsOnly,
              order: 'clickcount',
              reverse: true,
              limit: 60,
              cache: true,
            },
            state.drawerAbortController.signal
          ),
          radioApi
            .getGeoStations(
              {
                httpsOnly: state.httpsOnly,
                countrycode: code,
                limit: 400,
              },
              state.drawerAbortController.signal
            )
            .catch(() => []),
        ]);

        if (pinnedInCountry.length > 0) {
          state.hydratedCountries.add(code);
          mergeGeoStations(pinnedInCountry);
          renderStationPins();
          updateSummaryBadge();
        }
        countryStations = allInCountry;
        state.countryStationsCache.set(code, countryStations);
      }

      state.drawerStations = countryStations;
      const pinnedCount = countryStations.filter(hasValidGeo).length;
      const unpinnedCount = countryStations.length - pinnedCount;
      const totalReported = meta?.stationcount || countryStations.length;

      dom.drawerSubtitle.textContent = `Top ${countryStations.length} of ${formatNumber(totalReported)} stations (${pinnedCount} pinned · ${unpinnedCount} country fallback)`;

      if (countryStations.length === 0) {
        dom.drawerList.innerHTML = `
          <div class="atlas-empty">
            <p>No ${state.httpsOnly ? 'HTTPS ' : ''}stations found in ${escapeHtml(displayName)}.</p>
          </div>
        `;
        return;
      }

      dom.drawerList.innerHTML = countryStations
        .map((s) =>
          buildAtlasRowHtml(s, {
            badgeText: hasValidGeo(s) ? '' : 'Country match',
          })
        )
        .join('');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      dom.drawerSubtitle.textContent = 'Could not load stations for this country.';
      dom.drawerList.innerHTML = `
        <div class="atlas-empty">
          <p>The active Radio Browser mirror did not respond. Please try again.</p>
        </div>
      `;
    }
  }

  function inferNearestCountryCode(lat, lng) {
    // 1. Prefer the country of the closest verified pinned station within 350 km
    let bestStationDist = 350;
    let bestCode = '';
    for (const s of state.geoStations) {
      if (!s.countrycode) continue;
      const d = haversineKm(lat, lng, Number(s.geo_lat), Number(s.geo_long));
      if (d < bestStationDist) {
        bestStationDist = d;
        bestCode = s.countrycode.toUpperCase();
      }
    }
    if (bestCode) return bestCode;

    // 2. Fallback to nearest country centroid
    let bestCentroidDist = Infinity;
    for (const [code, coords] of Object.entries(COUNTRY_CENTROIDS)) {
      const d = haversineKm(lat, lng, coords[0], coords[1]);
      if (d < bestCentroidDist) {
        bestCentroidDist = d;
        bestCode = code;
      }
    }
    return bestCode;
  }

  function renderNearMeDrawer(countryStations = []) {
    if (!state.userCoords) return;
    const { lat, lng } = state.userCoords;
    const radius = state.nearMeRadiusKm;
    const countryCode = state.nearMeCountryCode;
    const countryMeta = getCountryMeta(countryCode);
    const countryName = countryMeta?.name || countryCode || 'Your Country';
    const solar = getSolarTimeInfo(lng);

    // Compute exact Haversine distance across all merged pinned stations
    const pinnedWithDist = state.geoStations
      .map((s) => ({
        station: s,
        distanceKm: haversineKm(lat, lng, Number(s.geo_lat), Number(s.geo_long)),
      }))
      .filter((entry) => radius === 0 || entry.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 36);

    const pinnedUuids = new Set(pinnedWithDist.map((e) => e.station.stationuuid));
    // Section 2: Unpinned / additional stations in the same country (honest country fallback!)
    const countryFallback = countryStations
      .filter((s) => !pinnedUuids.has(s.stationuuid) && !hasValidGeo(s))
      .slice(0, 24);

    state.drawerMode = 'nearme';
    state.drawerContext = { countryStations };
    state.drawerStations = [
      ...pinnedWithDist.map((e) => e.station),
      ...countryFallback,
    ];

    const modeLabel = state.userLocationIsGps ? 'Near Me' : 'Near This Spot';
    dom.drawerKicker.textContent = solar
      ? `${modeLabel} · ${solar.icon} ${solar.formatted}`
      : modeLabel;
    dom.drawerTitle.textContent = countryCode
      ? `${countryCodeToFlag(countryCode)} ${state.userLocationIsGps ? 'Local Broadcasts' : `Near ${countryName}`}`
      : 'Nearest Broadcasts';
    dom.drawerSubtitle.textContent =
      radius > 0
        ? `${pinnedWithDist.length} pinned within ${radius} km · ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`
        : `${pinnedWithDist.length} closest pinned stations · ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;

    dom.drawerControls.innerHTML = `
      <div class="atlas-radius-pills" role="group" aria-label="Search radius">
        ${RADIUS_OPTIONS.map(
          (r) => `
          <button
            type="button"
            class="atlas-radius-pill ${r === radius ? 'active' : ''}"
            data-atlas-radius="${r}"
          >${r === 0 ? 'Any' : `${r} km`}</button>
        `
        ).join('')}
      </div>
    `;

    dom.drawerControls.querySelectorAll('[data-atlas-radius]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.nearMeRadiusKm = Number(btn.dataset.atlasRadius) || 0;
        renderUserRadiusOverlay();
        renderNearMeDrawer(countryStations);
      });
    });

    if (countryCode && countryMeta) {
      dom.drawerBanner.style.display = 'flex';
      dom.drawerBanner.innerHTML = `
        <span>${countryCodeToFlag(countryCode)} ${formatNumber(countryMeta.stationcount)} stations in ${escapeHtml(countryName)}</span>
        <button type="button" class="text-link-btn" data-atlas-browse-country="${escapeHtml(countryCode)}">View country →</button>
      `;
    } else {
      dom.drawerBanner.style.display = 'none';
      dom.drawerBanner.innerHTML = '';
    }

    const parts = [];

    if (pinnedWithDist.length > 0) {
      parts.push(`<div class="atlas-section-label">Nearest Pinned Stations</div>`);
      parts.push(
        pinnedWithDist
          .map(({ station, distanceKm }) => buildAtlasRowHtml(station, { distanceKm }))
          .join('')
      );
    } else {
      parts.push(`
        <div class="atlas-empty compact">
          <p>No GPS-pinned stations found within ${radius} km. Try widening the radius to 500 km or Any.</p>
        </div>
      `);
    }

    if (countryFallback.length > 0) {
      parts.push(
        `<div class="atlas-section-label">More in ${escapeHtml(countryName)} <span>(No GPS pin · Country match)</span></div>`
      );
      parts.push(
        countryFallback
          .map((s) => buildAtlasRowHtml(s, { badgeText: 'Country match' }))
          .join('')
      );
    }

    dom.drawerList.innerHTML = parts.join('');
  }

  /**
   * Explore radio broadcasts near any geographic point (used by both GPS "Near Me"
   * and right-click / press-and-hold "Near this spot").
   */
  async function exploreSpot(lat, lng, { isUserLocation = false, fly = true } = {}) {
    state.userCoords = { lat, lng };
    state.userLocationIsGps = Boolean(isUserLocation);
    state.nearMeCountryCode = inferNearestCountryCode(lat, lng);

    if (state.map) {
      if (fly) {
        state.map.flyTo([lat, lng], Math.max(state.map.getZoom(), 8), { duration: 0.9 });
      } else if (state.map.getZoom() < 5) {
        state.map.flyTo([lat, lng], 6, { duration: 0.7 });
      }
    }
    renderUserRadiusOverlay();

    dom.drawerKicker.textContent = isUserLocation ? 'Near Me' : 'Near This Spot';
    dom.drawerTitle.textContent = 'Finding nearby stations…';
    dom.drawerSubtitle.textContent = `Scanning broadcasts near ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
    dom.drawerList.innerHTML = Array.from({ length: 5 })
      .map(() => '<div class="atlas-row-skeleton" aria-hidden="true"></div>')
      .join('');

    let countryStations = [];
    if (state.nearMeCountryCode) {
      const code = state.nearMeCountryCode;
      const [deepPinned, allCountryRes] = await Promise.all([
        radioApi
          .getGeoStations({
            httpsOnly: state.httpsOnly,
            countrycode: code,
            limit: 600,
          })
          .catch(() => []),
        radioApi
          .searchStations({
            countrycode: code,
            httpsOnly: state.httpsOnly,
            order: 'clickcount',
            reverse: true,
            limit: 50,
            cache: true,
          })
          .catch(() => ({ stations: [] })),
      ]);

      if (deepPinned.length > 0) {
        state.hydratedCountries.add(code);
        mergeGeoStations(deepPinned);
        renderStationPins();
        updateSummaryBadge();
      }
      countryStations = allCountryRes.stations || [];
      if (countryStations.length > 0) {
        state.countryStationsCache.set(code, countryStations);
      }
    }

    renderNearMeDrawer(countryStations);
    showToast(
      isUserLocation
        ? 'Centered Atlas on your location'
        : `Exploring broadcasts near ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`
    );
  }

  async function handleNearMeClick() {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported here — right-click or hold anywhere on the map instead.');
      return;
    }

    dom.nearMeBtn.disabled = true;
    dom.nearMeIcon.style.display = 'none';
    dom.nearMeSpinner.style.display = 'inline-block';

    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000,
        });
      });

      await exploreSpot(pos.coords.latitude, pos.coords.longitude, {
        isUserLocation: true,
        fly: true,
      });
    } catch (err) {
      const denied = err && err.code === 1;
      showToast(
        denied
          ? 'Location permission declined — hold or right-click anywhere on the map for nearby stations.'
          : 'Could not detect your location right now — hold or right-click anywhere on the map instead.'
      );
    } finally {
      dom.nearMeBtn.disabled = false;
      dom.nearMeIcon.style.display = 'inline-block';
      dom.nearMeSpinner.style.display = 'none';
    }
  }

  function exploreCurrentMapView() {
    if (!state.map) return;
    const bounds = state.map.getBounds();
    const center = state.map.getCenter();
    const now = new Date();

    const inView = state.geoStations
      .filter((s) => {
        const lat = Number(s.geo_lat);
        const lng = Number(s.geo_long);
        if (!bounds.contains([lat, lng])) return false;
        if (state.timeBand !== 'all') {
          const solar = getSolarTimeInfo(lng, now);
          if (!solar || solar.period !== state.timeBand) return false;
        }
        return true;
      })
      .map((s) => ({
        station: s,
        distanceKm: haversineKm(center.lat, center.lng, Number(s.geo_lat), Number(s.geo_long)),
      }))
      .sort((a, b) => (b.station.clickcount || 0) - (a.station.clickcount || 0))
      .slice(0, 40);

    state.drawerMode = 'inview';
    state.drawerContext = null;
    state.drawerStations = inView.map((e) => e.station);

    const solar = getSolarTimeInfo(center.lng, now);
    dom.drawerKicker.textContent = solar
      ? `In Map View · ${solar.icon} ${solar.formatted}`
      : 'In Map View';
    dom.drawerTitle.textContent = `${inView.length} Station${inView.length === 1 ? '' : 's'} Visible`;
    dom.drawerSubtitle.textContent = `Centered near ${center.lat.toFixed(1)}°, ${center.lng.toFixed(1)}°`;
    dom.drawerControls.innerHTML = '';

    const inferredCode = inferNearestCountryCode(center.lat, center.lng);
    const meta = getCountryMeta(inferredCode);
    if (meta) {
      dom.drawerBanner.style.display = 'flex';
      dom.drawerBanner.innerHTML = `
        <span>Near ${countryCodeToFlag(inferredCode)} ${escapeHtml(meta.name)} (${formatNumber(meta.stationcount)} total)</span>
        <button type="button" class="text-link-btn" data-atlas-browse-country="${escapeHtml(inferredCode)}">Browse all →</button>
      `;
    } else {
      dom.drawerBanner.style.display = 'none';
      dom.drawerBanner.innerHTML = '';
    }

    if (inView.length === 0) {
      dom.drawerList.innerHTML = `
        <div class="atlas-empty">
          <p>No pinned stations inside this map view. Zoom out or tap a Country Hub to browse unpinned stations.</p>
        </div>
      `;
      return;
    }

    dom.drawerList.innerHTML = inView
      .map(({ station }) => buildAtlasRowHtml(station))
      .join('');
  }

  /* --------------------------------------------------------------------------
     Quick Jump Search (Countries, Pinned Cities/States & Directory Lookup)
     -------------------------------------------------------------------------- */

  function hideJumpResults() {
    if (!dom.jumpResults) return;
    dom.jumpResults.classList.remove('open');
    dom.jumpResults.innerHTML = '';
    state.jumpItems = [];
  }

  function renderJumpResults(rawQuery) {
    if (!dom.jumpResults) return;
    const q = String(rawQuery || '').trim().toLowerCase();
    if (q.length < 1) {
      hideJumpResults();
      return;
    }

    const items = [];

    // 1. Matching Countries (prioritize prefix match)
    const countryMatches = state.countries
      .filter((c) => {
        const code = (c.iso_3166_1 || '').toUpperCase();
        if (!COUNTRY_CENTROIDS[code] || !c.stationcount) return false;
        return c.name.toLowerCase().includes(q) || code.toLowerCase() === q;
      })
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || (b.stationcount || 0) - (a.stationcount || 0);
      })
      .slice(0, 4);

    for (const c of countryMatches) {
      const code = (c.iso_3166_1 || '').toUpperCase();
      items.push({
        type: 'country',
        code,
        name: c.name,
        kind: 'Country',
        label: `${countryCodeToFlag(code)} ${c.name}`,
        meta: `${formatNumber(c.stationcount)} stations`,
      });
    }

    // 2. Matching Cities / States among currently loaded pinned stations
    if (q.length >= 2) {
      const regionBuckets = new Map();
      for (const s of state.geoStations) {
        if (!s.state || !s.state.toLowerCase().includes(q)) continue;
        const key = `${s.state.toLowerCase()}|${s.countrycode || ''}`;
        let b = regionBuckets.get(key);
        if (!b) {
          b = {
            stateName: s.state,
            country: s.country,
            countrycode: s.countrycode,
            sumLat: 0,
            sumLng: 0,
            stations: [],
          };
          regionBuckets.set(key, b);
        }
        b.sumLat += Number(s.geo_lat);
        b.sumLng += Number(s.geo_long);
        b.stations.push(s);
      }

      const topRegions = Array.from(regionBuckets.values())
        .sort((a, b) => b.stations.length - a.stations.length)
        .slice(0, 3);

      for (const r of topRegions) {
        items.push({
          type: 'region',
          lat: r.sumLat / r.stations.length,
          lng: r.sumLng / r.stations.length,
          countrycode: r.countrycode,
          stations: r.stations,
          kind: 'Region',
          label: `${countryCodeToFlag(r.countrycode)} ${r.stateName}${r.country ? `, ${r.country}` : ''}`,
          meta: `${r.stations.length} pinned`,
        });
      }

      // 3. Matching pinned stations by name
      const stationMatches = state.geoStations
        .filter((s) => s.name && s.name.toLowerCase().includes(q))
        .slice(0, 3);

      for (const s of stationMatches) {
        items.push({
          type: 'station',
          station: s,
          kind: 'Station',
          label: `${countryCodeToFlag(s.countrycode)} ${s.name}`,
          meta: s.state || s.country || 'Pinned',
        });
      }

      // 4. Live directory search fallback for cities/stations not yet loaded
      items.push({
        type: 'remote',
        query: rawQuery.trim(),
        kind: 'Search',
        label: `Find pinned stations for "${rawQuery.trim()}"`,
        meta: 'Enter ↵',
      });
    }

    if (items.length === 0) {
      hideJumpResults();
      return;
    }

    state.jumpItems = items;
    dom.jumpResults.innerHTML = items
      .map(
        (item, idx) => `
        <button
          type="button"
          class="search-suggestion-item"
          role="option"
          data-jump-index="${idx}"
        >
          <span class="suggestion-left">
            <span class="suggestion-kind">${escapeHtml(item.kind)}</span>
            <span class="suggestion-label">${escapeHtml(item.label)}</span>
          </span>
          <span class="suggestion-meta">${escapeHtml(item.meta)}</span>
        </button>
      `
      )
      .join('');
    dom.jumpResults.classList.add('open');
  }

  async function remoteJumpSearch(query) {
    const q = String(query || '').trim();
    if (q.length < 2) return;

    showLoading(`Searching Atlas for "${q}"…`);
    try {
      const [byState, byName] = await Promise.all([
        radioApi
          .searchStations({
            state: q,
            hasGeoInfo: true,
            httpsOnly: state.httpsOnly,
            order: 'clickcount',
            reverse: true,
            limit: 30,
          })
          .catch(() => ({ stations: [] })),
        radioApi
          .searchStations({
            name: q,
            hasGeoInfo: true,
            httpsOnly: state.httpsOnly,
            order: 'clickcount',
            reverse: true,
            limit: 20,
          })
          .catch(() => ({ stations: [] })),
      ]);

      const merged = [];
      const seen = new Set();
      for (const s of [...(byState.stations || []), ...(byName.stations || [])]) {
        if (!hasValidGeo(s) || seen.has(s.stationuuid)) continue;
        seen.add(s.stationuuid);
        merged.push(s);
      }

      if (merged.length === 0) {
        showToast(`No GPS-pinned stations found matching "${q}". Try a country name.`);
        return;
      }

      mergeGeoStations(merged);
      renderStationPins();
      updateSummaryBadge();

      const top = merged[0];
      const lat = Number(top.geo_lat);
      const lng = Number(top.geo_long);
      if (state.map) {
        state.map.flyTo([lat, lng], merged.length === 1 ? 8 : 6, { duration: 0.85 });
      }
      openClusterInDrawer({
        lat,
        lng,
        stations: merged,
        canZoomCloser: false,
      });
      if (top.countrycode) {
        hydrateCountryPins(top.countrycode);
      }
    } finally {
      hideLoading();
    }
  }

  async function executeJumpItem(item) {
    if (!item) return;
    hideJumpResults();
    if (dom.jumpInput) dom.jumpInput.value = '';

    if (item.type === 'country') {
      await openCountryInDrawer(item.code, item.name);
    } else if (item.type === 'region') {
      if (state.map) {
        state.map.flyTo([item.lat, item.lng], 7, { duration: 0.8 });
      }
      openClusterInDrawer({
        lat: item.lat,
        lng: item.lng,
        stations: item.stations,
        canZoomCloser: false,
      });
      if (item.countrycode) hydrateCountryPins(item.countrycode);
    } else if (item.type === 'station') {
      await focusStationOnMap(item.station);
    } else if (item.type === 'remote') {
      await remoteJumpSearch(item.query);
    }
  }

  async function focusStationOnMap(station) {
    if (!station) return;
    if (!state.initialized || !state.map) {
      await controller.onShow();
    }
    if (!state.map) return;

    if (hasValidGeo(station)) {
      mergeGeoStations([station]);
      renderStationPins();
      updateSummaryBadge();

      const lat = Number(station.geo_lat);
      const lng = Number(station.geo_long);
      state.map.flyTo([lat, lng], Math.max(state.map.getZoom(), 8), { duration: 0.85 });
      openClusterInDrawer({
        lat,
        lng,
        stations: [station],
        canZoomCloser: false,
      });
      if (station.countrycode) {
        hydrateCountryPins(station.countrycode);
      }
    } else if (station.countrycode) {
      const code = station.countrycode.toUpperCase();
      const meta = getCountryMeta(code);
      await openCountryInDrawer(code, station.country || meta?.name || code);
    } else {
      showToast('This station has no geographic location data.');
    }
  }

  /* --------------------------------------------------------------------------
     UI Event Binding (Once)
     -------------------------------------------------------------------------- */

  function bindAtlasUiEvents() {
    dom.nearMeBtn?.addEventListener('click', handleNearMeClick);

    dom.locateActiveBtn?.addEventListener('click', () => {
      const current = getPlayerState()?.station;
      if (!hasValidGeo(current) || !state.map) {
        showToast('Current station has no GPS coordinates.');
        return;
      }
      focusStationOnMap(current);
    });

    dom.jumpInput?.addEventListener('input', () => {
      renderJumpResults(dom.jumpInput.value);
    });

    dom.jumpInput?.addEventListener('focus', () => {
      if (dom.jumpInput.value.trim().length >= 1) {
        renderJumpResults(dom.jumpInput.value);
      }
    });

    dom.jumpInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideJumpResults();
        dom.jumpInput.blur();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.jumpItems.length > 0) {
          executeJumpItem(state.jumpItems[0]);
        } else if (dom.jumpInput.value.trim().length >= 2) {
          hideJumpResults();
          const q = dom.jumpInput.value.trim();
          dom.jumpInput.value = '';
          remoteJumpSearch(q);
        }
      }
    });

    dom.jumpResults?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-jump-index]');
      if (!btn) return;
      const idx = Number(btn.dataset.jumpIndex);
      if (Number.isFinite(idx) && state.jumpItems[idx]) {
        executeJumpItem(state.jumpItems[idx]);
      }
    });

    document.addEventListener('click', (e) => {
      if (dom.jumpWrap && !dom.jumpWrap.contains(e.target)) {
        hideJumpResults();
      }
    });

    dom.inViewBtn?.addEventListener('click', exploreCurrentMapView);

    dom.dayNightBtn?.addEventListener('click', () => {
      state.showTerminator = !state.showTerminator;
      dom.dayNightBtn.classList.toggle('active', state.showTerminator);
      dom.dayNightBtn.setAttribute('aria-pressed', String(state.showTerminator));
      renderTerminator();
    });

    dom.hubsBtn?.addEventListener('click', () => {
      state.showCountryHubs = !state.showCountryHubs;
      dom.hubsBtn.classList.toggle('active', state.showCountryHubs);
      dom.hubsBtn.setAttribute('aria-pressed', String(state.showCountryHubs));
      renderCountryHubs();
    });

    dom.timeChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const nextBand = chip.dataset.timeBand || 'all';
        state.timeBand = nextBand;
        dom.timeChips.forEach((c) => {
          const isActive = c.dataset.timeBand === nextBand;
          c.classList.toggle('active', isActive);
          c.setAttribute('aria-pressed', String(isActive));
        });

        renderCountryHubs();
        renderStationPins();
        updateSummaryBadge();

        // Gently pan toward the longitude band currently experiencing this time of day
        if (nextBand !== 'all' && state.map && TIME_BAND_META[nextBand]) {
          const targetLng = getLongitudeForSolarHour(TIME_BAND_META[nextBand].targetHour);
          state.map.flyTo([20, targetLng], Math.min(state.map.getZoom(), 3), { duration: 0.8 });
        }

        if (state.drawerMode === 'intro') {
          renderIntroDrawer();
        }
      });
    });

    // Country fallback banner click
    dom.drawerBanner?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-atlas-browse-country]');
      if (!btn) return;
      const code = btn.dataset.atlasBrowseCountry;
      const meta = getCountryMeta(code);
      openCountryInDrawer(code, meta?.name || code);
    });

    // Station row actions (play, favorite, info)
    dom.drawerList?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-atlas-action]');
      if (!btn) return;
      const action = btn.dataset.atlasAction;
      const uuid = btn.dataset.uuid;
      const station = findStation(uuid);
      if (!station) return;

      if (action === 'play') {
        playStation(station, state.drawerStations);
      } else if (action === 'favorite') {
        toggleFavorite(station);
      } else if (action === 'info') {
        openInfo(station);
      }
    });
  }

  function findStation(uuid) {
    if (!uuid) return null;
    return (
      state.drawerStations.find((s) => s.stationuuid === uuid) ||
      state.geoStationsMap.get(uuid) ||
      null
    );
  }

  function startTerminatorClock() {
    stopTerminatorClock();
    state.terminatorTimer = setInterval(() => {
      if (state.visible && document.visibilityState === 'visible') {
        renderTerminator();
      }
    }, 60000);
  }

  function stopTerminatorClock() {
    if (state.terminatorTimer) {
      clearInterval(state.terminatorTimer);
      state.terminatorTimer = null;
    }
  }

  bindAtlasUiEvents();

  /* --------------------------------------------------------------------------
     Public Controller API (called from js/app.js)
     -------------------------------------------------------------------------- */

  const controller = {
    async onShow() {
      state.visible = true;
      try {
        await initMapIfNeeded();
      } catch (err) {
        hideLoading();
        showToast(err?.message || 'Could not load map library.');
        return;
      }

      // Ensure Leaflet measures container cleanly after #view-atlas becomes display:block
      requestAnimationFrame(() => {
        state.map?.invalidateSize();
      });

      startTerminatorClock();
      await loadGlobalGeoStations();
      renderTerminator();
      renderActiveStationBeacon();
      updateLocateActiveButton();
    },

    focusStation: focusStationOnMap,

    onHide() {
      state.visible = false;
      hideJumpResults();
      clearTimeout(state.hydrateTimer);
      stopTerminatorClock();
    },

    setTheme(theme) {
      const next = theme === 'dark' ? 'dark' : 'light';
      if (state.theme === next) return;
      state.theme = next;
      if (state.initialized) {
        renderTerminator();
        renderCountryHubs();
        renderStationPins();
      }
    },

    setAccent() {
      if (!state.initialized) return;
      renderStationPins();
      renderActiveStationBeacon();
      renderUserRadiusOverlay();
    },

    setCountries(countries) {
      state.countries = Array.isArray(countries) ? countries : [];
      updateSummaryBadge();
      if (state.initialized) {
        renderCountryHubs();
        scheduleViewportHydration();
      }
    },

    setHttpsOnly(httpsOnly) {
      const next = Boolean(httpsOnly);
      if (state.httpsOnly === next) return;
      state.httpsOnly = next;
      state.hydratedCountries.clear();
      if (state.initialized && state.visible) {
        loadGlobalGeoStations({ forceReload: true });
      } else {
        state.geoStationsMap.clear();
        state.geoStations = [];
        state.countryStationsCache.clear();
      }
    },

    syncPlayback(pState) {
      updateLocateActiveButton();
      if (state.initialized) {
        renderActiveStationBeacon();
      }

      const activeUuid = pState?.station?.stationuuid || '';
      const status = pState?.status || 'idle';

      dom.drawerList?.querySelectorAll('.atlas-station-row[data-atlas-uuid]').forEach((row) => {
        const uuid = row.dataset.atlasUuid;
        const isMatch = uuid === activeUuid;
        const nextState =
          isMatch && status === 'loading'
            ? 'loading'
            : isMatch && status === 'playing'
            ? 'playing'
            : 'idle';

        if (row.dataset.playState === nextState) return;
        row.dataset.playState = nextState;
        row.classList.toggle('is-playing', nextState === 'playing');
        row.classList.toggle('is-loading', nextState === 'loading');

        const overlay = row.querySelector('.atlas-play-overlay');
        if (overlay) {
          if (nextState === 'loading') {
            overlay.innerHTML = '<span class="spinner"></span>';
          } else if (nextState === 'playing') {
            overlay.innerHTML =
              '<span class="eq-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
          } else {
            overlay.innerHTML =
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
          }
        }
      });
    },

    syncFavorite(uuid, fav) {
      dom.drawerList
        ?.querySelectorAll(`.atlas-station-row[data-atlas-uuid="${CSS.escape(uuid)}"] [data-atlas-action="favorite"]`)
        .forEach((btn) => {
          btn.classList.toggle('favorited', fav);
          btn.setAttribute('aria-label', fav ? 'Remove from saved' : 'Save station');
          btn.setAttribute('title', fav ? 'Saved' : 'Save station');
        });
    },

    findStation,
  };

  return controller;
}
