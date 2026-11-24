import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlaylistUrl,
  isHlsUrl,
  inferCodecFromUrl,
  inferNameFromUrl,
  parsePlaylistText,
  resolveStreamInput,
} from '../js/custom-streams.js';

test('URL format and metadata inference helpers identify common broadcast formats', () => {
  assert.equal(isPlaylistUrl('https://radio.example.com/listen.pls'), true);
  assert.equal(isPlaylistUrl('https://radio.example.com/stream.m3u?token=1'), true);
  assert.equal(isPlaylistUrl('https://radio.example.com/live.m3u8'), false);

  assert.equal(isHlsUrl('https://radio.example.com/live.m3u8'), true);
  assert.equal(isHlsUrl('https://radio.example.com/live.m3u8?auth=abc'), true);
  assert.equal(isHlsUrl('https://radio.example.com/live.mp3'), false);

  assert.equal(inferCodecFromUrl('https://radio.example.com/live.m3u8'), 'HLS');
  assert.equal(inferCodecFromUrl('https://radio.example.com/hifi.flac'), 'FLAC');
  assert.equal(inferCodecFromUrl('https://radio.example.com/stream.aacp'), 'AAC');
  assert.equal(inferCodecFromUrl('https://radio.example.com/stream.opus'), 'OGG');
  assert.equal(inferCodecFromUrl('https://radio.example.com/stream.mp3'), 'MP3');
  assert.equal(inferCodecFromUrl('https://radio.example.com/live'), '');

  assert.equal(inferNameFromUrl('https://www.somafm.com/groove-salad.mp3'), 'somafm.com · groove salad');
  assert.equal(inferNameFromUrl('https://stream.kexp.org/'), 'stream.kexp.org');
  assert.equal(inferNameFromUrl('invalid'), 'Custom Radio Stream');
});

test('parsePlaylistText parses PLS and M3U formats and prefers HTTPS on HTTPS pages', () => {
  const prevWindow = globalThis.window;
  try {
    globalThis.window = { location: { protocol: 'https:' } };

    const pls = parsePlaylistText(`
      [playlist]
      NumberOfEntries=2
      File1=http://mirror1.example.com:8000/jazz
      Title1=Late Night Jazz (HTTP)
      File2=https://mirror2.example.com/jazz.aac
      Title2=Late Night Jazz (HTTPS)
    `);
    assert.deepEqual(pls, {
      streamUrl: 'https://mirror2.example.com/jazz.aac',
      title: 'Late Night Jazz (HTTPS)',
      count: 2,
    });

    const m3u = parsePlaylistText(`
      #EXTM3U
      #EXTINF:-1,Ambient FM
      https://ambient.example.com/stream.mp3
      javascript:alert(1)
    `);
    assert.deepEqual(m3u, {
      streamUrl: 'https://ambient.example.com/stream.mp3',
      title: 'Ambient FM',
      count: 1,
    });

    assert.equal(parsePlaylistText('#EXTM3U\n# just comments\nnot-a-url'), null);
  } finally {
    globalThis.window = prevWindow;
  }
});

test('resolveStreamInput handles direct URLs, HLS, raw playlists, and remote .pls fetch/CORS fallback', async () => {
  const empty = await resolveStreamInput('   ');
  assert.ok(empty.error);

  const badUrl = await resolveStreamInput('javascript:alert(1)');
  assert.ok(badUrl.error);

  const direct = await resolveStreamInput('https://stream.example.com/radio.mp3');
  assert.equal(direct.status, 'ok');
  assert.equal(direct.urlResolved, 'https://stream.example.com/radio.mp3');

  const hls = await resolveStreamInput('https://stream.example.com/live.m3u8');
  assert.equal(hls.status, 'ok');
  assert.match(hls.formatNote, /HLS/i);

  const pastedPls = await resolveStreamInput('[playlist]\nFile1=https://audio.example.com/ch1.aac\nTitle1=Channel One');
  assert.equal(pastedPls.status, 'ok');
  assert.equal(pastedPls.urlResolved, 'https://audio.example.com/ch1.aac');
  assert.equal(pastedPls.suggestedTitle, 'Channel One');

  // Remote .pls resolution with mocked fetch
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      text: async () => '[playlist]\nFile1=https://resolved.example.com/live.mp3\nTitle1=Resolved FM',
    });
    const remoteOk = await resolveStreamInput('https://example.com/listen.pls');
    assert.equal(remoteOk.status, 'ok');
    assert.equal(remoteOk.url, 'https://example.com/listen.pls');
    assert.equal(remoteOk.urlResolved, 'https://resolved.example.com/live.mp3');
    assert.equal(remoteOk.suggestedTitle, 'Resolved FM');

    // CORS / network failure gracefully falls back to saving the URL directly with a warning
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const remoteCors = await resolveStreamInput('https://blocked.example.com/listen.pls');
    assert.equal(remoteCors.status, 'warn');
    assert.equal(remoteCors.urlResolved, 'https://blocked.example.com/listen.pls');
  } finally {
    globalThis.fetch = origFetch;
  }
});
