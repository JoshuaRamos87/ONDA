/**
 * ONDA — Local Persistence Layer
 * Stores favorite stations (by persistent stationuuid), recent listening history,
 * audio preferences, and theme settings in localStorage.
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

/**
 * Keep only the lightweight, durable fields needed to render & play a station.
 */
function serializeStation(station) {
  return {
    stationuuid: station.stationuuid,
    name: station.name || 'Untitled Station',
    url: station.url || '',
    url_resolved: station.url_resolved || station.url || '',
    homepage: station.homepage || '',
    favicon: station.favicon || '',
    tags: station.tags || '',
    country: station.country || '',
    countrycode: station.countrycode || '',
    state: station.state || '',
    language: station.language || '',
    codec: station.codec || '',
    bitrate: Number(station.bitrate) || 0,
    hls: Number(station.hls) || 0,
    votes: Number(station.votes) || 0,
    clickcount: Number(station.clickcount) || 0,
    geo_lat: station.geo_lat ?? null,
    geo_long: station.geo_long ?? null,
    savedAt: Date.now(),
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

  replaceFavorites(stations) {
    const clean = stations
      .filter((s) => s && s.stationuuid)
      .map((s) => serializeStation(s));
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
