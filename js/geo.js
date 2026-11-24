/**
 * ONDA — Pure Geographic, Distance & Astronomical Solar Time Math
 * Extracted from js/map.js so country centroids, Haversine distance,
 * coordinate validation, and solar day/night terminator math stay cleanly isolated.
 */

export const WIDE_MULTI_TZ_COUNTRIES = new Set([
  'US', 'CA', 'RU', 'BR', 'AU', 'MX', 'ID', 'KZ', 'MN', 'CD', 'GL', 'KI', 'PF', 'FM', 'AQ',
]);

// Compact ISO 3166-1 alpha-2 country/territory centroids [lat, lng] for Country Hub fallback
export const COUNTRY_CENTROIDS = {
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

export const TIME_BAND_META = {
  morning: { label: 'Morning', icon: '🌅', targetHour: 8.5 },
  afternoon: { label: 'Afternoon', icon: '☀️', targetHour: 14 },
  evening: { label: 'Evening', icon: '🌇', targetHour: 19 },
  night: { label: 'Late Night', icon: '🌙', targetHour: 0.5 },
};

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function hasValidGeo(station) {
  if (!station) return false;
  if (station.geo_lat === null || station.geo_lat === undefined || station.geo_lat === '') {
    return false;
  }
  if (station.geo_long === null || station.geo_long === undefined || station.geo_long === '') {
    return false;
  }
  const lat = Number(station.geo_lat);
  const lng = Number(station.geo_long);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return false;
  return true;
}

export function normalizeLongitude(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistanceKm(km) {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return '< 1 km';
  if (km < 10) return `${km.toFixed(1)} km`;
  if (km < 1000) return `${Math.round(km)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

export function getSolarTimeInfo(lng, date = new Date()) {
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
export function getStationSolarTime(station, date = new Date()) {
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
export function getLongitudeForSolarHour(targetHour, date = new Date()) {
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
export function buildNightTerminatorPolygon(date = new Date()) {
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

export function getClusterCellSize(zoom) {
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
