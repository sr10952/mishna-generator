/**
 * settings.js - The canonical settings schema for the Mishna Poster Generator.
 *
 * This module is intentionally DOM-free and side-effect-free so it can be unit
 * tested in Node and reused by the profile manager and the backup/restore
 * pipeline. It owns:
 *   - DEFAULTS: the full default configuration
 *   - normalizeSettings(): forward/backward-compatible deep merge + migration
 *     (missing, invalid, or obsolete fields are safely repaired)
 *   - stripImages(): privacy helper that removes uploaded image data URLs
 *
 * localStorage persistence stays keyed by the historic 'mishna-poster-settings-v1'
 * key (see main.js) so existing users keep their settings. SETTINGS_SCHEMA_VERSION
 * below is a *content* version stamped into exported backups, independent of the
 * storage key, and is used to migrate old backup files on import.
 */

import { getPageSize, FONTS } from './poster.js';

/** Bumped whenever the settings shape changes in a way import must migrate. */
export const SETTINGS_SCHEMA_VERSION = 2;

/** Stable identifier written into backup files so imports can be validated. */
export const APP_ID = 'mishna-poster-generator';

export const WEEKDAY_DISPLAY_STYLES = new Set(['auto', 'he', 'yi', 'en', 'custom', 'none']);
export const YOM_TOV_DISPLAY_STYLES = new Set(['auto', 'he', 'yi', 'en']);
const TEMPLATE_IDS = new Set(['classic', 'modern', 'royal', 'elegant', 'fresh', 'night', 'auto']);
const PAGE_SIZE_IDS = new Set(['letter', 'legal', 'tabloid', 'custom']);
const QUALITY_IDS = new Set(['draft', 'high', 'ultra']);

/**
 * Image fields are uploaded, potentially private data URLs. They are never
 * written into saved profiles or exported backups (see stripImages) so a shared
 * backup file can't leak a private letterhead.
 */
export const IMAGE_FIELDS = ['logoDataUrl', 'bgDataUrl'];

/** Longest string we will accept for any free-text field on import. */
export const MAX_TEXT_LEN = 2000;

/** The fixed project memorial dedication, rendered in the poster footer.
 *  Pure Hebrew (no Latin) so native-Hebrew posters stay Latin-free. */
export const PROJECT_DEDICATION_HE = 'לע״נ אסתר בילא ע״ה בת שמשון צבי ני״ו';

export function makeDefaults() {
  return {
    lang: 'en',
    startDate: isoToday(),
    count: 7,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    skipYomTov: true,
    diaspora: true,
    start: { book: 'Mishnah Bekhorot', chapter: 3, mishna: 2 }, // the example from the brief
    text: {
      language: 'he',
      nikud: true,
      hebrewVersion: 'auto',
      englishVersion: 'auto',
      bartenura: true,
      tosafotYT: false,
      rambam: false,
      commentaryLang: 'he',
    },
    design: {
      template: 'classic',
      autoTemplateSeed: null,
      font: 'frank',
      commentaryFont: 'frank',
      pageSize: 'letter',
      customPageWidth: 8.5,
      customPageHeight: 11,
      accent: '#8a6d3b',
      institution: '',
      dedication: '',
      footerNote: '',
      logoDataUrl: null,
      bgDataUrl: null,
      bgOverlay: 0.85,
      showDailyMishnaBadge: true,
      dailyMishnaBadgeText: '',
      // "auto" keeps the historic date line; Yiddish/custom modes are opt-in.
      weekdayDisplay: 'auto',
      customWeekdayNames: '',
      showYomTovName: false,
      yomTovDisplay: 'auto',
      showDate: true,
      showParsha: true,
      showDayCount: true,
      showRef: true,
      showAttribution: true,
      // The project memorial dedication is on by default; unchecking it in the
      // UI asks for confirmation (see main.js).
      showProjectDedication: true,
      quality: 'high',
    },
  };
}

/** The default configuration (fresh clone each read to avoid shared mutation). */
export const DEFAULTS = Object.freeze(makeDefaults());

function isoToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function clone(v) {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

function asString(v, fallback = '') {
  return typeof v === 'string' ? v.slice(0, MAX_TEXT_LEN) : fallback;
}

function asBool(v, fallback) {
  return typeof v === 'boolean' ? v : fallback;
}

function clampInt(v, min, max, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Deep-merge an arbitrary (possibly hostile / obsolete) settings object onto a
 * fresh copy of DEFAULTS, repairing every field. Never throws; unknown keys are
 * dropped, invalid values fall back to their default.
 *
 * @param {any} raw parsed settings object (or anything)
 * @returns {object} a fully normalized settings object
 */
export function normalizeSettings(raw) {
  const out = makeDefaults();
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const src = { start: {}, text: {}, design: {}, ...s };

  // top level
  out.lang = src.lang === 'he' ? 'he' : 'en';
  if (typeof src.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.startDate)) out.startDate = src.startDate;
  out.count = clampInt(src.count, 1, 30, DEFAULTS.count);
  if (Array.isArray(src.weekdays)) {
    const days = [...new Set(src.weekdays.map((d) => Math.floor(Number(d))).filter((d) => d >= 0 && d <= 6))].sort();
    out.weekdays = days;
  }
  out.skipYomTov = asBool(src.skipYomTov, DEFAULTS.skipYomTov);
  out.diaspora = asBool(src.diaspora, DEFAULTS.diaspora);

  // start ref
  const start = src.start && typeof src.start === 'object' ? src.start : {};
  out.start.book = asString(start.book, DEFAULTS.start.book) || DEFAULTS.start.book;
  out.start.chapter = clampInt(start.chapter, 1, 999, DEFAULTS.start.chapter);
  out.start.mishna = clampInt(start.mishna, 1, 999, DEFAULTS.start.mishna);

  // text
  const text = src.text && typeof src.text === 'object' ? src.text : {};
  out.text.language = text.language === 'en' ? 'en' : 'he';
  out.text.nikud = asBool(text.nikud, DEFAULTS.text.nikud);
  out.text.hebrewVersion = asString(text.hebrewVersion, DEFAULTS.text.hebrewVersion) || DEFAULTS.text.hebrewVersion;
  out.text.englishVersion = asString(text.englishVersion, DEFAULTS.text.englishVersion) || DEFAULTS.text.englishVersion;
  out.text.bartenura = asBool(text.bartenura, DEFAULTS.text.bartenura);
  out.text.tosafotYT = asBool(text.tosafotYT, DEFAULTS.text.tosafotYT);
  out.text.rambam = asBool(text.rambam, DEFAULTS.text.rambam);
  out.text.commentaryLang = text.commentaryLang === 'en' ? 'en' : 'he';

  // design
  const d = src.design && typeof src.design === 'object' ? src.design : {};
  const dd = out.design;
  dd.template = TEMPLATE_IDS.has(d.template) ? d.template : DEFAULTS.design.template;
  dd.autoTemplateSeed = Number.isFinite(Number(d.autoTemplateSeed)) ? Math.floor(Number(d.autoTemplateSeed)) : null;
  dd.font = FONTS[d.font] ? d.font : 'frank';
  // Saved settings predate the separate commentary font. Preserve the historic
  // "one font for everything" behavior when the field is absent/invalid.
  dd.commentaryFont = FONTS[d.commentaryFont] ? d.commentaryFont : (FONTS[dd.font] ? dd.font : 'frank');
  dd.pageSize = PAGE_SIZE_IDS.has(d.pageSize) ? d.pageSize : DEFAULTS.design.pageSize;
  dd.customPageWidth = clampNum(d.customPageWidth, 5, 17, DEFAULTS.design.customPageWidth);
  dd.customPageHeight = clampNum(d.customPageHeight, 5, 17, DEFAULTS.design.customPageHeight);
  // Reuse the poster geometry normalizer so custom dimensions match everywhere.
  const ps = getPageSize({ pageSize: dd.pageSize, customPageWidth: dd.customPageWidth, customPageHeight: dd.customPageHeight });
  dd.pageSize = ps.id;
  if (ps.id === 'custom') { dd.customPageWidth = ps.widthIn; dd.customPageHeight = ps.heightIn; }
  dd.accent = /^#[0-9a-fA-F]{3,8}$/.test(d.accent) ? d.accent : DEFAULTS.design.accent;
  dd.institution = asString(d.institution, '');
  dd.dedication = asString(d.dedication, '');
  dd.footerNote = asString(d.footerNote, '');
  dd.logoDataUrl = safeImageDataUrl(d.logoDataUrl);
  dd.bgDataUrl = safeImageDataUrl(d.bgDataUrl);
  dd.bgOverlay = clampNum(d.bgOverlay, 0.4, 1, DEFAULTS.design.bgOverlay);
  dd.showDailyMishnaBadge = asBool(d.showDailyMishnaBadge, DEFAULTS.design.showDailyMishnaBadge);
  dd.dailyMishnaBadgeText = asString(d.dailyMishnaBadgeText, '');
  dd.weekdayDisplay = WEEKDAY_DISPLAY_STYLES.has(d.weekdayDisplay) ? d.weekdayDisplay : 'auto';
  dd.customWeekdayNames = asString(d.customWeekdayNames, '');
  dd.showYomTovName = d.showYomTovName === true;
  dd.yomTovDisplay = YOM_TOV_DISPLAY_STYLES.has(d.yomTovDisplay) ? d.yomTovDisplay : 'auto';
  dd.showDate = asBool(d.showDate, DEFAULTS.design.showDate);
  dd.showParsha = asBool(d.showParsha, DEFAULTS.design.showParsha);
  dd.showDayCount = asBool(d.showDayCount, DEFAULTS.design.showDayCount);
  dd.showRef = asBool(d.showRef, DEFAULTS.design.showRef);
  dd.showAttribution = asBool(d.showAttribution, DEFAULTS.design.showAttribution);
  dd.showProjectDedication = asBool(d.showProjectDedication, DEFAULTS.design.showProjectDedication);
  dd.quality = QUALITY_IDS.has(d.quality) ? d.quality : DEFAULTS.design.quality;

  return out;
}

/**
 * Only accept image values that are genuine, inert image data URLs. This blocks
 * javascript:, data:text/html, SVG-with-script and other executable payloads
 * that could ride in through an imported backup or a tampered profile.
 */
export function safeImageDataUrl(v) {
  if (typeof v !== 'string') return null;
  const m = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/.exec(v.trim());
  if (!m) return null;
  // Reject SVG payloads that smuggle script/handlers even when base64-wrapped.
  if (m[1] === 'svg+xml') {
    try {
      const decoded = typeof atob === 'function'
        ? atob(v.split(',')[1])
        : Buffer.from(v.split(',')[1], 'base64').toString('utf8');
      if (/<script|on\w+\s*=|javascript:/i.test(decoded)) return null;
    } catch { return null; }
  }
  return v;
}

/** Return a deep clone of settings with all uploaded image data removed. */
export function stripImages(settings) {
  const c = clone(settings);
  if (c && c.design) for (const k of IMAGE_FIELDS) c.design[k] = null;
  return c;
}
