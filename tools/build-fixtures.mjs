/**
 * tools/build-fixtures.mjs
 * ---------------------------------------------------------------------------
 * Builds tests/fixtures/fixtures.json - the deterministic Sefaria API
 * responses used by the e2e tests (so tests never hit the network).
 *
 * The Mishnah Bekhorot 3:2 Hebrew text, its Bartenura commentary and the
 * English (William Davidson / Koren-Steinsaltz) translation are REAL captures
 * from https://www.sefaria.org/api/v3/texts/... taken 2026-09-03.
 * The remaining refs (Bekhorot 3:3, 3:4, 4:1 and their Bartenura) are
 * synthetic clones with realistic lengths - clearly marked as synthetic.
 * The calendar fixtures mirror the real /api/calendars response shape.
 *
 * Run:  node tools/build-fixtures.mjs
 * ---------------------------------------------------------------------------
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- real captures (2026-09-03) ---------------------------------------- */

const BEKHOROT_3_2_HE =
  'רַבָּן שִׁמְעוֹן בֶּן גַּמְלִיאֵל אוֹמֵר, הַלּוֹקֵחַ בְּהֵמָה מְנִיקָה מִן הַנָּכְרִי, אֵינוֹ חוֹשֵׁשׁ שֶׁמָּא בְּנָהּ שֶׁל אַחֶרֶת הָיָה. ' +
  'נִכְנַס לְתוֹךְ עֶדְרוֹ וְרָאָה אֶת הַמַּבְכִּירוֹת מְנִיקוֹת וְאֶת שֶׁאֵינָן מַבְכִּירוֹת מְנִיקוֹת, ' +
  'אֵינוֹ חוֹשֵׁשׁ שֶׁמָּא בְּנָהּ שֶׁל זוֹ בָּא לוֹ אֵצֶל זוֹ, אוֹ שֶׁמָּא בְּנָהּ שֶׁל זוֹ בָּא לוֹ אֵצֶל זוֹ: \n';

const BEKHOROT_3_2_EN =
  'Rabban Shimon ben Gamliel says: In the case of one who purchases a nursing female animal from a gentile, ' +
  'he does not need to be concerned, i.e., take into account the possibility, that perhaps it was nursing the offspring ' +
  'of another animal. Rather, the buyer may assume it had previously given birth. In the case of one who enters amid ' +
  'his flock and sees mother animals that gave birth for the first time that were nursing, and also sees mother animals ' +
  'that gave birth not for the first time that were also nursing, he does not need to be concerned that perhaps the ' +
  'offspring of this animal came to that animal to be nursed, or that perhaps the offspring of that animal came to this ' +
  'animal to be nursed.';

const BARTENURA_3_2_HE = [
  'אֵין חוֹשְׁשִׁין שֶׁמָּא בְנָהּ שֶׁל אַחֶרֶת הָיָה. שֶׁיְּהֵא הַבָּא אַחֲרָיו בְּכוֹר סָפֵק דְּנֵימָא הַךְ בְּהֵמָה לֹא יָלְדָה מֵעוֹלָם אֶלָּא שֶׁאָהֲבָה אֶת זֶה בֶּן חֲבֶרְתָּהּ, וְאִי מִשּׁוּם דְּאִית לָהּ חָלָב, הָא אִיכָּא מִעוּטָא דְּחוֹלְבוֹת אַף עַל פִּי שֶׁאֵינָן יוֹלְדוֹת, הָא וַדַּאי לֹא אָמְרִינַן, אֶלָּא בְנָהּ הוּא וּפְטוּרָה מִן הַבְּכוֹרָה:',
  'מַבְכִּירוֹת. בַּחוּרוֹת שֶׁלֹּא יָלְדוּ עַד עַכְשָׁיו:',
  'אֵין חוֹשְׁשִׁין שֶׁמָּא בְנָהּ שֶׁל זוֹ בָא לוֹ אֵצֶל זוֹ. דְּלֵחוּשׁ לְכֻלְּהוּ בִּסְפֵק בְּכוֹרוֹת, אֶלָּא וַדַּאי אוֹתָן הַכְּרוּכִין אַחַר הַמַּבְכִּירוֹת הָווּ בְּכוֹרוֹת וַדָּאִין, וְהַכְּרוּכִין אַחַר שֶׁאֵין מַבְכִּירוֹת הָווּ פְּשׁוּטִין וַדָּאִין. וַהֲלָכָה כְּרַבָּן שִׁמְעוֹן בֶּן גַּמְלִיאֵל:',
];

/* ---- synthetic but realistic clones ------------------------------------ */

const SYN = {
  '3:3': {
    text: 'כֵּיצַד מַפְרִישִׁין בְּכוֹרוֹת. עָמַד בָּעֲדַר וְאָמַר: כָּל שֶׁיִּוָּלֵד בְּעֶדְרִי זֶה הֲרֵי הוּא קֹדֶשׁ, אֵין כְּלוּם. שֶׁלֹּא אָמַר אֶלָּא מַה שֶּׁיִּוָּלֵד: \n',
    bartenura: [
      'כֵּיצַד מַפְרִישִׁין. שֶׁיִּהְיֶה הִפְרָשׁוֹ וְדַאי וְלֹא סָפֵק:',
      'אֵין כְּלוּם. שֶׁלֹּא נִתְקַדֵּשׁ כְּלוּם עַד שֶׁיִּוָּלֵד:',
    ],
  },
  '3:4': {
    text: 'מַפְרִישׁ אֶת הָעֲגָלוֹת וְאֶת הַגְּדָיִים וְאֶת הַטְּלָאִים וְאֶת הַבְּכוֹרוֹת, וְשׁוֹחֵט אוֹתָן בֶּחָצֵר, וְאוֹכֵל אוֹתָן בְּמַאֲכָל גַּס, וְאֵין נִמְלָכִין בָּהֶן, וְאֵין מַעֲלִין מֵהֶן עַל גַּבֵּי הַמִּזְבֵּחַ, וְאֵין נֶהֱנִין בָּהֶן בִּגְזִיזָה וְחֲלִיבָה עַד שֶׁיִּמּוּתוּ, וְאַחַר מִיתָה מֻתָּרִין בִּהְנָיָה מִיָּד, שֶׁנֶּאֱמַר: לֹא תַעְשֹׂק שָׂכִיר עָנִי וְאֶבְיוֹן מֵאַחֶיךָ, וְאָמַר רַבִּי יוֹסֵי: כָּל שֶׁהוּא מֻזְהָר עַל הָעֲבוֹדָה כֵּן הוּא מֻזְהָר עַל הַהֲנָאָה: \n',
    bartenura: [
      'מַפְרִישׁ אֶת הָעֲגָלוֹת. בְּכוֹר בְּהֵמָה טְמֵאָה כְּגוֹן חֲמוֹר מֻתָּר בִּהְנָיָה אַחַר מִיתָה, דִּכְתִיב: וְאֶת חֲמֹר הַבְּכֹר תִּפְדֶּה:',
      'וְאֵין נִמְלָכִין בָּהֶן. שֶׁלֹּא יֹאמַר הִיאָרֵךְ בּוֹ נְגַע, שֶׁמָּא יָבֹא לִידֵי תְּקָלָה:',
    ],
  },
  '4:1': {
    text: 'כֹּהֵן שֶׁמֵּכֵר בְהֶמְתּוֹ שֶׁלֹּא שְׁחָטָהּ, וְלֹקֵחַ אֶת הַמָּעוֹת וְהָלַךְ וְשָׁחַט בָּהֶן בְּהֵמָה אַחֶרֶת, הֲרִי זֶה מֻתָּר. שְׁחָטָהּ וְאַחַר כָּךְ מְכָרָהּ, הֲרִי זֶה מֻתָּר בִּגְזִיזָה: \n',
    bartenura: [
      'שֶׁלֹּא שְׁחָטָהּ. דְּאִי שָׁחַט וְאַחַר כָּךְ מְכָרָהּ, הֲרֵי זֶה מֻתָּר בִּהֲנָיָה מִיָּד:',
    ],
  },
};

/* ---- response builders ---------------------------------------------------- */

function textResponse({ ref, heRef, text, versionTitle, versionTitleInHebrew, license, lang, isCommentary }) {
  const arr = Array.isArray(text) ? text : [text];
  return {
    versions: [
      {
        status: 'locked', priority: 3.0, license, versionNotes: '',
        language: lang === 'en' ? 'en' : 'he',
        versionSource: 'https://www.sefaria.org', versionTitle,
        versionTitleInHebrew: versionTitleInHebrew || '',
        actualLanguage: lang === 'en' ? 'en' : 'he',
        languageFamilyName: lang === 'en' ? 'english' : 'hebrew',
        isSource: lang !== 'en', isPrimary: true,
        direction: lang === 'en' ? 'ltr' : 'rtl',
        text: arr,
      },
    ],
    available_versions: [],
    ref, heRef,
    sections: [String(ref.match(/(\d+):(\d+)$/)[1]), String(ref.match(/(\d+):(\d+)$/)[2])],
    next: '', prev: '',
    warnings: [],
    __synthetic_note: 'Bekhorot 3:2 fixtures are real API captures; other refs are synthetic test data.',
    ...(isCommentary ? {} : {}),
  };
}

function calendarResponse(iso, parshaEn, parshaHe) {
  return {
    date: iso,
    timezone: 'UTC',
    calendar_items: [
      {
        title: { en: 'Parashat Hashavua', he: 'פרשת השבוע' },
        displayValue: { en: parshaEn, he: parshaHe },
        url: 'Deuteronomy.29.9-31.30',
        ref: 'Deuteronomy 29:9-31:30',
        order: 1, category: 'Tanakh',
      },
    ],
  };
}

const fixtures = { texts: {}, calendars: {} };

function key(ref, version) { return `${ref}::${version}`; }

// --- Mishnah Bekhorot, Hebrew (real + synthetic clones)
fixtures.texts[key('Mishnah Bekhorot 3:2', 'hebrew')] = textResponse({
  ref: 'Mishnah Bekhorot 3:2', heRef: 'משנה בכורות ג׳:ב׳',
  text: BEKHOROT_3_2_HE, versionTitle: 'Torat Emet 357',
  versionTitleInHebrew: 'תורת אמת 357', license: 'Public Domain', lang: 'he',
});
for (const [refKey, data] of Object.entries(SYN)) {
  fixtures.texts[key(`Mishnah Bekhorot ${refKey}`, 'hebrew')] = textResponse({
    ref: `Mishnah Bekhorot ${refKey}`, heRef: `משנה בכורות ${refKey}`,
    text: data.text, versionTitle: 'Torat Emet 357',
    versionTitleInHebrew: 'תורת אמת 357', license: 'Public Domain', lang: 'he',
  });
}

// --- Bartenura on Mishnah Bekhorot (real + clones)
fixtures.texts[key('Bartenura on Mishnah Bekhorot 3:2', 'hebrew|Torat-Emet')] = textResponse({
  ref: 'Bartenura on Mishnah Bekhorot 3:2', heRef: 'ברטנורא על משנה בכורות ג׳:ב׳',
  text: BARTENURA_3_2_HE, versionTitle: 'Torat-Emet',
  license: 'CC-BY-NC', lang: 'he', isCommentary: true,
});
for (const [refKey, data] of Object.entries(SYN)) {
  fixtures.texts[key(`Bartenura on Mishnah Bekhorot ${refKey}`, 'hebrew|Torat-Emet')] = textResponse({
    ref: `Bartenura on Mishnah Bekhorot ${refKey}`, heRef: `ברטנורא על משנה בכורות ${refKey}`,
    text: data.bartenura, versionTitle: 'Torat-Emet',
    license: 'CC-BY-NC', lang: 'he', isCommentary: true,
  });
}

// --- English translation (real)
fixtures.texts[key('Mishnah Bekhorot 3:2', 'english|William Davidson Edition - English')] = textResponse({
  ref: 'Mishnah Bekhorot 3:2', heRef: 'משנה בכורות ג׳:ב׳',
  text: BEKHOROT_3_2_EN, versionTitle: 'William Davidson Edition - English',
  license: 'CC-BY-NC', lang: 'en',
});
fixtures.texts[key('Mishnah Bekhorot 3:2', 'english')] = textResponse({
  ref: 'Mishnah Bekhorot 3:2', heRef: 'משנה בכורות ג׳:ב׳',
  text: BEKHOROT_3_2_EN, versionTitle: 'William Davidson Edition - English',
  license: 'CC-BY-NC', lang: 'en',
});
for (const [refKey, data] of Object.entries(SYN)) {
  fixtures.texts[key(`Mishnah Bekhorot ${refKey}`, 'english')] = textResponse({
    ref: `Mishnah Bekhorot ${refKey}`, heRef: `משנה בכורות ${refKey}`,
    text: `English translation of Mishnah Bekhorot ${refKey} (synthetic test fixture). ` + data.text.replace(/[\u0591-\u05C7]/g, '').slice(0, 80),
    versionTitle: 'William Davidson Edition - English', license: 'CC-BY-NC', lang: 'en',
  });
}

// --- calendars (real shape; 2026-09-05 & 09-12 mirror real API output)
fixtures.calendars['2026-9-5'] = calendarResponse('2026-09-05', 'Nitzavim-Vayeilech', 'נצבים-וילך');
fixtures.calendars['2026-9-12'] = calendarResponse('2026-09-12', 'Rosh Hashana I', 'ראש השנה א');
fixtures.calendars['2026-9-19'] = calendarResponse('2026-09-19', 'Haazinu', 'האזינו');
fixtures.calendars['2026-9-26'] = calendarResponse('2026-09-26', 'Sukkot', 'סוכות');

mkdirSync(join(root, 'tests', 'fixtures'), { recursive: true });
writeFileSync(join(root, 'tests', 'fixtures', 'fixtures.json'), JSON.stringify(fixtures, null, 1), 'utf8');
console.log(`fixtures.json written: ${Object.keys(fixtures.texts).length} texts, ${Object.keys(fixtures.calendars).length} calendars`);
