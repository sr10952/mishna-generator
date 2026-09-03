import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, setLang, t } from '../../assets/js/i18n.js';

test('EN and HE dictionaries have identical keys', () => {
  const en = Object.keys(STRINGS.en).sort();
  const he = Object.keys(STRINGS.he).sort();
  assert.deepEqual(en, he);
});

test('no empty translations', () => {
  for (const [k, v] of Object.entries(STRINGS.en)) assert.ok(String(v).length > 0, `empty en.${k}`);
  for (const [k, v] of Object.entries(STRINGS.he)) assert.ok(String(v).length > 0, `empty he.${k}`);
});

test('Hebrew strings are actually Hebrew where expected', () => {
  const hebrewKeys = ['appTitle', 'downloadPdf', 'masechet', 'parshaPrefix', 'dailyMishna', 'textSource'];
  for (const k of hebrewKeys) {
    assert.match(STRINGS.he[k], /[\u05D0-\u05EA]/, `he.${k} has no Hebrew letters`);
  }
  // native Hebrew mode promise: poster-facing strings must contain zero Latin letters
  for (const k of ['dailyMishna', 'parshaPrefix', 'textSource', 'madeWith']) {
    assert.equal(/[A-Za-z]/.test(STRINGS.he[k]), false, `he.${k} leaks Latin characters`);
  }
});

test('t() switches language and interpolates', () => {
  setLang('en');
  assert.equal(t('appTitle'), 'Mishna Poster Generator');
  assert.equal(t('pageOf', { a: 2, b: 7 }), 'Page 2 of 7');
  setLang('he');
  assert.equal(t('appTitle'), 'מחולל כרזות משנה יומית');
  assert.equal(/[A-Za-z]/.test(t('appTitle')), false);
  assert.equal(t('pageOf', { a: 'ב׳', b: 'ז׳' }), 'עמוד ב׳ מתוך ז׳');
  setLang('en');
});
