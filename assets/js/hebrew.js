/**
 * hebrew.js - Hebrew text & calendar utilities with zero dependencies.
 *
 * - Hebrew (Jewish) calendar conversion uses the browser's built-in
 *   Intl Hebrew calendar (ICU), so it is always correct and offline.
 * - Gematria formatting produces traditional Hebrew numerals with
 *   gershayim (e.g. 21 -> כ״א) and the ט״ו / ט״ז convention.
 * - Nikud stripping keeps the maqaf (hyphen) and gershayim intact.
 */

export const NIKUD_RE = /[\u0591-\u05BD\u05BF\u05C0\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

/** Remove nikud (vowel points, shin/sin dots, cantillation). Keeps maqaf & gershayim. */
export function stripNikud(s) {
  return typeof s === 'string' ? s.replace(NIKUD_RE, '') : s;
}

export function hasNikud(s) {
  return typeof s === 'string' && NIKUD_RE.test(s);
}

/** True when the string contains Hebrew letters (Aleph..Tav, any block letter). */
export function containsHebrewLetters(s) {
  return /[\u05D0-\u05EA]/.test(String(s));
}

/** True when the string contains Latin letters (A-Z / a-z). */
export function containsLatinLetters(s) {
  return /[A-Za-z]/.test(String(s));
}

/* ---------------------------------------------------------------------------
 * Gematria (Hebrew numerals)
 * ------------------------------------------------------------------------- */

const GEMATRIA_VALUES = [
  [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'],
  [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'],
  [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א'],
];

/**
 * Format a positive integer as a Hebrew numeral.
 *  - 15 -> ט״ו and 16 -> ט״ז (avoid spelling God's name)
 *  - two or more letters get a gershayim before the final letter
 *  - a single letter gets a geresh after it
 */
export function gematria(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n <= 0) return String(n ?? '');
  if (n > 9999) return String(n);
  let s = '';
  let rest = n;
  for (const [v, ch] of GEMATRIA_VALUES) {
    while (rest >= v) { s += ch; rest -= v; }
  }
  s = s.replace(/יה$/, 'טו').replace(/יו$/, 'טז');
  if (s.length === 1) return s + '׳';
  return s.slice(0, -1) + '״' + s.slice(-1);
}

/** Format a number for display, honoring the UI language. */
export function num(n, lang) {
  return lang === 'he' ? gematria(n) : String(n);
}

/* ---------------------------------------------------------------------------
 * Hebrew / Gregorian calendar via Intl (offline, built into every browser)
 * ------------------------------------------------------------------------- */

const HE_MONTH_NAMES = {
  Tishri: 'תשרי', Heshvan: 'חשוון', Cheshvan: 'חשוון', Kislev: 'כסלו', Tevet: 'טבת',
  Shevat: 'שבט', 'Adar I': 'אדר א׳', 'Adar II': 'אדר ב׳', Adar: 'אדר',
  Nisan: 'ניסן', Iyar: 'אייר', Sivan: 'סיוון', Tamuz: 'תמוז', Av: 'אב', Elul: 'אלול',
};
// Map ICU English month names to canonical Hebrew-calendar month numbers (1=Tishri..13=Adar II)
const HE_MONTH_NUM = {
  Tishri: 1, Heshvan: 2, Cheshvan: 2, Kislev: 3, Tevet: 4, Shevat: 5,
  'Adar I': 6, Adar: 7, 'Adar II': 7, Nisan: 8, Iyar: 9, Sivan: 10,
  Tamuz: 11, Av: 12, Elul: 13,
};

function hebrewParts(date) {
  const parts = new Intl.DateTimeFormat('en-u-ca-hebrew-nu-latn', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).formatToParts(date);
  const out = {};
  for (const p of parts) {
    if (p.type === 'day') out.day = parseInt(p.value, 10);
    else if (p.type === 'month') out.monthName = p.value;
    else if (p.type === 'year') out.year = parseInt(p.value, 10);
  }
  out.month = HE_MONTH_NUM[out.monthName] ?? null;
  out.monthHe = HE_MONTH_NAMES[out.monthName] ?? out.monthName;
  return out;
}

/** {day, monthName (English, e.g. "Elul"), monthHe (אלול), month (1..13), year} */
export function hebrewDate(date) {
  return hebrewParts(date);
}

/** "כ״א באלול תשפ״ו" (Hebrew) or "21 Elul 5786" (English). */
export function formatHebrewDate(date, lang = 'he') {
  const h = hebrewParts(date);
  if (!h.day || !h.monthHe || !h.year) return '';
  if (lang === 'he') {
    // years are written without the thousands: 5786 -> תשפ״ו
    let y = h.year >= 5000 ? h.year % 1000 : h.year;
    if (y < 1) y = h.year;
    return `${gematria(h.day)} ב${h.monthHe} ${gematria(y)}`;
  }
  return `${h.day} ${h.monthName} ${h.year}`;
}

/** Gregorian date formatted per locale. */
export function formatGregorianDate(date, lang = 'en') {
  const loc = lang === 'he' ? 'he-IL' : 'en-US';
  return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** Weekday name, e.g. "יום חמישי" / "Thursday". */
export function formatWeekday(date, lang = 'en') {
  return new Intl.DateTimeFormat(lang === 'he' ? 'he' : 'en-US', { weekday: 'long' }).format(date);
}

/** ISO yyyy-mm-dd key for a Date (local, not UTC). */
export function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse "yyyy-mm-dd" into a local Date at noon (timezone-safe). */
export function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Yom Tov (major holiday, no weekday learning) detection.
 * True on the days when a learning poster would normally not be printed:
 * Rosh Hashana (1-2 Tishri), Yom Kippur (10), Sukkot day 1 (+2nd day in
 * diaspora), Shmini Atzeret (+Simchat Torah in diaspora), Pesach day 1 and
 * last day (+2nd days in diaspora), Shavuot (+2nd day in diaspora).
 * Chol HaMoed is intentionally NOT skipped - learning continues.
 */
export function isYomTov(date, diaspora = true) {
  const h = hebrewParts(date);
  if (!h.month || !h.day) return false;
  const tishri = h.month === 1;
  if (tishri && (h.day === 1 || h.day === 2)) return true;            // Rosh Hashana
  if (tishri && h.day === 10) return true;                            // Yom Kippur
  if (tishri && h.day === 15) return true;                            // Sukkot day 1
  if (tishri && h.day === 16 && diaspora) return true;                // Sukkot day 2 (diaspora)
  if (tishri && h.day === 22) return true;                            // Shmini Atzeret
  if (tishri && h.day === 23 && diaspora) return true;                // Simchat Torah (diaspora)
  if (h.month === 8 && h.day === 15) return true;                     // Pesach day 1
  if (h.month === 8 && h.day === 16 && diaspora) return true;         // Pesach day 2 (diaspora)
  if (h.month === 8 && h.day === 21) return true;                     // Pesach day 7
  if (h.month === 8 && h.day === 22 && diaspora) return true;         // Pesach day 8 (diaspora)
  if (h.month === 10 && h.day === 6) return true;                     // Shavuot
  if (h.month === 10 && h.day === 7 && diaspora) return true;         // Shavuot day 2 (diaspora)
  return false;
}

/** The Saturday of the week the date belongs to (used to cache the weekly parasha). */
export function saturdayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const add = (6 - dow + 7) % 7;
  d.setDate(d.getDate() + add);
  return d;
}

/* ---------------------------------------------------------------------------
 * Reference formatting
 * ------------------------------------------------------------------------- */

/** "Mishnah Bekhorot 3:2" from {book, chapter, mishna}. */
export function apiRef(pos) {
  return `${pos.book} ${pos.chapter}:${pos.mishna}`;
}

/** Commentary ref: "Bartenura on Mishnah Bekhorot 3:2". */
export function commentaryRef(commentaryKey, pos) {
  const names = { bartenura: 'Bartenura', tosafotYT: 'Tosafot Yom Tov', rambam: 'Rambam' };
  return `${names[commentaryKey]} on ${pos.book} ${pos.chapter}:${pos.mishna}`;
}

/** Hebrew display name of a masechet, e.g. "משנה בכורות" -> "בכורות". */
export function masechetHeName(m) {
  return m.heTitle.replace(/^משנה\s+/, '');
}

/** Poster title, e.g. HE: "משנה בכורות · פרק ג׳ · משנה ב׳"  EN: "Bekhorot · Chapter 3 · Mishna 2". */
export function formatRefTitle(m, chapter, mishna, lang) {
  if (lang === 'he') {
    return `מסכת ${masechetHeName(m)} · פרק ${gematria(chapter)} · משנה ${gematria(mishna)}`;
  }
  return `${m.title} · Chapter ${chapter} · Mishna ${mishna}`;
}

/* ---------------------------------------------------------------------------
 * Text cleaning / sanitizing
 * ------------------------------------------------------------------------- */

const ALLOWED_TAGS = new Set(['b', 'i', 'em', 'strong']);
const PLACEHOLDER = '\u0001';

/**
 * Sanitize Sefaria inline HTML. Allows only b/i/em/strong; converts <br> to a
 * newline; decodes the few entities Sefaria emits; escapes every other <, >, &.
 */
export function sanitizeText(raw) {
  if (raw == null) return '';
  let s = String(raw);
  const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  s = s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => entities[m] || m);
  // drop script/style blocks entirely, including their content
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  // Tags -> safe placeholders (allowed), newline (<br>) or removed (everything else)
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tag, name) => {
    const n = name.toLowerCase();
    if (n === 'br') return '\n';
    if (ALLOWED_TAGS.has(n)) {
      return tag.startsWith('</') ? `${PLACEHOLDER}/${n}${PLACEHOLDER}` : `${PLACEHOLDER}${n}${PLACEHOLDER}`;
    }
    return '';
  });
  // Escape whatever is left
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Restore the whitelisted tags
  s = s.replace(/\u0001(\/?)(b|i|em|strong)\u0001/g, (m, slash, n) => `<${slash}${n}>`);
  return s.replace(/[ \t]+/g, ' ').trim();
}

/** Split a Sefaria segment string into paragraph strings (on blank lines). */
export function toParagraphs(raw) {
  const s = String(raw ?? '');
  return s
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/* ---------------------------------------------------------------------------
 * Parasha display helpers
 * ------------------------------------------------------------------------- */

const NON_PARSHA_KEYS = [
  'rosh hashana', 'yom kippur', 'sukkot', 'succot', 'pesach', 'passover', 'shavuot',
  'shabbat', 'shabbos', 'chanukah', 'hanukah', 'purim', 'tisha', 'tu bishvat',
  'ראש השנה', 'יום כיפור', 'סוכות', 'פסח', 'שבועות', 'שבת', 'חנוכה', 'פורים', 'תשעה באב', 'ט״ו בשבט',
];

/** Should "פרשת / Parshat " be prefixed to this calendars displayValue? */
export function isParshaName(displayValue) {
  const v = String(displayValue || '').toLowerCase();
  if (!v) return false;
  return !NON_PARSHA_KEYS.some((k) => v.includes(k));
}
