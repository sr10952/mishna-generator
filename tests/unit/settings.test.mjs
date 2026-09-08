import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, makeDefaults, normalizeSettings, stripImages, safeImageDataUrl,
  SETTINGS_SCHEMA_VERSION, PROJECT_DEDICATION_HE,
  DEFAULT_MIN_FONT_PX, DEFAULT_MAX_FONT_PX,
} from '../../assets/js/settings.js';

test('DEFAULTS is a complete, self-consistent schema', () => {
  assert.equal(DEFAULTS.start.book, 'Mishnah Bekhorot');
  assert.equal(DEFAULTS.start.chapter, 3);
  assert.equal(DEFAULTS.start.mishna, 2);
  assert.equal(DEFAULTS.design.pageSize, 'letter');
  assert.equal(DEFAULTS.design.showProjectDedication, true);
  assert.equal(DEFAULTS.design.showAttribution, true);
  // Layout options keep a sane, backwards-compatible default state.
  assert.equal(DEFAULTS.design.layoutMode, 'single');
  assert.equal(DEFAULTS.design.textAlign, 'auto');
  assert.equal(DEFAULTS.design.commLayout, 'flow');
  assert.equal(DEFAULTS.design.minMishnaFontPx, DEFAULT_MIN_FONT_PX);
  assert.equal(DEFAULTS.design.maxMishnaFontPx, DEFAULT_MAX_FONT_PX);
  assert.ok(DEFAULTS.design.maxMishnaFontPx >= DEFAULTS.design.minMishnaFontPx);
  assert.equal(DEFAULTS.design.marginTop, 0.5);
  assert.equal(DEFAULTS.design.marginBottom, 0.5);
  assert.equal(DEFAULTS.design.marginRight, 0.6);
  assert.equal(DEFAULTS.design.marginLeft, 0.6);
});

test('legacy settings without layout fields are repaired to the defaults', () => {
  const s = normalizeSettings({ design: { template: 'modern' } });
  assert.equal(s.design.layoutMode, 'single');
  assert.equal(s.design.textAlign, 'auto');
  assert.equal(s.design.commLayout, 'flow');
  assert.equal(s.design.minMishnaFontPx, DEFAULT_MIN_FONT_PX);
  assert.equal(s.design.maxMishnaFontPx, DEFAULT_MAX_FONT_PX);
  assert.deepEqual(
    [s.design.marginTop, s.design.marginRight, s.design.marginBottom, s.design.marginLeft],
    [0.5, 0.6, 0.5, 0.6],
  );
});

test('normalizeSettings validates the layout enums and font limits', () => {
  const s = normalizeSettings({
    design: {
      layoutMode: 'fill',
      textAlign: 'justify',
      commLayout: 'blocks',
      minMishnaFontPx: 18,
      maxMishnaFontPx: 90,
    },
  });
  assert.equal(s.design.layoutMode, 'fill');
  assert.equal(s.design.textAlign, 'justify');
  assert.equal(s.design.commLayout, 'blocks');
  assert.equal(s.design.minMishnaFontPx, 18);
  assert.equal(s.design.maxMishnaFontPx, 90);

  const bad = normalizeSettings({
    design: {
      layoutMode: 'waterfall',
      textAlign: 'stretch',
      commLayout: 'zigzag',
      minMishnaFontPx: -3,
      maxMishnaFontPx: 9999,
    },
  });
  assert.equal(bad.design.layoutMode, 'single');
  assert.equal(bad.design.textAlign, 'auto');
  assert.equal(bad.design.commLayout, 'flow');
  // Numeric limits are clamped to their ranges (invalid *types* fall back).
  assert.equal(bad.design.minMishnaFontPx, 11);
  assert.equal(bad.design.maxMishnaFontPx, 200);

  // The ceiling always covers the floor.
  const crossed = normalizeSettings({ design: { minMishnaFontPx: 80, maxMishnaFontPx: 20 } });
  assert.equal(crossed.design.maxMishnaFontPx, crossed.design.minMishnaFontPx);
  assert.equal(crossed.design.minMishnaFontPx, 80);
});

test('normalizeSettings bounds the page margins to 0..2 inches', () => {
  const s = normalizeSettings({ design: { marginTop: 5, marginBottom: -1, marginLeft: '1.25', marginRight: 'oops' } });
  assert.equal(s.design.marginTop, 2);
  assert.equal(s.design.marginBottom, 0);
  assert.equal(s.design.marginLeft, 1.25);
  assert.equal(s.design.marginRight, DEFAULTS.design.marginRight);
});

test('makeDefaults returns fresh clones (no shared mutation)', () => {
  const a = makeDefaults();
  a.design.accent = '#000000';
  a.weekdays.push(99);
  const b = makeDefaults();
  assert.notEqual(b.design.accent, '#000000');
  assert.deepEqual(b.weekdays, [0, 1, 2, 3, 4, 5, 6]);
});

test('normalizeSettings repairs an empty / garbage object to defaults', () => {
  assert.deepEqual(normalizeSettings(null).design.template, DEFAULTS.design.template);
  assert.deepEqual(normalizeSettings('nope').start.book, DEFAULTS.start.book);
  assert.deepEqual(normalizeSettings([1, 2, 3]).count, DEFAULTS.count);
});

test('normalizeSettings preserves valid user values (deep merge)', () => {
  const s = normalizeSettings({
    lang: 'he',
    count: 12,
    weekdays: [0, 2, 4],
    start: { book: 'Pirkei Avot', chapter: 1, mishna: 1 },
    text: { language: 'en', nikud: false, bartenura: false },
    design: { template: 'night', accent: '#123abc', pageSize: 'legal', showProjectDedication: false },
  });
  assert.equal(s.lang, 'he');
  assert.equal(s.count, 12);
  assert.deepEqual(s.weekdays, [0, 2, 4]);
  assert.equal(s.start.book, 'Pirkei Avot');
  assert.equal(s.text.language, 'en');
  assert.equal(s.text.nikud, false);
  assert.equal(s.design.template, 'night');
  assert.equal(s.design.accent, '#123abc');
  assert.equal(s.design.pageSize, 'legal');
  assert.equal(s.design.showProjectDedication, false);
});

test('normalizeSettings clamps out-of-range numbers', () => {
  assert.equal(normalizeSettings({ count: 999 }).count, 30);
  assert.equal(normalizeSettings({ count: 0 }).count, 1);
  assert.equal(normalizeSettings({ count: -5 }).count, 1);
  const custom = normalizeSettings({ design: { pageSize: 'custom', customPageWidth: 99, customPageHeight: 2 } });
  assert.equal(custom.design.pageSize, 'custom');
  assert.ok(custom.design.customPageWidth <= 17 && custom.design.customPageWidth >= 5);
  assert.ok(custom.design.customPageHeight <= 17 && custom.design.customPageHeight >= 5);
});

test('normalizeSettings rejects invalid enums and falls back', () => {
  assert.equal(normalizeSettings({ design: { template: 'bogus' } }).design.template, 'classic');
  assert.equal(normalizeSettings({ design: { pageSize: 'a3' } }).design.pageSize, 'letter');
  assert.equal(normalizeSettings({ design: { quality: 'lol' } }).design.quality, 'high');
  assert.equal(normalizeSettings({ design: { font: 'comic' } }).design.font, 'frank');
  assert.equal(normalizeSettings({ design: { weekdayDisplay: 'klingon' } }).design.weekdayDisplay, 'auto');
  assert.equal(normalizeSettings({ design: { accent: 'red' } }).design.accent, DEFAULTS.design.accent);
});

test('normalizeSettings de-dupes and sorts weekdays, drops invalid days', () => {
  const s = normalizeSettings({ weekdays: [6, 6, 0, 3, 99, -1, 2] });
  assert.deepEqual(s.weekdays, [0, 2, 3, 6]);
});

test('migration: legacy settings without commentaryFont inherit the main font', () => {
  const s = normalizeSettings({ design: { font: 'heebo' } });
  assert.equal(s.design.commentaryFont, 'heebo');
});

test('migration: obsolete/unknown keys are dropped', () => {
  const s = normalizeSettings({ design: { template: 'modern', obsoleteField: 'x' }, extraTop: 1 });
  assert.equal(s.design.obsoleteField, undefined);
  assert.equal(s.extraTop, undefined);
});

test('startDate only accepts ISO YYYY-MM-DD', () => {
  assert.equal(normalizeSettings({ startDate: '2026-09-03' }).startDate, '2026-09-03');
  assert.match(normalizeSettings({ startDate: 'not-a-date' }).startDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('free-text fields are length-capped and coerced to strings', () => {
  const long = 'x'.repeat(5000);
  const s = normalizeSettings({ design: { institution: long, footerNote: 42 } });
  assert.ok(s.design.institution.length <= 2000);
  assert.equal(s.design.footerNote, ''); // non-string -> default
});

test('safeImageDataUrl accepts only inert image data URLs', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA',
    ok = safeImageDataUrl(png);
  assert.equal(ok, png);
  assert.equal(safeImageDataUrl('javascript:alert(1)'), null);
  assert.equal(safeImageDataUrl('data:text/html;base64,PHNjcmlwdD4='), null);
  assert.equal(safeImageDataUrl('http://evil.example/x.png'), null);
  assert.equal(safeImageDataUrl(12345), null);
});

test('safeImageDataUrl blocks scriptable SVG payloads', () => {
  const svgScript = 'data:image/svg+xml;base64,' + Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64');
  assert.equal(safeImageDataUrl(svgScript), null);
  const svgClean = 'data:image/svg+xml;base64,' + Buffer.from('<svg><rect/></svg>').toString('base64');
  assert.equal(safeImageDataUrl(svgClean), svgClean);
});

test('normalizeSettings strips executable image payloads to null', () => {
  const s = normalizeSettings({ design: { logoDataUrl: 'javascript:evil()', bgDataUrl: 'data:text/html,<b>x</b>' } });
  assert.equal(s.design.logoDataUrl, null);
  assert.equal(s.design.bgDataUrl, null);
});

test('stripImages removes uploaded image data (privacy default)', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA';
  const s = normalizeSettings({ design: { logoDataUrl: png, bgDataUrl: png } });
  assert.equal(s.design.logoDataUrl, png);
  const stripped = stripImages(s);
  assert.equal(stripped.design.logoDataUrl, null);
  assert.equal(stripped.design.bgDataUrl, null);
  // original untouched
  assert.equal(s.design.logoDataUrl, png);
});

test('schema version and project dedication constant are exported', () => {
  assert.ok(Number.isInteger(SETTINGS_SCHEMA_VERSION));
  assert.match(PROJECT_DEDICATION_HE, /אסתר בילא/);
  assert.equal(/[A-Za-z]/.test(PROJECT_DEDICATION_HE), false, 'dedication must be Latin-free');
});
