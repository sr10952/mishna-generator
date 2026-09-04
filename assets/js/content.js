/**
 * content.js - Local, bundled Mishnah content store (Sefaria-independent layer).
 *
 * Goal (requirement #6): the app should not *depend* on a live Sefaria
 * connection. Text that ships inside the repo (assets/content/mishnah.json) is
 * served instantly and fully offline. Anything not bundled falls back to the
 * live Sefaria API at runtime, exactly as before, so no tractate ever becomes
 * unavailable.
 *
 * The bundled file ships the COMPLETE Mishnah Hebrew text - all 6 sedarim,
 * 63 tractates, every mishna (~4,192 refs) - so the entire corpus renders
 * fully offline with no external API calls. The built-in Bekhorot 3:2-4:1
 * example additionally carries English and Bartenura commentary.
 *
 * Rebuild / extend the store offline with the build tools, both of which write
 * this same JSON shape:
 *   - tools/fetch-corpus-github.mjs  (bulk: pulls the whole corpus from
 *     Sefaria's open dataset via the GitHub Contents API; add --english /
 *     --bartenura for those layers)
 *   - tools/build-content.mjs        (targeted single-ref captures)
 *
 * Shape of assets/content/mishnah.json:
 *   { "<ref>": { "he": <entry>, "en": <entry> }, ... }
 * where <entry> = { paragraphs:string[], versionTitle, versionTitleInHebrew,
 *                   license, direction:'rtl'|'ltr', language }
 * matching the object getText() returns.
 */

import { getText as apiGetText } from './sefaria.js';

const CONTENT_URL = new URL('../content/mishnah.json', import.meta.url).href;

let storePromise = null;

/** Lazy-load and cache the bundled content JSON (once). Never throws. */
async function loadStore() {
  if (storePromise) return storePromise;
  storePromise = (async () => {
    try {
      const res = await fetch(CONTENT_URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) return {};
      const json = await res.json();
      return json && typeof json === 'object' ? json : {};
    } catch {
      return {}; // no bundled content available (e.g. file:// without it) - API fallback
    }
  })();
  return storePromise;
}

/** Map a Sefaria versionParam to the language bucket used by the bundled store. */
function langOf(versionParam) {
  const v = String(versionParam || '').toLowerCase();
  if (v.startsWith('english') || v.includes('|english') || v === 'en') return 'en';
  return 'he';
}

/** True when a store entry looks usable. */
function usable(entry) {
  return !!(entry && Array.isArray(entry.paragraphs) && entry.paragraphs.length);
}

/**
 * Return the bundled entry for a ref+version, or null when it isn't bundled.
 * Exposed for tests and diagnostics.
 */
export function getBundled(store, ref, versionParam) {
  const byLang = store && store[ref];
  if (!byLang) return null;
  const lang = langOf(versionParam);
  if (usable(byLang[lang])) return byLang[lang];
  // A specific English edition may be requested but only the default bundled;
  // fall back to whichever language bucket exists for that ref.
  const only = byLang[lang] || byLang.he || byLang.en;
  return usable(only) ? only : null;
}

/**
 * getText replacement: try bundled offline content first, then the live API.
 * Same signature and return shape as sefaria.getText, so callers are unchanged.
 */
export async function getText(ref, versionParam) {
  const store = await loadStore();
  const bundled = getBundled(store, ref, versionParam);
  if (bundled) {
    return {
      paragraphs: bundled.paragraphs.map(String),
      versionTitle: bundled.versionTitle || '',
      versionTitleInHebrew: bundled.versionTitleInHebrew || '',
      license: bundled.license || '',
      direction: bundled.direction === 'ltr' ? 'ltr' : 'rtl',
      language: bundled.language || '',
      source: 'bundled',
    };
  }
  const fromApi = await apiGetText(ref, versionParam);
  return { ...fromApi, source: 'api' };
}

/** Report how much content is bundled (for the UI / about line). */
export async function contentStatus() {
  const store = await loadStore();
  const refs = Object.keys(store);
  const books = [...new Set(refs.map((r) => r.replace(/^Bartenura on /, '').replace(/\s+\d+:\d+$/, '')))];
  return { refs: refs.length, books };
}

/** Test seam: reset the memoized store. */
export function _resetContentCache() { storePromise = null; }
