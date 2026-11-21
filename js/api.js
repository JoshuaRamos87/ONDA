/**
 * ONDA — Radio Browser API Client
 *
 * Implements the official Radio Browser API discovery & failover workflow:
 * 1. Queries https://all.api.radio-browser.info/json/servers to discover active mirrors.
 * 2. Randomizes mirrors to distribute load across the community network.
 * 3. Automatically fails over to the next healthy mirror on network/timeout/5xx errors.
 * 4. Reports station clicks via /json/url/{stationuuid} and supports /json/vote/{stationuuid}.
 */

const DISCOVERY_URL = 'https://all.api.radio-browser.info/json/servers';

const FALLBACK_MIRRORS = [
  'de1.api.radio-browser.info',
  'de2.api.radio-browser.info',
  'fi1.api.radio-browser.info',
  'at1.api.radio-browser.info',
  'nl1.api.radio-browser.info',
  'all.api.radio-browser.info',
];

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const externalSignal = options.signal;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

class RadioBrowserClient {
  constructor() {
    this.mirrors = shuffle(FALLBACK_MIRRORS);
    this.activeIndex = 0;
    this.discovered = false;
    this.discoverPromise = null;
    this.cache = new Map();
    this.mirrorListeners = new Set();
  }

  onMirrorChange(callback) {
    this.mirrorListeners.add(callback);
    return () => this.mirrorListeners.delete(callback);
  }

  emitMirrorChange(status = 'connected') {
    const host = this.getActiveMirror();
    for (const cb of this.mirrorListeners) {
      cb({ host, status, count: this.mirrors.length });
    }
  }

  getActiveMirror() {
    return this.mirrors[this.activeIndex] || FALLBACK_MIRRORS[0];
  }

  /**
   * Discover live community mirrors from https://all.api.radio-browser.info/json/servers
   */
  async ensureMirrors() {
    if (this.discovered) return this.mirrors;
    if (this.discoverPromise) return this.discoverPromise;

    this.emitMirrorChange('connecting');

    this.discoverPromise = (async () => {
      try {
        const res = await fetchWithTimeout(DISCOVERY_URL, {}, 4500);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const uniqueHosts = Array.from(
              new Set(
                data
                  .map((entry) => (entry && entry.name ? String(entry.name).trim() : ''))
                  .filter((name) => name && name.endsWith('.api.radio-browser.info'))
              )
            );

            if (uniqueHosts.length > 0) {
              const randomized = shuffle(uniqueHosts);
              // Keep fallback mirrors at the tail in case all discovered hosts fail
              for (const fallback of FALLBACK_MIRRORS) {
                if (!randomized.includes(fallback)) {
                  randomized.push(fallback);
                }
              }
              this.mirrors = randomized;
              this.activeIndex = 0;
            }
          }
        }
      } catch {
        // Silently keep randomized fallback mirror list
      } finally {
        this.discovered = true;
        this.emitMirrorChange('connected');
      }
      return this.mirrors;
    })();

    return this.discoverPromise;
  }

  /**
   * Switch manually to the next available mirror in the discovered pool.
   */
  rotateMirror() {
    this.activeIndex = (this.activeIndex + 1) % this.mirrors.length;
    this.emitMirrorChange('connected');
    return this.getActiveMirror();
  }

  /**
   * Perform a JSON GET request against the active mirror with automatic failover.
   */
  async request(path, params = {}, options = {}) {
    await this.ensureMirrors();

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    }
    const queryString = query.toString();
    const fullPath = queryString ? `${path}?${queryString}` : path;

    const cacheKey = options.cache ? fullPath : null;
    if (cacheKey && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let lastError = null;
    const maxAttempts = Math.min(this.mirrors.length, 4);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const idx = (this.activeIndex + attempt) % this.mirrors.length;
      const host = this.mirrors[idx];
      const url = `https://${host}${fullPath}`;

      try {
        const res = await fetchWithTimeout(url, { signal: options.signal }, options.timeoutMs || 8500);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} from ${host}`);
        }
        const json = await res.json();

        if (idx !== this.activeIndex) {
          this.activeIndex = idx;
          this.emitMirrorChange('connected');
        }

        if (cacheKey) {
          this.cache.set(cacheKey, json);
        }
        return json;
      } catch (err) {
        if (err && err.name === 'AbortError' && options.signal && options.signal.aborted) {
          throw err;
        }
        lastError = err;
      }
    }

    this.emitMirrorChange('error');
    throw lastError || new Error('All Radio Browser API mirrors failed to respond.');
  }

  /**
   * Global database statistics (stations, countries, tags, languages, clicks)
   */
  async getStats() {
    return this.request('/json/stats', {}, { cache: true });
  }

  /**
   * Advanced station search with filtering, sorting, and pagination.
   */
  async searchStations(filters = {}, signal) {
    const params = {
      hidebroken: 'true',
      limit: filters.limit ?? 36,
      offset: filters.offset ?? 0,
      order: filters.order || 'clickcount',
      reverse: filters.reverse === false ? 'false' : 'true',
    };

    if (filters.name) params.name = filters.name.trim();
    if (filters.tag) params.tag = filters.tag.trim();
    if (filters.countrycode) params.countrycode = filters.countrycode.trim().toUpperCase();
    if (filters.language) params.language = filters.language.trim();
    if (filters.codec) params.codec = filters.codec.trim();
    if (filters.bitrateMin && Number(filters.bitrateMin) > 0) {
      params.bitrateMin = Number(filters.bitrateMin);
    }
    if (filters.httpsOnly) {
      params.is_https = 'true';
    }

    const stations = await this.request('/json/stations/search', params, { signal });
    return Array.isArray(stations) ? stations : [];
  }

  /**
   * Fetch fresh station records by an array of stationuuid strings.
   */
  async getStationsByUuids(uuids) {
    if (!Array.isArray(uuids) || uuids.length === 0) return [];
    const stations = await this.request('/json/stations/byuuid', {
      uuids: uuids.join(','),
    });
    return Array.isArray(stations) ? stations : [];
  }

  /**
   * Fetch a batch of random working stations for "Surprise Me".
   */
  async getRandomStations(httpsOnly = true, limit = 12) {
    return this.searchStations({
      order: 'random',
      reverse: false,
      limit,
      httpsOnly,
    });
  }

  /**
   * Top genres / tags sorted by station count.
   */
  async getTags(limit = 160) {
    const data = await this.request(
      '/json/tags',
      {
        order: 'stationcount',
        reverse: 'true',
        hidebroken: 'true',
        limit,
      },
      { cache: true }
    );
    return Array.isArray(data)
      ? data.filter((t) => t && t.name && t.name.trim().length > 1 && Number(t.stationcount) > 0)
      : [];
  }

  /**
   * Countries with ISO 3166-1 alpha-2 codes and station counts.
   */
  async getCountries() {
    const data = await this.request(
      '/json/countries',
      {
        order: 'stationcount',
        reverse: 'true',
        hidebroken: 'true',
      },
      { cache: true }
    );
    return Array.isArray(data)
      ? data.filter((c) => c && c.name && c.iso_3166_1 && Number(c.stationcount) > 0)
      : [];
  }

  /**
   * Spoken languages sorted by station count.
   */
  async getLanguages(limit = 120) {
    const data = await this.request(
      '/json/languages',
      {
        order: 'stationcount',
        reverse: 'true',
        hidebroken: 'true',
        limit,
      },
      { cache: true }
    );
    return Array.isArray(data)
      ? data.filter((l) => l && l.name && l.name.trim().length > 1 && Number(l.stationcount) > 0)
      : [];
  }

  /**
   * Register a playback click (requested by Radio Browser API guidelines).
   * Non-blocking; errors are safely ignored.
   */
  async registerClick(stationuuid) {
    if (!stationuuid) return;
    try {
      await this.request(`/json/url/${encodeURIComponent(stationuuid)}`, {}, { timeoutMs: 4500 });
    } catch {
      // Best-effort analytics call
    }
  }

  /**
   * Upvote a station on the Radio Browser directory.
   */
  async voteStation(stationuuid) {
    if (!stationuuid) throw new Error('Missing station UUID');
    return this.request(`/json/vote/${encodeURIComponent(stationuuid)}`, {}, { timeoutMs: 6000 });
  }
}

export const radioApi = new RadioBrowserClient();
