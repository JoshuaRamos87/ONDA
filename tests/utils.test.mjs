import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  sanitizeHttpUrl,
  getSafeFaviconUrl,
  countryCodeToFlag,
  formatNumber,
  formatExactNumber,
  formatElapsed,
  getStationMonogram,
  parseTags,
  buildArtworkHtml,
  isDesktopPipSupported,
} from '../js/utils.js';

test('escapeHtml escapes all dangerous HTML entities and handles nullish inputs', () => {
  assert.equal(escapeHtml(`<img src="x" onerror='alert(1)&'>`), '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&amp;&#39;&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('sanitizeHttpUrl allows only valid http/https URLs', () => {
  assert.equal(sanitizeHttpUrl('https://stream.example.com/live.mp3'), 'https://stream.example.com/live.mp3');
  assert.equal(sanitizeHttpUrl('  http://radio.test:8000/mount  '), 'http://radio.test:8000/mount');
  assert.equal(sanitizeHttpUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeHttpUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(sanitizeHttpUrl('ftp://files.example.com/a.mp3'), '');
  assert.equal(sanitizeHttpUrl('not a url'), '');
  assert.equal(sanitizeHttpUrl(''), '');
});

test('getSafeFaviconUrl blocks insecure http favicons when served over HTTPS', () => {
  const prevWindow = globalThis.window;
  try {
    globalThis.window = { location: { protocol: 'https:' } };
    assert.equal(getSafeFaviconUrl('http://insecure.example.com/logo.png'), '');
    assert.equal(getSafeFaviconUrl('https://secure.example.com/logo.png'), 'https://secure.example.com/logo.png');

    globalThis.window = { location: { protocol: 'http:' } };
    assert.equal(getSafeFaviconUrl('http://local.example.com/logo.png'), 'http://local.example.com/logo.png');
  } finally {
    globalThis.window = prevWindow;
  }
});

test('countryCodeToFlag converts ISO alpha-2 codes and falls back to globe', () => {
  assert.equal(countryCodeToFlag('US'), '🇺🇸');
  assert.equal(countryCodeToFlag('jp'), '🇯🇵');
  assert.equal(countryCodeToFlag(''), '🌐');
  assert.equal(countryCodeToFlag('USA'), '🌐');
  assert.equal(countryCodeToFlag('12'), '🌐');
});

test('number and elapsed time formatters format edge values cleanly', () => {
  assert.equal(formatNumber(2500000), '2.5M');
  assert.equal(formatNumber(15400), '15.4k');
  assert.equal(formatNumber(950), '950');
  assert.equal(formatNumber('not-a-number'), '—');

  assert.equal(formatExactNumber(12345), (12345).toLocaleString());
  assert.equal(formatExactNumber(NaN), '0');

  assert.equal(formatElapsed(0), '00:00');
  assert.equal(formatElapsed(65), '01:05');
  assert.equal(formatElapsed(3661), '01:01:01');
});

test('getStationMonogram builds deterministic initials and palette color', () => {
  const a = getStationMonogram({ name: 'Radio Nova Paris', stationuuid: 'abc-123' });
  const b = getStationMonogram({ name: 'Radio Nova Paris', stationuuid: 'abc-123' });
  assert.equal(a.initials, 'RN');
  assert.equal(a.color, b.color);
  assert.match(a.color, /^#[0-9A-F]{6}$/i);

  assert.equal(getStationMonogram({ name: 'KEXP', stationuuid: '1' }).initials, 'KE');
  assert.equal(getStationMonogram({ name: '---', stationuuid: '2' }).initials, 'FM');
});

test('parseTags trims, lowercases, deduplicates, and filters invalid lengths', () => {
  assert.deepEqual(
    parseTags('Jazz, lofi, JAZZ, a, , ambient, this-tag-is-far-too-long-to-display-cleanly'),
    ['jazz', 'lofi', 'ambient']
  );
  assert.deepEqual(parseTags(''), []);
});

test('buildArtworkHtml returns safe monogram or lazy image with fallback', () => {
  const noArt = buildArtworkHtml({ name: 'KEXP <FM>', stationuuid: 'u1', favicon: '' });
  assert.match(noArt, /station-monogram/);
  assert.doesNotMatch(noArt, /<img/);

  const withArt = buildArtworkHtml(
    { name: 'Radio Nova', stationuuid: 'u2', favicon: 'https://cdn.example.com/logo.png' },
    64
  );
  assert.match(withArt, /<img/);
  assert.match(withArt, /src="https:\/\/cdn\.example\.com\/logo\.png"/);
  assert.match(withArt, /width="64"/);
  assert.match(withArt, /referrerpolicy="no-referrer"/);
});

test('isDesktopPipSupported returns false safely in non-browser environments', () => {
  assert.equal(isDesktopPipSupported(), false);
});
