/**
 * main.js - application controller: settings, i18n, schedule, Sefaria loading,
 * poster building, preview navigation, PDF/PNG/print export, persistence.
 */

import { setLang, getLang, t } from './i18n.js';
import { MISHNAH, SEDARIM, findMasechet, COMMENTARIES, ENGLISH_VERSIONS, HEBREW_VERSIONS } from './mishnah-index.js';
import { buildSchedule, validateSettings, MAX_MISHNAS, totalMishnas } from './schedule.js';
import { apiRef, commentaryRef, formatHebrewDate, formatGregorianDate, formatWeekday, parseISODate, isoDate, saturdayOf, gematria, masechetHeName, containsLatinLetters } from './hebrew.js';
import { getText, getCalendar, runPool, clearSefariaCache } from './sefaria.js';
import { buildPosterPage, autofitPage, ensureFontsLoaded, TEMPLATES, FONTS, getPageSize, getPageSizeForElement, randomTemplate } from './poster.js';
import { generatePdf, renderPagePng, savePdf, suggestedFilename, QUALITIES } from './pdf.js';

/* ===========================================================================
 * State
 * =========================================================================*/

const LS_KEY = 'mishna-poster-settings-v1';

const DEFAULTS = {
  lang: 'en',
  startDate: isoDate(new Date()),
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
    accent: '#8a6d3b',
    institution: '',
    dedication: '',
    footerNote: '',
    logoDataUrl: null,
    bgDataUrl: null,
    bgOverlay: 0.85,
    showDate: true,
    showParsha: true,
    showDayCount: true,
    showRef: true,
    showAttribution: true,
    quality: 'high',
  },
};

let settings = loadSettings();
let schedule = null;      // {entries, wrappedToStart, skipped}
let entryData = [];       // per-entry {text, commentaries, calendar, error}
let stagePages = [];      // built poster elements (render stage)
let pageIndex = 0;
let contentHash = '';     // detects schedule/content changes => stale state

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    // deep-merge onto defaults (keeps forward compatibility)
    const merged = structuredClone(DEFAULTS);
    Object.assign(merged, s, {
      start: { ...merged.start, ...(s.start || {}) },
      text: { ...merged.text, ...(s.text || {}) },
      design: { ...merged.design, ...(s.design || {}) },
    });
    // Saved settings predate both controls. Preserve the old "one font for
    // everything" behavior for those users, while safely handling malformed
    // localStorage values.
    if (!s.design || !s.design.commentaryFont || !FONTS[merged.design.commentaryFont]) merged.design.commentaryFont = FONTS[merged.design.font] ? merged.design.font : 'frank';
    if (!FONTS[merged.design.font]) merged.design.font = 'frank';
    merged.design.pageSize = getPageSize(merged.design.pageSize).id;
    return merged;
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let saveTimer;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* quota - ignore */ }
  }, 250);
}

function posterLang() {
  return getLang() === 'he' ? 'he' : settings.text.language;
}

/* ===========================================================================
 * DOM helpers
 * =========================================================================*/

const $ = (id) => document.getElementById(id);
const WD_LABELS = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  he: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'],
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/** Keep CSS print media, render stage, and saved state on the same format. */
function syncPageSize() {
  const pageSize = getPageSize(settings.design.pageSize);
  settings.design.pageSize = pageSize.id;
  document.documentElement.dataset.posterPageSize = pageSize.id;

  const renderStage = $('renderStage');
  if (renderStage) renderStage.style.width = `${pageSize.width}px`;
  const previewCanvas = $('previewCanvas');
  if (previewCanvas) previewCanvas.style.aspectRatio = `${pageSize.width} / ${pageSize.height}`;

  // @page cannot depend on a normal element selector or custom property. A
  // tiny generated rule is the reliable way to make the browser's print
  // dialog (and headless print-to-PDF) honor the selected format.
  let style = document.getElementById('printPageSizeStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'printPageSizeStyle';
    document.head.appendChild(style);
  }
  style.textContent = `@media print { @page { size: ${pageSize.printFormat} portrait; margin: 0; } }`;
  return pageSize;
}

function pageSizeLabel(page) {
  const size = getPageSizeForElement(page);
  return t(size.id === 'legal' ? 'pageSizeLegal' : 'pageSizeLetter');
}

/* ===========================================================================
 * i18n application
 * =========================================================================*/

function applyI18n() {
  const he = getLang() === 'he';
  document.documentElement.lang = he ? 'he' : 'en';
  document.documentElement.dir = he ? 'rtl' : 'ltr';
  document.title = t('appTitle');
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((node) => {
    node.placeholder = t(node.dataset.i18nPh);
  });
  document.querySelectorAll('[data-i18n-en]').forEach((node) => {
    node.textContent = he ? node.dataset.i18nHe : node.dataset.i18nEn;
  });
  $('langToggle').textContent = t('langToggle');
  buildWeekdayChips();
  renderTemplateOptions();
  renderFontOptions();
  renderVersionOptions();
  refreshRefSelectors();
  updateRefHint();
  updateScheduleTable();
  updatePreviewChrome();
}

/* ===========================================================================
 * Form: weekday chips, selectors
 * =========================================================================*/

function buildWeekdayChips() {
  const row = $('weekdayRow');
  row.innerHTML = '';
  const labels = WD_LABELS[getLang()] || WD_LABELS.en;
  for (let d = 0; d < 7; d++) {
    const chip = el('button', 'wd-chip', labels[d]);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', settings.weekdays.includes(d) ? 'true' : 'false');
    chip.addEventListener('click', () => {
      const set = new Set(settings.weekdays);
      if (set.has(d)) set.delete(d); else set.add(d);
      settings.weekdays = [...set].sort();
      chip.setAttribute('aria-pressed', set.has(d) ? 'true' : 'false');
      onContentSettingChange();
    });
    row.appendChild(chip);
  }
}

function renderTemplateOptions() {
  const grid = $('templateGrid');
  grid.innerHTML = '';
  const isAuto = settings.design.template === 'auto';
  const options = [...TEMPLATES];
  if (isAuto) options.push(currentAutoTemplate());
  for (const tpl of options) {
    const btn = el('button', 'tpl-option');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', settings.design.template === tpl.id ? 'true' : 'false');
    const pal = tpl.palette || {};
    const bg = pal.bg || tplBg(tpl.id);
    const accent = pal.accent || tpl.accent;
    const frame = pal.frame || tplFrame(tpl.id);
    btn.innerHTML = `<span class="tpl-swatch" style="background:${bg};border:3px ${frame} ${accent}"></span>
      <span>${getLang() === 'he' ? tpl.labelHe : tpl.labelEn}</span>`;
    btn.addEventListener('click', () => {
      settings.design.template = tpl.id;
      if (tpl.id === 'auto' && !settings.design.autoTemplateSeed) {
        settings.design.autoTemplateSeed = Math.floor(Math.random() * 99999);
      }
      settings.design.accent = tpl.accent;
      $('accentColor').value = tpl.accent;
      renderTemplateOptions();
      onDesignSettingChange();
    });
    grid.appendChild(btn);
  }
}

function tplBg(id) {
  return { classic: '#fdf8ec', modern: '#ffffff', royal: '#fffdf7', elegant: '#fbfaf7', fresh: '#f4f9f4', night: '#14213d' }[id] || '#ffffff';
}
function tplFrame(id) {
  return id === 'night' || id === 'royal' || id === 'classic' ? 'double' : 'solid';
}
function currentAutoTemplate() {
  return randomTemplate(settings.design.autoTemplateSeed || 1);
}

function renderFontOptions() {
  const fill = (id, selected) => {
    const sel = $(id);
    sel.innerHTML = '';
    for (const [key, f] of Object.entries(FONTS)) {
      const opt = el('option', null, t(f.i18nKey));
      opt.value = key;
      opt.selected = selected === key;
      sel.appendChild(opt);
    }
  };
  fill('fontSel', settings.design.font);
  fill('commentaryFontSel', settings.design.commentaryFont);
}

function renderVersionOptions() {
  const heSel = $('hebrewVersionSel');
  heSel.innerHTML = '';
  for (const [key, v] of Object.entries(HEBREW_VERSIONS)) {
    const opt = el('option', null, getLang() === 'he' && v.labelHe ? v.labelHe : v.labelEn);
    opt.value = key;
    opt.selected = settings.text.hebrewVersion === key;
    heSel.appendChild(opt);
  }
  const enSel = $('englishVersionSel');
  enSel.innerHTML = '';
  for (const [key, v] of Object.entries(ENGLISH_VERSIONS)) {
    const opt = el('option', null, v.labelEn);
    opt.value = key;
    opt.selected = settings.text.englishVersion === key;
    enSel.appendChild(opt);
  }
}

/** tractate / chapter / mishna selectors */
function refreshRefSelectors() {
  const msSel = $('masechetSel');
  const chSel = $('chapterSel');
  const miSel = $('mishnaSel');
  const he = getLang() === 'he';

  const prevBook = msSel.value;
  msSel.innerHTML = '';
  for (const seder of SEDARIM) {
    const group = el('optgroup');
    group.label = he ? `סדר ${seder.he}` : seder.en;
    for (const m of MISHNAH.filter((x) => x.seder === seder.en)) {
      const opt = el('option', null, he ? masechetHeName(m) : m.title);
      opt.value = m.book;
      group.appendChild(opt);
    }
    msSel.appendChild(group);
  }
  msSel.value = settings.start.book || MISHNAH[0].book;
  if (!msSel.selectedOptions[0]) msSel.value = MISHNAH[0].book;

  const masechet = findMasechet(msSel.value);
  chSel.innerHTML = '';
  for (let c = 1; masechet && c <= masechet.chapters.length; c++) {
    const opt = el('option', null, he ? gematria(c) : String(c));
    opt.value = String(c);
    chSel.appendChild(opt);
  }
  chSel.value = String(settings.start.chapter);
  if (!chSel.selectedOptions[0] && chSel.options.length) chSel.value = chSel.options[0].value;

  const n = masechet ? masechet.chapters[Number(chSel.value) - 1] : 0;
  miSel.innerHTML = '';
  for (let i = 1; i <= (n || 0); i++) {
    const opt = el('option', null, he ? gematria(i) : String(i));
    opt.value = String(i);
    miSel.appendChild(opt);
  }
  miSel.value = String(settings.start.mishna);
  if (!miSel.selectedOptions[0] && miSel.options.length) miSel.value = miSel.options[0].value;
}

function updateRefHint() {
  const m = findMasechet(settings.start.book);
  if (!m) { $('refHint').textContent = ''; return; }
  const he = getLang() === 'he';
  const total = totalMishnas(m.book);
  const refTxt = he
    ? `משנה ${masechetHeName(m)} ${gematria(settings.start.chapter)}:${gematria(settings.start.mishna)}`
    : `${m.title} ${settings.start.chapter}:${settings.start.mishna}`;
  $('refHint').textContent = he
    ? `${refTxt} · ${m.chapters.length} פרקים · ${total} משניות במסכת`
    : `${refTxt} · ${m.chapters.length} chapters · ${total} mishnas in tractate`;
}

/* ===========================================================================
 * Change handling (content vs design)
 * =========================================================================*/

function computeContentHash() {
  const p = posterLang();
  return JSON.stringify({
    s: settings.startDate, c: settings.count, w: settings.weekdays,
    y: settings.skipYomTov, d: settings.diaspora, r: settings.start,
    l: p, n: settings.text.nikud,
    hv: p === 'he' ? settings.text.hebrewVersion : settings.text.englishVersion,
    b: settings.text.bartenura, tyt: settings.text.tosafotYT, rm: settings.text.rambam,
    cl: settings.text.commentaryLang,
  });
}

function onContentSettingChange() {
  saveSettings();
  const scheduleChanged = true;
  renderScheduleIfNeeded();
  markStale();
}

let designRenderVersion = 0;
function onDesignSettingChange() {
  saveSettings();
  syncPageSize();
  if (entryData.length && schedule) {
    const version = ++designRenderVersion;
    rebuildAllPages();
    renderPreview(pageIndex);
    // A newly selected (especially commentary) font may not have been loaded
    // when the first layout pass runs. Refit once real glyph metrics are ready
    // so a fallback font can never reintroduce clipping.
    ensureFontsLoaded(settings.design).then(() => {
      if (version !== designRenderVersion || !entryData.length || !schedule) return;
      rebuildAllPages();
      renderPreview(pageIndex);
    });
  }
}

let stale = false;
function markStale() {
  stale = true;
  const btn = $('buildBtn');
  btn.classList.add('pulse');
  btn.textContent = t('rebuild');
}

function renderScheduleIfNeeded() {
  const errs = validateSettings(settings);
  if (errs.length) {
    setStatus(t(errs[0]), 'error');
    return false;
  }
  schedule = buildSchedule(settings);
  updateScheduleTable();
  $('scheduleWrap').classList.remove('hidden');
  return true;
}

/* ===========================================================================
 * Schedule table
 * =========================================================================*/

function updateScheduleTable() {
  const table = $('scheduleTable');
  if (!schedule || !schedule.entries.length) {
    table.querySelector('tbody').innerHTML = '';
    return;
  }
  const he = getLang() === 'he';
  const thead = table.querySelector('thead');
  thead.innerHTML = `<tr>
    <th>${t('colDay')}</th><th>${t('colHebDate')}</th><th>${t('colWeekday')}</th>
    <th>${t('colParsha')}</th><th>${t('colRef')}</th><th></th></tr>`;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  schedule.entries.forEach((entry, i) => {
    const date = parseISODate(entry.date);
    const m = findMasechet(entry.book);
    const ref = he ? `${masechetHeName(m)} ${gematria(entry.chapter)}:${gematria(entry.mishna)}` : `${m.title} ${entry.chapter}:${entry.mishna}`;
    const cal = entryData[i] && entryData[i].calendar;
    const parsha = cal && cal.parsha ? (he ? cal.parsha.he : cal.parsha.en) : t('noParsha');
    const tr = el('tr', i === pageIndex ? 'current' : '');
    tr.innerHTML = `
      <td>${he ? gematria(i + 1) : i + 1}</td>
      <td>${formatHebrewDate(date, he ? 'he' : 'en')}<br><span style="color:var(--ui-muted)">${formatGregorianDate(date, he ? 'he' : 'en')}</span></td>
      <td>${formatWeekday(date, he ? 'he' : 'en')}</td>
      <td>${escapeHtml(parsha)}</td>
      <td class="ref-cell">${escapeHtml(ref)}</td>
      <td>${entryData[i] && entryData[i].error ? '<span class="err-cell">✗</span>' : ''}</td>`;
    tr.addEventListener('click', () => {
      if (stagePages[i]) { renderPreview(i); if (window.innerWidth <= 720) switchTab('preview'); }
    });
    tr.style.cursor = 'pointer';
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ===========================================================================
 * Loading texts from Sefaria
 * =========================================================================*/

function setStatus(msg, kind = '') {
  const line = $('statusLine');
  line.textContent = msg || '';
  line.className = `status-line ${kind}`.trim();
}

function setProgress(done, total, label) {
  const row = $('progressRow');
  if (done >= total && total > 0) {
    row.classList.add('hidden');
    return;
  }
  row.classList.remove('hidden');
  const pct = total ? Math.round((done / total) * 100) : 0;
  $('progressBar').style.width = `${pct}%`;
  $('progressLabel').textContent = `${label || t('loading')} ${done}/${total}`;
}

async function loadEntryData() {
  const lang = posterLang();
  const versionParam = lang === 'he'
    ? (HEBREW_VERSIONS[settings.text.hebrewVersion] || { value: 'hebrew' }).value
    : (ENGLISH_VERSIONS[settings.text.englishVersion] || { value: 'english' }).value;

  const commKeys = ['bartenura', 'tosafotYT', 'rambam'].filter((k) => settings.text[k]);

  const tasks = schedule.entries.map((entry) => async () => {
    const text = await getText(apiRef(entry), versionParam);
    const commentaries = [];
    for (const key of commKeys) {
      const def = COMMENTARIES[key];
      const clang = key === 'bartenura' ? (lang === 'en' ? settings.text.commentaryLang : 'he') : 'he';
      try {
        const ctext = await getText(commentaryRef(key, entry), def.versions[clang]);
        commentaries.push({ key, paragraphs: ctext.paragraphs, versionTitle: ctext.versionTitle });
      } catch {
        if (clang === 'en') {
          // English commentary missing -> fall back to Hebrew
          try {
            const ctext = await getText(commentaryRef(key, entry), def.versions.he);
            commentaries.push({ key, paragraphs: ctext.paragraphs, versionTitle: ctext.versionTitle });
          } catch { /* commentary simply unavailable for this tractate */ }
        }
        /* else: unavailable */
      }
    }
    return { text, commentaries };
  });

  const { results, failures } = await runPool(tasks, {
    concurrency: 4,
    onProgress: (done, total, i) => setProgress(done, total),
  });

  entryData = schedule.entries.map((entry, i) => ({
    ...(results[i] || null),
    calendar: (entryData[i] && entryData[i].calendar) || null,
    error: failures.find((f) => f.index === i) ? failures.find((f) => f.index === i).error : null,
  }));

  // weekly parasha (cached per Saturday)
  const satKeys = [...new Set(schedule.entries.map((e) => isoDate(saturdayOf(parseISODate(e.date)))))];
  const calTasks = satKeys.map((iso) => () => getCalendar(parseISODate(iso), { diaspora: settings.diaspora }));
  const calResults = await runPool(calTasks, {
    concurrency: 3,
    onProgress: (done, total) => setProgress(done, total, '🗓'),
  });
  const calBySat = new Map();
  satKeys.forEach((iso, i) => { if (calResults.results[i]) calBySat.set(iso, calResults.results[i]); });
  entryData.forEach((d, i) => {
    const sat = isoDate(saturdayOf(parseISODate(schedule.entries[i].date)));
    d.calendar = calBySat.get(sat) || null;
  });

  const failed = failures.length;
  return { failed };
}

/* ===========================================================================
 * Poster building & preview
 * =========================================================================*/

function templateDef() {
  if (settings.design.template === 'auto') return currentAutoTemplate();
  return TEMPLATES.find((x) => x.id === settings.design.template) || TEMPLATES[0];
}

function rebuildAllPages() {
  const stage = $('renderStage');
  const pageSize = syncPageSize();
  stage.style.width = `${pageSize.width}px`;
  stage.innerHTML = '';
  stagePages = [];
  if (!schedule || !entryData.length) return;
  let compacted = false;
  schedule.entries.forEach((entry, i) => {
    const d = entryData[i];
    if (!d || !d.text) return;
    const page = buildPosterPage({
      entry,
      textData: d.text,
      commentaries: d.commentaries || [],
      calendar: d.calendar,
      index: i + 1,
      total: schedule.entries.length,
      settings: { text: settings.text, design: { ...settings.design, templateDef: templateDef() } },
      lang: posterLang(),
    });
    stage.appendChild(page);
    const scale = autofitPage(page, { userScale: 1 });
    if (scale < 0.58 || page.dataset.fitAtFloor === 'true' || page.dataset.fitOverflow === '1') compacted = true;
    stagePages.push(page);
  });
  const warn = $('warnLine');
  if (compacted) warn.textContent = t('warnCompact');
  else if (schedule && schedule.wrappedToStart) warn.textContent = t('warnWrap');
  else warn.textContent = '';
}

async function rebuildAllPagesWithFonts() {
  await ensureFontsLoaded(settings.design);
  rebuildAllPages();
}

function renderPreview(i) {
  if (!stagePages.length) return;
  pageIndex = Math.max(0, Math.min(stagePages.length - 1, i));
  const canvas = $('previewCanvas');
  canvas.querySelectorAll('.poster-page').forEach((n) => n.remove());
  $('previewEmpty').classList.toggle('hidden', true);
  const clone = stagePages[pageIndex].cloneNode(true);
  const pageSize = getPageSizeForElement(clone);
  canvas.style.aspectRatio = `${pageSize.width} / ${pageSize.height}`;
  clone.style.transform = 'none';
  canvas.appendChild(clone);
  scalePreview();
  updatePreviewChrome();
  updateScheduleTable();
}

function scalePreview() {
  const canvas = $('previewCanvas');
  const page = canvas.querySelector('.poster-page');
  if (!page) return;
  const pageSize = getPageSizeForElement(page);
  const w = canvas.clientWidth;
  const scale = w / pageSize.width;
  page.style.transform = `scale(${scale})`;
}

function updatePreviewChrome() {
  const total = stagePages.length;
  const he = getLang() === 'he';
  $('pageIndicator').textContent = total ? (he ? `${gematria(pageIndex + 1)} / ${gematria(total)}` : `${pageIndex + 1} / ${total}`) : '–';
  $('prevPageBtn').disabled = pageIndex <= 0;
  $('nextPageBtn').disabled = pageIndex >= total - 1;
  // native-Hebrew promise: when poster language is Hebrew there must be no
  // Latin letters anywhere on the page - assert it in the preview note.
  if (total && posterLang() === 'he' && stagePages[pageIndex]) {
    const txt = stagePages[pageIndex].textContent || '';
    $('previewNote').textContent = containsLatinLetters(txt)
      ? '⚠ Latin characters detected on this page'
      : `${pageSizeLabel(stagePages[pageIndex])} · עברית מלאה · טקסט מספריא`;
  } else if (total) {
    $('previewNote').textContent = `${pageSizeLabel(stagePages[pageIndex])} · Sefaria text`;
  } else {
    $('previewNote').textContent = '';
  }
}

/* ===========================================================================
 * Main build flow
 * =========================================================================*/

async function buildAll() {
  const btn = $('buildBtn');
  btn.disabled = true;
  btn.classList.remove('pulse');
  try {
    if (!renderScheduleIfNeeded()) return;
    contentHash = computeContentHash();
    setStatus(t('loading') + ' …');
    setProgress(0, 1);
    const { failed } = await loadEntryData();
    await rebuildAllPagesWithFonts();
    stale = false;
    renderPreview(0);
    $('actionsRow').classList.remove('hidden');
    updateScheduleTable();
    if (failed) {
      setStatus(t('errNetwork', { ref: '' }), 'error');
    } else {
      setStatus(t('ready', { n: getLang() === 'he' ? gematria(stagePages.length) : stagePages.length }), 'ok');
    }
  } catch (err) {
    console.error(err);
    setStatus(String(err && err.message ? err.message : err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('build');
    setProgress(1, 1);
  }
}

/* ===========================================================================
 * Exports: PDF / PNG / print
 * =========================================================================*/

async function downloadPdf() {
  const btn = $('downloadPdfBtn');
  btn.disabled = true;
  try {
    if (!stagePages.length) throw new Error('no pages');
    if (stale || contentHash !== computeContentHash()) {
      await buildAll();
    }
    const doc = await generatePdf(stagePages, {
      quality: settings.design.quality,
      pageSize: settings.design.pageSize,
      onProgress: (done, total) => setProgress(done, total, t('downloading')),
    });
    savePdf(doc, suggestedFilename(schedule, settings));
    setStatus('✓ PDF', 'ok');
  } catch (err) {
    setStatus(String(err && err.message ? err.message : err), 'error');
  } finally {
    btn.disabled = false;
    setProgress(1, 1);
  }
}

async function downloadPng() {
  try {
    if (!stagePages[pageIndex]) throw new Error('no page');
    const dataUrl = await renderPagePng(stagePages[pageIndex], 3);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `mishna-${stagePages[pageIndex].dataset.ref.replace(/[^A-Za-z0-9]+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    setStatus(String(err && err.message ? err.message : err), 'error');
  }
}

function printPosters() {
  syncPageSize();
  const stage = $('printStage');
  stage.innerHTML = '';
  for (const p of stagePages) stage.appendChild(p.cloneNode(true));
  window.print();
  setTimeout(() => { stage.innerHTML = ''; }, 1000);
}

/* ===========================================================================
 * File uploads (downscaled to keep localStorage & PDF sizes sane)
 * =========================================================================*/

function readImageFile(file, maxDim) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read error'));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      if (file.type === 'image/svg+xml') return resolve(dataUrl); // keep vector
      const img = new Image();
      img.onerror = () => resolve(dataUrl); // if it can't be decoded, keep original
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        if (scale >= 1) return resolve(dataUrl);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function setupUpload(inputId, removeId, previewId, maxDim, apply) {
  const input = $(inputId);
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const dataUrl = await readImageFile(file, maxDim);
      apply(dataUrl);
      $(previewId).src = dataUrl;
      $(previewId).classList.remove('hidden');
      $(removeId).classList.remove('hidden');
      onDesignSettingChange();
    } catch {
      setStatus('Could not read image', 'error');
    }
  });
  $(removeId).addEventListener('click', () => {
    apply(null);
    input.value = '';
    $(previewId).classList.add('hidden');
    $(removeId).classList.add('hidden');
    onDesignSettingChange();
  });
}

/* ===========================================================================
 * Mobile tabs
 * =========================================================================*/

function switchTab(tab) {
  document.body.classList.toggle('tab-preview', tab === 'preview');
  document.querySelectorAll('.mobile-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  window.scrollTo({ top: 0 });
}

/* ===========================================================================
 * Boot & event wiring
 * =========================================================================*/

function wire() {
  // language
  $('langToggle').addEventListener('click', () => {
    const next = getLang() === 'he' ? 'en' : 'he';
    setLang(next);
    settings.lang = next;
    if (next === 'he') {
      // native Hebrew mode: everything on the poster must be Hebrew
      settings.text.language = 'he';
      settings.text.commentaryLang = 'he';
      $('textLang').value = 'he';
      $('commLangSel').value = 'he';
    }
    saveSettings();
    applyI18n();
    syncTextLangVisibility();
    if (entryData.length) markStale();
  });

  // schedule
  $('startDate').value = settings.startDate;
  $('startDate').addEventListener('change', (e) => { settings.startDate = e.target.value; onContentSettingChange(); });

  $('count').value = settings.count;
  $('count').addEventListener('change', (e) => {
    settings.count = Math.max(1, Math.min(MAX_MISHNAS, Number(e.target.value) || 7));
    e.target.value = settings.count;
    onContentSettingChange();
  });

  $('skipYomTov').checked = settings.skipYomTov;
  $('skipYomTov').addEventListener('change', (e) => { settings.skipYomTov = e.target.checked; onContentSettingChange(); });

  $('diasporaSel').value = settings.diaspora ? 'diaspora' : 'israel';
  $('diasporaSel').addEventListener('change', (e) => {
    settings.diaspora = e.target.value === 'diaspora';
    entryData.forEach((d) => { if (d) d.calendar = null; });
    onContentSettingChange();
  });

  $('wdAll').addEventListener('click', () => { settings.weekdays = [0, 1, 2, 3, 4, 5, 6]; buildWeekdayChips(); onContentSettingChange(); });
  $('wdNone').addEventListener('click', () => { settings.weekdays = []; buildWeekdayChips(); onContentSettingChange(); });

  $('masechetSel').addEventListener('change', (e) => {
    settings.start.book = e.target.value;
    settings.start.chapter = 1;
    settings.start.mishna = 1;
    refreshRefSelectors();
    updateRefHint();
    onContentSettingChange();
  });
  $('chapterSel').addEventListener('change', (e) => {
    settings.start.chapter = Number(e.target.value);
    settings.start.mishna = 1;
    refreshRefSelectors();
    updateRefHint();
    onContentSettingChange();
  });
  $('mishnaSel').addEventListener('change', (e) => {
    settings.start.mishna = Number(e.target.value);
    updateRefHint();
    onContentSettingChange();
  });

  // content
  $('textLang').value = settings.text.language;
  $('textLang').addEventListener('change', (e) => { settings.text.language = e.target.value; syncTextLangVisibility(); onContentSettingChange(); });

  $('nikudSel').value = settings.text.nikud ? 'on' : 'off';
  $('nikudSel').addEventListener('change', (e) => { settings.text.nikud = e.target.value === 'on'; onContentSettingChange(); });

  $('hebrewVersionSel').addEventListener('change', (e) => { settings.text.hebrewVersion = e.target.value; onContentSettingChange(); });
  $('englishVersionSel').addEventListener('change', (e) => { settings.text.englishVersion = e.target.value; onContentSettingChange(); });

  $('commBartenura').checked = settings.text.bartenura;
  $('commBartenura').addEventListener('change', (e) => { settings.text.bartenura = e.target.checked; onContentSettingChange(); });
  $('commTosafotYT').checked = settings.text.tosafotYT;
  $('commTosafotYT').addEventListener('change', (e) => { settings.text.tosafotYT = e.target.checked; onContentSettingChange(); });
  $('commRambam').checked = settings.text.rambam;
  $('commRambam').addEventListener('change', (e) => { settings.text.rambam = e.target.checked; onContentSettingChange(); });
  $('commLangSel').value = settings.text.commentaryLang;
  $('commLangSel').addEventListener('change', (e) => { settings.text.commentaryLang = e.target.value; onContentSettingChange(); });

  $('showRef').checked = settings.design.showRef;
  $('showRef').addEventListener('change', (e) => { settings.design.showRef = e.target.checked; onDesignSettingChange(); });

  const infoToggles = [
    ['showDateInfo', 'showDate'],
    ['showParshaInfo', 'showParsha'],
    ['showDayCountInfo', 'showDayCount'],
    ['showAttributionInfo', 'showAttribution'],
  ];
  for (const [inputId, key] of infoToggles) {
    $(inputId).checked = settings.design[key];
    $(inputId).addEventListener('change', (e) => { settings.design[key] = e.target.checked; onDesignSettingChange(); });
  }

  // design
  $('surpriseBtn').addEventListener('click', () => {
    settings.design.template = 'auto';
    settings.design.autoTemplateSeed = Math.floor(Math.random() * 99999);
    const tpl = currentAutoTemplate();
    settings.design.accent = tpl.accent;
    settings.design.font = tpl.font;
    $('accentColor').value = tpl.accent;
    $('fontSel').value = tpl.font;
    renderTemplateOptions();
    onDesignSettingChange();
  });

  $('fontSel').addEventListener('change', (e) => { settings.design.font = e.target.value; onDesignSettingChange(); });
  $('commentaryFontSel').addEventListener('change', (e) => { settings.design.commentaryFont = e.target.value; onDesignSettingChange(); });
  $('pageSizeSel').value = getPageSize(settings.design.pageSize).id;
  $('pageSizeSel').addEventListener('change', (e) => {
    settings.design.pageSize = getPageSize(e.target.value).id;
    onDesignSettingChange();
  });
  $('accentColor').value = settings.design.accent;
  $('accentColor').addEventListener('input', (e) => {
    settings.design.accent = e.target.value;
    clearTimeout(window.__accentTimer);
    window.__accentTimer = setTimeout(onDesignSettingChange, 200);
  });

  $('institution').value = settings.design.institution;
  $('institution').addEventListener('input', (e) => { settings.design.institution = e.target.value; onDesignSettingChange(); });
  $('dedication').value = settings.design.dedication;
  $('dedication').addEventListener('input', (e) => { settings.design.dedication = e.target.value; onDesignSettingChange(); });
  $('footerNote').value = settings.design.footerNote;
  $('footerNote').addEventListener('input', (e) => { settings.design.footerNote = e.target.value; onDesignSettingChange(); });

  $('bgOverlay').value = settings.design.bgOverlay;
  const updOverlay = () => { $('overlayVal').textContent = `${Math.round(settings.design.bgOverlay * 100)}%`; };
  $('bgOverlay').addEventListener('input', (e) => {
    settings.design.bgOverlay = Number(e.target.value);
    updOverlay();
    clearTimeout(window.__overlayTimer);
    window.__overlayTimer = setTimeout(onDesignSettingChange, 150);
  });
  updOverlay();
  if (!settings.design.bgDataUrl) $('overlayField').classList.add('hidden');

  setupUpload('logoFile', 'logoRemove', 'logoPreview', 900, (v) => { settings.design.logoDataUrl = v; });
  setupUpload('bgFile', 'bgRemove', 'bgPreview', 2000, (v) => {
    settings.design.bgDataUrl = v;
    $('overlayField').classList.toggle('hidden', !v);
  });

  // generate
  $('buildBtn').addEventListener('click', buildAll);
  $('downloadPdfBtn').addEventListener('click', downloadPdf);
  $('downloadPngBtn').addEventListener('click', downloadPng);
  $('printBtn').addEventListener('click', printPosters);
  $('qualitySel').value = settings.design.quality;
  $('qualitySel').addEventListener('change', (e) => { settings.design.quality = e.target.value; saveSettings(); });

  // preview nav
  $('prevPageBtn').addEventListener('click', () => renderPreview(pageIndex - 1));
  $('nextPageBtn').addEventListener('click', () => renderPreview(pageIndex + 1));

  // mobile tabs
  document.querySelectorAll('.mobile-tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // preview scaling on resize
  new ResizeObserver(() => scalePreview()).observe($('previewCanvas'));
}

function syncTextLangVisibility() {
  const heUI = getLang() === 'he';
  $('textLang').disabled = heUI;          // Hebrew UI = Hebrew-only poster
  $('commLangSel').disabled = heUI;
  const heText = settings.text.language === 'he';
  $('hebrewVersionField').classList.toggle('hidden', !heText);
  $('englishVersionField').classList.toggle('hidden', heText);
}

/* ===========================================================================
 * init
 * =========================================================================*/

function init() {
  setLang(settings.lang || 'en');
  syncPageSize();
  wire();
  applyI18n();
  syncTextLangVisibility();
  renderScheduleIfNeeded();
  // restore uploads previews
  if (settings.design.logoDataUrl) {
    $('logoPreview').src = settings.design.logoDataUrl;
    $('logoPreview').classList.remove('hidden');
    $('logoRemove').classList.remove('hidden');
  }
  if (settings.design.bgDataUrl) {
    $('bgPreview').src = settings.design.bgDataUrl;
    $('bgPreview').classList.remove('hidden');
    $('bgRemove').classList.remove('hidden');
    $('overlayField').classList.remove('hidden');
  }
}

init();
