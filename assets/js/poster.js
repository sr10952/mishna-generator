/**
 * poster.js - Builds a Letter-size (8.5in x 11in @96dpi = 816x1056px) poster
 * page for a single mishna, with built-in and randomized templates, uploaded
 * letterhead/logo & background images, and automatic text fitting so that the
 * whole mishna (plus selected commentaries) always fits on ONE page.
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

export const PAGE_W = 816; // 8.5in * 96
export const PAGE_H = 1056; // 11in * 96

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
  page.dataset.ref = `${entry.book} ${entry.chapter}:${entry.mishna}`;
  page.dataset.page = String(index);

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
  if (infoBits.length) {
    const info = el('div', 'pg-info');
    const S = STRINGS[he ? 'he' : 'en'];
    info.appendChild(el('span', 'pg-badge', S.dailyMishna));
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
  if (total > 0) {
    foot.appendChild(el('div', 'pg-pageno', he ? `${gematria(index)} / ${gematria(total)}` : `${index} / ${total}`));
  }
  content.appendChild(foot);

  return page;
}

/**
 * Auto-fit: shrink the mishna text & commentaries until everything fits in
 * the page. Returns the applied scale (1 = no shrink needed).
 */
export function autofitPage(page, { userScale = 1 } = {}) {
  const main = page.querySelector('.pg-main');
  const textEl = page.querySelector('.pg-text');
  const commEl = page.querySelector('.pg-commentary');
  if (!main || !textEl) return 1;

  const BASE_TEXT = 33;
  const BASE_COMM = 16;

  let scale = 1.06 * userScale;
  const minScale = 0.42 * Math.min(1, userScale);
  const apply = (s) => {
    textEl.style.fontSize = `${(BASE_TEXT * s).toFixed(1)}px`;
    textEl.style.lineHeight = String(1.55 + 0.32 * Math.min(1, s)); // slightly tighter when shrunk
    if (commEl) {
      commEl.style.fontSize = `${(BASE_COMM * s).toFixed(1)}px`;
      commEl.style.lineHeight = String(1.5 + 0.25 * Math.min(1, s));
    }
  };
  const fits = () => main.scrollHeight <= main.clientHeight + 2;

  apply(scale);
  // binary search between minScale and current scale
  let lo = minScale;
  let hi = scale;
  if (fits()) {
    // try growing a bit for short mishnas
    hi = 1.25 * userScale;
    apply(hi);
    if (fits()) return hi;
    while (hi - lo > 0.02) {
      const mid = (lo + hi) / 2;
      apply(mid);
      if (fits()) lo = mid; else hi = mid;
    }
    apply(lo);
    return lo;
  }
  while (hi - lo > 0.015) {
    const mid = (lo + hi) / 2;
    apply(mid);
    if (fits()) lo = mid; else hi = mid;
  }
  apply(Math.max(lo, minScale));
  return Math.max(lo, minScale);
}

/** Warm up the fonts used by a page so html2canvas measures real glyphs. */
export async function ensureFontsLoaded(design) {
  const fam = (FONTS[design.font] || FONTS.frank).css;
  const family = fam.split(',')[0].replace(/'/g, '');
  const loads = [];
  for (const spec of [`400 20px ${family}`, `700 20px ${family}`, `900 20px ${family}`]) {
    try { loads.push(document.fonts.load(spec, 'אA')); } catch { /* older browsers */ }
  }
  await Promise.all(loads).catch(() => {});
  try { await document.fonts.ready; } catch { /* ignore */ }
}
