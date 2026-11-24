import test from 'node:test';
import assert from 'node:assert/strict';
import { storage, createCustomUuid, isCustomStation } from '../js/storage.js';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

test('createCustomUuid and isCustomStation identify custom streams reliably', () => {
  const id1 = createCustomUuid();
  const id2 = createCustomUuid();
  assert.match(id1, /^custom-/);
  assert.notEqual(id1, id2);

  assert.equal(isCustomStation({ stationuuid: id1 }), true);
  assert.equal(isCustomStation({ stationuuid: 'rb-uuid', isCustom: true }), true);
  assert.equal(isCustomStation({ stationuuid: 'rb-uuid', isCustom: false }), false);
  assert.equal(isCustomStation(null), false);
});

test('favorites toggle, upsert, recent sync, and replaceFavorites work end-to-end', () => {
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();
  try {
    const station = {
      stationuuid: 'uuid-1',
      name: '  KEXP 90.3  ',
      url: 'https://kexp.example/live.mp3',
      countrycode: 'us',
      codec: 'mp3',
      bitrate: '128',
    };

    const addRes = storage.toggleFavorite(station);
    assert.equal(addRes.added, true);
    assert.equal(storage.isFavorite('uuid-1'), true);
    assert.equal(storage.getFavorites()[0].name, 'KEXP 90.3');
    assert.equal(storage.getFavorites()[0].countrycode, 'US');
    assert.equal(storage.getFavorites()[0].codec, 'MP3');
    assert.equal(storage.getFavorites()[0].bitrate, 128);

    // Add to recent history and verify upsertFavorite updates both favorites & recents
    storage.addRecent(station);
    const updated = storage.upsertFavorite({ ...station, name: 'KEXP Seattle' });
    assert.equal(updated.updated, true);
    assert.equal(storage.getFavorites()[0].name, 'KEXP Seattle');
    assert.equal(storage.getRecent()[0].name, 'KEXP Seattle');

    const removeRes = storage.toggleFavorite(station);
    assert.equal(removeRes.added, false);
    assert.equal(storage.isFavorite('uuid-1'), false);

    // replaceFavorites assigns custom UUIDs when importing URL-only entries and drops empty objects
    const replaced = storage.replaceFavorites([
      null,
      {},
      { name: 'Imported Stream', url: 'https://radio.example/stream.aac' },
    ]);
    assert.equal(replaced.length, 1);
    assert.equal(isCustomStation(replaced[0]), true);
  } finally {
    globalThis.localStorage = prevStorage;
  }
});

test('addRecent deduplicates and enforces the 18-station history cap', () => {
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();
  try {
    for (let i = 1; i <= 25; i++) {
      storage.addRecent({ stationuuid: `s-${i}`, name: `Station ${i}` });
    }
    const recent = storage.getRecent();
    assert.equal(recent.length, 18);
    assert.equal(recent[0].stationuuid, 's-25');

    // Tuning an older station promotes it to index 0 without duplicating
    storage.addRecent({ stationuuid: 's-10', name: 'Station 10' });
    const afterPromote = storage.getRecent();
    assert.equal(afterPromote.length, 18);
    assert.equal(afterPromote[0].stationuuid, 's-10');
    assert.equal(afterPromote.filter((s) => s.stationuuid === 's-10').length, 1);

    storage.clearRecent();
    assert.deepEqual(storage.getRecent(), []);
  } finally {
    globalThis.localStorage = prevStorage;
  }
});

test('prefs persist cleanly and recover gracefully from corrupt localStorage JSON', () => {
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();
  try {
    globalThis.localStorage.setItem('onda_prefs_v1', '{not valid json');
    globalThis.localStorage.setItem('onda_favorites_v1', 'corrupt');

    const defaults = storage.getPrefs();
    assert.equal(defaults.volume, 0.82);
    assert.equal(defaults.accent, 'vermilion');
    assert.deepEqual(storage.getFavorites(), []);

    storage.setPref('accent', 'cobalt');
    storage.setPref('volume', 0.5);
    const saved = storage.getPrefs();
    assert.equal(saved.accent, 'cobalt');
    assert.equal(saved.volume, 0.5);
  } finally {
    globalThis.localStorage = prevStorage;
  }
});
