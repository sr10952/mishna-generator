import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../../assets/js/version.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Release versioning is a shipped requirement (see README "Versioning &
 * updates"): every release bumps one version number, and that number must be
 * stamped consistently into the UI module, the service worker, and its cache
 * identity. These guards fail the build if the pieces drift apart.
 */

test('the app version is semver and matches package.json', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/, 'APP_VERSION must be MAJOR.MINOR.PATCH');
  assert.equal(APP_VERSION, pkg.version, 'version.js must mirror package.json');
});

test('sw.js is stamped with the same release version', () => {
  const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes(`const VERSION = '${APP_VERSION}';`), 'sw.js must carry the release VERSION');
  // The cache name carries the version so every release starts a fresh cache
  // (old caches are deleted on activate => online users get the new build).
  assert.match(sw, new RegExp(`const CACHE = 'mishna-poster-v${APP_VERSION.replace(/\./g, '\\.')}-[0-9a-f]{12}';`));
});

test('sw.js precaches the version module and answers version queries', () => {
  const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes('"assets/js/version.js"'), 'version.js must be precached for offline use');
  assert.ok(sw.includes('GET_VERSION'), 'sw.js must answer GET_VERSION messages');
});
