import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBundled } from '../../assets/js/content.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const store = JSON.parse(readFileSync(path.join(ROOT, 'assets/content/mishnah.json'), 'utf8'));
const index = JSON.parse(readFileSync(path.join(ROOT, 'assets/content/index.json'), 'utf8'));

test('bundled content index identifies this app and lists books', () => {
  assert.equal(index.app, 'mishna-poster-generator');
  assert.equal(index.kind, 'mishnah-content');
  assert.ok(Array.isArray(index.books) && index.books.length >= 1);
  assert.ok(index.books.includes('Mishnah Bekhorot'));
});

test('bundled store covers the ENTIRE Mishnah (all 63 tractates, every mishna) in Hebrew', async () => {
  const { MISHNAH } = await import('../../assets/js/mishnah-index.js');
  assert.equal(MISHNAH.length, 63, 'expected 63 tractates in the index');
  let expected = 0;
  const missing = [];
  for (const m of MISHNAH) {
    m.chapters.forEach((count, ci) => {
      for (let mi = 1; mi <= count; mi++) {
        expected++;
        const ref = `${m.book} ${ci + 1}:${mi}`;
        const entry = getBundled(store, ref, 'hebrew');
        if (!entry || !entry.paragraphs.length) missing.push(ref);
      }
    });
    // Every tractate in the index must appear in the bundled book list.
    assert.ok(index.books.includes(m.book), `book missing from index.json: ${m.book}`);
  }
  assert.equal(missing.length, 0, `missing bundled refs: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}`);
  assert.ok(expected >= 4000, `expected the full corpus (~4192 mishnayot), got ${expected}`);
});

test('bundled store covers the built-in example (Bekhorot 3:2-4:1) in Hebrew', () => {
  for (const ref of ['Mishnah Bekhorot 3:2', 'Mishnah Bekhorot 3:3', 'Mishnah Bekhorot 3:4', 'Mishnah Bekhorot 4:1']) {
    const entry = getBundled(store, ref, 'hebrew');
    assert.ok(entry, `missing bundled ${ref}`);
    assert.ok(entry.paragraphs.length > 0);
    assert.equal(entry.direction, 'rtl');
  }
});

test('getBundled resolves the language bucket from the version param', () => {
  const he = getBundled(store, 'Mishnah Bekhorot 3:2', 'hebrew');
  const en = getBundled(store, 'Mishnah Bekhorot 3:2', 'english|William Davidson Edition - English');
  assert.equal(he.language, 'he');
  assert.equal(en.language, 'en');
  // Compare on consonants only (nikud varies between Sefaria text versions).
  const stripNikud = (s) => s.replace(/[\u0591-\u05C7]/g, '');
  assert.match(stripNikud(he.paragraphs.join(' ')), /רבן שמעון/);
  assert.match(en.paragraphs.join(' '), /Rabban Shimon/);
});

test('bundled Bartenura commentary is present for the example', () => {
  const b = getBundled(store, 'Bartenura on Mishnah Bekhorot 3:2', 'hebrew|Torat-Emet');
  assert.ok(b, 'missing bundled Bartenura');
  assert.ok(b.paragraphs.length > 0);
});

test('getBundled returns null for refs not in the store (API fallback path)', () => {
  // Talmud/Tanakh etc. are not bundled -> the app still falls back to the API.
  assert.equal(getBundled(store, 'Genesis 1:1', 'hebrew'), null);
  assert.equal(getBundled(store, 'Mishnah Berakhot 99:99', 'hebrew'), null);
  assert.equal(getBundled({}, 'anything', 'hebrew'), null);
});

test('bundled Hebrew content contains no Latin letters (native-Hebrew promise)', () => {
  // Sample refs across several tractates, not just the built-in example.
  for (const ref of ['Mishnah Bekhorot 3:2', 'Mishnah Berakhot 1:1', 'Pirkei Avot 1:1', "Mishnah Ta'anit 1:1", 'Mishnah Kelim 1:1']) {
    const he = getBundled(store, ref, 'hebrew');
    assert.ok(he, `missing ${ref}`);
    // Strip the inline HTML tags Sefaria emits (e.g. <br>, <i data-…>) which the
    // renderer sanitizes; the underlying Hebrew text must be Latin-free.
    const text = he.paragraphs.join(' ').replace(/<[^>]*>/g, '');
    assert.equal(/[A-Za-z]/.test(text), false, `Latin letters found in ${ref}`);
  }
});
