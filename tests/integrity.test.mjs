import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function listFiles(dirRel, ext) {
  return fs
    .readdirSync(path.join(ROOT, dirRel))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => `${dirRel}/${f}`);
}

test('all JS files pass Node syntax check', () => {
  const jsFiles = ['sw.js', ...listFiles('js', '.js')];
  assert.ok(jsFiles.length >= 10, 'expected core JS files to exist');

  for (const rel of jsFiles) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' });
  }
});

test('all stylesheets have balanced braces and match ordered index.html links', () => {
  const html = read('index.html');
  const linkedCss = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/(styles\/[^"]+\.css)"/g)].map(
    (m) => m[1]
  );

  assert.deepEqual(linkedCss, [
    'styles/base.css',
    'styles/views.css',
    'styles/components.css',
    'styles/atlas.css',
    'styles/mobile-player.css',
  ]);

  for (const rel of linkedCss) {
    const css = read(rel);
    assert.ok(css.trim().length > 0, `${rel} should not be empty`);

    const stripped = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
    let depth = 0;
    for (const ch of stripped) {
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      assert.ok(depth >= 0, `unexpected closing brace in ${rel}`);
    }
    assert.equal(depth, 0, `unclosed brace in ${rel}`);
  }
});

test('config.js version and sw.js CACHE_VERSION stay in lockstep and all SHELL_ASSETS exist', () => {
  const configSrc = read('js/config.js');
  const swSrc = read('sw.js');

  const configVersion = configSrc.match(/version:\s*'([0-9]+\.[0-9]+\.[0-9]+)'/)?.[1];
  const swVersion = swSrc.match(/CACHE_VERSION\s*=\s*'onda-shell-v([0-9]+\.[0-9]+\.[0-9]+)'/)?.[1];

  assert.ok(configVersion, 'APP_CONFIG.version should be a semver string');
  assert.equal(swVersion, configVersion, 'sw.js CACHE_VERSION must match APP_CONFIG.version');

  const assetBlock = swSrc.match(/SHELL_ASSETS\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
  const assets = [...assetBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(assets.length >= 10, 'SHELL_ASSETS should list core app shell files');

  for (const asset of assets) {
    if (asset === './') continue;
    const rel = asset.replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `SHELL_ASSETS entry missing on disk: ${rel}`);
  }

  // Service worker must never intercept cross-origin streams, Radio Browser API, or map tiles
  assert.match(swSrc, /url\.origin\s*!==\s*self\.location\.origin/);
});

test('manifest.webmanifest is valid JSON and all referenced icons exist', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.short_name, 'ONDA');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);

  for (const icon of manifest.icons) {
    const rel = String(icon.src || '').replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `manifest icon missing on disk: ${rel}`);
  }
});

test('every getElementById call in app/map/mobile/custom modules resolves to a defined DOM id', () => {
  const html = read('index.html');
  const allJs = listFiles('js', '.js').map(read).join('\n');
  const definedIds = new Set([...(html + '\n' + allJs).matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]));

  const checkedModules = ['js/app.js', 'js/map.js', 'js/mobile-player.js', 'js/custom-streams.js'];
  for (const rel of checkedModules) {
    const src = read(rel);
    for (const m of src.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
      const id = m[1];
      assert.ok(definedIds.has(id), `DOM id "${id}" referenced in ${rel} was not found`);
    }
  }
});

test('critical architecture and bug-fix guardrails remain intact', () => {
  // 1. Heavy / platform-specific modules must remain lazy-loaded from app.js
  const appSrc = read('js/app.js');
  assert.doesNotMatch(appSrc, /^import\s+.*from\s+['"]\.\/(map|geo|pip)\.js['"]/m);

  // 2. player.js pause() must not clear audio.src (keeps Android MediaSession card alive)
  const playerSrc = read('js/player.js');
  const pauseBlock = playerSrc.match(/\bpause\(\)\s*\{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.ok(pauseBlock.length > 0, 'player.js pause() method should exist');
  assert.doesNotMatch(pauseBlock, /removeAttribute\(\s*['"]src['"]\s*\)/);
  assert.doesNotMatch(pauseBlock, /audio\.src\s*=\s*['"]['"]/);

  // 3. Sticky header modal scroll-lock fix must remain in components.css
  const componentsCss = read('styles/components.css');
  assert.match(componentsCss, /body\.modal-open\s+\.site-header/);
  assert.match(componentsCss, /--locked-scroll-y/);

  // 4. Atlas must use keyless OpenStreetMap tiles (CARTO tiles require an API key since Sept 2026)
  const mapSrc = read('js/map.js');
  assert.match(mapSrc, /tile\.openstreetmap\.org/);
  assert.doesNotMatch(mapSrc, /basemaps\.cartocdn\.com/);
});
