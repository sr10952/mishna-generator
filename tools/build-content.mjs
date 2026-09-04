#!/usr/bin/env node
/**
 * tools/build-content.mjs
 * ---------------------------------------------------------------------------
 * Populate assets/content/mishnah.json with real Sefaria text so the app can
 * render those tractates fully offline (requirement #6: Sefaria independence).
 *
 * The app itself has ZERO runtime build step; this is a maintainer tool run
 * occasionally to grow the bundled corpus. It fetches whole chapters (one
 * request per chapter, far fewer than per-mishna) for the Hebrew source, the
 * default English (William Davidson), and Bartenura (Hebrew), then writes the
 * per-mishna paragraph shape the app consumes. Existing entries are preserved.
 *
 * Usage:
 *   node tools/build-content.mjs                 # default showcase set
 *   node tools/build-content.mjs "Pirkei Avot" "Mishnah Berakhot"
 *   node tools/build-content.mjs --all           # entire Mishnah (large; slow)
 *
 * Data is open source from Sefaria (CC / public domain per version); see
 * https://developers.sefaria.org. Requires network access to www.sefaria.org.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/content/mishnah.json');
const IDX = path.join(ROOT, 'assets/content/index.json');
const API = 'https://www.sefaria.org/api';

// The default showcase set: the built-in example plus a small, complete,
// popular tractate so the offline corpus demonstrates full coverage.
const DEFAULT_BOOKS = ['Mishnah Bekhorot', 'Pirkei Avot'];

const { MISHNAH } = await import(new URL('../assets/js/mishnah-index.js', import.meta.url));

async function fetchJSON(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) return await res.json();
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error(`fetch failed: ${url}`);
}

function entryFromVersion(v) {
  const raw = Array.isArray(v.text) ? v.text : [v.text];
  return {
    versionTitle: v.versionTitle || '',
    versionTitleInHebrew: v.versionTitleInHebrew || '',
    license: v.license || '',
    direction: v.direction === 'ltr' ? 'ltr' : 'rtl',
    language: v.language || '',
    _chapterText: raw, // temporary; split per mishna below
  };
}

async function fetchChapter(ref, versionParam) {
  const url = `${API}/v3/texts/${encodeURIComponent(ref).replace(/%2C/g, ',').replace(/%3A/g, ':')}`
    + `?version=${encodeURIComponent(versionParam)}&return_format=text_only`;
  const data = await fetchJSON(url);
  const v = data && data.versions && data.versions[0];
  if (!v || v.text == null) return null;
  return entryFromVersion(v);
}

function put(store, ref, lang, entry) {
  (store[ref] ||= {})[lang] = {
    paragraphs: entry.paragraphs,
    versionTitle: entry.versionTitle,
    versionTitleInHebrew: entry.versionTitleInHebrew,
    license: entry.license,
    direction: entry.direction,
    language: entry.language,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let books;
  if (args.includes('--all')) books = MISHNAH.map((m) => m.book);
  else if (args.length) books = args;
  else books = DEFAULT_BOOKS;

  mkdirSync(path.join(ROOT, 'assets/content'), { recursive: true });
  const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

  for (const book of books) {
    const m = MISHNAH.find((x) => x.book === book);
    if (!m) { console.warn(`! unknown book: ${book}`); continue; }
    console.log(`\n${book} (${m.chapters.length} chapters)`);
    for (let ch = 1; ch <= m.chapters.length; ch++) {
      const count = m.chapters[ch - 1];
      const jobs = [
        ['he', `${book} ${ch}`, 'hebrew'],
        ['en', `${book} ${ch}`, 'english|William Davidson Edition - English'],
        ['he', `Bartenura on ${book} ${ch}`, 'hebrew|Torat-Emet'],
      ];
      for (const [lang, ref, version] of jobs) {
        try {
          const chap = await fetchChapter(ref, version);
          if (!chap) continue;
          const paras = chap._chapterText;
          for (let mi = 1; mi <= count; mi++) {
            const seg = paras[mi - 1];
            if (seg == null) continue;
            const paragraphs = (Array.isArray(seg) ? seg : [seg]).map(String).filter(Boolean);
            if (!paragraphs.length) continue;
            put(store, `${ref.replace(/ \d+$/, '')} ${ch}:${mi}`.replace(/ (\d+):(\d+)$/, ' $1:$2'),
              lang, { ...chap, paragraphs });
          }
          process.stdout.write(`  ${ref} [${version.split('|')[0]}] ✓\n`);
        } catch (e) {
          console.warn(`  ${ref} [${version}] ✗ ${e.message}`);
        }
      }
    }
  }

  writeFileSync(OUT, JSON.stringify(store, null, 1));
  const refs = Object.keys(store);
  const bookList = [...new Set(refs.map((r) => r.replace(/^Bartenura on /, '').replace(/\s+\d+:\d+$/, '')))].sort();
  writeFileSync(IDX, JSON.stringify({
    app: 'mishna-poster-generator',
    kind: 'mishnah-content',
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'Sefaria.org (open source; CC / public-domain per version)',
    note: 'Bundled offline text. Populate more with tools/build-content.mjs.',
    books: bookList,
    refs: refs.length,
  }, null, 2));
  console.log(`\nWrote ${refs.length} refs across ${bookList.length} books to assets/content/.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
