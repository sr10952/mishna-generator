# Mishna Poster Generator · מחולל כרזות משנה

A free, fully client-side web app that generates **printable daily-Mishnah study posters**
from open-source [Sefaria](https://sefaria.org) texts. Pick where you're starting
(e.g. *Bekhorot 3:2*), how many mishnayot (up to 30), and which days of the week to
learn — the app builds the schedule, lays out **one mishna per US-Letter page** with the
Hebrew date, weekday, weekly parasha and day counter, and exports a ready-to-print PDF.

Everything runs in the browser. There is **no build step, no backend, and no tracking** —
texts are fetched at runtime from the public Sefaria API.

> לומדי משנה יומית: האתר תומך במצב עברית מלא — ממשק ימין-לשמאל, תאריכים עבריים,
> מספרים בגימטריה, **בלי אף אות לועזית**.

---

## Features

**Schedule**
- Start from any mishna (masechta → perek → mishna pickers), 1–30 mishnayot
- Start date (defaults to today) + per-weekday selection (e.g. every day, or skip Shabbos)
- Optional skip of Yom Tov days; Israel / Diaspora calendar switch
- Live schedule table with English + Hebrew dates and parasha per row

**Poster content**
- Mishna text from Sefaria — with or without nikud, Hebrew or English (translation)
- Commentaries: Bartenura, Rambam, Tosafot Yom Tov (each toggleable)
- Per-page dynamic header: weekday, Hebrew date, weekly parasha, "day N of M" counter
- Institution letterhead, dedication line, custom footer note
- Version pickers for the Hebrew and English text source

**Design & templates**
- 6 built-in templates (Classic Parchment, Modern Minimal, Royal Blue & Gold,
  Elegant Ivory, Fresh Garden, Night Learning) + "Surprise me" auto-generated palettes
- Upload your own **logo** and **background image** for a fully custom letterhead
- Accent color picker, font choice, overlay darkness control for background images

**Output**
- **PDF download** — US Letter (8.5″ × 11″), one mishna per page, 192 / 288 / 384 DPI
- **Vector print** via the browser print dialog (`Ctrl/Cmd-P`) — smallest files, crisp text
- **PNG export** of the current page
- All settings persist in `localStorage`

**Interface**
- Full **native Hebrew mode**: RTL layout, Hebrew UI strings, Hebrew dates,
  gematria numerals (א׳, ב׳…), zero Latin characters anywhere on the poster
- Responsive from 375 px phones (tabbed mobile layout) through tablets to desktop
  (two-column side-by-side) — tested at 375 / 768 / 1280 px

## Quick start

The site is 100% static. Serve it with any static server:

```bash
npm start          # npx serve -l 8930 .
# or: python3 -m http.server 8930
```

then open <http://localhost:8930>. (ES modules require http:// — `file://` won't work.)

> Deploying? See **[DEPLOYMENT.md](DEPLOYMENT.md)** for step-by-step free hosting on
> Cloudflare Pages (recommended), plus GitHub Pages.

## Tests

```bash
npm install        # dev deps only (puppeteer-core + @sparticuz/chromium for headless tests)
npm test           # 27 unit tests
npm run test:e2e   # 20 end-to-end scenarios in real headless Chromium (offline, fixture-driven)
npm run test:all   # everything
```

E2E coverage highlights: zero console errors on boot; the Bekhorot 3:2 × 4-days example
from the brief (schedule, parasha/Hebrew-date headers, day counter); PDF export is a
valid 4-page Letter-size document with real ink; the html2canvas raster used for PDFs is
**pixel-compared against the browser's own rendering** (≥ 95 % match) so Hebrew/RTL
output can't silently break; native-Hebrew mode contains *no Latin characters*; nikud
toggling; template switching; persistence; responsive audits at 375/768/1280 px; and
graceful degradation when Sefaria returns a 404.

## Project structure

```
index.html              the whole app (single page)
assets/
  css/                  main.css (app UI), poster.css (print/poster geometry), fonts.css
  js/
    main.js             app wiring, settings, i18n switching
    schedule.js         date stepping, weekday/Yom-Tov logic, Sefaria calendars
    sefaria.js          Sefaria v3 API client (texts, versions, calendars)
    mishnah-index.js    full mishna counts for every perek (for stepping refs)
    poster.js           poster DOM templates + auto-fit typography
    pdf.js              html2canvas → jsPDF pipeline, PNG export, print styles
    hebrew.js           gematria, nikud stripping, Hebrew formatting
    i18n.js             EN/HE UI strings
  fonts/                self-hosted woff2 (Frank Ruhl Libre, David Libre, Heebo, Miriam Libre)
  vendor/               html2canvas 1.4.1, jsPDF 3 (self-hosted, MIT)
tests/
  unit/                 27 unit tests (node --test)
  e2e/                  e2e.mjs + browser.mjs (chromium bootstrap, static server,
                        Sefaria fixture interceptor) — runs fully offline
  fixtures/             recorded Sefaria API responses
tools/build-fixtures.mjs rebuilds the fixtures from the live API
```

## Data & licensing

- Texts and calendar data come from the [Sefaria API](https://developers.sefaria.org)
  (Sefaria texts are open-source / CC-BY; each poster carries a "source: Sefaria.org"
  attribution line). The app calls the API at runtime — nothing is bundled.
- Fonts: Frank Ruhl Libre, David Libre, Heebo, Miriam Libre — SIL OFL, self-hosted.
- Vendored libraries: html2canvas (MIT), jsPDF (MIT). Site code: MIT.

## Browser support

Any modern browser (Chrome/Edge 111+, Firefox 113+, Safari 16.4+). PDF export uses
html2canvas; the print path (vector) works everywhere, including Safari.
