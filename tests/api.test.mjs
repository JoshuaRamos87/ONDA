import test from 'node:test';
import assert from 'node:assert/strict';
import { radioApi } from '../js/api.js';

function resetApiState() {
  radioApi.mirrors = [
    'de1.api.radio-browser.info',
    'fi1.api.radio-browser.info',
    'nl1.api.radio-browser.info',
  ];
  radioApi.activeIndex = 0;
  radioApi.discovered = true;
  radioApi.discoverPromise = null;
  radioApi.cache.clear();
  radioApi.mirrorListeners.clear();
}

test('searchStations normalizes messy metadata, strips Null Island, and deduplicates UUIDs and URLs', async () => {
  const origFetch = globalThis.fetch;
  resetApiState();

  const seenUrls = [];
  globalThis.fetch = async (url) => {
    seenUrls.push(String(url));
    return {
      ok: true,
      json: async () => [
        {
          stationuuid: 's-1',
          name: '  Radio\tNova\nFM  ',
          countrycode: 'fr',
          codec: 'aac',
          url: 'https://nova.example/live.aac',
          url_resolved: 'https://nova.example/live.aac',
          geo_lat: '48.8566',
          geo_long: '2.3522',
          bitrate: '128',
        },
        // Duplicate UUID
        {
          stationuuid: 's-1',
          name: 'Duplicate UUID',
          url_resolved: 'https://other.example/live.mp3',
        },
        // Duplicate resolved URL (case-insensitive)
        {
          stationuuid: 's-2',
          name: 'Duplicate URL Mirror',
          url_resolved: 'HTTPS://NOVA.EXAMPLE/LIVE.AAC',
        },
        // Null Island coordinates should be cleared to null
        {
          stationuuid: 's-3',
          name: 'Null Island Station',
          url_resolved: 'https://clean.example/stream.mp3',
          geo_lat: 0,
          geo_long: 0,
        },
      ],
    };
  };

  try {
    const { stations, rawCount } = await radioApi.searchStations({
      tag: 'jazz',
      countrycode: 'fr',
      bitrateMin: 128,
      httpsOnly: true,
      hasGeoInfo: true,
    });

    assert.equal(rawCount, 4);
    assert.equal(stations.length, 2);
    assert.equal(stations[0].name, 'Radio Nova FM');
    assert.equal(stations[0].countrycode, 'FR');
    assert.equal(stations[0].codec, 'AAC');
    assert.equal(stations[0].geo_lat, 48.8566);
    assert.equal(stations[1].geo_lat, null);
    assert.equal(stations[1].geo_long, null);

    const reqUrl = new URL(seenUrls[0]);
    assert.equal(reqUrl.pathname, '/json/stations/search');
    assert.equal(reqUrl.searchParams.get('hidebroken'), 'true');
    assert.equal(reqUrl.searchParams.get('tag'), 'jazz');
    assert.equal(reqUrl.searchParams.get('countrycode'), 'FR');
    assert.equal(reqUrl.searchParams.get('bitrateMin'), '128');
    assert.equal(reqUrl.searchParams.get('is_https'), 'true');
    assert.equal(reqUrl.searchParams.get('has_geo_info'), 'true');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('request automatically fails over to the next healthy mirror and caches cached endpoints', async () => {
  const origFetch = globalThis.fetch;
  resetApiState();

  const attemptedHosts = [];
  const mirrorEvents = [];
  const unsub = radioApi.onMirrorChange((ev) => mirrorEvents.push(ev));

  globalThis.fetch = async (url) => {
    const host = new URL(url).hostname;
    attemptedHosts.push(host);
    if (host === 'de1.api.radio-browser.info') {
      return { ok: false, status: 503 };
    }
    return {
      ok: true,
      json: async () => ({ stations: 42000, countries: 210, tags: 8500 }),
    };
  };

  try {
    const stats1 = await radioApi.getStats();
    assert.equal(stats1.stations, 42000);
    assert.deepEqual(attemptedHosts, ['de1.api.radio-browser.info', 'fi1.api.radio-browser.info']);
    assert.equal(radioApi.getActiveMirror(), 'fi1.api.radio-browser.info');
    assert.ok(mirrorEvents.some((e) => e.host === 'fi1.api.radio-browser.info' && e.status === 'connected'));

    // Second call should hit session cache without calling fetch again
    const stats2 = await radioApi.getStats();
    assert.equal(stats2.stations, 42000);
    assert.equal(attemptedHosts.length, 2);
  } finally {
    unsub();
    globalThis.fetch = origFetch;
  }
});

test('request aborts immediately when caller AbortSignal is aborted without failing over', async () => {
  const origFetch = globalThis.fetch;
  resetApiState();

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('should not be called when already aborted');
  };

  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => radioApi.searchStations({ name: 'jazz' }, controller.signal),
      (err) => err && err.name === 'AbortError'
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ensureMirrors discovers live mirrors and falls back cleanly if discovery fails', async () => {
  const origFetch = globalThis.fetch;
  resetApiState();
  radioApi.discovered = false;

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [
      { name: 'at1.api.radio-browser.info' },
      { name: 'evil.example.com' },
      { name: 'all.api.radio-browser.info' },
    ],
  });

  try {
    const mirrors = await radioApi.ensureMirrors();
    assert.ok(mirrors.includes('at1.api.radio-browser.info'));
    assert.ok(!mirrors.includes('evil.example.com'));
    assert.equal(mirrors[mirrors.length - 1], 'all.api.radio-browser.info');
  } finally {
    globalThis.fetch = origFetch;
  }
});
