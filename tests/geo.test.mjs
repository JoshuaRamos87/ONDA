import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTRY_CENTROIDS,
  CITY_REGION_COORDS,
  TIME_BAND_META,
  hasValidGeo,
  normalizeLocationKey,
  resolveFallbackGeo,
  getStationGeo,
  normalizeLongitude,
  haversineKm,
  formatDistanceKm,
  getSolarTimeInfo,
  getStationSolarTime,
  getLongitudeForSolarHour,
  buildNightTerminatorPolygon,
  getClusterCellSize,
} from '../js/geo.js';

test('hasValidGeo validates coordinate ranges and rejects Null Island (0, 0)', () => {
  assert.equal(hasValidGeo({ geo_lat: 35.6762, geo_long: 139.6503 }), true);
  assert.equal(hasValidGeo({ geo_lat: -33.8688, geo_long: 151.2093 }), true);
  assert.equal(hasValidGeo({ geo_lat: 0, geo_long: 0 }), false);
  assert.equal(hasValidGeo({ geo_lat: 0.0001, geo_long: -0.0001 }), false);
  assert.equal(hasValidGeo({ geo_lat: 91, geo_long: 10 }), false);
  assert.equal(hasValidGeo({ geo_lat: 10, geo_long: 181 }), false);
  assert.equal(hasValidGeo({ geo_lat: null, geo_long: 10 }), false);
  assert.equal(hasValidGeo({ geo_lat: '', geo_long: '' }), false);
  assert.equal(hasValidGeo(null), false);
});

test('normalizeLocationKey strips diacritics, hashtags, and punctuation while keeping CJK', () => {
  assert.equal(normalizeLocationKey('São Paulo, SP #qa'), 'sao paulo sp');
  assert.equal(normalizeLocationKey('Tokyo-FM / Shibuya'), 'tokyo fm shibuya');
  assert.equal(normalizeLocationKey('東京都'), '東京都');
  assert.equal(normalizeLocationKey('  Hokaido  '), 'hokaido');
});

test('resolveFallbackGeo matches state, typos, CJK, and station name without false positives', () => {
  // Pass 1: exact and typo state matches in JP
  const tokyo = resolveFallbackGeo({ countrycode: 'JP', state: 'Tokyo', name: 'J-Wave' });
  assert.equal(tokyo?.precision, 'city');
  assert.equal(tokyo?.label, 'Tokyo');

  const hokkaidoTypo = resolveFallbackGeo({ countrycode: 'JP', state: 'Hokaido #qa', name: 'FM North' });
  assert.equal(hokkaidoTypo?.label, 'Hokkaido');

  const shigaLower = resolveFallbackGeo({ countrycode: 'JP', state: 'shiga', name: 'e-radio' });
  assert.equal(shigaLower?.label, 'Shiga');

  const kanjiTokyo = resolveFallbackGeo({ countrycode: 'JP', state: '東京都渋谷区', name: 'Shibuya Cross' });
  assert.equal(kanjiTokyo?.label, 'Tokyo');

  // Longest-key-first: New Delhi beats Delhi
  const newDelhi = resolveFallbackGeo({ countrycode: 'IN', state: 'New Delhi, India', name: 'AIR' });
  assert.equal(newDelhi?.label, 'New Delhi');

  // Pass 2: station.name fallback when state is empty
  const osakaName = resolveFallbackGeo({ countrycode: 'JP', state: '', name: 'FM Osaka 85.1' });
  assert.equal(osakaName?.label, 'Osaka');

  // Blocklisted ambiguous words do NOT false-match in station.name, but DO match in station.state
  assert.equal(resolveFallbackGeo({ countrycode: 'FR', state: '', name: 'Very Nice Jazz FM' }), null);
  assert.equal(resolveFallbackGeo({ countrycode: 'FR', state: 'Nice', name: 'Radio Cote' })?.label, 'Nice');
  assert.equal(resolveFallbackGeo({ countrycode: 'BR', state: '', name: 'Rádio Para Todos' }), null);
  assert.equal(resolveFallbackGeo({ countrycode: 'ID', state: '', name: 'Solo Acoustic Radio' }), null);

  // Country scoping prevents cross-border collisions
  assert.equal(resolveFallbackGeo({ countrycode: 'US', state: 'Tokyo', name: 'Tokyo Hits' }), null);

  // Stations with verified GPS return null from resolveFallbackGeo (exact takes precedence)
  assert.equal(
    resolveFallbackGeo({ countrycode: 'JP', state: 'Osaka', geo_lat: 35.68, geo_long: 139.69 }),
    null
  );
});

test('getStationGeo resolves Tier 1 exact GPS, Tier 2 city matches, and returns null for Tier 3', () => {
  const exact = getStationGeo({ geo_lat: 35.68, geo_long: 139.69, state: 'Tokyo', countrycode: 'JP' });
  assert.equal(exact?.precision, 'exact');
  assert.equal(exact?.lat, 35.68);

  const preAttached = getStationGeo({
    _geoLat: 34.6937,
    _geoLng: 135.5023,
    _geoPrecision: 'city',
    _geoLabel: 'Osaka',
  });
  assert.equal(preAttached?.precision, 'city');
  assert.equal(preAttached?.label, 'Osaka');

  const lazyCity = getStationGeo({ countrycode: 'KR', state: 'Busan', name: 'Busan eFM' });
  assert.equal(lazyCity?.precision, 'city');
  assert.equal(lazyCity?.label, 'Busan');

  assert.equal(getStationGeo({ countrycode: 'JP', state: '', name: 'J-Pop Radio' }), null);
});

test('normalizeLongitude wraps longitudes cleanly into [-180, 180)', () => {
  assert.equal(normalizeLongitude(0), 0);
  assert.equal(normalizeLongitude(190), -170);
  assert.equal(normalizeLongitude(-190), 170);
  assert.equal(normalizeLongitude(540), -180);
});

test('haversineKm and formatDistanceKm compute accurate real-world distances', () => {
  // San Francisco to Los Angeles (~559 km)
  const sfToLa = haversineKm(37.7749, -122.4194, 34.0522, -118.2437);
  assert.ok(sfToLa > 550 && sfToLa < 570, `expected ~559 km, got ${sfToLa}`);

  // Zero distance
  assert.equal(haversineKm(51.5074, -0.1278, 51.5074, -0.1278), 0);

  assert.equal(formatDistanceKm(0.3), '< 1 km');
  assert.equal(formatDistanceKm(4.26), '4.3 km');
  assert.equal(formatDistanceKm(125.7), '126 km');
});

test('getSolarTimeInfo and getStationSolarTime derive expected solar time bands', () => {
  const solsticeNoonUtc = new Date('2026-06-21T12:00:00Z');

  // London (0°) at 12:00 UTC -> Afternoon (~12:00 PM)
  const london = getSolarTimeInfo(0, solsticeNoonUtc);
  assert.equal(london.period, 'afternoon');
  assert.equal(london.offsetLabel, 'UTC+0');
  assert.ok(london.period in TIME_BAND_META);

  // Tokyo (~139.7°E -> UTC+9) at 12:00 UTC -> ~21:00 Evening
  const tokyo = getSolarTimeInfo(139.69, solsticeNoonUtc);
  assert.equal(tokyo.period, 'evening');
  assert.equal(tokyo.offsetLabel, 'UTC+9');

  // Exact GPS takes precedence even for wide multi-timezone countries
  const nycStation = { geo_lat: 40.71, geo_long: -74.0, countrycode: 'US' };
  const nycTime = getStationSolarTime(nycStation, solsticeNoonUtc);
  assert.ok(nycTime);
  assert.equal(nycTime.period, 'morning');

  // City-matched station in a wide multi-TZ country (Brazil) now gets accurate solar time
  const spStation = { countrycode: 'BR', state: 'São Paulo', name: 'Jovem Pan' };
  const spTime = getStationSolarTime(spStation, solsticeNoonUtc);
  assert.ok(spTime);
  assert.equal(spTime.offsetLabel, 'UTC-3');

  // Wide multi-TZ country without exact GPS or city match still returns null
  assert.equal(getStationSolarTime({ countrycode: 'US' }, solsticeNoonUtc), null);

  // Single-timezone country without exact GPS falls back to centroid
  const jpFallback = getStationSolarTime({ countrycode: 'JP' }, solsticeNoonUtc);
  assert.ok(jpFallback);
  assert.equal(jpFallback.period, 'evening');
});

test('getLongitudeForSolarHour stays within [-180, 180]', () => {
  const now = new Date('2026-03-20T06:00:00Z');
  for (const targetHour of [0, 6, 9, 14, 19, 23]) {
    const lng = getLongitudeForSolarHour(targetHour, now);
    assert.ok(lng >= -180 && lng <= 180, `longitude ${lng} out of bounds for hour ${targetHour}`);
  }
});

test('buildNightTerminatorPolygon returns valid closed polygons across seasons', () => {
  const dates = [
    new Date('2026-06-21T12:00:00Z'), // Northern summer solstice
    new Date('2026-12-21T12:00:00Z'), // Northern winter solstice
    new Date('2026-03-20T12:00:00Z'), // Equinox
  ];

  for (const dt of dates) {
    const poly = buildNightTerminatorPolygon(dt);
    assert.ok(Array.isArray(poly) && poly.length > 100);
    for (const [lat, lng] of poly) {
      assert.ok(Number.isFinite(lat) && lat >= -90 && lat <= 90, `invalid lat ${lat}`);
      assert.ok(Number.isFinite(lng) && lng >= -360 && lng <= 360, `invalid lng ${lng}`);
    }
  }
});

test('getClusterCellSize shrinks monotonically as zoom increases', () => {
  const zooms = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  let prev = Infinity;
  for (const z of zooms) {
    const size = getClusterCellSize(z);
    assert.ok(size <= prev, `cell size should shrink as zoom grows (zoom ${z})`);
    prev = size;
  }
});

test('COUNTRY_CENTROIDS and CITY_REGION_COORDS entries have valid geographic coordinates', () => {
  const entries = Object.entries(COUNTRY_CENTROIDS);
  assert.ok(entries.length >= 150);
  for (const [code, [lat, lng]] of entries) {
    assert.match(code, /^[A-Z]{2}$/);
    assert.ok(lat >= -90 && lat <= 90, `${code} invalid lat ${lat}`);
    assert.ok(lng >= -180 && lng <= 180, `${code} invalid lng ${lng}`);
  }

  const cityCountries = Object.entries(CITY_REGION_COORDS);
  assert.ok(cityCountries.length >= 25);
  for (const [code, table] of cityCountries) {
    assert.match(code, /^[A-Z]{2}$/);
    for (const [key, [lat, lng, label]] of Object.entries(table)) {
      assert.ok(key.length >= 2, `${code} key too short: ${key}`);
      assert.ok(lat >= -90 && lat <= 90, `${code}:${key} invalid lat ${lat}`);
      assert.ok(lng >= -180 && lng <= 180, `${code}:${key} invalid lng ${lng}`);
      assert.ok(typeof label === 'string' && label.length > 0, `${code}:${key} missing label`);
    }
  }
});
