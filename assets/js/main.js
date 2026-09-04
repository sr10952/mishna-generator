/**
 * main.js - application controller: settings, i18n, schedule, Sefaria loading,
 * poster building, preview navigation, PDF/PNG/print export, persistence.
 */

import { setLang, getLang, t } from './i18n.js';
import { MISHNAH, SEDARIM, findMasechet, COMMENTARIES, ENGLISH_VERSIONS, HEBREW_VERSIONS } from './mishnah-index.js';
import { buildSchedule, validateSettings, MAX_MISHNAS, totalMishnas } from './schedule.js';
import { apiRef, commentaryRef, formatHebrewDate, formatGregorianDate, formatWeekday, parseISODate, isoDate, saturdayOf, gematria, masechetHeName, containsLatinLetters, getYomTovInfo } from './hebrew.js';
import { getCalendar, runPool, clearSefariaCache } from './sefaria.js';
import { getText } from './content.js';
import { buildPosterPage, autofitPage, ensureFontsLoaded, TEMPLATES, FONTS, getPageSize, getPageSizeForElement, randomTemplate } from './poster.js';
import { generatePdf, renderPagePng, savePdf, suggestedFilename, QUALITIES } from './pdf.js';
import { normalizeSettings, WEEKDAY_DISPLAY_STYLES, YOM_TOV_DISPLAY_STYLES } from './settings.js';
import {
  MAX_PROFILES, PROFILE_OK, readProfiles, writeProfiles, saveProfile as saveProfileEntry,
  loadProfile as loadProfileEntry, renameProfile as renameProfileEntry, deleteProfile as deleteProfileEntry,
  serializeBackup, parseBackup, mergeProfiles,
} from './profiles.js';

/* ===========================================================================
 * State
 * =========================================================================*/

const LS_KEY = 'mishna-poster-settings-v1';

let settings = loadSettings();
let profiles = readProfiles({ read: (k) => localStorage.getItem(k) });
let schedule = null;      // {entries, wrappedToStart, skipped}
let entryData = [];       // per-entry {text, commentaries, calendar, error}
let stagePages = [];      // built poster elements (render stage)
let pageIndex = 0;
let contentHash = '';     // detects schedule/content changes => stale state

function loadSettings() {
  // normalizeSettings performs the forward/backward-compatible deep merge onto
  // DEFAULTS and repairs every field (migration, invalid values, obsolete keys).
  try {
    const raw = localStorage.getItem(LS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeSettings({});
  }
}

function persistProfiles() {
  writeProfiles({ write: (k, v) => localStorage.setItem(k, v) }, profiles);
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
  const pageSize = getPageSize(settings.design);
  settings.design.pageSize = pageSize.id;
  if (pageSize.id === 'custom') {
    settings.design.customPageWidth = pageSize.widthIn;
    settings.design.customPageHeight = pageSize.heightIn;
  }
  document.documentElement.dataset.posterPageSize = pageSize.id;

  const renderStage = $('renderStage');
  if (renderStage) renderStage.style.width = `${pageSize.width}px`;
  const previewCanvas = $('previewCanvas');
  if (previewCanvas) previewCanvas.style.aspectRatio = `${pageSize.width} / ${pageSize.height}`;

  // @page cannot depend on a normal element selector or custom property. A
  // tiny generated rule is the reliable way to make the browser's print
  // dialog (and headless print-to-PDF) honor the selected format. Every
  // format uses explicit inches so even browsers lacking a named Tabloid
  // page size preserve the chosen portrait or landscape dimensions.
  let style = document.getElementById('printPageSizeStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'printPageSizeStyle';
    document.head.appendChild(style);
  }
  style.textContent = `@media print { @page { size: ${pageSize.printFormat}; margin: 0; } }`;
  return pageSize;
}

function formatPageInches(value) {
  return String(Math.round(Number(value) * 100) / 100);
}

function pageSizeLabel(page) {
  const size = getPageSizeForElement(page);
  if (size.id === 'legal') return t('pageSizeLegal');
  if (size.id === 'tabloid') return t('pageSizeTabloid');
  if (size.id === 'custom') {
    return t('pageSizeCustomPreview', {
      width: formatPageInches(size.widthIn),
      height: formatPageInches(size.heightIn),
    });
  }
  return t('pageSizeLetter');
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
  if ($('profileSelect')) renderProfiles();
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

  // Weekly parasha is cached per Saturday. Holiday context is calculated for
  // every actual learning date: a weekly Torah-reading response cannot tell us
  // whether an intervening weekday is, for example, Chol HaMoed.
  const satKeys = [...new Set(schedule.entries.map((e) => isoDate(saturdayOf(parseISODate(e.date)))))];
  const calTasks = satKeys.map((iso) => () => getCalendar(parseISODate(iso), { diaspora: settings.diaspora }));
  const calResults = await runPool(calTasks, {
    concurrency: 3,
    onProgress: (done, total) => setProgress(done, total, '🗓'),
  });
  const calBySat = new Map();
  satKeys.forEach((iso, i) => { if (calResults.results[i]) calBySat.set(iso, calResults.results[i]); });
  entryData.forEach((d, i) => {
    const entryDate = parseISODate(schedule.entries[i].date);
    const sat = isoDate(saturdayOf(entryDate));
    const weeklyCalendar = calBySat.get(sat) || null;
    const yomTov = getYomTovInfo(entryDate, { diaspora: settings.diaspora });
    d.calendar = (weeklyCalendar || yomTov)
      ? { ...(weeklyCalendar || {}), yomTov }
      : null;
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
      settings: {
        diaspora: settings.diaspora,
        text: settings.text,
        design: { ...settings.design, templateDef: templateDef() },
      },
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
      pageSize: settings.design,
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

  $('showDailyMishnaBadge').checked = settings.design.showDailyMishnaBadge !== false;
  $('showDailyMishnaBadge').addEventListener('change', (e) => {
    settings.design.showDailyMishnaBadge = e.target.checked;
    syncDailyMishnaBadgeTextVisibility();
    onDesignSettingChange();
  });
  $('dailyMishnaBadgeText').value = settings.design.dailyMishnaBadgeText || '';
  $('dailyMishnaBadgeText').addEventListener('input', (e) => {
    settings.design.dailyMishnaBadgeText = e.target.value;
    onDesignSettingChange();
  });
  syncDailyMishnaBadgeTextVisibility();

  $('weekdayDisplaySel').value = settings.design.weekdayDisplay || 'auto';
  $('weekdayDisplaySel').addEventListener('change', (e) => {
    settings.design.weekdayDisplay = WEEKDAY_DISPLAY_STYLES.has(e.target.value) ? e.target.value : 'auto';
    syncDateDisplayControls();
    onDesignSettingChange();
  });
  $('customWeekdayNames').value = settings.design.customWeekdayNames || '';
  $('customWeekdayNames').addEventListener('input', (e) => {
    settings.design.customWeekdayNames = e.target.value;
    onDesignSettingChange();
  });
  $('showYomTovName').checked = settings.design.showYomTovName === true;
  $('showYomTovName').addEventListener('change', (e) => {
    settings.design.showYomTovName = e.target.checked;
    syncDateDisplayControls();
    onDesignSettingChange();
  });
  $('yomTovDisplaySel').value = settings.design.yomTovDisplay || 'auto';
  $('yomTovDisplaySel').addEventListener('change', (e) => {
    settings.design.yomTovDisplay = YOM_TOV_DISPLAY_STYLES.has(e.target.value) ? e.target.value : 'auto';
    onDesignSettingChange();
  });
  syncDateDisplayControls();

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

  // Project memorial dedication: on by default; unchecking asks for confirmation.
  const projDed = $('showProjectDedicationInfo');
  projDed.checked = settings.design.showProjectDedication !== false;
  projDed.addEventListener('change', async (e) => {
    if (!e.target.checked) {
      const ok = await confirmDialog(t('projectDedicationConfirm'));
      if (!ok) { e.target.checked = true; return; }
    }
    settings.design.showProjectDedication = e.target.checked;
    onDesignSettingChange();
  });

  wireProfilesAndBackup();

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
  $('pageSizeSel').value = getPageSize(settings.design).id;
  $('pageSizeSel').addEventListener('change', (e) => {
    settings.design.pageSize = getPageSize(e.target.value).id;
    syncCustomPageSizeControls();
    onDesignSettingChange();
  });
  const updateCustomPageSize = () => {
    settings.design.customPageWidth = $('customPageWidth').value;
    settings.design.customPageHeight = $('customPageHeight').value;
    const normalized = getPageSize({
      pageSize: 'custom',
      customPageWidth: settings.design.customPageWidth,
      customPageHeight: settings.design.customPageHeight,
    });
    settings.design.customPageWidth = normalized.widthIn;
    settings.design.customPageHeight = normalized.heightIn;
    syncCustomPageSizeControls();
    onDesignSettingChange();
  };
  $('customPageWidth').addEventListener('change', updateCustomPageSize);
  $('customPageHeight').addEventListener('change', updateCustomPageSize);
  syncCustomPageSizeControls();
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

function syncDailyMishnaBadgeTextVisibility() {
  const field = $('dailyMishnaBadgeTextField');
  if (field) field.hidden = settings.design.showDailyMishnaBadge === false;
}

/** Normalize, restore, and conditionally reveal manual page dimensions. */
function syncCustomPageSizeControls() {
  const custom = getPageSize({
    pageSize: 'custom',
    customPageWidth: settings.design.customPageWidth,
    customPageHeight: settings.design.customPageHeight,
  });
  settings.design.customPageWidth = custom.widthIn;
  settings.design.customPageHeight = custom.heightIn;
  const width = $('customPageWidth');
  const height = $('customPageHeight');
  if (width) width.value = formatPageInches(custom.widthIn);
  if (height) height.value = formatPageInches(custom.heightIn);
  const fields = $('customPageSizeFields');
  if (fields) fields.hidden = settings.design.pageSize !== 'custom';
}

/** Keep optional date-format controls out of the way until they are relevant. */
function syncDateDisplayControls() {
  const customField = $('customWeekdayNamesField');
  if (customField) customField.hidden = settings.design.weekdayDisplay !== 'custom';
  const yomTovField = $('yomTovDisplayField');
  if (yomTovField) yomTovField.hidden = settings.design.showYomTovName !== true;
}

/* ===========================================================================
 * Accessible modal dialogs (confirm / prompt)
 * =========================================================================*/

let modalPreviousFocus = null;

/** Promise-based confirmation dialog. Resolves true on confirm, false on cancel. */
function confirmDialog(message) {
  return new Promise((resolve) => {
    const backdrop = $('confirmBackdrop');
    $('confirmText').textContent = message;
    // Generic OK/Cancel wording matching the UI language.
    $('confirmOk').textContent = getLang() === 'he' ? 'אישור' : 'OK';
    $('confirmCancel').textContent = getLang() === 'he' ? 'ביטול' : 'Cancel';
    modalPreviousFocus = document.activeElement;
    backdrop.hidden = false;
    $('confirmOk').focus();

    const cleanup = (result) => {
      backdrop.hidden = true;
      $('confirmOk').removeEventListener('click', onOk);
      $('confirmCancel').removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      if (modalPreviousFocus && modalPreviousFocus.focus) modalPreviousFocus.focus();
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === backdrop) cleanup(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Tab') trapFocus(e, $('confirmModal'));
    };
    $('confirmOk').addEventListener('click', onOk);
    $('confirmCancel').addEventListener('click', onCancel);
    backdrop.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

/** Promise-based text prompt. Resolves the string or null on cancel. */
function promptDialog(message, initial = '') {
  return new Promise((resolve) => {
    const backdrop = $('promptBackdrop');
    $('promptText').textContent = message;
    const input = $('promptInput');
    input.value = initial;
    $('promptOk').textContent = getLang() === 'he' ? 'אישור' : 'OK';
    $('promptCancel').textContent = getLang() === 'he' ? 'ביטול' : 'Cancel';
    modalPreviousFocus = document.activeElement;
    backdrop.hidden = false;
    input.focus();
    input.select();

    const cleanup = (result) => {
      backdrop.hidden = true;
      $('promptOk').removeEventListener('click', onOk);
      $('promptCancel').removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      if (modalPreviousFocus && modalPreviousFocus.focus) modalPreviousFocus.focus();
      resolve(result);
    };
    const onOk = () => cleanup(input.value);
    const onCancel = () => cleanup(null);
    const onBackdrop = (e) => { if (e.target === backdrop) cleanup(null); };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(null);
      if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); cleanup(input.value); }
      if (e.key === 'Tab') trapFocus(e, $('promptModal'));
    };
    $('promptOk').addEventListener('click', onOk);
    $('promptCancel').addEventListener('click', onCancel);
    backdrop.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

function trapFocus(e, container) {
  const focusable = container.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ===========================================================================
 * Profiles & backup / restore
 * =========================================================================*/

function setProfileStatus(msg, kind = '') {
  const line = $('profileStatus');
  line.textContent = msg || '';
  line.className = `status-line ${kind}`.trim();
}

/** Repopulate the profile <select> and the count label. */
function renderProfiles() {
  const sel = $('profileSelect');
  const prev = sel.value;
  sel.innerHTML = '';
  if (!profiles.length) {
    const opt = el('option', null, t('profileNone'));
    opt.value = '';
    opt.disabled = true;
    opt.selected = true;
    sel.appendChild(opt);
    sel.disabled = true;
  } else {
    sel.disabled = false;
    for (const p of profiles) {
      const opt = el('option', null, p.name);
      opt.value = p.id;
      sel.appendChild(opt);
    }
    if (profiles.some((p) => p.id === prev)) sel.value = prev;
  }
  const has = profiles.length > 0;
  ['profileLoadBtn', 'profileRenameBtn', 'profileDeleteBtn'].forEach((id) => { $(id).disabled = !has; });
  $('profileCountLabel').textContent = t('profileCount', { n: profiles.length, max: MAX_PROFILES });
}

/** Apply an imported / loaded settings object as the live configuration. */
function applyLoadedSettings(next, { keepImages = true } = {}) {
  const incoming = normalizeSettings(next);
  if (keepImages) {
    // Loaded profiles/backups are image-free; preserve the user's current
    // uploaded logo/background rather than wiping them.
    incoming.design.logoDataUrl = settings.design.logoDataUrl;
    incoming.design.bgDataUrl = settings.design.bgDataUrl;
  }
  settings = incoming;
  setLang(settings.lang || 'en');
  saveSettings();
  // Rewire all form controls to the new values and rebuild dependent UI.
  refreshFormFromSettings();
  applyI18n();
  syncTextLangVisibility();
  syncPageSize();
  renderScheduleIfNeeded();
  if (entryData.length) markStale();
}

/** Push the current `settings` object back into every form control. */
function refreshFormFromSettings() {
  $('startDate').value = settings.startDate;
  $('count').value = settings.count;
  $('skipYomTov').checked = settings.skipYomTov;
  $('diasporaSel').value = settings.diaspora ? 'diaspora' : 'israel';
  buildWeekdayChips();
  refreshRefSelectors();
  updateRefHint();
  $('textLang').value = settings.text.language;
  $('nikudSel').value = settings.text.nikud ? 'on' : 'off';
  renderVersionOptions();
  $('commBartenura').checked = settings.text.bartenura;
  $('commTosafotYT').checked = settings.text.tosafotYT;
  $('commRambam').checked = settings.text.rambam;
  $('commLangSel').value = settings.text.commentaryLang;
  $('showRef').checked = settings.design.showRef;
  $('showDailyMishnaBadge').checked = settings.design.showDailyMishnaBadge !== false;
  $('dailyMishnaBadgeText').value = settings.design.dailyMishnaBadgeText || '';
  syncDailyMishnaBadgeTextVisibility();
  $('weekdayDisplaySel').value = settings.design.weekdayDisplay || 'auto';
  $('customWeekdayNames').value = settings.design.customWeekdayNames || '';
  $('showYomTovName').checked = settings.design.showYomTovName === true;
  $('yomTovDisplaySel').value = settings.design.yomTovDisplay || 'auto';
  syncDateDisplayControls();
  $('showDateInfo').checked = settings.design.showDate;
  $('showParshaInfo').checked = settings.design.showParsha;
  $('showDayCountInfo').checked = settings.design.showDayCount;
  $('showAttributionInfo').checked = settings.design.showAttribution;
  $('showProjectDedicationInfo').checked = settings.design.showProjectDedication !== false;
  renderTemplateOptions();
  renderFontOptions();
  $('pageSizeSel').value = getPageSize(settings.design).id;
  syncCustomPageSizeControls();
  $('accentColor').value = settings.design.accent;
  $('institution').value = settings.design.institution;
  $('dedication').value = settings.design.dedication;
  $('footerNote').value = settings.design.footerNote;
  $('bgOverlay').value = settings.design.bgOverlay;
  $('overlayVal').textContent = `${Math.round(settings.design.bgOverlay * 100)}%`;
  $('qualitySel').value = settings.design.quality;
}

function wireProfilesAndBackup() {
  renderProfiles();

  $('profileSaveBtn').addEventListener('click', async () => {
    const name = $('profileNameInput').value;
    const clean = String(name || '').trim();
    if (!clean) { setProfileStatus(t('profileErrEmptyName'), 'error'); return; }
    // Confirm before overwriting an existing profile of the same name.
    const existing = profiles.find((p) => p.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      const ok = await confirmDialog(t('profileOverwriteConfirm', { name: existing.name }));
      if (!ok) return;
    }
    const res = saveProfileEntry(profiles, clean, settings);
    if (res.status !== PROFILE_OK) {
      setProfileStatus(t(res.status, { max: MAX_PROFILES }), 'error');
      return;
    }
    profiles = res.profiles;
    persistProfiles();
    renderProfiles();
    $('profileSelect').value = res.profile.id;
    $('profileNameInput').value = '';
    setProfileStatus(t('profileSaved', { name: res.profile.name }), 'ok');
  });

  $('profileLoadBtn').addEventListener('click', () => {
    const id = $('profileSelect').value;
    if (!id) { setProfileStatus(t('profileSelectFirst'), 'error'); return; }
    const loaded = loadProfileEntry(profiles, id);
    if (!loaded) { setProfileStatus(t('profileErrNotFound'), 'error'); return; }
    const p = profiles.find((x) => x.id === id);
    applyLoadedSettings(loaded);
    setProfileStatus(t('profileLoaded', { name: p ? p.name : '' }), 'ok');
  });

  $('profileRenameBtn').addEventListener('click', async () => {
    const id = $('profileSelect').value;
    if (!id) { setProfileStatus(t('profileSelectFirst'), 'error'); return; }
    const p = profiles.find((x) => x.id === id);
    const next = await promptDialog(t('profileRenamePrompt'), p ? p.name : '');
    if (next == null) return;
    const res = renameProfileEntry(profiles, id, next);
    if (res.status !== PROFILE_OK) { setProfileStatus(t(res.status, { max: MAX_PROFILES }), 'error'); return; }
    profiles = res.profiles;
    persistProfiles();
    renderProfiles();
    $('profileSelect').value = id;
    setProfileStatus(t('profileRenamed', { name: res.profile.name }), 'ok');
  });

  $('profileDeleteBtn').addEventListener('click', async () => {
    const id = $('profileSelect').value;
    if (!id) { setProfileStatus(t('profileSelectFirst'), 'error'); return; }
    const p = profiles.find((x) => x.id === id);
    const ok = await confirmDialog(t('profileDeleteConfirm', { name: p ? p.name : '' }));
    if (!ok) return;
    const res = deleteProfileEntry(profiles, id);
    if (res.status !== PROFILE_OK) { setProfileStatus(t(res.status, { max: MAX_PROFILES }), 'error'); return; }
    profiles = res.profiles;
    persistProfiles();
    renderProfiles();
    setProfileStatus(t('profileDeleted', { name: res.profile ? res.profile.name : '' }), 'ok');
  });

  $('backupExportBtn').addEventListener('click', () => {
    const json = serializeBackup(settings, profiles);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `mishna-poster-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setProfileStatus(t('backupExported'), 'ok');
  });

  $('backupImportBtn').addEventListener('click', () => $('backupImportFile').click());
  $('backupImportFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-importing the same file later
    if (!file) return;
    let text;
    try { text = await file.text(); } catch { setProfileStatus(t('importErrParse'), 'error'); return; }
    const parsed = parseBackup(text);
    if (!parsed.ok) { setProfileStatus(t(parsed.error), 'error'); return; }
    const ok = await confirmDialog(t('backupImportConfirm'));
    if (!ok) return;
    // Merge profiles first (bounded), then apply settings.
    let added = 0; let updated = 0; let skipped = 0;
    if (parsed.profiles && parsed.profiles.length) {
      const merged = mergeProfiles(profiles, parsed.profiles);
      profiles = merged.profiles;
      added = merged.added; updated = merged.updated; skipped = merged.skipped;
      persistProfiles();
      renderProfiles();
    }
    if (parsed.settings) applyLoadedSettings(parsed.settings);
    const msg = (added || updated || skipped)
      ? t('importOkProfiles', { added, updated, skipped })
      : t('importOk');
    setProfileStatus(msg, 'ok');
  });
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

/* ===========================================================================
 * PWA: register the offline service worker (progressive enhancement).
 * Works from http(s) and from file://-served static copies where supported.
 * =========================================================================*/
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', document.baseURI).href;
    navigator.serviceWorker.register(swUrl).catch(() => { /* offline install optional */ });
  });
}
