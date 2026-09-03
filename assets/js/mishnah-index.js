/**
 * mishnah-index.js
 * ---------------------------------------------------------------------------
 * The complete structure of the Mishnah: 6 sedarim, 63 masechtot, and the
 * number of mishnayot in every chapter.
 *
 * Source: Sefaria Shape API  (https://www.sefaria.org/api/shape/Mishnah)
 * Captured 2026-09-03. Sefaria data is open source (CC / public domain
 * depending on version) - see https://developers.sefaria.org
 *
 * `book` is the canonical Sefaria index title used to build text refs:
 *    e.g. "Mishnah Bekhorot" -> "Mishnah Bekhorot 3:2"
 *         "Pirkei Avot"      -> "Pirkei Avot 3:2"   (Avot's canonical title)
 * Commentary titles follow the pattern "<Commentary> on <book>".
 * ---------------------------------------------------------------------------
 */

export const SEDARIM = [
  { en: 'Seder Zeraim', he: 'זרעים', order: 1 },
  { en: 'Seder Moed', he: 'מועד', order: 2 },
  { en: 'Seder Nashim', he: 'נשים', order: 3 },
  { en: 'Seder Nezikin', he: 'נזיקין', order: 4 },
  { en: 'Seder Kodashim', he: 'קדשים', order: 5 },
  { en: 'Seder Tahorot', he: 'טהרות', order: 6 },
];

/** @type {Array<{book:string, title:string, heTitle:string, seder:string, chapters:number[]}>} */
export const MISHNAH = [
  // ---- Seder Zeraim ----
  { book: 'Mishnah Berakhot', title: 'Berakhot', heTitle: 'משנה ברכות', seder: 'Seder Zeraim', chapters: [5, 8, 6, 7, 5, 8, 5, 8, 5] },
  { book: 'Mishnah Peah', title: 'Peah', heTitle: 'משנה פאה', seder: 'Seder Zeraim', chapters: [6, 8, 8, 11, 8, 11, 8, 9] },
  { book: 'Mishnah Demai', title: 'Demai', heTitle: 'משנה דמאי', seder: 'Seder Zeraim', chapters: [4, 5, 6, 7, 11, 12, 8] },
  { book: 'Mishnah Kilayim', title: 'Kilayim', heTitle: 'משנה כלאים', seder: 'Seder Zeraim', chapters: [9, 11, 7, 9, 8, 9, 8, 6, 10] },
  { book: 'Mishnah Sheviit', title: "Shevi'it", heTitle: 'משנה שביעית', seder: 'Seder Zeraim', chapters: [8, 10, 10, 10, 9, 6, 7, 11, 9, 9] },
  { book: 'Mishnah Terumot', title: 'Terumot', heTitle: 'משנה תרומות', seder: 'Seder Zeraim', chapters: [10, 6, 9, 13, 9, 6, 7, 12, 7, 12, 10] },
  { book: 'Mishnah Maasrot', title: "Ma'asrot", heTitle: 'משנה מעשרות', seder: 'Seder Zeraim', chapters: [8, 8, 10, 6, 8] },
  { book: 'Mishnah Maaser Sheni', title: "Ma'aser Sheni", heTitle: 'משנה מעשר שני', seder: 'Seder Zeraim', chapters: [7, 10, 13, 12, 15] },
  { book: 'Mishnah Challah', title: 'Challah', heTitle: 'משנה חלה', seder: 'Seder Zeraim', chapters: [9, 8, 10, 11] },
  { book: 'Mishnah Orlah', title: 'Orlah', heTitle: 'משנה ערלה', seder: 'Seder Zeraim', chapters: [9, 17, 9] },
  { book: 'Mishnah Bikkurim', title: 'Bikkurim', heTitle: 'משנה ביכורים', seder: 'Seder Zeraim', chapters: [11, 11, 12, 5] },
  // ---- Seder Moed ----
  { book: 'Mishnah Shabbat', title: 'Shabbat', heTitle: 'משנה שבת', seder: 'Seder Moed', chapters: [11, 7, 6, 2, 4, 10, 4, 7, 7, 6, 6, 6, 7, 4, 3, 8, 8, 3, 6, 5, 3, 6, 5, 5] },
  { book: 'Mishnah Eruvin', title: 'Eruvin', heTitle: 'משנה עירובין', seder: 'Seder Moed', chapters: [10, 6, 9, 11, 9, 10, 11, 11, 4, 15] },
  { book: 'Mishnah Pesachim', title: 'Pesachim', heTitle: 'משנה פסחים', seder: 'Seder Moed', chapters: [7, 8, 8, 9, 10, 6, 13, 8, 11, 9] },
  { book: 'Mishnah Shekalim', title: 'Shekalim', heTitle: 'משנה שקלים', seder: 'Seder Moed', chapters: [7, 5, 4, 9, 6, 6, 7, 8] },
  { book: 'Mishnah Yoma', title: 'Yoma', heTitle: 'משנה יומא', seder: 'Seder Moed', chapters: [8, 7, 11, 6, 7, 8, 5, 9] },
  { book: 'Mishnah Sukkah', title: 'Sukkah', heTitle: 'משנה סוכה', seder: 'Seder Moed', chapters: [11, 9, 15, 10, 8] },
  { book: 'Mishnah Beitzah', title: 'Beitzah', heTitle: 'משנה ביצה', seder: 'Seder Moed', chapters: [10, 10, 8, 7, 7] },
  { book: 'Mishnah Rosh Hashanah', title: 'Rosh Hashanah', heTitle: 'משנה ראש השנה', seder: 'Seder Moed', chapters: [9, 9, 8, 9] },
  { book: "Mishnah Ta'anit", title: "Ta'anit", heTitle: 'משנה תענית', seder: 'Seder Moed', chapters: [7, 10, 9, 8] },
  { book: 'Mishnah Megillah', title: 'Megillah', heTitle: 'משנה מגילה', seder: 'Seder Moed', chapters: [11, 6, 6, 10] },
  { book: 'Mishnah Moed Katan', title: 'Moed Katan', heTitle: 'משנה מועד קטן', seder: 'Seder Moed', chapters: [10, 5, 9] },
  { book: 'Mishnah Chagigah', title: 'Chagigah', heTitle: 'משנה חגיגה', seder: 'Seder Moed', chapters: [8, 7, 8] },
  // ---- Seder Nashim ----
  { book: 'Mishnah Yevamot', title: 'Yevamot', heTitle: 'משנה יבמות', seder: 'Seder Nashim', chapters: [4, 10, 10, 13, 6, 6, 6, 6, 6, 9, 7, 6, 13, 9, 10, 7] },
  { book: 'Mishnah Ketubot', title: 'Ketubot', heTitle: 'משנה כתובות', seder: 'Seder Nashim', chapters: [10, 10, 9, 12, 9, 7, 10, 8, 9, 6, 6, 4, 11] },
  { book: 'Mishnah Nedarim', title: 'Nedarim', heTitle: 'משנה נדרים', seder: 'Seder Nashim', chapters: [4, 5, 11, 8, 6, 10, 9, 7, 10, 8, 12] },
  { book: 'Mishnah Nazir', title: 'Nazir', heTitle: 'משנה נזיר', seder: 'Seder Nashim', chapters: [7, 10, 7, 7, 7, 11, 4, 2, 5] },
  { book: 'Mishnah Sotah', title: 'Sotah', heTitle: 'משנה סוטה', seder: 'Seder Nashim', chapters: [9, 6, 8, 5, 5, 4, 8, 7, 15] },
  { book: 'Mishnah Gittin', title: 'Gittin', heTitle: 'משנה גיטין', seder: 'Seder Nashim', chapters: [6, 7, 8, 9, 9, 7, 9, 10, 10] },
  { book: 'Mishnah Kiddushin', title: 'Kiddushin', heTitle: 'משנה קידושין', seder: 'Seder Nashim', chapters: [10, 10, 13, 14] },
  // ---- Seder Nezikin ----
  { book: 'Mishnah Bava Kamma', title: 'Bava Kamma', heTitle: 'משנה בבא קמא', seder: 'Seder Nezikin', chapters: [4, 6, 11, 9, 7, 6, 7, 7, 12, 10] },
  { book: 'Mishnah Bava Metzia', title: 'Bava Metzia', heTitle: 'משנה בבא מציעא', seder: 'Seder Nezikin', chapters: [8, 11, 12, 12, 11, 8, 11, 9, 13, 6] },
  { book: 'Mishnah Bava Batra', title: 'Bava Batra', heTitle: 'משנה בבא בתרא', seder: 'Seder Nezikin', chapters: [6, 14, 8, 9, 11, 8, 4, 8, 10, 8] },
  { book: 'Mishnah Sanhedrin', title: 'Sanhedrin', heTitle: 'משנה סנהדרין', seder: 'Seder Nezikin', chapters: [6, 5, 8, 5, 5, 6, 11, 7, 6, 6, 6] },
  { book: 'Mishnah Makkot', title: 'Makkot', heTitle: 'משנה מכות', seder: 'Seder Nezikin', chapters: [10, 8, 16] },
  { book: 'Mishnah Shevuot', title: 'Shevuot', heTitle: 'משנה שבועות', seder: 'Seder Nezikin', chapters: [7, 5, 11, 13, 5, 7, 8, 6] },
  { book: 'Mishnah Eduyot', title: 'Eduyot', heTitle: 'משנה עדיות', seder: 'Seder Nezikin', chapters: [14, 10, 12, 12, 7, 3, 9, 7] },
  { book: 'Mishnah Avodah Zarah', title: 'Avodah Zarah', heTitle: 'משנה עבודה זרה', seder: 'Seder Nezikin', chapters: [9, 7, 10, 12, 12] },
  { book: 'Pirkei Avot', title: 'Avot', heTitle: 'משנה אבות', seder: 'Seder Nezikin', chapters: [18, 16, 18, 22, 23, 11] },
  { book: 'Mishnah Horayot', title: 'Horayot', heTitle: 'משנה הוריות', seder: 'Seder Nezikin', chapters: [5, 7, 8] },
  // ---- Seder Kodashim ----
  { book: 'Mishnah Zevachim', title: 'Zevachim', heTitle: 'משנה זבחים', seder: 'Seder Kodashim', chapters: [4, 5, 6, 6, 8, 7, 6, 12, 7, 8, 8, 6, 8, 10] },
  { book: 'Mishnah Menachot', title: 'Menachot', heTitle: 'משנה מנחות', seder: 'Seder Kodashim', chapters: [4, 5, 7, 5, 9, 7, 6, 7, 9, 9, 9, 5, 11] },
  { book: 'Mishnah Chullin', title: 'Chullin', heTitle: 'משנה חולין', seder: 'Seder Kodashim', chapters: [7, 10, 7, 7, 5, 7, 6, 6, 8, 4, 2, 5] },
  { book: 'Mishnah Bekhorot', title: 'Bekhorot', heTitle: 'משנה בכורות', seder: 'Seder Kodashim', chapters: [7, 9, 4, 10, 6, 12, 7, 10, 8] },
  { book: 'Mishnah Arakhin', title: 'Arakhin', heTitle: 'משנה ערכין', seder: 'Seder Kodashim', chapters: [4, 6, 5, 4, 6, 5, 5, 7, 8] },
  { book: 'Mishnah Temurah', title: 'Temurah', heTitle: 'משנה תמורה', seder: 'Seder Kodashim', chapters: [6, 3, 5, 4, 6, 5, 6] },
  { book: 'Mishnah Keritot', title: 'Keritot', heTitle: 'משנה כריתות', seder: 'Seder Kodashim', chapters: [7, 6, 10, 3, 8, 9] },
  { book: 'Mishnah Meilah', title: 'Meilah', heTitle: 'משנה מעילה', seder: 'Seder Kodashim', chapters: [4, 9, 8, 6, 5, 6] },
  { book: 'Mishnah Tamid', title: 'Tamid', heTitle: 'משנה תמיד', seder: 'Seder Kodashim', chapters: [4, 5, 9, 3, 6, 3, 4] },
  { book: 'Mishnah Middot', title: 'Middot', heTitle: 'משנה מדות', seder: 'Seder Kodashim', chapters: [9, 6, 8, 7, 4] },
  { book: 'Mishnah Kinnim', title: 'Kinnim', heTitle: 'משנה קינים', seder: 'Seder Kodashim', chapters: [4, 5, 6] },
  // ---- Seder Tahorot ----
  { book: 'Mishnah Kelim', title: 'Kelim', heTitle: 'משנה כלים', seder: 'Seder Tahorot', chapters: [9, 8, 8, 4, 11, 4, 6, 11, 8, 8, 9, 8, 8, 8, 6, 8, 17, 9, 10, 7, 3, 10, 5, 17, 9, 9, 12, 10, 8, 4] },
  { book: 'Mishnah Oholot', title: 'Oholot', heTitle: 'משנה אהלות', seder: 'Seder Tahorot', chapters: [8, 7, 7, 3, 7, 7, 6, 6, 16, 7, 9, 8, 6, 7, 10, 5, 5, 10] },
  { book: 'Mishnah Negaim', title: 'Negaim', heTitle: 'משנה נגעים', seder: 'Seder Tahorot', chapters: [6, 5, 8, 11, 5, 8, 5, 10, 3, 10, 12, 7, 12, 13] },
  { book: 'Mishnah Parah', title: 'Parah', heTitle: 'משנה פרה', seder: 'Seder Tahorot', chapters: [4, 5, 11, 4, 9, 5, 12, 11, 9, 6, 9, 11] },
  { book: 'Mishnah Tahorot', title: 'Tahorot', heTitle: 'משנה טהרות', seder: 'Seder Tahorot', chapters: [9, 8, 8, 13, 9, 10, 9, 9, 9, 8] },
  { book: 'Mishnah Mikvaot', title: 'Mikvaot', heTitle: 'משנה מקואות', seder: 'Seder Tahorot', chapters: [8, 10, 4, 5, 6, 11, 7, 5, 7, 8] },
  { book: 'Mishnah Niddah', title: 'Niddah', heTitle: 'משנה נדה', seder: 'Seder Tahorot', chapters: [7, 7, 7, 7, 9, 14, 5, 4, 11, 8] },
  { book: 'Mishnah Makhshirin', title: 'Makhshirin', heTitle: 'משנה מכשירין', seder: 'Seder Tahorot', chapters: [6, 11, 8, 10, 11, 8] },
  { book: 'Mishnah Zavim', title: 'Zavim', heTitle: 'משנה זבים', seder: 'Seder Tahorot', chapters: [6, 4, 3, 7, 12] },
  { book: 'Mishnah Tevul Yom', title: 'Tevul Yom', heTitle: 'משנה טבול יום', seder: 'Seder Tahorot', chapters: [5, 8, 6, 7] },
  { book: 'Mishnah Yadayim', title: 'Yadayim', heTitle: 'משנה ידים', seder: 'Seder Tahorot', chapters: [5, 4, 5, 8] },
  { book: 'Mishnah Oktzin', title: 'Oktzin', heTitle: 'משנה עוקצים', seder: 'Seder Tahorot', chapters: [6, 10, 12] },
];

export const COMMENTARIES = {
  bartenura: {
    key: 'bartenura',
    en: 'Bartenura',
    he: 'הברטנורא',
    labelEn: 'Bartenura (Rabbi Ovadiah of Bertinoro)',
    labelHe: 'פירוש הברטנורא',
    hebrewTitle: 'ברטנורא',
    /** default version selection per language */
    versions: { he: 'hebrew|Torat-Emet', en: 'english|Bartenura on Mishnah, trans. by Rabbi Robert Alpert, 2020' },
    available: 'all',
  },
  tosafotYT: {
    key: 'tosafotYT',
    en: 'Tosafot Yom Tov',
    he: 'תוספות יום טוב',
    labelEn: 'Tosafot Yom Tov',
    labelHe: 'תוספות יום טוב',
    hebrewTitle: 'תוספות יום טוב',
    versions: { he: 'hebrew', en: 'hebrew' },
    available: 'most',
  },
  rambam: {
    key: 'rambam',
    en: 'Rambam',
    he: 'הרמב״ם',
    labelEn: "Rambam's Commentary on the Mishnah",
    labelHe: 'פירוש הרמב״ם',
    hebrewTitle: 'רמב״ם',
    versions: { he: 'hebrew', en: 'hebrew' },
    available: 'most',
  },
};

/** Find a masechet entry by its canonical Sefaria book title. */
export function findMasechet(book) {
  return MISHNAH.find((m) => m.book === book) || null;
}

/** English translation source options for the mishna text. */
export const ENGLISH_VERSIONS = {
  auto: { value: 'english', labelEn: 'Best available', labelHe: '' },
  davidson: { value: 'english|William Davidson Edition - English', labelEn: 'Koren–Steinsaltz (Davidson Edition)', labelHe: '' },
  kulp: { value: 'english|Mishnah Yomit by Dr. Joshua Kulp', labelEn: 'Mishnah Yomit – Dr. Joshua Kulp', labelHe: '' },
  community: { value: 'english|Sefaria Community Translation', labelEn: 'Sefaria Community Translation', labelHe: '' },
};

/** Hebrew version options. */
export const HEBREW_VERSIONS = {
  auto: { value: 'hebrew', labelEn: 'Standard (with nikud)', labelHe: 'רגיל (עם ניקוד)' },
  vilna: { value: 'hebrew|Mishnah, ed. Romm, Vilna 1913', labelEn: 'Vilna 1913 edition', labelHe: 'מהדורת וילנא תרע״ג' },
};
