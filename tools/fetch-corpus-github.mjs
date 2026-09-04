#!/usr/bin/env node
/**
 * tools/fetch-corpus-github.mjs
 * ---------------------------------------------------------------------------
 * Download the COMPLETE Mishnah text corpus from Sefaria's open dataset and
 * write it into the app's bundled offline store (assets/content/mishnah.json),
 * so the app needs ZERO external API calls to render any tractate.
 *
 * Sefaria's live text now lives in a Google Cloud Storage bucket, but the
 * `Sefaria/Sefaria-Export` GitHub repository still holds the same public-domain
 * JSON in its git history under `json/Mishnah/<Seder>/<Book>/<Lang>/merged.json`.
 * We read those blobs through the GitHub Contents API (works with a normal
 * `gh` token, no special access), which is reachable where the GCS bucket may
 * not be.
 *
 * Default: Hebrew source text for all 63 tractates (the primary poster text).
 * Add languages/commentaries with flags:
 *   --hebrew        (default on) Mishnah Hebrew source
 *   --english       Mishnah English (William Davidson / merged)
 *   --bartenura     Bartenura commentary (Hebrew)
 *   --ref <sha>     git ref to read from (default: a known good pre-migration commit)
 *
 * Usage:
 *   node tools/fetch-corpus-github.mjs                 # all Hebrew Mishnah
 *   node tools/fetch-corpus-github.mjs --english --bartenura
 *
 * Data: Sefaria (open source; CC / public domain per version).
 * https://github.com/Sefaria/Sefaria-Export  ·  https://developers.sefaria.org
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/content/mishnah.json');
const IDX = path.join(ROOT, 'assets/content/index.json');
const REPO = 'Sefaria/Sefaria-Export';
// A commit whose tree still contains json/Mishnah (before the GCS migration).
const DEFAULT_REF = 'c18cf0b133902b8a08e7f53b4b66c117b96e144b';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const REF = opt('ref', DEFAULT_REF);
// Hebrew is the default unless the user explicitly asks for others only.
const wantHe = flag('hebrew') || (!flag('english') && !flag('bartenura'));
const wantEn = flag('english');
const wantBart = flag('bartenura');

const { MISHNAH } = await import(new URL('../assets/js/mishnah-index.js', import.meta.url));

let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
if (!token) {
  try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim(); } catch { /* none */ }
}
if (!token) {
  console.error('No GitHub token found. Run `gh auth login` or set GH_TOKEN.');
  process.exit(1);
}

async function ghJSON(url) {
  // Use curl: it trusts the sandbox proxy CA where Node's fetch may not.
  for (let i = 0; i < 4; i++) {
    try {
      const out = execFileSync('curl', [
        '-sS', '-m', '60',
        '-H', `Authorization: token ${token}`,
        '-H', 'Accept: application/vnd.github+json',
        '-H', 'User-Agent: mishna-poster-build',
        url,
      ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const data = JSON.parse(out);
      if (data && (data.message === 'Not Found')) return null;
      if (data && typeof data.message === 'string' && /rate limit|abuse/i.test(data.message)) {
        await sleep(2000 * (i + 1)); continue;
      }
      return data;
    } catch { await sleep(800 * (i + 1)); }
  }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

/** Read and decode a merged.json blob at a repo path (git ref). */
async function readMerged(repoPath, ref = REF) {
  const url = `https://api.github.com/repos/${REPO}/contents/${enc(repoPath)}?ref=${ref}`;
  const data = await ghJSON(url);
  if (!data || data.encoding !== 'base64' || !data.content) return null;
  try {
    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  } catch { return null; }
}

/** Flatten one Sefaria "text" chapter (array of segments) into a mishna's paragraphs. */
function segParagraphs(segment) {
  const arr = Array.isArray(segment) ? segment : [segment];
  return arr
    .flatMap((s) => (Array.isArray(s) ? s : [s]))
    .filter((s) => typeof s === 'string' || typeof s === 'number')
    .map((s) => String(s).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Sefaria stores books under Seder folders. Map our book -> repo dir. */
const SEDER_DIR = {
  'Seder Zeraim': 'Seder Zeraim', 'Seder Moed': 'Seder Moed', 'Seder Nashim': 'Seder Nashim',
  'Seder Nezikin': 'Seder Nezikin', 'Seder Kodashim': 'Seder Kodashim', 'Seder Tahorot': 'Seder Tahorot',
};

/**
 * A few tractates use a different folder name and/or only exist in an older
 * export commit. Map our canonical `book` -> { folder, ref? } overrides.
 * Refs in the bundled store still use our canonical `book` (m.book) so they
 * match what the app requests at runtime.
 */
const BOOK_OVERRIDES = {
  // App refs "Mishnah Ta'anit"; Sefaria's folder is "Mishnah Taanit" and this
  // path only survives before the c18cf0b reshuffle.
  "Mishnah Ta'anit": { folder: 'Mishnah Taanit', ref: '1af9cdcbd6a0aa32443579b5db53c01772b1dd8c' },
};

function bookDir(m) {
  // Sefaria's folder name equals the canonical title (e.g. "Mishnah Bekhorot", "Pirkei Avot").
  const folder = BOOK_OVERRIDES[m.book]?.folder || m.book;
  return `json/Mishnah/${SEDER_DIR[m.seder]}/${folder}`;
}

// By default we DO NOT overwrite an entry that already exists, so hand-curated
// captures (e.g. the built-in Bekhorot 3:2-4:1 example, kept in the exact
// version the fixtures/tests expect) survive a full-corpus rebuild. Pass
// --overwrite to replace everything.
const OVERWRITE = flag('overwrite');
function put(store, ref, lang, entry) {
  const bucket = (store[ref] ||= {});
  if (!OVERWRITE && bucket[lang] && Array.isArray(bucket[lang].paragraphs) && bucket[lang].paragraphs.length) {
    return false; // keep existing curated entry
  }
  bucket[lang] = entry;
  return true;
}

async function ingest(store, m, lang, repoPath, meta) {
  const merged = await readMerged(repoPath, meta.ref);
  if (!merged || !Array.isArray(merged.text)) return 0;
  const dir = lang === 'en' ? 'ltr' : 'rtl';
  let count = 0;
  // "merged" is Sefaria's internal name for a version merged from several
  // sources - not a real edition title, and printing it would leak Latin onto
  // native-Hebrew posters. Drop it so only the "Sefaria" attribution shows.
  const rawVT = merged.versionTitle || meta.versionTitle || '';
  const versionTitle = /^merged$/i.test(rawVT) ? '' : rawVT;
  merged.text.forEach((chapter, ci) => {
    const chapterArr = Array.isArray(chapter) ? chapter : [chapter];
    chapterArr.forEach((segment, mi) => {
      const paragraphs = segParagraphs(segment);
      if (!paragraphs.length) return;
      const ref = `${meta.refPrefix} ${ci + 1}:${mi + 1}`;
      const wrote = put(store, ref, lang, {
        paragraphs,
        versionTitle,
        versionTitleInHebrew: merged.versionTitleInHebrew || '',
        license: merged.license || 'Public Domain',
        direction: dir,
        language: lang,
      });
      if (wrote) count++;
    });
  });
  return count;
}

async function main() {
  mkdirSync(path.join(ROOT, 'assets/content'), { recursive: true });
  const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

  let totalRefs = 0;
  for (const m of MISHNAH) {
    const dir = bookDir(m);
    const bookRef = BOOK_OVERRIDES[m.book]?.ref || REF;
    let line = m.book.padEnd(26);
    if (wantHe) {
      const n = await ingest(store, m, 'he', `${dir}/Hebrew/merged.json`, { refPrefix: m.book, versionTitle: 'merged', ref: bookRef });
      line += ` he:${String(n).padStart(3)}`;
      totalRefs += n;
    }
    if (wantEn) {
      const n = await ingest(store, m, 'en', `${dir}/English/merged.json`, { refPrefix: m.book, versionTitle: 'merged', ref: bookRef });
      line += ` en:${String(n).padStart(3)}`;
    }
    if (wantBart) {
      // Commentary lives under a sibling path in Sefaria's export.
      const bdir = `json/Mishnah/Rishonim on Mishnah/Bartenura/${SEDER_DIR[m.seder]}/Bartenura on ${m.book}`;
      const n = await ingest(store, { ...m, seder: m.seder }, 'he', `${bdir}/Hebrew/merged.json`,
        { refPrefix: `Bartenura on ${m.book}`, versionTitle: 'Bartenura', ref: bookRef });
      line += ` bart:${String(n).padStart(3)}`;
    }
    console.log(line);
  }

  writeFileSync(OUT, JSON.stringify(store, null, 0));
  const refs = Object.keys(store);
  const books = [...new Set(refs.map((r) => r.replace(/^Bartenura on /, '').replace(/\s+\d+:\d+$/, '')))].sort();
  writeFileSync(IDX, JSON.stringify({
    app: 'mishna-poster-generator',
    kind: 'mishnah-content',
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'Sefaria-Export (open source; CC / public domain per version)',
    sourceRepo: `${REPO}@${REF}`,
    note: 'Complete Mishnah Hebrew text (all 63 tractates) bundled so the app renders with no external API calls. The Bekhorot 3:2-4:1 example also carries English + Bartenura. Rebuild with tools/fetch-corpus-github.mjs.',
    languages: [wantHe && 'he', wantEn && 'en', wantBart && 'bartenura-he'].filter(Boolean),
    books,
    refs: refs.length,
  }, null, 2));
  console.log(`\nWrote ${refs.length} refs across ${books.length} books -> assets/content/`);
  console.log(`mishnah.json = ${(readFileSync(OUT).length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
