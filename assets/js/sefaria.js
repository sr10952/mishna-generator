/**
 * sefaria.js - Minimal, robust client for the public Sefaria API.
 *
 * Endpoints used (all CORS-enabled, no API key required):
 *   GET https://www.sefaria.org/api/v3/texts/{ref}?version={lang}|{Version_Title}
 *   GET https://www.sefaria.org/api/calendars?year=Y&month=M&day=D&timezone=TZ&diaspora=0|1
 *
 * Docs: https://developers.sefaria.org  (Sefaria data is open source;
 * individual versions carry their own CC / public-domain licenses).
 */

const API_BASE = 'https://www.sefaria.org/api';

/** Simple per-URL cache so repeated previews don't re-fetch texts. */
const cache = new Map();

export function clearSefariaCache() {
  cache.clear();
}

async function fetchJSON(url, { retries = 2, timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      clearTimeout(timer);
      return json;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  clearTimeout(timer);
  throw lastErr;
}

async function cachedJSON(url, opts) {
  if (cache.has(url)) return cache.get(url);
  const json = await fetchJSON(url, opts);
  cache.set(url, json);
  return json;
}

/* ---------------------------------------------------------------------------
 * Texts
 * ------------------------------------------------------------------------- */

/**
 * Fetch one text (mishna or commentary) with a specific version.
 * @param {string} ref e.g. "Mishnah Bekhorot 3:2"
 * @param {string} versionParam e.g. "hebrew", "english|Mishnah Yomit by Dr. Joshua Kulp"
 * @returns {Promise<{paragraphs:string[], versionTitle:string, versionTitleInHebrew:string,
 *                     license:string, direction:'rtl'|'ltr', language:string}>}
 */
export async function getText(ref, versionParam) {
  const url = `${API_BASE}/v3/texts/${encodeURIComponent(ref).replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%2F/g, '/')}${versionParam ? `?version=${encodeURIComponent(versionParam)}` : ''}`;
  const data = await cachedJSON(url);
  const v = data && data.versions && data.versions[0];
  if (!v || v.text == null) {
    const err = new Error(`No text returned for ${ref}`);
    err.code = 'no-text';
    throw err;
  }
  const raw = Array.isArray(v.text) ? v.text : [v.text];
  const paragraphs = raw.flatMap((chunk) => (Array.isArray(chunk) ? chunk : [chunk])).filter((s) => typeof s === 'string' || typeof s === 'number');
  return {
    paragraphs: paragraphs.map(String),
    versionTitle: v.versionTitle || '',
    versionTitleInHebrew: v.versionTitleInHebrew || '',
    license: v.license || '',
    direction: v.direction === 'ltr' ? 'ltr' : 'rtl',
    language: v.language || '',
  };
}

/* ---------------------------------------------------------------------------
 * Calendar (weekly parasha etc.)
 * ------------------------------------------------------------------------- */

/**
 * Fetch the calendar items for a date. Returns { parsha: {en, he}|null }.
 * @param {Date} date local date
 */
export async function getCalendar(date, { diaspora = true, timezone } = {}) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const tz = timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
  const url = `${API_BASE}/calendars?year=${y}&month=${m}&day=${d}&timezone=${encodeURIComponent(tz)}&diaspora=${diaspora ? 1 : 0}`;
  const data = await cachedJSON(url);
  const items = (data && data.calendar_items) || [];
  const parshaItem = items.find(
    (it) => it.title && (it.title.en === 'Parashat Hashavua' || it.title.he === 'פרשת השבוע'),
  );
  return {
    parsha: parshaItem && parshaItem.displayValue
      ? { en: parshaItem.displayValue.en || '', he: parshaItem.displayValue.he || '' }
      : null,
  };
}

/* ---------------------------------------------------------------------------
 * Concurrency helper
 * ------------------------------------------------------------------------- */

/**
 * Run tasks (functions returning promises) with limited concurrency,
 * reporting progress as each completes. Never rejects; failures are returned.
 */
export async function runPool(tasks, { concurrency = 4, onProgress } = {}) {
  const results = new Array(tasks.length);
  let next = 0;
  let done = 0;
  const failures = [];

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        results[i] = undefined;
        failures.push({ index: i, error: err });
      }
      done++;
      if (onProgress) onProgress(done, tasks.length, i);
    }
  }

  const n = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: n }, worker));
  return { results, failures };
}
