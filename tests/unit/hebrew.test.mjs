import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gematria, stripNikud, sanitizeText, isParshaName, containsLatinLetters,
  formatHebrewDate, hebrewDate, isYomTov, saturdayOf, isoDate, parseISODate, formatWeekday,
} from '../../assets/js/hebrew.js';

test('gematria basics', () => {
  assert.equal(gematria(1), 'א׳');
  assert.equal(gematria(2), 'ב׳');
  assert.equal(gematria(3), 'ג׳');
  assert.equal(gematria(7), 'ז׳');
  assert.equal(gematria(11), 'י״א');
  assert.equal(gematria(15), 'ט״ו');
  assert.equal(gematria(16), 'ט״ז');
  assert.equal(gematria(20), 'כ׳');
  assert.equal(gematria(21), 'כ״א');
  assert.equal(gematria(30), 'ל׳');
  assert.equal(gematria(100), 'ק׳');
  assert.equal(gematria(376), 'שע״ו'); // 300+70+6
  assert.equal(gematria(786), 'תשפ״ו');
});

test('stripNikud removes vowels but keeps maqaf and gershayim', () => {
  assert.equal(stripNikud('שָׁלוֹם'), 'שלום');
  assert.equal(stripNikud('בְּהֵמָה'), 'בהמה');
  assert.equal(stripNikud('עַל־יְדֵי'), 'על־ידי'); // maqaf U+05BE kept
  assert.equal(stripNikud('כ״א באלול'), 'כ״א באלול'); // gershayim kept
  assert.equal(stripNikud('שֶׁבֶת שַׁבָּתוֹן'), 'שבת שבתון');
});

test('sanitizeText blocks XSS but keeps safe formatting', () => {
  assert.equal(sanitizeText('plain text'), 'plain text');
  assert.equal(sanitizeText('a &amp; b'), 'a &amp; b'.replace('&amp;', '&amp;')); // & decodes then re-escapes
  assert.equal(sanitizeText('<b>bold</b>'), '<b>bold</b>');
  assert.equal(sanitizeText('<script>alert(1)</script>ok'), 'ok'); // script content fully dropped
  assert.equal(sanitizeText('<img src=x onerror=alert(1)>'), '');
  assert.equal(sanitizeText('5 &lt; 6'), '5 &lt; 6');
  assert.equal(sanitizeText('line1<br>line2'), 'line1\nline2');
  assert.equal(sanitizeText('<a href="http://x">link</a>'), 'link');
  assert.equal(sanitizeText('quotes « and » stay'), 'quotes « and » stay');
});

test('isParshaName heuristic', () => {
  assert.equal(isParshaName('Nitzavim-Vayeilech'), true);
  assert.equal(isParshaName('נצבים-וילך'), true);
  assert.equal(isParshaName('Bereshit'), true);
  assert.equal(isParshaName('Rosh Hashana I'), false);
  assert.equal(isParshaName('ראש השנה א'), false);
  assert.equal(isParshaName('Shabbat Shuva'), false);
  assert.equal(isParshaName(''), false);
});

test('containsLatinLetters', () => {
  assert.equal(containsLatinLetters('שלום'), false);
  assert.equal(containsLatinLetters('שלום Shalom'), true);
  assert.equal(containsLatinLetters('123 !? ·'), false);
});

test('hebrewDate via Intl (known anchors)', () => {
  // 2026-09-03 = 21 Elul 5786 (verified against Sefaria's calendar API)
  const h = hebrewDate(parseISODate('2026-09-03'));
  assert.equal(h.day, 21);
  assert.equal(h.monthHe, 'אלול');
  assert.equal(h.year, 5786);
  assert.equal(h.month, 13); // Elul is month 13 when counted from Tishri

  // 2026-09-12 = 1 Tishri 5787 (Rosh Hashana, per Sefaria calendar API)
  const rh = hebrewDate(parseISODate('2026-09-12'));
  assert.equal(rh.day, 1);
  assert.equal(rh.month, 1);
  assert.equal(rh.year, 5787);
});

test('formatHebrewDate in both languages', () => {
  const d = parseISODate('2026-09-03');
  assert.equal(formatHebrewDate(d, 'he'), 'כ״א באלול תשפ״ו');
  assert.equal(formatHebrewDate(d, 'en'), '21 Elul 5786');
});

test('weekday names', () => {
  const d = parseISODate('2026-09-03'); // Thursday
  assert.equal(formatWeekday(d, 'en'), 'Thursday');
  assert.equal(formatWeekday(d, 'he'), 'יום חמישי');
});

test('isYomTov anchors (2026/5787)', () => {
  const diaspora = true;
  assert.equal(isYomTov(parseISODate('2026-09-12'), diaspora), true);  // RH 1
  assert.equal(isYomTov(parseISODate('2026-09-13'), diaspora), true);  // RH 2
  assert.equal(isYomTov(parseISODate('2026-09-21'), diaspora), true);  // Yom Kippur (10 Tishri)
  assert.equal(isYomTov(parseISODate('2026-09-26'), diaspora), true);  // Sukkot day 1
  assert.equal(isYomTov(parseISODate('2026-09-27'), diaspora), true);  // Sukkot day 2 (diaspora)
  assert.equal(isYomTov(parseISODate('2026-09-27'), false), false);   // ...but Chol HaMoed in Israel
  assert.equal(isYomTov(parseISODate('2026-10-01'), diaspora), false); // Chol HaMoed - learning continues
  assert.equal(isYomTov(parseISODate('2026-10-03'), diaspora), true);  // Shmini Atzeret (22 Tishri)
  assert.equal(isYomTov(parseISODate('2026-10-04'), diaspora), true);  // Simchat Torah diaspora
  assert.equal(isYomTov(parseISODate('2026-10-04'), false), false);   // regular day in Israel
  assert.equal(isYomTov(parseISODate('2026-09-14'), diaspora), false); // Tzom Gedaliah - fast, not Yom Tov
  assert.equal(isYomTov(parseISODate('2026-09-03'), diaspora), false); // plain Thursday
  // Pesach 5787 (leap year): 15 Nisan = 2027-04-22
  const pesach = hebrewDate(parseISODate('2027-04-22'));
  assert.equal(pesach.month, 8);
  assert.equal(pesach.day, 15);
  assert.equal(isYomTov(parseISODate('2027-04-22'), true), true);  // Pesach day 1
  assert.equal(isYomTov(parseISODate('2027-04-23'), false), false); // Chol HaMoed in Israel
  assert.equal(isYomTov(parseISODate('2027-04-25'), true), false); // Chol HaMoed Pesach
  assert.equal(isYomTov(parseISODate('2027-04-28'), true), true);  // last day Pesach (21 Nisan)
  assert.equal(isYomTov(parseISODate('2027-04-29'), true), true);  // 22 Nisan diaspora
  assert.equal(isYomTov(parseISODate('2027-04-29'), false), false);
  // Shavuot 5787: 6 Sivan = 2027-06-11 (verified via Intl)
  assert.equal(isYomTov(parseISODate('2027-06-11'), true), true);
  assert.equal(isYomTov(parseISODate('2027-06-12'), true), true);  // 2nd day, diaspora only
  assert.equal(isYomTov(parseISODate('2027-06-12'), false), false);
});

test('saturdayOf', () => {
  assert.equal(isoDate(saturdayOf(parseISODate('2026-09-03'))), '2026-09-05'); // Thu -> Sat
  assert.equal(isoDate(saturdayOf(parseISODate('2026-09-05'))), '2026-09-05'); // Sat -> itself
  assert.equal(isoDate(saturdayOf(parseISODate('2026-09-06'))), '2026-09-12'); // Sun -> next Sat
});
