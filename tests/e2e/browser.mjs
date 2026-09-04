/**
 * tests/e2e/browser.mjs - headless Chromium helper for e2e tests.
 *
 * Uses @sparticuz/chromium (a self-contained Chromium build that ships inside
 * an npm package) driven by puppeteer-core, so the test suite runs on any
 * machine with Node.js - no system Chrome and no network required.
 *
 * On AWS Lambda the runtime libs are provided by the package automatically;
 * elsewhere (e.g. this dev sandbox / CI on Debian) we extract the bundled
 * AL2023 shared libraries and point LD_LIBRARY_PATH at them.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export async function ensureChromium() {
  const chromium = require('@sparticuz/chromium');
  const libDir = path.join(tmpdir(), 'al2023', 'lib');
  if (!existsSync(path.join(libDir, 'libnspr4.so'))) {
    // Recent @sparticuz/chromium releases intentionally do not export their
    // package.json. Resolve the public entry point instead, then walk from
    // build/cjs back to the package root.
    const chromiumRoot = path.resolve(path.dirname(require.resolve('@sparticuz/chromium')), '../..');
    const tarBr = path.join(chromiumRoot, 'bin', 'al2023.tar.br');
    const tar = zlib.brotliDecompressSync(readFileSync(tarBr));
    const tarPath = path.join(tmpdir(), 'al2023.tar');
    writeFileSync(tarPath, tar);
    mkdirSync(path.join(tmpdir(), 'al2023'), { recursive: true });
    execFileSync('tar', ['xf', tarPath, '-C', path.join(tmpdir(), 'al2023')]);
  }
  const executablePath = await chromium.executablePath();
  return {
    executablePath,
    libDir,
    async launchPage({ timezone = 'UTC' } = {}) {
      const puppeteer = require('puppeteer-core');
      const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
        env: { ...process.env, LD_LIBRARY_PATH: libDir },
      });
      const page = await browser.newPage();
      if (timezone) await page.emulateTimezone(timezone);
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      page.__errors = errors;
      return { browser, page };
    },
  };
}

/** Tiny static file server rooted at the repo directory. */
export function startStaticServer(root, port = 8930) {
  // eslint-disable-next-line no-undef
  const http = require('node:http');
  const fs = require('node:fs');
  const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml',
  };
  const server = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p.replace(/\.\./g, ''));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      const data = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

/** Serve Sefaria API calls from the fixtures file (no network in tests). */
export function makeSefariaInterceptor(fixtures) {
  return function intercept(request) {
    const url = request.url();
    try {
      if (url.startsWith('https://www.sefaria.org/api/v3/texts/')) {
        const u = new URL(url);
        const ref = decodeURIComponent(u.pathname.replace('/api/v3/texts/', ''));
        const version = u.searchParams.get('version') || '';
        const key = `${ref}::${version}`;
        if (fixtures.texts[key]) {
          request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures.texts[key]) });
        } else {
          request.respond({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `No fixture for ${key}` }) });
        }
        return true;
      }
      if (url.startsWith('https://www.sefaria.org/api/calendars')) {
        const u = new URL(url);
        const key = `${u.searchParams.get('year')}-${Number(u.searchParams.get('month'))}-${Number(u.searchParams.get('day'))}`;
        const cal = fixtures.calendars[key] || {
          date: `${key}`,
          timezone: 'UTC',
          calendar_items: [{
            title: { en: 'Parashat Hashavua', he: 'פרשת השבוע' },
            displayValue: { en: 'Generic', he: 'גנרית' },
            url: '', ref: '', order: 1, category: 'Tanakh',
          }],
        };
        request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(cal) });
        return true;
      }
    } catch (e) {
      request.abort();
      return true;
    }
    return false;
  };
}
