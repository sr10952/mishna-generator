import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, validateSettings, MAX_MISHNAS, totalMishnas } from '../../assets/js/schedule.js';
import { MISHNAH, findMasechet } from '../../assets/js/mishnah-index.js';
import { parseISODate } from '../../assets/js/hebrew.js';

const base = {
  startDate: '2026-09-03',
  count: 4,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  skipYomTov: false,
  diaspora: true,
  start: { book: 'Mishnah Bekhorot', chapter: 3, mishna: 2 },
};

const refs = (s) => s.entries.map((e) => `${e.book} ${e.chapter}:${e.mishna}`);
const dates = (s) => s.entries.map((e) => e.date);

test('sequential mishnas on consecutive days (the brief\'s example)', () => {
  const s = buildSchedule(base);
  assert.deepEqual(refs(s), [
    'Mishnah Bekhorot 3:2',
    'Mishnah Bekhorot 3:3',
    'Mishnah Bekhorot 3:4',
    'Mishnah Bekhorot 4:1',
  ]);
  assert.deepEqual(dates(s), ['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
});

test('chapter rollover', () => {
  const s = buildSchedule({ ...base, start: { book: 'Mishnah Bekhorot', chapter: 3, mishna: 4 } });
  assert.deepEqual(refs(s).slice(0, 2), ['Mishnah Bekhorot 3:4', 'Mishnah Bekhorot 4:1']);
});

test('tractate rollover', () => {
  const s = buildSchedule({ ...base, start: { book: 'Mishnah Bekhorot', chapter: 9, mishna: 8 } });
  assert.deepEqual(refs(s).slice(0, 2), ['Mishnah Bekhorot 9:8', 'Mishnah Arakhin 1:1']);
});

test('wraps around the whole Mishnah after Oktzin', () => {
  const s = buildSchedule({ ...base, start: { book: 'Mishnah Oktzin', chapter: 3, mishna: 12 } });
  assert.deepEqual(refs(s).slice(0, 2), ['Mishnah Oktzin 3:12', 'Mishnah Berakhot 1:1']);
  assert.equal(s.wrappedToStart, true);
});

test('weekday filter: Fridays only', () => {
  const s = buildSchedule({ ...base, count: 3, weekdays: [5] });
  assert.deepEqual(dates(s), ['2026-09-04', '2026-09-11', '2026-09-18']);
  for (const e of s.entries) {
    assert.equal(parseISODate(e.date).getDay(), 5);
  }
});

test('weekday filter: not on Shabbat', () => {
  const s = buildSchedule({ ...base, count: 7, weekdays: [0, 1, 2, 3, 4, 5] });
  for (const e of s.entries) {
    assert.notEqual(parseISODate(e.date).getDay(), 6);
  }
  assert.equal(dates(s).includes('2026-09-05'), false);
});

test('skipYomTov skips Rosh Hashana 5787', () => {
  const s = buildSchedule({ ...base, startDate: '2026-09-10', count: 4, skipYomTov: true });
  assert.deepEqual(dates(s), ['2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15']);
  assert.deepEqual(s.skipped.map((x) => x.date), ['2026-09-12', '2026-09-13']);
});

test('skipYomTov respects Israel calendar (RH is 2 days everywhere; Sukkot day 2 only in diaspora)', () => {
  // Rosh Hashana is two days even in Israel
  const il = buildSchedule({ ...base, startDate: '2026-09-10', count: 4, skipYomTov: true, diaspora: false });
  assert.deepEqual(dates(il), ['2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15']);
  // Sukkot day 2 (2026-09-27) is Yom Tov only in the diaspora
  const galut = buildSchedule({ ...base, startDate: '2026-09-25', count: 3, skipYomTov: true, diaspora: true });
  assert.deepEqual(dates(galut), ['2026-09-25', '2026-09-28', '2026-09-29']); // 26,27 = Sukkot 1+2
  const eretz = buildSchedule({ ...base, startDate: '2026-09-25', count: 3, skipYomTov: true, diaspora: false });
  assert.deepEqual(dates(eretz), ['2026-09-25', '2026-09-27', '2026-09-28']); // 26 only, 27 = Chol HaMoed
});

test('no weekday selected still terminates (empty schedule)', () => {
  const s = buildSchedule({ ...base, weekdays: [] });
  assert.equal(s.entries.length, 0);
});

test('count is capped at 30', () => {
  const s = buildSchedule({ ...base, count: 99 });
  assert.equal(s.entries.length, MAX_MISHNAS);
  assert.equal(MAX_MISHNAS, 30);
});

test('validateSettings catches bad input', () => {
  assert.deepEqual(validateSettings({ ...base, weekdays: [] }), ['errWeekdays']);
  assert.deepEqual(validateSettings({ ...base, count: 31 }), ['errCount']);
  assert.deepEqual(validateSettings({ ...base, count: 0 }), ['errCount']);
  assert.deepEqual(validateSettings(base), []);
});

test('mishnah index integrity', () => {
  assert.equal(MISHNAH.length, 63);
  const books = new Set(MISHNAH.map((m) => m.book));
  assert.equal(books.size, 63);
  // Bekhorot: 9 chapters, ch 3 has 4 mishnas (3:2 from the brief is valid)
  const bekhorot = findMasechet('Mishnah Bekhorot');
  assert.equal(bekhorot.chapters.length, 9);
  assert.deepEqual(bekhorot.chapters, [7, 9, 4, 10, 6, 12, 7, 10, 8]);
  assert.ok(bekhorot.chapters[2] >= 2);
  assert.equal(totalMishnas('Mishnah Bekhorot'), 73);
  // every masechet has chapters and a seder
  for (const m of MISHNAH) {
    assert.ok(m.chapters.length >= 1, m.book);
    assert.ok(m.chapters.every((c) => c >= 1), m.book);
    assert.ok(m.seder, m.book);
    assert.ok(m.heTitle, m.book);
  }
  // Avot canonical title quirk
  assert.ok(findMasechet('Pirkei Avot'));
  // sedarim all present
  const sedarim = new Set(MISHNAH.map((m) => m.seder));
  assert.equal(sedarim.size, 6);
});

test('avot and its gematria-friendly hebrew titles exist', () => {
  const avot = findMasechet('Pirkei Avot');
  assert.equal(avot.heTitle, 'משנה אבות');
  assert.equal(avot.chapters.length, 6);
});
