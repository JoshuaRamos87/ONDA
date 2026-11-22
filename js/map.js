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

const WIDE_MULTI_TZ_COUNTRIES = new Set([
  'US', 'CA', 'RU', 'BR', 'AU', 'MX', 'ID', 'KZ', 'MN', 'CD', 'GL', 'KI', 'PF', 'FM', 'AQ',
]);

// Compact ISO 3166-1 alpha-2 country/territory centroids [lat, lng] for Country Hub fallback
const COUNTRY_CENTROIDS = {
  AD: [42.55, 1.6], AE: [23.42, 53.85], AF: [33.94, 67.71], AG: [17.06, -61.8],
  AI: [18.22, -63.07], AL: [41.15, 20.17], AM: [40.07, 45.04], AO: [-11.2, 17.87],
  AQ: [-75.25, -0.07], AR: [-38.42, -63.62], AS: [-14.27, -170.13], AT: [47.52, 14.55],
  AU: [-25.27, 133.78], AW: [12.52, -69.97], AX: [60.18, 19.92], AZ: [40.14, 47.58],
  BA: [43.92, 17.68], BB: [13.19, -59.54], BD: [23.68, 90.36], BE: [50.5, 4.47],
  BF: [12.24, -1.56], BG: [42.73, 25.49], BH: [25.93, 50.64], BI: [-3.37, 29.92],
  BJ: [9.31, 2.32], BL: [17.9, -62.83], BM: [32.32, -64.76], BN: [4.54, 114.73],
  BO: [-16.29, -63.59], BQ: [12.18, -68.24], BR: [-14.24, -51.93], BS: [25.03, -77.4],
  BT: [27.51, 90.43], BW: [-22.33, 24.68], BY: [53.71, 27.95], BZ: [17.19, -88.5],
  CA: [56.13, -106.35], CC: [-12.16, 96.87], CD: [-4.04, 21.76], CF: [6.61, 20.94],
  CG: [-0.23, 15.83], CH: [46.82, 8.23], CI: [7.54, -5.55], CK: [-21.24, -159.78],
  CL: [-35.68, -71.54], CM: [7.37, 12.35], CN: [35.86, 104.2], CO: [4.57, -74.3],
  CR: [9.75, -83.75], CU: [21.52, -77.78], CV: [16.0, -24.01], CW: [12.17, -68.99],
  CX: [-10.45, 105.69], CY: [35.13, 33.43], CZ: [49.82, 15.47], DE: [51.17, 10.45],
  DJ: [11.83, 42.59], DK: [56.26, 9.5], DM: [15.41, -61.37], DO: [18.74, -70.16],
  DZ: [28.03, 1.66], EC: [-1.83, -78.18], EE: [58.6, 25.01], EG: [26.82, 30.8],
  EH: [24.22, -12.89], ER: [15.18, 39.78], ES: [40.46, -3.75], ET: [9.15, 40.49],
  FI: [61.92, 25.75], FJ: [-17.71, 178.07], FK: [-51.8, -59.52], FM: [7.43, 150.55],
  FO: [61.89, -6.91], FR: [46.23, 2.21], GA: [-0.8, 11.61], GB: [55.38, -3.44],
  GD: [12.26, -61.6], GE: [42.32, 43.36], GF: [3.93, -53.13], GG: [49.47, -2.59],
  GH: [7.95, -1.02], GI: [36.14, -5.35], GL: [71.71, -42.6], GM: [13.44, -15.31],
  GN: [9.95, -9.7], GP: [16.99, -62.07], GQ: [1.65, 10.27], GR: [39.07, 21.82],
  GS: [-54.43, -36.59], GT: [15.78, -90.23], GU: [13.44, 144.79], GW: [11.8, -15.18],
  GY: [4.86, -58.93], HK: [22.4, 114.11], HN: [15.2, -86.24], HR: [45.1, 15.2],
  HT: [18.97, -72.29], HU: [47.16, 19.5], ID: [-0.79, 113.92], IE: [53.41, -8.24],
  IL: [31.05, 34.85], IM: [54.24, -4.55], IN: [20.59, 78.96], IO: [-6.34, 71.88],
  IQ: [33.22, 43.68], IR: [32.43, 53.69], IS: [64.96, -19.02], IT: [41.87, 12.57],
  JE: [49.21, -2.13], JM: [18.11, -77.3], JO: [30.59, 36.24], JP: [36.2, 138.25],
  KE: [-0.02, 37.91], KG: [41.2, 74.77], KH: [12.57, 104.99], KI: [-3.37, -168.73],
  KM: [-11.88, 43.87], KN: [17.36, -62.78], KP: [40.34, 127.51], KR: [35.91, 127.77],
  KW: [29.31, 47.48], KY: [19.51, -80.57], KZ: [48.02, 66.92], LA: [19.86, 102.5],
  LB: [33.85, 35.86], LC: [13.91, -60.98], LI: [47.17, 9.56], LK: [7.87, 80.77],
  LR: [6.43, -9.43], LS: [-29.61, 28.23], LT: [55.17, 23.88], LU: [49.82, 6.13],
  LV: [56.88, 24.6], LY: [26.34, 17.23], MA: [31.79, -7.09], MC: [43.75, 7.41],
  MD: [47.41, 28.37], ME: [42.71, 19.37], MF: [18.08, -63.05], MG: [-18.77, 46.87],
  MH: [7.13, 171.18], MK: [41.61, 21.75], ML: [17.57, -4.0], MM: [21.91, 95.96],
  MN: [46.86, 103.85], MO: [22.2, 113.54], MP: [17.33, 145.38], MQ: [14.64, -61.02],
  MR: [21.01, -10.94], MS: [16.74, -62.19], MT: [35.94, 14.38], MU: [-20.35, 57.55],
  MV: [3.2, 73.22], MW: [-13.25, 34.3], MX: [23.63, -102.55], MY: [4.21, 101.98],
  MZ: [-18.67, 35.53], NA: [-22.96, 18.49], NC: [-20.9, 165.62], NE: [17.61, 8.08],
  NF: [-29.04, 167.95], NG: [9.08, 8.68], NI: [12.87, -85.21], NL: [52.13, 5.29],
  NO: [60.47, 8.47], NP: [28.39, 84.12], NR: [-0.52, 166.93], NU: [-19.05, -169.87],
  NZ: [-40.9, 174.89], OM: [21.51, 55.92], PA: [8.54, -80.78], PE: [-9.19, -75.02],
  PF: [-17.68, -149.41], PG: [-6.31, 143.96], PH: [12.88, 121.77], PK: [30.38, 69.35],
  PL: [51.92, 19.15], PM: [46.94, -56.27], PN: [-24.7, -127.44], PR: [18.22, -66.59],
  PS: [31.95, 35.23], PT: [39.4, -8.22], PW: [7.51, 134.58], PY: [-23.44, -58.44],
  QA: [25.35, 51.18], RE: [-21.12, 55.54], RO: [45.94, 24.97], RS: [44.02, 21.01],
  RU: [61.52, 105.32], RW: [-1.94, 29.87], SA: [23.89, 45.08], SB: [-9.65, 160.16],
  SC: [-4.68, 55.49], SD: [12.86, 30.22], SE: [60.13, 18.64], SG: [1.35, 103.82],
  SH: [-15.96, -5.7], SI: [46.15, 14.99], SJ: [77.55, 23.67], SK: [48.67, 19.7],
  SL: [8.46, -11.78], SM: [43.94, 12.46], SN: [14.5, -14.45], SO: [5.15, 46.2],
  SR: [3.92, -56.03], SS: [6.88, 31.31], ST: [0.19, 6.61], SV: [13.79, -88.9],
  SX: [18.04, -63.05], SY: [34.8, 39.0], SZ: [-26.52, 31.47], TC: [21.69, -71.8],
  TD: [15.45, 18.73], TF: [-49.28, 69.35], TG: [8.62, 0.82], TH: [15.87, 100.99],
  TJ: [38.86, 71.28], TK: [-8.97, -171.86], TL: [-8.87, 125.73], TM: [38.97, 59.56],
  TN: [33.89, 9.54], TO: [-21.18, -175.2], TR: [38.96, 35.24], TT: [10.69, -61.22],
  TV: [-7.11, 177.65], TW: [23.7, 120.96], TZ: [-6.37, 34.89], UA: [48.38, 31.17],
  UG: [1.37, 32.29], US: [39.83, -98.58], UY: [-32.52, -55.77], UZ: [41.38, 64.59],
  VA: [41.9, 12.45], VC: [12.98, -61.29], VE: [6.42, -66.59], VG: [18.42, -64.64],
  VI: [18.34, -64.9], VN: [14.06, 108.28], VU: [-15.38, 166.96], WF: [-13.77, -177.16],
  WS: [-13.76, -172.1], XK: [42.6, 20.9], YE: [15.55, 48.52], YT: [-12.83, 45.17],
  ZA: [-30.56, 22.94], ZM: [-13.13, 27.85], ZW: [-19.02, 29.15],
};

const TIME_BAND_META = {
  morning: { label: 'Morning', icon: '🌅', targetHour: 8.5 },
  afternoon: { label: 'Afternoon', icon: '☀️', targetHour: 14 },
  evening: { label: 'Evening', icon: '🌇', targetHour: 19 },
  night: { label: 'Late Night', icon: '🌙', targetHour: 0.5 },
};

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

/* ==========================================================================
   Geo, Distance & Solar Time Math
   ========================================================================== */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function hasValidGeo(station) {
  if (!station) return false;
  const lat = Number(station.geo_lat);
  const lng = Number(station.geo_long);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return false;
  return true;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanceKm(km) {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return '< 1 km';
  if (km < 10) return `${km.toFixed(1)} km`;
  if (km < 1000) return `${Math.round(km)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

function getSolarTimeInfo(lng, date = new Date()) {
  if (!Number.isFinite(lng)) return null;
  const offsetHours = Math.max(-12, Math.min(14, Math.round(lng / 15)));
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const localTotalMinutes = ((utcMinutes + offsetHours * 60) % 1440 + 1440) % 1440;
  const hour24 = Math.floor(localTotalMinutes / 60);
  const minute = localTotalMinutes % 60;

  const hour12 = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  const formatted = `~${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;

  let period = 'night';
  if (hour24 >= 5 && hour24 <= 11) period = 'morning';
  else if (hour24 >= 12 && hour24 <= 16) period = 'afternoon';
  else if (hour24 >= 17 && hour24 <= 21) period = 'evening';

  const meta = TIME_BAND_META[period];
  const sign = offsetHours >= 0 ? '+' : '';
  return {
    hour24,
    formatted,
    period,
    periodLabel: meta.label,
    icon: meta.icon,
    offsetLabel: `UTC${sign}${offsetHours}`,
  };
}

/**
 * Resolve solar time for a station: uses exact longitude when pinned, or country centroid
 * longitude for single-timezone countries (returns null for unpinned multi-timezone nations).
 */
function getStationSolarTime(station, date = new Date()) {
  if (hasValidGeo(station)) {
    return getSolarTimeInfo(Number(station.geo_long), date);
  }
  const code = (station?.countrycode || '').toUpperCase();
  if (!code || WIDE_MULTI_TZ_COUNTRIES.has(code)) return null;
  const centroid = COUNTRY_CENTROIDS[code];
  return centroid ? getSolarTimeInfo(centroid[1], date) : null;
}

/**
 * Compute longitude center where approximate local solar hour equals targetHour.
 */
function getLongitudeForSolarHour(targetHour, date = new Date()) {
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60;
  let diff = targetHour - utcHour;
  while (diff > 12) diff -= 24;
  while (diff < -12) diff += 24;
  return diff * 15;
}

/**
 * Compute the Earth's astronomical night-side terminator polygon across [-360, +360] longitude
 * so panning continuously across the antimeridian keeps night shading seamless.
 */
function buildNightTerminatorPolygon(date = new Date()) {
  const julianDay = date.getTime() / 86400000 + 2440587.5;
  const n = julianDay - 2451545.0;

  // Sun mean longitude (L) and mean anomaly (g) in degrees
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG2RAD;

  // Ecliptic longitude and obliquity
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG2RAD;
  const epsilon = (23.439 - 0.0000004 * n) * DEG2RAD;

  // Solar declination & right ascension
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const rightAscension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));

  // Greenwich Mean Sidereal Time (radians) -> subsolar longitude
  const gmstDeg = (280.46061837 + 360.98564736629 * n) % 360;
  const subsolarLonDeg = ((rightAscension * RAD2DEG - gmstDeg + 540) % 360) - 180;

  const tanDec = Math.tan(declination);
  const safeTanDec = Math.abs(tanDec) < 0.001 ? (tanDec >= 0 ? 0.001 : -0.001) : tanDec;

  const points = [];
  for (let lon = -360; lon <= 360; lon += 3) {
    const hourAngle = (lon - subsolarLonDeg) * DEG2RAD;
    const lat = Math.atan(-Math.cos(hourAngle) / safeTanDec) * RAD2DEG;
    points.push([Math.max(-85, Math.min(85, lat)), lon]);
  }

  // Close polygon over whichever pole is currently in polar night
  const darkPoleLat = declination >= 0 ? -85 : 85;
  points.push([darkPoleLat, 360]);
  points.push([darkPoleLat, -360]);
  return points;
}

/* ==========================================================================
   Small Helpers
   ========================================================================== */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '🌐';
  return String.fromCodePoint(...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
}

function readCssVar(name, fallback) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}

function getClusterCellSize(zoom) {
  if (zoom <= 2) return 3.6;
  if (zoom === 3) return 2.1;
  if (zoom === 4) return 1.15;
  if (zoom === 5) return 0.55;
  if (zoom === 6) return 0.25;
  if (zoom === 7) return 0.12;
  if (zoom === 8) return 0.05;
  if (zoom === 9) return 0.02;
  return 0.008;
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
    summaryBadge: document.getElementById('atlas-summary'),
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
    drawerStations: [], // flat array for lookup & queue
    drawerMode: 'intro', // intro | cluster | country | nearme | inview
    drawerContext: null,

    // Near Me state
    userCoords: null,
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

  async function initMapIfNeeded() {
    if (state.initialized && state.map) return;

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

    state.initialized = true;
    renderTerminator();
    renderActiveStationBeacon();
    updateLocateActiveButton();
  }

  async function loadGlobalGeoStations({ forceReload = false } = {}) {
    if (state.loadingGlobal) return;
    if (!forceReload && state.geoStations.length > 0) {
      renderCountryHubs();
      renderStationPins();
      updateSummaryBadge();
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
          limit: 1500,
        },
        state.abortController.signal
      );

      if (forceReload) {
        state.geoStationsMap.clear();
        state.countryStationsCache.clear();
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
    }
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
      fillColor: '#1B6CE3',
      fillOpacity: 1,
      interactive: false,
    })
      .bindTooltip('Your location', { direction: 'top', offset: [0, -8] })
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

    dom.drawerKicker.textContent = solar
      ? `Near Me · ${solar.icon} ${solar.formatted}`
      : 'Near Me';
    dom.drawerTitle.textContent = countryCode
      ? `${countryCodeToFlag(countryCode)} Local Broadcasts`
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

  async function handleNearMeClick() {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported in this browser. Tap any country on the map instead.');
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

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      state.userCoords = { lat, lng };
      state.nearMeCountryCode = inferNearestCountryCode(lat, lng);

      if (state.map) {
        state.map.flyTo([lat, lng], 8, { duration: 0.9 });
      }
      renderUserRadiusOverlay();

      dom.drawerKicker.textContent = 'Near Me';
      dom.drawerTitle.textContent = 'Finding local stations…';
      dom.drawerSubtitle.textContent = `Scanning broadcasts near ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
      dom.drawerList.innerHTML = Array.from({ length: 5 })
        .map(() => '<div class="atlas-row-skeleton" aria-hidden="true"></div>')
        .join('');

      let countryStations = [];
      if (state.nearMeCountryCode) {
        const [deepPinned, allCountryRes] = await Promise.all([
          radioApi
            .getGeoStations({
              httpsOnly: state.httpsOnly,
              countrycode: state.nearMeCountryCode,
              limit: 600,
            })
            .catch(() => []),
          radioApi
            .searchStations({
              countrycode: state.nearMeCountryCode,
              httpsOnly: state.httpsOnly,
              order: 'clickcount',
              reverse: true,
              limit: 50,
              cache: true,
            })
            .catch(() => ({ stations: [] })),
        ]);

        if (deepPinned.length > 0) {
          mergeGeoStations(deepPinned);
          renderStationPins();
          updateSummaryBadge();
        }
        countryStations = allCountryRes.stations || [];
        if (countryStations.length > 0) {
          state.countryStationsCache.set(state.nearMeCountryCode, countryStations);
        }
      }

      renderNearMeDrawer(countryStations);
      showToast('Centered Atlas on your location');
    } catch (err) {
      const denied = err && err.code === 1;
      showToast(
        denied
          ? 'Location permission declined — tap any pin or Country Hub to explore.'
          : 'Could not detect your location right now. Tap any region on the map to explore.'
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
      const pos = [Number(current.geo_lat), Number(current.geo_long)];
      state.map.flyTo(pos, Math.max(state.map.getZoom(), 7), { duration: 0.85 });
      openClusterInDrawer({
        lat: pos[0],
        lng: pos[1],
        stations: [current],
        canZoomCloser: false,
      });
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

  return {
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

    onHide() {
      state.visible = false;
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
      }
    },

    setHttpsOnly(httpsOnly) {
      const next = Boolean(httpsOnly);
      if (state.httpsOnly === next) return;
      state.httpsOnly = next;
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
}
