/**
 * poster.js - Builds a selected physical-size poster page for a single mishna,
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
  formatRefTitle, sanitizeText, stripNikud, isParshaName, isHolidayParsha, masechetHeName,
  getYomTovInfo, formatYomTovInfo,
} from './hebrew.js';
import { STRINGS } from './i18n.js';
import { PROJECT_DEDICATION_HE } from './settings.js';

/**
 * Physical poster formats. The raster dimensions are based on CSS's 96 px/in
 * so a 2x/3x/4x html2canvas render remains 192/288/384 DPI for every format.
 * Custom values deliberately use familiar single-sheet printer limits: five
 * through seventeen inches on either side, including Tabloid's 11 × 17 format.
 */
const CSS_PIXELS_PER_INCH = 96;
const POINTS_PER_INCH = 72;
export const CUSTOM_PAGE_MIN_IN = 5;
export const CUSTOM_PAGE_MAX_IN = 17;
export const CUSTOM_PAGE_DEFAULT_WIDTH_IN = 8.5;
export const CUSTOM_PAGE_DEFAULT_HEIGHT_IN = 11;

function roundedInches(value) {
  return Math.round(value * 100) / 100;
}

function printableInches(value) {
  return String(roundedInches(value));
}

/** Clamp a manual dimension to the supported range, preserving 0.01in input. */
export function clampCustomPageDimension(value, fallback) {
  const parsed = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) && Number(fallback) > 0
    ? Number(fallback)
    : CUSTOM_PAGE_DEFAULT_WIDTH_IN;
  const usable = Number.isFinite(parsed) && parsed > 0 ? parsed : safeFallback;
  return roundedInches(Math.max(CUSTOM_PAGE_MIN_IN, Math.min(CUSTOM_PAGE_MAX_IN, usable)));
}

function presetPageSize(id, widthIn, heightIn, pdfFormat) {
  return Object.freeze({
    id,
    width: widthIn * CSS_PIXELS_PER_INCH,
    height: heightIn * CSS_PIXELS_PER_INCH,
    widthIn,
    heightIn,
    widthPt: widthIn * POINTS_PER_INCH,
    heightPt: heightIn * POINTS_PER_INCH,
    pdfFormat,
    // Explicit inches work in browser print engines that do not support all
    // North American named CSS page sizes (notably Tabloid).
    printFormat: `${printableInches(widthIn)}in ${printableInches(heightIn)}in`,
    orientation: 'portrait',
  });
}

/** Create a custom CSS/print/PDF format from user-selected inches. */
function customPageSize(width, height) {
  const widthIn = clampCustomPageDimension(width, CUSTOM_PAGE_DEFAULT_WIDTH_IN);
  const heightIn = clampCustomPageDimension(height, CUSTOM_PAGE_DEFAULT_HEIGHT_IN);
  return {
    id: 'custom',
    width: widthIn * CSS_PIXELS_PER_INCH,
    height: heightIn * CSS_PIXELS_PER_INCH,
    widthIn,
    heightIn,
    widthPt: widthIn * POINTS_PER_INCH,
    heightPt: heightIn * POINTS_PER_INCH,
    // jsPDF accepts [width, height] in the selected unit for arbitrary pages.
    pdfFormat: [widthIn * POINTS_PER_INCH, heightIn * POINTS_PER_INCH],
    // CSS @page accepts explicit dimensions and preserves a landscape choice.
    printFormat: `${printableInches(widthIn)}in ${printableInches(heightIn)}in`,
    orientation: widthIn > heightIn ? 'landscape' : 'portrait',
  };
}

export const PAGE_SIZES = Object.freeze({
  letter: presetPageSize('letter', 8.5, 11, 'letter'),
  legal: presetPageSize('legal', 8.5, 14, 'legal'),
  tabloid: presetPageSize('tabloid', 11, 17, 'tabloid'),
});

/**
 * Return a supported preset or a normalized manual format. Pass either a
 * size id or the full design object containing pageSize/customPageWidth/
 * customPageHeight. Invalid preset ids become Letter; custom dimensions are normalized.
 */
export function getPageSize(sizeOrDesign, customDimensions = {}) {
  const design = sizeOrDesign && typeof sizeOrDesign === 'object'
    ? sizeOrDesign
    : { pageSize: sizeOrDesign, ...(customDimensions || {}) };
  if (design.pageSize === 'custom') {
    return customPageSize(
      design.customPageWidth ?? design.width,
      design.customPageHeight ?? design.height,
    );
  }
  return PAGE_SIZES[design.pageSize] || PAGE_SIZES.letter;
}

/** Resolve the exact format carried by a rendered poster element. */
export function getPageSizeForElement(page) {
  const data = page && page.dataset ? page.dataset : {};
  if (data.pageSize === 'custom') {
    return getPageSize({
      pageSize: 'custom',
      customPageWidth: data.pageWidthIn ?? (Number(data.pageWidth) / CSS_PIXELS_PER_INCH),
      customPageHeight: data.pageHeightIn ?? (Number(data.pageHeight) / CSS_PIXELS_PER_INCH),
    });
  }
  return getPageSize(data.pageSize);
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

/** Parse Sunday-to-Shabbos labels supplied in the optional custom field. */
function customWeekdayLabels(value) {
  return String(value ?? '')
    .split(/[,;|]+/)
    .map((label) => label.trim());
}

/**
 * Resolve the visible weekday independently from the poster text language.
 * Saved settings without this field retain the existing "match poster" output.
 */
function formatPosterWeekday(date, design, he) {
  const style = design.weekdayDisplay || 'auto';
  if (style === 'none') return '';
  if (style === 'custom') {
    const custom = customWeekdayLabels(design.customWeekdayNames);
    return custom[date.getDay()] || formatWeekday(date, he ? 'he' : 'en');
  }
  if (style === 'yi' || style === 'yiddish') return formatWeekday(date, 'yi');
  if (style === 'he' || style === 'en') return formatWeekday(date, style);
  return formatWeekday(date, he ? 'he' : 'en');
}

/** The automatic holiday wording follows a selected Yiddish weekday, if any. */
function yomTovDisplayLanguage(design, he) {
  const style = design.yomTovDisplay || 'auto';
  if (style === 'yi' || style === 'yiddish' || style === 'he' || style === 'en') return style;
  if (design.weekdayDisplay === 'yi' || design.weekdayDisplay === 'yiddish') return 'yi';
  return he ? 'he' : 'en';
}

/* ---------------------------------------------------------------------------
 * Shared poster geometry
 * ------------------------------------------------------------------------- */

/** Auto-fit typography constants (CSS px). BASE_TEXT is the design size for
 *  the mishna body; everything else scales from it. */
const BASE_TEXT = 33;
const BASE_COMM = 16;
const MIN_COMM = 8;
const COMM_MAX_RATIO = 0.8;
const START_SCALE = 1.06;
// Historic hard floor used when a caller does not supply a user preference.
const MIN_TEXT_DEFAULT = 11;

/** inches -> CSS px at the 96 px/in poster grid */
function pxFromInches(value) {
  const n = Number(value);
  return Math.round((Number.isFinite(n) ? n : 0) * CSS_PIXELS_PER_INCH);
}

function commentaryPxFor(textPx) {
  // The commentary stays proportional to the mishna (16px @ 33px), never above
  // 80% of it, and never below its own readable floor.
  return Math.min(textPx * COMM_MAX_RATIO, Math.max(MIN_COMM, textPx * (BASE_COMM / BASE_TEXT)));
}

function setPageSizeData(page, pageSize) {
  page.dataset.pageSize = pageSize.id;
  page.dataset.pageWidth = String(pageSize.width);
  page.dataset.pageHeight = String(pageSize.height);
  page.dataset.pageWidthIn = String(pageSize.widthIn);
  page.dataset.pageHeightIn = String(pageSize.heightIn);
}

/**
 * Create the reusable poster page shell (background layers, decorative
 * frames, typography variables, margins) plus its content column. The caller
 * fills .pg-content and returns a fully dressed element.
 */
function createPageShell({ settings, pageSize, template, he, layoutMode }) {
  const design = settings.design;
  const page = el('div', `poster-page ${template.cls} poster-${he ? 'he' : 'en'} layout-${layoutMode}`);
  page.dir = he ? 'rtl' : 'ltr';
  page.lang = he ? 'he' : 'en';
  page.dataset.layout = layoutMode;
  page.style.setProperty('--pg-accent', design.accent || template.accent);
  if (template.palette) {
    for (const [k, v] of Object.entries(template.palette)) page.style.setProperty(`--pg-${k}`, v);
  }
  if (design.frame) page.style.setProperty('--pg-frame-style', design.frame);
  page.style.setProperty('--pg-font', (FONTS[design.font] || FONTS.frank).css);
  page.style.setProperty('--pg-comm-font', (FONTS[design.commentaryFont] || FONTS[design.font] || FONTS.frank).css);
  page.style.setProperty('--pg-page-width', `${pageSize.width}px`);
  page.style.setProperty('--pg-page-height', `${pageSize.height}px`);

  // Text margins: the distance the content column keeps from each page edge.
  // These complement the page size so pre-printed templates / drawn-over
  // artwork can reserve their own gutters.
  page.style.setProperty('--pg-mt', `${pxFromInches(design.marginTop)}px`);
  page.style.setProperty('--pg-mr', `${pxFromInches(design.marginRight)}px`);
  page.style.setProperty('--pg-mb', `${pxFromInches(design.marginBottom)}px`);
  page.style.setProperty('--pg-ml', `${pxFromInches(design.marginLeft)}px`);

  // Justify / centered body text (auto keeps the per-language default).
  if (design.textAlign && design.textAlign !== 'auto') page.dataset.align = design.textAlign;
  // Commentary flow: paragraphs run inline (sefarim-style) or block lines.
  page.classList.add(design.commLayout === 'blocks' ? 'comm-blocks' : 'comm-flow');

  setPageSizeData(page, pageSize);

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
  return { page, content };
}

/** Letterhead block (logo / institution / dedication) or null when empty. */
function buildPosterHead(design) {
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
  return head.childElementCount ? head : null;
}

/** The weekly parasha, already prefixed and holiday-filtered, or ''. */
function posterParshaText({ design, he, calendar }) {
  if (design.showParsha === false || !calendar || !calendar.parsha) return '';
  const raw = he ? calendar.parsha.he : calendar.parsha.en;
  // A holiday reading may be returned in the weekly-parasha slot (for
  // example "סוכות חג ראשון"). Suppress it rather than duplicating or
  // misleading the date information shown immediately beside it.
  if (!raw || isHolidayParsha(raw)) return '';
  const prefix = he ? 'פרשת ' : 'Parshat ';
  return `${isParshaName(raw) ? prefix : ''}${raw}`;
}

/**
 * Poster info bar: badge (optional) + weekday · parasha + Hebrew date +
 * holiday + mishna reference + day count.
 *
 * Bits are ordered so the pieces that belong together never get separated by
 * a wrap: the weekday and the weekly parasha share one bit (the parasha
 * follows the weekday directly), and the Hebrew date is its own bit instead of
 * sitting between the two.
 */
function buildPosterInfo({ date, design, he, calendar, index, total, settings, showBadge, masechet, chapter, mishna }) {
  const infoBits = [];
  const push = (text, cls) => { if (text) infoBits.push({ text, cls }); };

  const weekdayText = design.showDate === false ? '' : formatPosterWeekday(date, design, he);
  const dateText = design.showDate === false ? '' : formatHebrewDate(date, he ? 'he' : 'en');
  push([weekdayText, posterParshaText({ design, he, calendar })].filter(Boolean).join(' · '));
  push(dateText);
  if (design.showYomTovName === true) {
    // Main.js stores the per-entry value so all generated output is stable,
    // even if the weekly calendar request failed. Keep this fallback for
    // direct callers and legacy entry data.
    const yomTov = (calendar && calendar.yomTov) || getYomTovInfo(date, {
      diaspora: settings.diaspora !== false,
    });
    push(formatYomTovInfo(yomTov, {
      lang: yomTovDisplayLanguage(design, he),
    }));
  }
  // The mishna reference rides along in the same line as the date details
  // instead of taking a heading of its own above the text.
  if (design.showRef !== false && masechet) {
    push(formatRefTitle(masechet, chapter, mishna, he ? 'he' : 'en'), 'pg-ref');
  }
  if (design.showDayCount !== false) {
    push(he ? `יום ${gematria(index)} מתוך ${gematria(total)}` : `Day ${index} of ${total}`);
  }
  // The badge is optional and its text is intentionally independent from the
  // UI language: an institution may use its own Hebrew/English program name.
  // Legacy saved settings do not have this field, so they retain the badge.
  const badgeOn = showBadge && design.showDailyMishnaBadge !== false;
  if (!badgeOn && !infoBits.length) return null;
  const S = STRINGS[he ? 'he' : 'en'];
  const info = el('div', 'pg-info');
  if (badgeOn) {
    const dailyMishnaBadgeText = String(design.dailyMishnaBadgeText || '').trim() || S.dailyMishna;
    info.appendChild(el('span', 'pg-badge', esc(dailyMishnaBadgeText)));
  }
  for (const b of infoBits) {
    info.appendChild(el('span', b.cls ? `pg-info-bit ${b.cls}` : 'pg-info-bit', esc(b.text)));
  }
  return info;
}

/** One commentary unit may not be the same as one line of print: "flowing"
 *  mode joins every דיבור המתחיל of a commentary into a single running
 *  paragraph (separated by ·), exactly like a sefer's running commentary.
 *  Block mode keeps one paragraph per unit, each starting its own line. */
function commentaryParagraphs(c, design, applyNikud) {
  const paras = c.paragraphs.map((p) => sanitizeText(applyNikud(p))).filter(Boolean);
  if (!paras.length) return [];
  if (design.commLayout === 'blocks') {
    return paras.map((p) => el('p', null, p));
  }
  return [el('p', null, paras.join(' · '))];
}

/** The scrollable body: mishna paragraphs + each selected commentary block. */
function buildPosterMain({ design, textData, commentaries, settings, he }) {
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
    for (const p of commentaryParagraphs(c, design, applyNikud)) ctext.appendChild(p);
    block.appendChild(ctext);
    commWrap.appendChild(block);
  }
  if (commWrap.childElementCount) main.appendChild(commWrap);
  return main;
}

/** Poster footer: custom note + Sefaria attribution + project dedication. */
function buildPosterFoot({ design, textData, he }) {
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
  // Project memorial dedication (on by default). Always Hebrew so native-Hebrew
  // posters remain free of Latin text; shown in both UI languages.
  if (design.showProjectDedication !== false) {
    foot.appendChild(el('div', 'pg-project-dedication', esc(PROJECT_DEDICATION_HE)));
  }
  // Posters are intentionally independent handouts, not a bound document, so
  // do not add a page N of M marker to their footer.
  return foot;
}

/**
 * Build one poster page element for a single mishna (the classic layout):
 * letterhead, info line, reference, auto-fitted mishna + commentaries, footer.
 *
 * @param {object} p
 * @param {object} p.entry       {date, book, chapter, mishna}
 * @param {object} p.textData    {paragraphs, versionTitle, versionTitleInHebrew, license}
 * @param {Array}  p.commentaries [{key, paragraphs, versionTitle}]
 * @param {object} p.calendar    {parsha:{en,he}|null, yomTov?:object|null}
 * @param {number} p.index       1-based day number
 * @param {number} p.total       total days
 * @param {object} p.settings    full app settings (text + design options)
 * @param {string} p.lang        poster language ('he' | 'en')
 */
export function buildPosterPage({ entry, textData, commentaries, calendar, index, total, settings, lang }) {
  const he = lang === 'he';
  const design = settings.design;
  const pageSize = getPageSize(design);
  const masechet = findMasechet(entry.book);
  const template = design.templateDef || TEMPLATES[0];
  const date = parseISODate(entry.date);

  const { page, content } = createPageShell({ settings, pageSize, template, he, layoutMode: 'single' });
  page.dataset.ref = `${entry.book} ${entry.chapter}:${entry.mishna}`;
  page.dataset.page = String(index);

  const head = buildPosterHead(design);
  if (head) content.appendChild(head);
  const info = buildPosterInfo({
    date, design, he, calendar, index, total, settings, showBadge: true,
    masechet, chapter: entry.chapter, mishna: entry.mishna,
  });
  if (info) content.appendChild(info);
  content.appendChild(buildPosterMain({ design, textData, commentaries, settings, he }));
  content.appendChild(buildPosterFoot({ design, textData, he }));

  return page;
}

/* ---------------------------------------------------------------------------
 * Multi-mishna ("fill") pages - pack as many mishnas as fit per page while
 * keeping the floor font size; the next page continues where the last ended.
 * ------------------------------------------------------------------------- */

function fillUnit({ entry, textData, commentaries, calendar, dayIndex, total, settings, lang, he, showBadge, entryIndex }) {
  const design = settings.design;
  const masechet = findMasechet(entry.book);
  const date = parseISODate(entry.date);
  const unit = el('div', 'pg-unit');
  unit.dataset.entry = String(entryIndex);
  unit.dataset.ref = `${entry.book} ${entry.chapter}:${entry.mishna}`;
  const info = buildPosterInfo({
    date, design, he, calendar, index: dayIndex, total, settings, showBadge,
    masechet, chapter: entry.chapter, mishna: entry.mishna,
  });
  if (info) unit.appendChild(info);
  unit.appendChild(buildPosterMain({ design, textData, commentaries, settings, he }));
  return unit;
}

/** Apply one shared mishna font size to every unit currently on a fill page. */
function applyFillScale(page, textPx) {
  textPx = Math.round(textPx * 100) / 100;
  page.querySelectorAll('.pg-unit .pg-text').forEach((text) => {
    text.style.fontSize = `${textPx}px`;
    text.style.lineHeight = String(1.55 + 0.32 * Math.min(1, textPx / BASE_TEXT));
  });
  page.querySelectorAll('.pg-unit .pg-commentary').forEach((comm) => {
    const commPx = commentaryPxFor(textPx);
    comm.style.fontSize = `${commPx}px`;
    comm.style.lineHeight = String(1.5 + 0.25 * Math.min(1, commPx / BASE_COMM));
  });
}

/**
 * Paginate entries into filled poster pages.
 *
 * Every unit carries the full info line + reference + mishna + commentaries.
 * A page accepts one more unit whenever the whole page still fits at the floor
 * font size; when the next unit would no longer fit even at the floor, the
 * current page is closed (and its font size grown back up to the largest that
 * fits, capped by the ceiling) and a new page starts. If a single mishna alone
 * cannot fit at the floor it is force-placed and flagged, mirroring the
 * single-per-page overflow reporting.
 *
 * Pages are appended to `stage` so layout metrics are real.
 *
 * @returns {{pages: HTMLElement[], flagged: boolean}}
 */
export function paginateFillPages({ entries, settings, lang, stage, total }) {
  const he = lang === 'he';
  const design = settings.design;
  const pageSize = getPageSize(design);
  const template = design.templateDef || TEMPLATES[0];
  const minText = Math.max(MIN_TEXT_DEFAULT, Number(design.minMishnaFontPx) || MIN_TEXT_DEFAULT);
  const maxText = Math.max(minText, Number(design.maxMishnaFontPx) || minText);

  const pages = [];
  let flagged = false;

  const fits = (page) => {
    const wrap = page.querySelector('.pg-units');
    if (!wrap) return false;
    return wrap.scrollHeight <= wrap.clientHeight + 2;
  };

  const newPage = (firstEntry, textData) => {
    const { page, content } = createPageShell({ settings, pageSize, template, he, layoutMode: 'fill' });
    page.dataset.ref = `${firstEntry.book} ${firstEntry.chapter}:${firstEntry.mishna}`;
    const head = buildPosterHead(design);
    if (head) content.appendChild(head);
    const unitsWrap = el('div', 'pg-units');
    content.appendChild(unitsWrap);
    // The footer participates in layout from the very start so the fit
    // measurement above it is final (single pages already do this).
    content.appendChild(buildPosterFoot({ design, textData, he }));
    page.__unitsWrap = unitsWrap;
    page.__first = true;
    stage.appendChild(page);
    return page;
  };

  const finalizePage = (page) => {
    // Only enlarge after membership is fixed: find the largest shared font
    // size in [minText, maxText] the closed page still fits.
    applyFillScale(page, minText);
    if (!fits(page)) {
      page.dataset.fitOverflow = '1';
      flagged = true;
    } else {
      applyFillScale(page, maxText);
      if (!fits(page)) {
        let lo = minText;
        let hi = maxText;
        while (hi - lo > 0.5) {
          const mid = (lo + hi) / 2;
          applyFillScale(page, mid);
          if (fits(page)) lo = mid;
          else hi = mid;
        }
        applyFillScale(page, lo);
      }
    }
    page.dataset.page = String(pages.length + 1);
    const appliedPx = parseFloat(page.querySelector('.pg-text').style.fontSize) || minText;
    page.dataset.textScale = (appliedPx / BASE_TEXT).toFixed(3);
    page.dataset.fitAtFloor = String(page.dataset.fitOverflow === '1' || appliedPx <= minText + 0.5);
    delete page.__unitsWrap;
    delete page.__first;
    pages.push(page);
  };

  const unitCount = (page) => page.__unitsWrap ? page.__unitsWrap.childElementCount : 0;

  let i = 0;
  let page = null;
  while (i < entries.length) {
    const item = entries[i];
    if (!page) page = newPage(item.entry, item.textData);
    const unit = fillUnit({
      entry: item.entry,
      textData: item.textData,
      commentaries: item.commentaries || [],
      calendar: item.calendar,
      dayIndex: item.dayIndex,
      total,
      settings,
      lang,
      he,
      showBadge: unitCount(page) === 0,
      entryIndex: item.entryIndex,
    });
    page.__unitsWrap.appendChild(unit);
    applyFillScale(page, minText);
    if (fits(page)) {
      i += 1;
      if (page.__first) { page.dataset.fitOverflow = '0'; page.__first = false; }
      continue;
    }
    // This unit does not fit alongside the existing ones at the floor.
    page.__unitsWrap.removeChild(unit);
    if (unitCount(page) === 0) {
      // Even a lone mishna cannot fit at the floor: force-place it alone and
      // flag the exceptional condition, exactly like the single-page path.
      page.__unitsWrap.appendChild(unit);
      applyFillScale(page, minText);
      page.dataset.fitOverflow = '1';
      flagged = true;
      page.__first = false;
      i += 1;
      finalizePage(page);
      page = null;
    } else {
      // Page is full: close it with the units it already holds and retry
      // this unit on a fresh page.
      finalizePage(page);
      page = null;
    }
  }
  if (page && unitCount(page) > 0) {
    page.dataset.fitOverflow = page.dataset.fitOverflow || '0';
    finalizePage(page);
  }
  return { pages, flagged };
}

/**
 * Auto-fit mishna and commentary independently (one mishna per page).
 *
 * Commentary used to have fixed child font sizes in CSS. Changing the
 * wrapper's font size therefore did nothing, so the mishna kept shrinking
 * while an over-large commentary was eventually clipped by .pg-main. Here we
 * deliberately reduce commentary first, then reduce the mishna only when the
 * commentary has reached its readable floor. Commentary is never allowed to
 * exceed 80% of the actual mishna size.
 *
 * @param {object} [opts] {userScale, minTextPx, maxTextPx} - min/max text
 *   sizes come from the user's Layout settings when given (they replace the
 *   historic 11px floor / 1.25x ceiling defaults).
 *
 * Returns the applied mishna scale (relative to the 33px base), preserving
 * the old public return shape. Per-region values are also exposed as data
 * attributes for diagnostics and tests.
 */
export function autofitPage(page, { userScale = 1, minTextPx = null, maxTextPx = null } = {}) {
  const main = page.querySelector('.pg-main');
  const textEl = page.querySelector('.pg-text');
  const commEl = page.querySelector('.pg-commentary');
  if (!main || !textEl) return 1;

  const EPSILON = 0.015;
  const scaleInput = Number.isFinite(Number(userScale)) && Number(userScale) > 0 ? Number(userScale) : 1;
  const startText = BASE_TEXT * START_SCALE * scaleInput;
  const userMin = Number(minTextPx);
  const userMax = Number(maxTextPx);
  const floorPx = Number.isFinite(userMin) && userMin > 0 ? userMin : MIN_TEXT_DEFAULT;
  // The historic default ceiling (BASE * 1.25) applies only when the caller
  // does not pass Layout settings; the app always passes its own.
  const ceilingPx = Number.isFinite(userMax) && userMax > 0
    ? userMax
    : BASE_TEXT * 1.25 * scaleInput;
  const maxText = Math.max(ceilingPx, floorPx);
  const minText = Math.min(startText, Math.max(MIN_TEXT_DEFAULT, floorPx));

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
