/**
 * schedule.js - Pure scheduling logic.
 *
 * Given a start date, a set of weekdays, the number of mishnas wanted and a
 * starting position (tractate / chapter / mishna), produce the ordered list
 * of learning days and the mishna learned on each one.
 *
 * Rules:
 *  - one mishna per learning day, in order;
 *  - a day is a learning day when its weekday is selected, and (optionally)
 *    it is not Yom Tov;
 *  - mishnas advance within a chapter, then to the next chapter, then to the
 *    next tractate (and wrap around the whole Mishnah if needed).
 */

import { MISHNAH, findMasechet } from './mishnah-index.js';
import { isYomTov, isoDate } from './hebrew.js';

export const MAX_MISHNAS = 30;

/**
 * @param {{startDate:string, count:number, weekdays:number[], skipYomTov:boolean,
 *          diaspora:boolean, start:{book:string, chapter:number, mishna:number}}} settings
 * @returns {{entries:Array, wrappedToStart:boolean, skipped:Array}} schedule
 */
export function buildSchedule(settings) {
  const count = Math.max(1, Math.min(MAX_MISHNAS, Math.floor(settings.count) || 1));
  const weekdays = new Set((settings.weekdays || []).filter((d) => d >= 0 && d <= 6));
  const start = settings.start;

  const entries = [];
  const skipped = [];
  let wrappedToStart = false;

  // Position cursor
  let bookIdx = MISHNAH.findIndex((m) => m.book === start.book);
  if (bookIdx < 0) bookIdx = 0;
  let chapter = Math.max(1, Math.min(MISHNAH[bookIdx].chapters.length, start.chapter | 0));
  let mishna = Math.max(1, Math.min(MISHNAH[bookIdx].chapters[chapter - 1], start.mishna | 0));

  // Date cursor (local noon avoids DST boundaries)
  const [y, m, d] = settings.startDate.split('-').map(Number);
  let date = new Date(y, m - 1, d, 12, 0, 0);
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Hard stop: never scan more than ~5 years looking for learning days
  const maxIterations = 366 * 5;

  for (let i = 0; entries.length < count && i < maxIterations; i++, date.setDate(date.getDate() + 1)) {
    const dow = date.getDay();
    if (!weekdays.has(dow)) continue;
    if (settings.skipYomTov && isYomTov(date, settings.diaspora)) {
      skipped.push({ date: isoDate(date), reason: 'yomtov' });
      continue;
    }
    const masechet = MISHNAH[bookIdx];
    entries.push({
      date: isoDate(date),
      book: masechet.book,
      chapter,
      mishna,
    });
    // advance position
    if (mishna < masechet.chapters[chapter - 1]) {
      mishna += 1;
    } else if (chapter < masechet.chapters.length) {
      chapter += 1;
      mishna = 1;
    } else {
      // next tractate
      bookIdx += 1;
      if (bookIdx >= MISHNAH.length) {
        bookIdx = 0;
        wrappedToStart = true;
      }
      chapter = 1;
      mishna = 1;
    }
  }

  return { entries, wrappedToStart, skipped };
}

/** Total mishnas in a tractate. */
export function totalMishnas(book) {
  const m = findMasechet(book);
  return m ? m.chapters.reduce((a, b) => a + b, 0) : 0;
}

/** Validate schedule inputs; returns list of error keys (i18n). */
export function validateSettings(settings) {
  const errors = [];
  if (!settings.weekdays || settings.weekdays.length === 0) errors.push('errWeekdays');
  const c = Number(settings.count);
  if (!Number.isFinite(c) || c < 1 || c > MAX_MISHNAS) errors.push('errCount');
  if (!settings.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(settings.startDate)) errors.push('errStartDate');
  return errors;
}
