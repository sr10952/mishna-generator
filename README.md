# Mishna Poster Generator · מחולל כרזות משנה

A free, fully client-side web app that generates **printable daily-Mishnah study posters**
from open-source [Sefaria](https://sefaria.org) texts. Pick where you're starting
(e.g. *Bekhorot 3:2*), how many mishnayot (up to 30), and which days of the week to
learn — the app builds the schedule, lays out **one mishna per Letter, Legal, Tabloid,
or custom-size page** with the Hebrew date, weekday, weekly parasha and day counter,
and exports a ready-to-print PDF.

Everything runs in the browser. There is **no build step, no backend, and no tracking**.
The app ships with a **bundled offline text store** (`assets/content/`) containing the
**complete Mishnah** — all 6 sedarim, 63 tractates, every mishna (~4,200 refs) in Hebrew —
so any tractate renders with no network at all. Anything not bundled (e.g. an alternate
translation) still falls back to the public Sefaria API at runtime. It is also an
**installable PWA** that works 100% offline once loaded and can be copied to a USB drive
and served locally.

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
- Per-page dynamic header: weekday, Hebrew date (month name without a leading ב־), weekly parasha, "day N of M" counter
- Weekday display can match the poster, use the traditional Yiddish names (זונטאג through שב"ק), be hidden, or use seven custom labels
- Optional date-aware Yom Tov / holiday line, including Chol HaMoed; choose Hebrew, Yiddish, or English wording and it respects the Israel / Diaspora setting. Holiday Torah readings are omitted from the separate parasha field to avoid duplicate date context
- Optional, customizable "Daily Mishnah" badge; institution letterhead, dedication line, and custom footer note
- Posters are independent handouts, so their footers omit page N of M markers
- Version pickers for the Hebrew and English text source

**Design & templates**
- 6 built-in templates (Classic Parchment, Modern Minimal, Royal Blue & Gold,
  Elegant Ivory, Fresh Garden, Night Learning) + "Surprise me" auto-generated palettes
- Upload your own **logo** and **background image** for a fully custom letterhead
- Accent color picker, independent mishna and commentary font choices, overlay darkness control for background images
- Letter (8.5″ × 11″), Legal (8.5″ × 14″), and Tabloid (11″ × 17″) presets, plus a custom width × height size from 5″ to 17″ on each side — consistently applied to preview, PDF, PNG, and print

**Saved profiles & backup**
- Save the whole configuration under a name, then **load**, **rename**, or **delete** it
  (up to **20** saved profiles; a clear error explains the limit, and overwriting an
  existing name is always allowed)
- **Export** all safe settings + profiles as a downloadable JSON file, and **import**
  one back through a file picker
- Imports are validated and normalized: missing / invalid / obsolete fields are repaired,
  older backups are migrated, and no executable content or arbitrary HTML is trusted
- **Privacy default:** uploaded logo / background images are *never* written into profiles
  or backups, so a shared backup file can't leak a private letterhead
- Destructive actions (delete a profile, replace settings on import, remove the project
  dedication) require an accessible, keyboard- and screen-reader-friendly confirmation

**Offline / PWA (Sefaria-independent)**
- Bundled JSON text store (`assets/content/`) carrying the **entire Mishnah in Hebrew**
  (63 tractates, ~4,200 mishnayot) plus English + Bartenura for the built-in example
  (Mishnah Bekhorot 3:2–4:1) — the app reads it first and only falls back to the Sefaria
  API for text it doesn't bundle (e.g. other translations/commentaries)
- Rebuild or extend the offline corpus with the maintainer tools:
  - `tools/fetch-corpus-github.mjs` — bulk pull the whole corpus from Sefaria's open
    dataset via the GitHub Contents API (`--english` / `--bartenura` add those layers)
  - `tools/build-content.mjs` — targeted whole-chapter captures from the live Sefaria API
- Installable PWA with a manifest, icons, and an offline-first service worker that
  precaches the entire app shell (`tools/build-sw.mjs` regenerates `sw.js`)
- A memorial **project dedication** line — *לע״נ אסתר בילא ע״ה בת שמשון צבי ני״ו* — is shown
  at the bottom of every poster by default; it can be turned off (with confirmation) and is
  pure Hebrew so native-Hebrew posters stay Latin-free

**Output**
- **PDF download** — the selected Letter, Legal, Tabloid, or custom size; one mishna per page, 192 / 288 / 384 DPI
- **Vector print** via the browser print dialog (`Ctrl/Cmd-P`) — smallest files, crisp text, and the selected physical page size (including custom landscape dimensions)
- **PNG export** of the current page at the selected physical page dimensions
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
npm test           # 73 unit tests
npm run test:e2e   # 33 end-to-end scenarios in real headless Chromium (offline, fixture-driven)
npm run test:all   # everything
```

E2E coverage highlights: zero console errors on boot; the Bekhorot 3:2 × 4-days example
from the brief (schedule, parasha/Hebrew-date headers, day counter); PDF export is a
valid 4-page Letter-size document with real ink; Legal, Tabloid, and custom-size output
keep their dimensions across preview, raster PDF, PNG, and browser print (including
custom 13″ × 10″ landscape regression coverage); long commentary auto-fit stays inside the page
while remaining smaller than the mishna; the html2canvas raster used for
PDFs is **pixel-compared against the browser's own rendering** (≥ 95 % match) so
Hebrew/RTL output can't silently break; native-Hebrew mode contains *no Latin
characters*; the Daily Mishnah badge can be customized or hidden; Yiddish and custom
weekday labels plus optional date-aware Yom Tov / Chol HaMoed labels; individual posters
omit page N of M footers; nikud toggling; template switching; persistence; responsive
audits at 375/768/1280 px; and graceful degradation when Sefaria returns a 404. Newer
scenarios cover the memorial project dedication (default-on, confirm-to-remove, Latin-free);
saved-profile save/load/rename/delete; JSON backup export/import (image-free, validated);
bundled content rendering the example with the Sefaria API fully blocked; graceful
degradation to the API when the bundled store is unavailable; and the PWA
manifest / icons / service worker being served.

The unit suite adds focused coverage for the settings schema and migration/normalization
(`settings.test.mjs`), profile serialization, limits, and backup validation
(`profiles.test.mjs`), and the bundled content store (`content.test.mjs`).

## Project structure

```
index.html              the whole app (single page)
manifest.webmanifest    PWA manifest
sw.js                   offline-first service worker (generated by tools/build-sw.mjs)
assets/
  css/                  main.css (app UI + modals), poster.css (print/poster geometry), fonts.css
  js/
    main.js             app wiring, i18n switching, profile/backup UI, modals, SW registration
    settings.js         canonical settings schema, DEFAULTS, normalize/migrate, image safety
    profiles.js         saved-profile CRUD + limits, JSON backup build/parse/validate/merge
    content.js          bundled offline content loader (Sefaria-independent) + API fallback
    schedule.js         date stepping, weekday/Yom-Tov logic, Sefaria calendars
    sefaria.js          Sefaria v3 API client (texts, versions, calendars)
    mishnah-index.js    full mishna counts for every perek (for stepping refs)
    poster.js           poster DOM templates + auto-fit typography + project dedication
    pdf.js              html2canvas → jsPDF pipeline, PNG export, print styles
    hebrew.js           gematria, nikud stripping, Hebrew formatting
    i18n.js             EN/HE UI strings
  content/              bundled offline text store — the complete Mishnah in Hebrew
                        (index.json + mishnah.json, ~4,200 refs)
  icons/                PWA icons (192 / 512 / maskable)
  fonts/                self-hosted woff2 (Frank Ruhl Libre, David Libre, Heebo, Miriam Libre)
  vendor/               html2canvas 1.4.1, jsPDF 3 (self-hosted, MIT)
tests/
  unit/                 73 unit tests (node --test): hebrew, i18n, poster, schedule,
                        settings, profiles, content
  e2e/                  e2e.mjs + browser.mjs (chromium bootstrap, static server,
                        Sefaria fixture interceptor) — 33 scenarios, runs fully offline
  fixtures/             recorded Sefaria API responses
tools/build-fixtures.mjs rebuilds the fixtures from the live API
tools/fetch-corpus-github.mjs  bulk-builds the offline corpus (whole Mishnah) from
                               Sefaria's open dataset via the GitHub Contents API
tools/build-content.mjs  targeted captures into assets/content/ from the live Sefaria API
tools/build-sw.mjs       regenerates sw.js's precache list from the files on disk
```

## Data & licensing

- Texts and calendar data come from [Sefaria](https://developers.sefaria.org)
  (Sefaria texts are open-source / CC-BY / public-domain per version; each poster carries a
  "source: Sefaria.org" attribution line). The bundled offline store in `assets/content/`
  holds the complete Mishnah Hebrew text (all 63 tractates) plus English + Bartenura for the
  built-in example; the app reads it first and calls the live API at runtime only for text
  that isn't bundled. Rebuild the corpus with `tools/fetch-corpus-github.mjs` (bulk, from
  Sefaria's open GitHub dataset) or add targeted captures with `tools/build-content.mjs`.
- Fonts: Frank Ruhl Libre, David Libre, Heebo, Miriam Libre — SIL OFL, self-hosted.
- Vendored libraries: html2canvas (MIT), jsPDF (MIT). Site code: MIT.

## Browser support

Any modern browser (Chrome/Edge 111+, Firefox 113+, Safari 16.4+). PDF export uses
html2canvas; the print path (vector) works everywhere, including Safari.
