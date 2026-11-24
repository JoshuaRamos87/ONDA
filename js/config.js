/**
 * ONDA — Centralized Application Configuration
 * Single source of truth for app metadata, version number, accent themes, and repository links.
 */

export const APP_CONFIG = Object.freeze({
  name: 'ONDA',
  tagline: 'World Radio Broadcast Tuner',
  version: '1.4.6',
  repoUrl: 'https://github.com/JoshuaRamos87/ONDA',
  repoLabel: 'JoshuaRamos87/ONDA',
  apiHomeUrl: 'https://www.radio-browser.info/',
  apiDocsUrl: 'https://docs.radio-browser.info/',
});

export const ACCENT_THEMES = Object.freeze([
  { id: 'vermilion', name: 'Vermilion', swatch: '#E33E1B' },
  { id: 'cobalt', name: 'Cobalt Blue', swatch: '#1B6CE3' },
  { id: 'emerald', name: 'Emerald Green', swatch: '#1F9862' },
  { id: 'amber', name: 'Tuner Amber', swatch: '#CE8012' },
  { id: 'teal', name: 'Studio Teal', swatch: '#188A94' },
  { id: 'crimson', name: 'Tally Crimson', swatch: '#CE224A' },
]);
