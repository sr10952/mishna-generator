/**
 * poster.js - Builds a US Letter or Legal poster page for a single mishna,
 * with built-in and randomized templates, uploaded letterhead/logo &
 * background images, and automatic text fitting so that the whole mishna
 * (plus selected commentaries) always fits on ONE page.
 *
 * The same DOM is used for the on-screen preview and for the PDF raster, so
 * the preview is exactly what gets printed.
 */

import { MISHNAH, findMasechet, COMMENTARIES } from './mishnah-index.js';
import {
  gematria, formatHebrewDate, formatGregorianDate, formatWeekday, parseISODate,
  formatRefTitle, sanitizeText, stripNikud, isParshaName, masechetHeName,
} from './hebrew.js';
import { STRINGS } from './i18n.js';

/**
 * Physical poster formats. The raster dimensions are based on CSS's 96 px/in
 * so a 2x/3x/4x html2canvas render remains 192/288/384 DPI for either format.
 * Keep the Letter constants below for callers that imported them before Legal
 * support was added.
 */
export const PAGE_SIZES = Object.freeze({
  letter: Object.freeze({
    id: 'letter',
    width: 816, // 8.5in * 96
    height: 1056, // 11in * 96
    widthIn: 8.5,
    heightIn: 11,
    widthPt: 612,
    heightPt: 792,
    pdfFormat: 'letter',
    printFormat: 'letter',
  }),
  legal: Object.freeze({
    id: 'legal',
    width: 816, // 8.5in * 96
    height: 1344, // 14in * 96
    widthIn: 8.5,
    heightIn: 14,
    widthPt: 612,
    heightPt: 1008,
    pdfFormat: 'legal',
    printFormat: 'legal',
  }),
});

/** Return a supported size, safely falling back for old/invalid saved data. */
export function getPageSize(size) {
  return PAGE_SIZES[size] || PAGE_SIZES.letter;
}

/** Resolve the format carried by a rendered poster element. */
export function getPageSizeForElement(page) {
  return getPageSize(page && page.dataset ? page.dataset.pageSize : null);
}

// Legacy/default Letter exports. New rendering code should use getPageSize().
export const PAGE_W = PAGE_SIZES.letter.width;
export const PAGE_H = PAGE_SIZES.letter.height;

export const FONTS = {
  frank: { css: "'Frank Ruhl Libre', 'David Libre', Georgia, serif", i18nKey: 'fontFrank' },
  david: { css: "'David Libre', 'Frank Ruhl Libre', Georgia, serif", i18nKey: 'fontDavid' },
  miriam: { css: "'Miriam Libre', 'Heebo', sans-serif", i18nKey: 'fontMiriam' },
  heebo: { css: "'Heebo', 'Miriam Libre', sans-serif", i18nKey: 'fontHeebo' },
};

export const TEMPLATES = [
  {
    id: 'classic', cls: 'tpl-classic',
    labelEn: 'Classic Parchment', labelHe: 'קלאסי - קלף',
    accent: '#8a6d3b',
  },
  {
    id: 'modern', cls: 'tpl-modern',
    labelEn: 'Modern Minimal', labelHe: 'מודרני מינימלי',
    accent: '#2563eb',
  },
  {
    id: 'royal', cls: 'tpl-royal',
    labelEn: 'Royal Blue & Gold', labelHe: 'מלכותי - כחול וזהב',
    accent: '#c9a227',
  },
  {
    id: 'elegant', cls: 'tpl-elegant',
    labelEn: 'Elegant Ivory', labelHe: 'אלגנטי - שנהב',
    accent: '#111111',
  },
  {
    id: 'fresh', cls: 'tpl-fresh',
    labelEn: 'Fresh Garden', labelHe: 'טרי - ירוק',
    accent: '#15803d',
  },
  {
    id: 'night', cls: 'tpl-night',
    labelEn: 'Night Learning', labelHe: 'לימוד לילה - כהה',
    accent: '#fca311',
  },
];

/** Curated palettes for the "Surprise me" auto-generated templates. */
const PALETTES = [
  { bg: '#fdf8ec', ink: '#3a2c14', accent: '#8a6d3b', muted: '#7c6a4d', frame: '#6b4f2a' },
  { bg: '#ffffff', ink: '#1f2937', accent: '#2563eb', muted: '#6b7280', frame: '#dbe3ef' },
  { bg: '#fbfaf7', ink: '#141414', accent: '#9f1239', muted: '#6f6f6f', frame: '#141414' },
  { bg: '#f4f9f4', ink: '#14301c', accent: '#15803d', muted: '#5f7266', frame: '#2f6b43' },
  { bg: '#fdf6f3', ink: '#3b241c', accent: '#b45309', muted: '#8a6f62', frame: '#92603c' },
  { bg: '#f5f3ff', ink: '#2a2244', accent: '#6d28d9', muted: '#6e6787', frame: '#4c3f80' },
  { bg: '#14213d', ink: '#f1f5f9', accent: '#fca311', muted: '#a9b4c9', frame: '#fca311' },
  { bg: '#1c1917', ink: '#faf7f2', accent: '#d4a24e', muted: '#b8ada0', frame: '#d4a24e' },
];

/** Random (auto-generated) template - deterministic per seed so previews stay stable. */
export function randomTemplate(seed) {
  let r = (seed || Date.now()) % 100000;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const pal = PALETTES[Math.floor(rand() * PALETTES.length)];
  const fonts = Object.keys(FONTS);
  const font = fonts[Math.floor(rand() * fonts.length)];
  const frameStyles = ['solid', 'double'];
  return {
    id: `auto-${seed || 0}`,
    cls: 'tpl-auto',
    labelEn: 'Auto-generated', labelHe: 'נוצר אוטומטית',
    accent: pal.accent,
    palette: pal,
    font,
    frame: frameStyles[Math.floor(rand() * frameStyles.length)],
  };
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build one poster page element.
 *
 * @param {object} p
 * @param {object} p.entry       {date, book, chapter, mishna}
 * @param {object} p.textData    {paragraphs, versionTitle, versionTitleInHebrew, license}
 * @param {Array}  p.commentaries [{key, paragraphs, versionTitle}]
 * @param {object} p.calendar    {parsha:{en,he}|null}
 * @param {number} p.index       1-based day number
 * @param {number} p.total       total days
 * @param {object} p.settings    full app settings (text + design options)
 * @param {string} p.lang        poster language ('he' | 'en')
 */
export function buildPosterPage({ entry, textData, commentaries, calendar, index, total, settings, lang }) {
  const he = lang === 'he';
  const design = settings.design;
  const pageSize = getPageSize(design.pageSize);
  const masechet = findMasechet(entry.book);
  const template = design.templateDef || TEMPLATES[0];
  const date = parseISODate(entry.date);

  const page = el('div', `poster-page ${template.cls} poster-${he ? 'he' : 'en'}`);
  page.dir = he ? 'rtl' : 'ltr';
  page.lang = he ? 'he' : 'en';
  page.style.setProperty('--pg-accent', design.accent || template.accent);
  if (template.palette) {
    for (const [k, v] of Object.entries(template.palette)) page.style.setProperty(`--pg-${k}`, v);
  }
  if (design.frame) page.style.setProperty('--pg-frame-style', design.frame);
  page.style.setProperty('--pg-font', (FONTS[design.font] || FONTS.frank).css);
  page.style.setProperty('--pg-comm-font', (FONTS[design.commentaryFont] || FONTS[design.font] || FONTS.frank).css);
  page.style.setProperty('--pg-page-width', `${pageSize.width}px`);
  page.style.setProperty('--pg-page-height', `${pageSize.height}px`);
  page.dataset.ref = `${entry.book} ${entry.chapter}:${entry.mishna}`;
  page.dataset.page = String(index);
  page.dataset.pageSize = pageSize.id;
  page.dataset.pageWidth = String(pageSize.width);
  page.dataset.pageHeight = String(pageSize.height);

  // --- background layers -----------------------------------------------
  if (design.bgDataUrl) {
    page.appendChild(el('div', 'pg-bg')).style.backgroundImage = `url(${design.bgDataUrl})`;
    const overlay = el('div', 'pg-overlay');
    overlay.style.setProperty('--pg-overlay-alpha', String(design.bgOverlay ?? 0.85));
    page.appendChild(overlay);
  }
  page.appendChild(el('div', 'pg-frame pg-frame-outer'));
  page.appendChild(el('div', 'pg-frame pg-frame-inner'));

  // --- content column ----------------------------------------------------
  const content = el('div', 'pg-content');
  page.appendChild(content);

  // letterhead
  const head = el('header', 'pg-head');
  if (design.logoDataUrl) {
    const img = el('img', 'pg-logo');
    img.src = design.logoDataUrl;
    img.alt = '';
    head.appendChild(img);
  }
  if (design.institution) {
    head.appendChild(el('div', 'pg-inst', esc(design.institution)));
  }
  if (design.dedication) {
    head.appendChild(el('div', 'pg-dedication', esc(design.dedication)));
  }
  if (head.childElementCount) content.appendChild(head);

  // info bar: weekday + hebrew date + parsha + day count
  const showDate = design.showDate !== false;
  const showParsha = design.showParsha !== false;
  const infoBits = [];
  if (showDate) {
    infoBits.push(`${he ? formatWeekday(date, 'he') : formatWeekday(date, 'en')} · ${formatHebrewDate(date, he ? 'he' : 'en')}`);
  }
  if (showParsha && calendar && calendar.parsha) {
    const raw = he ? calendar.parsha.he : calendar.parsha.en;
    const prefix = he ? 'פרשת ' : 'Parshat ';
    infoBits.push(`${isParshaName(raw) ? prefix : ''}${raw}`);
  }
  if (design.showDayCount !== false) {
    infoBits.push(he ? `יום ${gematria(index)} מתוך ${gematria(total)}` : `Day ${index} of ${total}`);
  }
  // The badge is optional and its text is intentionally independent from the
  // UI language: an institution may use its own Hebrew/English program name.
  // Legacy saved settings do not have this field, so they retain the badge.
  const showDailyMishnaBadge = design.showDailyMishnaBadge !== false;
  const S = STRINGS[he ? 'he' : 'en'];
  const dailyMishnaBadgeText = String(design.dailyMishnaBadgeText || '').trim() || S.dailyMishna;
  if (showDailyMishnaBadge || infoBits.length) {
    const info = el('div', 'pg-info');
    if (showDailyMishnaBadge) info.appendChild(el('span', 'pg-badge', esc(dailyMishnaBadgeText)));
    for (const b of infoBits) info.appendChild(el('span', 'pg-info-bit', esc(b)));
    content.appendChild(info);
  }

  // mishna reference title
  if (design.showRef !== false && masechet) {
    content.appendChild(el('h2', 'pg-ref', esc(formatRefTitle(masechet, entry.chapter, entry.mishna, he ? 'he' : 'en'))));
  }

  // main text area (auto-fitted)
  const main = el('div', 'pg-main');
  const textEl = el('div', 'pg-text');
  const applyNikud = (s) => (settings.text.nikud ? s : stripNikud(s));
  for (const p of textData.paragraphs) {
    textEl.appendChild(el('p', null, sanitizeText(applyNikud(p))));
  }
  main.appendChild(textEl);

  // commentaries
  const commWrap = el('div', 'pg-commentary');
  for (const c of commentaries) {
    if (!c || !c.paragraphs || !c.paragraphs.length) continue;
    const def = COMMENTARIES[c.key];
    const block = el('section', `pg-comm-block pg-comm-${c.key}`);
    block.appendChild(el('h3', 'pg-comm-label', esc(he ? def.labelHe : def.labelEn)));
    const ctext = el('div', 'pg-comm-text');
    for (const p of c.paragraphs) {
      ctext.appendChild(el('p', null, sanitizeText(applyNikud(p))));
    }
    block.appendChild(ctext);
    commWrap.appendChild(block);
  }
  if (commWrap.childElementCount) main.appendChild(commWrap);
  content.appendChild(main);

  // footer: custom note + attribution + page number
  const foot = el('footer', 'pg-foot');
  const footLeft = el('div', 'pg-foot-note');
  if (design.footerNote) footLeft.appendChild(el('span', null, esc(design.footerNote)));
  const sourceBits = [];
  if (textData) {
    const vt = he && textData.versionTitleInHebrew ? textData.versionTitleInHebrew : textData.versionTitle;
    if (vt && design.showAttribution !== false) sourceBits.push(he ? `טקסט: ${vt}` : `Text: ${vt}`);
  }
  if (design.showAttribution !== false) sourceBits.push(he ? 'באדיבות ספריא' : 'Sefaria.org');
  if (sourceBits.length) footLeft.appendChild(el('span', 'pg-attr', esc(sourceBits.join(he ? ' · ' : ' · '))));
  if (footLeft.childElementCount) foot.appendChild(footLeft);
  // Posters are intentionally independent handouts, not a bound document, so
  // do not add a page N of M marker to their footer.
  content.appendChild(foot);

  return page;
}

/**
 * Auto-fit mishna and commentary independently.
 *
 * Commentary used to have fixed child font sizes in CSS. Changing the
 * wrapper's font size therefore did nothing, so the mishna kept shrinking
 * while an over-large commentary was eventually clipped by .pg-main. Here we
 * deliberately reduce commentary first, then reduce the mishna only when the
 * commentary has reached its readable floor. Commentary is never allowed to
 * exceed 80% of the actual mishna size.
 *
 * Returns the applied mishna scale (relative to the 33px base), preserving
 * the old public return shape. Per-region values are also exposed as data
 * attributes for diagnostics and tests.
 */
export function autofitPage(page, { userScale = 1 } = {}) {
  const main = page.querySelector('.pg-main');
  const textEl = page.querySelector('.pg-text');
  const commEl = page.querySelector('.pg-commentary');
  if (!main || !textEl) return 1;

  const BASE_TEXT = 33;
  const BASE_COMM = 16;
  // These are physical-pixel floors, not scale floors: a user may request a
  // smaller starting scale, but automatic fitting never needlessly goes below
  // these readable last-resort values.
  const MIN_TEXT = 11;
  const MIN_COMM = 8;
  const COMM_MAX_RATIO = 0.8;
  const START_SCALE = 1.06;
  const MAX_SCALE = 1.25;
  const EPSILON = 0.015;
  const scaleInput = Number.isFinite(Number(userScale)) && Number(userScale) > 0 ? Number(userScale) : 1;
  const startText = BASE_TEXT * START_SCALE * scaleInput;
  const maxText = BASE_TEXT * MAX_SCALE * scaleInput;
  const minText = Math.min(startText, MIN_TEXT);

  const capCommentary = (wanted, textSize) => Math.min(wanted, textSize * COMM_MAX_RATIO);
  const startComm = capCommentary(BASE_COMM * START_SCALE * scaleInput, startText);
  const minComm = Math.min(startComm, MIN_COMM);

  let appliedText = startText;
  let appliedComm = commEl ? startComm : 0;
  const px = (value) => Math.round(value * 100) / 100;

  const apply = (textSize, commentarySize = 0) => {
    appliedText = px(textSize);
    textEl.style.fontSize = `${appliedText}px`;
    textEl.style.lineHeight = String(1.55 + 0.32 * Math.min(1, appliedText / BASE_TEXT));
    if (commEl) {
      // The cap is applied every time, including at the hard floor, so custom
      // commentary fonts can never render larger than the mishna. Rounding
      // the cap downward keeps the *rendered* CSS value at or below 80% too.
      const cap = Math.floor(appliedText * COMM_MAX_RATIO * 100) / 100;
      appliedComm = Math.min(px(capCommentary(commentarySize, appliedText)), cap);
      commEl.style.fontSize = `${appliedComm}px`;
      commEl.style.lineHeight = String(1.5 + 0.25 * Math.min(1, appliedComm / BASE_COMM));
    }
  };
  const fits = () => main.scrollHeight <= main.clientHeight + 2;
  const finish = () => {
    const fit = fits();
    page.dataset.textScale = (appliedText / BASE_TEXT).toFixed(3);
    if (commEl) page.dataset.commentaryScale = (appliedComm / BASE_COMM).toFixed(3);
    else delete page.dataset.commentaryScale;
    const atFloor = appliedText <= minText + EPSILON || !!(commEl && appliedComm <= minComm + EPSILON);
    page.dataset.fitAtFloor = atFloor ? 'true' : 'false';
    page.dataset.fitOverflow = fit ? '0' : '1';
    return appliedText / BASE_TEXT;
  };

  // Search from the first known-fitting candidate toward the largest one.
  // `applyCandidate` must synchronously apply its value before `fits()` reads
  // layout, which is true for style writes in a live DOM.
  const largestThatFits = (low, high, applyCandidate) => {
    let lo = low;
    let hi = high;
    while (hi - lo > EPSILON) {
      const mid = (lo + hi) / 2;
      applyCandidate(mid);
      if (fits()) lo = mid;
      else hi = mid;
    }
    applyCandidate(lo);
    return lo;
  };

  apply(startText, startComm);
  if (fits()) {
    // Short content gets the same pleasant enlargement as before. Grow both
    // regions proportionally while keeping the 80% commentary ceiling.
    const applyGrowing = (textSize) => apply(
      textSize,
      capCommentary(BASE_COMM * (textSize / BASE_TEXT), textSize),
    );
    applyGrowing(maxText);
    if (fits()) return finish();
    largestThatFits(startText, maxText, applyGrowing);
    return finish();
  }

  if (commEl) {
    // First spend available space on the commentary. This is the important
    // ordering: a long commentary no longer forces the mishna to become tiny
    // while the commentary is left at a CSS-pinned size.
    apply(startText, minComm);
    if (fits()) {
      largestThatFits(minComm, startComm, (commSize) => apply(startText, commSize));
      return finish();
    }
  }

  // Commentary is at its floor (or absent). Only now compact the mishna. The
  // commentary stays at its floor unless the 80% cap needs it even smaller.
  const commentaryAtText = (textSize) => commEl ? capCommentary(minComm, textSize) : 0;
  const applyShrinking = (textSize) => apply(textSize, commentaryAtText(textSize));
  applyShrinking(minText);
  if (fits()) {
    largestThatFits(minText, startText, applyShrinking);
  }
  // If truly extraordinary content still cannot fit at both explicit floors,
  // keep those explicit floors and flag the exceptional condition. The caller
  // can surface it rather than silently presenting a half-fitted layout.
  return finish();
}

/** Warm up the fonts used by a page so html2canvas measures real glyphs. */
export async function ensureFontsLoaded(design) {
  const primaryFont = FONTS[design.font] ? design.font : 'frank';
  const commentaryFont = FONTS[design.commentaryFont] ? design.commentaryFont : primaryFont;
  const fontKeys = new Set([primaryFont, commentaryFont]);
  const loads = [];
  for (const key of fontKeys) {
    const fam = (FONTS[key] || FONTS.frank).css;
    const family = fam.split(',')[0].replace(/'/g, '');
    for (const spec of [`400 20px ${family}`, `700 20px ${family}`, `900 20px ${family}`]) {
      try { loads.push(document.fonts.load(spec, 'אA')); } catch { /* older browsers */ }
    }
  }
  await Promise.all(loads).catch(() => {});
  try { await document.fonts.ready; } catch { /* ignore */ }
}
