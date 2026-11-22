/**
 * ONDA — Local Persistence Layer
 * Stores favorite stations (Radio Browser + manually added custom streams),
 * recent listening history, audio preferences, and theme settings in localStorage.
 */

const KEYS = {
  FAVORITES: 'onda_favorites_v1',
  RECENT: 'onda_recent_v1',
  PREFS: 'onda_prefs_v1',
};

const MAX_RECENT = 18;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / private browsing storage errors
  }
}

export function createCustomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `custom-${crypto.randomUUID()}`;
  }
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isCustomStation(station) {
  if (!station) return false;
  return Boolean(station.isCustom) || String(station.stationuuid || '').startsWith('custom-');
}

/**
 * Keep only the lightweight, durable fields needed to render & play a station.
 * Preserves `isCustom` so manually added streams survive save, export, and import.
 */
function serializeStation(station) {
  const custom = isCustomStation(station);
  return {
    stationuuid: station.stationuuid || (custom ? createCustomUuid() : ''),
    name: String(station.name || 'Untitled Station').trim() || 'Untitled Station',
    url: String(station.url || '').trim(),
    url_resolved: String(station.url_resolved || station.url || '').trim(),
    homepage: String(station.homepage || '').trim(),
    favicon: String(station.favicon || '').trim(),
    tags: String(station.tags || '').trim(),
    country: String(station.country || '').trim(),
    countrycode: String(station.countrycode || '').trim().toUpperCase(),
    state: String(station.state || '').trim(),
    language: String(station.language || '').trim(),
    codec: String(station.codec || '').trim().toUpperCase(),
    bitrate: Number(station.bitrate) || 0,
    hls: Number(station.hls) || 0,
    votes: Number(station.votes) || 0,
    clickcount: Number(station.clickcount) || 0,
    geo_lat: station.geo_lat ?? null,
    geo_long: station.geo_long ?? null,
    isCustom: custom,
    savedAt: Number(station.savedAt) || Date.now(),
  };
}

export const storage = {
  getFavorites() {
    const list = readJSON(KEYS.FAVORITES, []);
    return Array.isArray(list) ? list : [];
  },

  isFavorite(stationuuid) {
    return this.getFavorites().some((s) => s.stationuuid === stationuuid);
  },

  toggleFavorite(station) {
    const list = this.getFavorites();
    const index = list.findIndex((s) => s.stationuuid === station.stationuuid);
    let added = false;

    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.unshift(serializeStation(station));
      added = true;
    }

    writeJSON(KEYS.FAVORITES, list);
    return { added, favorites: list };
  },

  /**
   * Insert a new station (e.g. a custom stream) or update an existing one in-place.
   */
  upsertFavorite(station) {
    const serialized = serializeStation(station);
    const list = this.getFavorites();
    const index = list.findIndex((s) => s.stationuuid === serialized.stationuuid);

    if (index >= 0) {
      list[index] = serialized;
    } else {
      list.unshift(serialized);
    }
    writeJSON(KEYS.FAVORITES, list);

    // Keep matching entry in recent history synchronized if present
    const recent = this.getRecent();
    const rIdx = recent.findIndex((s) => s.stationuuid === serialized.stationuuid);
    if (rIdx >= 0) {
      recent[rIdx] = serialized;
      writeJSON(KEYS.RECENT, recent);
    }

    return { station: serialized, updated: index >= 0, favorites: list };
  },

  replaceFavorites(stations) {
    const clean = stations
      .filter((s) => s && (s.stationuuid || s.url || s.url_resolved))
      .map((s) => {
        const hasUuid = Boolean(s.stationuuid);
        return serializeStation(
          hasUuid ? s : { ...s, stationuuid: createCustomUuid(), isCustom: true }
        );
      })
      .filter((s) => Boolean(s.stationuuid));
    writeJSON(KEYS.FAVORITES, clean);
    return clean;
  },

  getRecent() {
    const list = readJSON(KEYS.RECENT, []);
    return Array.isArray(list) ? list : [];
  },

  addRecent(station) {
    if (!station || !station.stationuuid) return [];
    const list = this.getRecent().filter((s) => s.stationuuid !== station.stationuuid);
    list.unshift(serializeStation(station));
    const trimmed = list.slice(0, MAX_RECENT);
    writeJSON(KEYS.RECENT, trimmed);
    return trimmed;
  },

  clearRecent() {
    writeJSON(KEYS.RECENT, []);
  },

  getPrefs() {
    const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const systemDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    const defaults = {
      volume: 0.82,
      muted: false,
      theme: systemDark ? 'dark' : 'light',
      accent: 'vermilion',
      httpsOnly: isHttpsPage,
    };

    return {
      ...defaults,
      ...readJSON(KEYS.PREFS, {}),
    };
  },

  setPref(key, value) {
    const prefs = this.getPrefs();
    prefs[key] = value;
    writeJSON(KEYS.PREFS, prefs);
    return prefs;
  },
};
