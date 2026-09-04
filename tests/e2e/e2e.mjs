/**
 * tests/e2e/e2e.mjs - end-to-end tests for the Mishna Poster Generator.
 *
 * Runs the real site in headless Chromium against fixture Sefaria responses
 * (no network), and verifies:
 *   - the app boots with zero console errors
 *   - the schedule builder (Bekhorot 3:2 example from the brief)
 *   - Hebrew poster content: nikud, RTL, Hebrew date, parasha, Bartenura
 *   - optional/custom Daily Mishna badge and no poster page-number footer
 *   - native-Hebrew mode: NOT A SINGLE Latin character on the poster
 *   - English mode + no-nikud mode
 *   - templates, letterhead text, persistence
 *   - PDF download (raster) + print-to-PDF (vector) page counts and sizes
 *   - PNG export
 *   - html2canvas raster sanity (correct size, real ink on canvas)
 *   - long-commentary auto-fit, independent commentary fonts, preset/custom page output
 *   - responsive layout at 375 / 768 / 1280 px
 *   - graceful degradation when a text is unavailable
 *
 * Usage:  npm run test:e2e     (requires `npm install` first)
 */
import { readFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ensureChromium, startStaticServer, makeSefariaInterceptor } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8930;
const BASE = `http://127.0.0.1:${PORT}/`;
const DOWNLOADS = '/tmp/e2e-downloads';

const fixtures = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/fixtures.json'), 'utf8'));

/* ---------------------------------------------------------------- helpers */

let passed = 0;
let failed = 0;
const failures = [];

async function scenario(name, fn) {
  const started = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}  (${Date.now() - started}ms)`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  ✘ ${name}\n      ${String(err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n      ') : err)}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, { timeout = 30000, poll = 100 } = {}) {
  const t0 = Date.now();
  let lastErr;
  while (Date.now() - t0 < timeout) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) { lastErr = e; }
    await sleep(poll);
  }
  throw new Error(`waitFor timed out${lastErr ? `: ${lastErr}` : ''}`);
}

const $eval = (page, sel, fn, ...args) => page.$eval(sel, fn, ...args);
const evalJS = (page, js, ...args) => page.evaluate(js, ...args);

async function setStartDate(page, iso) {
  await evalJS(page, (iso) => {
    const el = document.getElementById('startDate');
    el.value = iso;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, iso);
}

async function clickBuild(page) {
  await evalJS(page, () => document.getElementById('buildBtn').click());
  await waitFor(page, () => evalJS(page, () => !document.getElementById('actionsRow').classList.contains('hidden')
    && !document.getElementById('buildBtn').disabled));
}

function pdfText(buf) {
  // works for both Buffer (fs) and Uint8Array (puppeteer page.pdf)
  return Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('latin1');
}

function countPdfPages(buf) {
  const s = pdfText(buf);
  const matches = s.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

/* ---------------------------------------------------------------- main */

const server = await startStaticServer(ROOT, PORT);
const chromium = await ensureChromium();
const { browser, page } = await chromium.launchPage({ timezone: 'UTC' });

const intercept = makeSefariaInterceptor(fixtures);
await page.setRequestInterception(true);
page.on('request', (req) => { if (!intercept(req)) req.continue(); });

mkdirSync(DOWNLOADS, { recursive: true });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', {
  behavior: 'allow', downloadPath: DOWNLOADS,
});

/**
 * Wait for a new file to appear in DOWNLOADS and stop growing.
 * (CDP download events are unreliable in this headless build, but files
 * reliably land on disk - so we poll.)
 */
async function waitForDownload(timeoutMs = 90000) {
  const before = new Set(readdirSync(DOWNLOADS));
  const t0 = Date.now();
  let lastSize = -1;
  let lastChange = Date.now();
  let candidate = null;
  while (Date.now() - t0 < timeoutMs) {
    await sleep(250);
    const files = readdirSync(DOWNLOADS).filter((f) => !before.has(f));
    for (const f of files) {
      const full = path.join(DOWNLOADS, f);
      const st = statSync(full);
      if (st.size > 0 && st.size === lastSize && Date.now() - lastChange > 700) {
        return f;
      }
      if (st.size !== lastSize) { lastSize = st.size; lastChange = Date.now(); }
      candidate = f;
    }
    if (files.length === 0) { lastSize = -1; }
  }
  throw new Error(`download did not complete in ${timeoutMs}ms (candidate: ${candidate})`);
}

const NIKUD = /[\u05B0-\u05BB\u05C1\u05C2]/;

try {
  console.log('\nMishna Poster Generator - e2e tests\n====================================');

  await scenario('app boots without console errors', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    assert.equal(await page.title(), 'Mishna Poster Generator');
    assert.equal(page.__errors.length, 0, `console errors: ${page.__errors.join(' | ')}`);
  });

  await scenario('defaults match the brief (start at Bekhorot 3:2, 7 mishnas, all days)', async () => {
    assert.equal(await $eval(page, '#masechetSel', (e) => e.value), 'Mishnah Bekhorot');
    assert.equal(await $eval(page, '#chapterSel', (e) => e.value), '3');
    assert.equal(await $eval(page, '#mishnaSel', (e) => e.value), '2');
    assert.equal(await $eval(page, '#count', (e) => e.value), '7');
    assert.equal(await $eval(page, '#weekdayRow', (e) => e.querySelectorAll('.wd-chip[aria-pressed="true"]').length), 7);
    assert.equal(await $eval(page, '#templateGrid', (e) => e.querySelectorAll('.tpl-option').length), 6);
    assert.equal(await $eval(page, '#refHint', (e) => e.textContent.includes('73 mishnas')), true);
  });

  await scenario('build produces the 4-day Bekhorot schedule + preview', async () => {
    await evalJS(page, () => document.getElementById('count').value = '4');
    await evalJS(page, () => document.getElementById('count').dispatchEvent(new Event('change', { bubbles: true })));
    await setStartDate(page, '2026-09-03');
    await clickBuild(page);
    assert.equal(await $eval(page, '#scheduleTable tbody', (e) => e.rows.length), 4);
    const refs = await evalJS(page, () => [...document.querySelectorAll('#renderStage .poster-page')].map((p) => p.dataset.ref));
    assert.deepEqual(refs, ['Mishnah Bekhorot 3:2', 'Mishnah Bekhorot 3:3', 'Mishnah Bekhorot 3:4', 'Mishnah Bekhorot 4:1']);
    // preview clone visible
    assert.equal(await $eval(page, '#previewCanvas', (e) => !!e.querySelector('.poster-page')), true);
    assert.equal(page.__errors.length, 0, `console errors: ${page.__errors.join(' | ')}`);
  });

  await scenario('poster page 1: Hebrew + nikud + RTL + date + parasha + Bartenura', async () => {
    const info = await evalJS(page, () => {
      const p = document.querySelector('#renderStage .poster-page');
      return {
        dir: p.dir,
        ref: p.dataset.ref,
        title: p.querySelector('.pg-ref').textContent,
        text: p.querySelector('.pg-text').textContent,
        info: p.querySelector('.pg-info').textContent,
        badge: p.querySelector('.pg-badge').textContent,
        commLabel: p.querySelector('.pg-comm-label') ? p.querySelector('.pg-comm-label').textContent : '',
        attr: p.querySelector('.pg-attr').textContent,
        hasPageNumber: !!p.querySelector('.pg-pageno'),
      };
    });
    assert.equal(info.dir, 'rtl');
    assert.match(info.title, /בכורות/);
    assert.match(info.title, /פרק ג׳/);
    assert.match(info.title, /משנה ב׳/);
    assert.match(info.text, /רַבָּן שִׁמְעוֹן בֶּן גַּמְלִיאֵל/);
    assert.ok(NIKUD.test(info.text), 'mishna text should contain nikud');
    assert.match(info.info, /יום חמישי/);
    assert.match(info.info, /כ״א אלול תשפ״ו/);
    assert.match(info.info, /פרשת נצבים/);
    assert.match(info.info, /יום א׳ מתוך ד׳/);
    assert.equal(info.badge, 'משנה יומית');
    assert.match(info.commLabel, /ברטנורא/);
    assert.match(info.attr, /ספריא/);
    assert.equal(info.hasPageNumber, false, 'individual posters should not carry a page N of M footer');
  });

  await scenario('page navigation (2/4) updates preview & table', async () => {
    await evalJS(page, () => document.getElementById('nextPageBtn').click());
    await sleep(150);
    assert.equal(await $eval(page, '#pageIndicator', (e) => e.textContent), '2 / 4');
    const ref = await $eval(page, '#previewCanvas .poster-page', (e) => e.dataset.ref);
    assert.equal(ref, 'Mishnah Bekhorot 3:3');
    const currentRow = await $eval(page, '#scheduleTable tbody tr.current', (e) => e.rowIndex - 1);
    assert.equal(currentRow, 1);
  });

  await scenario('Daily Mishna box can be customized or hidden', async () => {
    await evalJS(page, () => {
      const text = document.getElementById('dailyMishnaBadgeText');
      text.value = 'לימוד משנה';
      text.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(page, () => $eval(page, '#renderStage .pg-badge', (e) => e.textContent === 'לימוד משנה'));

    await evalJS(page, () => {
      const toggle = document.getElementById('showDailyMishnaBadge');
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitFor(page, () => evalJS(page, () => !document.querySelector('#renderStage .pg-badge')));
    assert.equal(await $eval(page, '#dailyMishnaBadgeTextField', (e) => e.hidden), true);
    assert.equal(await $eval(page, '#dailyMishnaBadgeTextField', (e) => getComputedStyle(e).display), 'none');
    assert.equal(await $eval(page, '#renderStage .pg-info', (e) => !!e), true, 'other info-line details remain visible');

    // Restore the localized default so later scenarios retain their original
    // baseline poster content.
    await evalJS(page, () => {
      const toggle = document.getElementById('showDailyMishnaBadge');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      const text = document.getElementById('dailyMishnaBadgeText');
      text.value = '';
      text.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(page, () => $eval(page, '#renderStage .pg-badge', (e) => e.textContent === 'משנה יומית'));
    assert.equal(await $eval(page, '#dailyMishnaBadgeTextField', (e) => e.hidden), false);
  });

  await scenario('pdf download: 4 Letter pages, valid PDF, real ink', async () => {
    await evalJS(page, () => {
      const q = document.getElementById('qualitySel');
      q.value = 'draft';
      q.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await evalJS(page, () => document.getElementById('downloadPdfBtn').click());
    const filename = await waitForDownload();
    const buf = readFileSync(path.join(DOWNLOADS, filename));
    assert.ok(buf.subarray(0, 5).toString() === '%PDF-', 'PDF magic');
    assert.equal(await countPdfPages(buf), 4, 'PDF page count');
    const s = pdfText(buf);
    assert.match(s, /\/MediaBox\s*\[0 0 612\.? 792\.?\]/, 'Letter MediaBox');
    assert.ok(buf.length > 100 * 1024, `pdf size ${buf.length}`);
    rmSync(path.join(DOWNLOADS, filename));
  });

  await scenario('png export of current page', async () => {
    await evalJS(page, () => document.getElementById('downloadPngBtn').click());
    const filename = await waitForDownload();
    const buf = readFileSync(path.join(DOWNLOADS, filename));
    assert.equal(buf.subarray(1, 4).toString(), 'PNG');
    assert.ok(buf.length > 50 * 1024, `png size ${buf.length}`);
    rmSync(path.join(DOWNLOADS, filename));
  });

  await scenario('print stylesheet produces a 4-page vector PDF', async () => {
    await evalJS(page, () => {
      const stage = document.getElementById('printStage');
      stage.innerHTML = '';
      document.querySelectorAll('#renderStage .poster-page').forEach((p) => stage.appendChild(p.cloneNode(true)));
    });
    const buf = await page.pdf({ format: 'letter', printBackground: true, preferCSSPageSize: true });
    assert.equal(pdfText(buf).slice(0, 5), '%PDF-');
    assert.equal(countPdfPages(buf), 4, 'print PDF page count');
    assert.match(pdfText(buf), /\/MediaBox\s*\[0 0 612 792\]/, 'Letter MediaBox');
  });

  await scenario('html2canvas raster: correct dimensions and visible ink', async () => {
    const stats = await evalJS(page, async () => {
      const el = document.querySelector('#renderStage .poster-page');
      const canvas = await window.html2canvas(el, { scale: 1, backgroundColor: '#ffffff', logging: false });
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) dark++;
      }
      return { w: canvas.width, h: canvas.height, dark };
    });
    assert.equal(stats.w, 816);
    assert.equal(stats.h, 1056);
    assert.ok(stats.dark > 5000, `ink pixels: ${stats.dark}`);
  });

  await scenario('long commentary auto-fit shrinks commentary first without clipping', async () => {
    const fit = await evalJS(page, async () => {
      const poster = document.querySelector('#renderStage .poster-page');
      const main = poster.querySelector('.pg-main');
      const mishna = poster.querySelector('.pg-text');
      const commentary = poster.querySelector('.pg-comm-text');
      const source = commentary.textContent;
      const setParagraphs = (count) => {
        commentary.innerHTML = '';
        for (let i = 0; i < count; i++) {
          const p = document.createElement('p');
          p.textContent = source;
          commentary.appendChild(p);
        }
      };
      const { autofitPage } = await import('/assets/js/poster.js');

      // This amount only needs the commentary to compact. It proves the
      // mishna is not sacrificed before commentary space is used.
      setParagraphs(8);
      autofitPage(poster);
      const commentaryFirst = {
        mishna: parseFloat(getComputedStyle(mishna).fontSize),
        commentary: parseFloat(getComputedStyle(commentary).fontSize),
      };

      // A genuinely long commentary reaches the explicit commentary floor and
      // then lets the mishna compact too. It must still have no hidden rows.
      setParagraphs(16);
      autofitPage(poster);
      return {
        commentaryFirst,
        mishna: parseFloat(getComputedStyle(mishna).fontSize),
        commentary: parseFloat(getComputedStyle(commentary).fontSize),
        mainClientHeight: main.clientHeight,
        mainScrollHeight: main.scrollHeight,
        atFloor: poster.dataset.fitAtFloor,
        overflow: poster.dataset.fitOverflow,
      };
    });
    assert.ok(fit.commentaryFirst.mishna >= 34.9, `mishna shrank too early: ${fit.commentaryFirst.mishna}px`);
    assert.ok(fit.commentaryFirst.commentary < 16, `commentary did not shrink first: ${fit.commentaryFirst.commentary}px`);
    assert.ok(fit.commentary <= fit.mishna * 0.8 + 0.05, `${fit.commentary}px commentary exceeds 80% of ${fit.mishna}px mishna`);
    assert.equal(fit.atFloor, 'true', 'long content should be allowed to reach an explicit floor');
    assert.equal(fit.overflow, '0');
    assert.ok(fit.mainScrollHeight <= fit.mainClientHeight + 2, `${fit.mainScrollHeight}px content exceeds ${fit.mainClientHeight}px region`);
  });

  await scenario('native Hebrew mode: zero Latin characters on the poster', async () => {
    await evalJS(page, () => document.getElementById('langToggle').click());
    await sleep(100);
    assert.equal(await evalJS(page, () => document.documentElement.dir), 'rtl');
    assert.equal(await page.title(), 'מחולל כרזות משנה יומית');
    await clickBuild(page);
    const latin = await evalJS(page, () => {
      const p = document.querySelector('#renderStage .poster-page');
      return (p.textContent.match(/[A-Za-z]/g) || []).join('');
    });
    assert.equal(latin, '', `found Latin letters: ${latin}`);
    assert.equal(await $eval(page, '#pageIndicator', (e) => e.textContent), 'א׳ / ד׳');
    // UI itself is Hebrew
    assert.equal(await $eval(page, '#downloadPdfBtn', (e) => e.textContent), 'הורדת PDF');
    assert.equal(page.__errors.length, 0, `console errors: ${page.__errors.join(' | ')}`);
  });

  await scenario('back to English UI; English text mode renders LTR translation', async () => {
    await evalJS(page, () => document.getElementById('langToggle').click());
    await sleep(100);
    assert.equal(await evalJS(page, () => document.documentElement.dir), 'ltr');
    await evalJS(page, () => {
      const sel = document.getElementById('textLang');
      sel.value = 'en';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clickBuild(page);
    const info = await evalJS(page, () => {
      const p = document.querySelector('#renderStage .poster-page');
      return { dir: p.dir, text: p.querySelector('.pg-text').textContent, title: p.querySelector('.pg-ref').textContent };
    });
    assert.equal(info.dir, 'ltr');
    assert.match(info.text, /Rabban Shimon ben Gamliel says/);
    assert.match(info.title, /Bekhorot/);
    assert.match(info.title, /Chapter 3/);
  });

  await scenario('nikud toggle strips vowel points', async () => {
    // switch back to Hebrew text first (previous scenario left English mode)
    await evalJS(page, () => {
      const sel = document.getElementById('textLang');
      sel.value = 'he';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await evalJS(page, () => {
      const sel = document.getElementById('nikudSel');
      sel.value = 'off';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clickBuild(page);
    const text = await $eval(page, '#renderStage .poster-page .pg-text', (e) => e.textContent);
    assert.equal(NIKUD.test(text), false, 'no nikud should remain');
    assert.match(text, /רבן שמעון בן גמליאל/);
    await evalJS(page, () => {
      const sel = document.getElementById('nikudSel');
      sel.value = 'on';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  await scenario('template switch + letterhead text apply live', async () => {
    await evalJS(page, () => {
      document.querySelector('.tpl-option[data-auto]').click(); // no-op guard
    }).catch(() => {});
    const clicked = await evalJS(page, () => {
      const opts = [...document.querySelectorAll('.tpl-option')];
      const night = opts.find((o) => o.textContent.includes('Night'));
      if (night) night.click();
      return !!night;
    });
    assert.ok(clicked, 'Night template option exists');
    await evalJS(page, () => {
      const el = document.getElementById('institution');
      el.value = 'Congregation Test';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(400);
    const cls = await $eval(page, '#renderStage .poster-page', (e) => e.className);
    assert.match(cls, /tpl-night/);
    assert.equal(await $eval(page, '#renderStage .pg-inst', (e) => e.textContent), 'Congregation Test');
    // back to classic for later scenarios
    await evalJS(page, () => {
      const opts = [...document.querySelectorAll('.tpl-option')];
      const classic = opts.find((o) => o.textContent.includes('Classic'));
      if (classic) classic.click();
    });
  });

  await scenario('commentary font can differ from the mishna font', async () => {
    await evalJS(page, () => {
      const posterFont = document.getElementById('fontSel');
      posterFont.value = 'heebo';
      posterFont.dispatchEvent(new Event('change', { bubbles: true }));
      const commentaryFont = document.getElementById('commentaryFontSel');
      commentaryFont.value = 'david';
      commentaryFont.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(100);
    const fonts = await evalJS(page, () => {
      const poster = document.querySelector('#renderStage .poster-page');
      return {
        mishna: getComputedStyle(poster.querySelector('.pg-text')).fontFamily,
        commentary: getComputedStyle(poster.querySelector('.pg-comm-text')).fontFamily,
        label: getComputedStyle(poster.querySelector('.pg-comm-label')).fontFamily,
      };
    });
    assert.match(fonts.mishna, /Heebo/i);
    assert.match(fonts.commentary, /David Libre/i);
    assert.match(fonts.label, /David Libre/i);
  });

  await scenario('settings persist across reloads', async () => {
    await sleep(300); // localStorage writes are intentionally debounced
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await $eval(page, '#institution', (e) => e.value), 'Congregation Test');
    assert.equal(await $eval(page, '#masechetSel', (e) => e.value), 'Mishnah Bekhorot');
    assert.equal(await $eval(page, '#fontSel', (e) => e.value), 'heebo');
    assert.equal(await $eval(page, '#commentaryFontSel', (e) => e.value), 'david');
  });

  await scenario('Legal page size drives poster, preview, PNG, raster PDF, and print', async () => {
    await evalJS(page, () => {
      const size = document.getElementById('pageSizeSel');
      size.value = 'legal';
      size.dispatchEvent(new Event('change', { bubbles: true }));
      const count = document.getElementById('count');
      count.value = '1';
      count.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clickBuild(page);

    const dimensions = await evalJS(page, async () => {
      const poster = document.querySelector('#renderStage .poster-page');
      const preview = document.querySelector('#previewCanvas .poster-page');
      const canvas = document.getElementById('previewCanvas');
      const { renderPagePng } = await import('/assets/js/pdf.js');
      const png = await renderPagePng(poster, 1);
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = png;
      });
      return {
        pageSize: poster.dataset.pageSize,
        poster: [poster.offsetWidth, poster.offsetHeight],
        preview: [preview.offsetWidth, preview.offsetHeight],
        previewAspect: canvas.style.aspectRatio,
        png: [image.naturalWidth, image.naturalHeight],
        printRule: document.getElementById('printPageSizeStyle').textContent,
      };
    });
    assert.equal(dimensions.pageSize, 'legal');
    assert.deepEqual(dimensions.poster, [816, 1344]);
    assert.deepEqual(dimensions.preview, [816, 1344]);
    assert.equal(dimensions.previewAspect, '816 / 1344');
    assert.deepEqual(dimensions.png, [816, 1344]);
    assert.match(dimensions.printRule, /size:\s*8\.5in 14in/);

    await evalJS(page, () => {
      const quality = document.getElementById('qualitySel');
      quality.value = 'draft';
      quality.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('downloadPdfBtn').click();
    });
    const filename = await waitForDownload();
    const rasterPdf = readFileSync(path.join(DOWNLOADS, filename));
    assert.equal(countPdfPages(rasterPdf), 1, 'Legal raster PDF page count');
    assert.match(pdfText(rasterPdf), /\/MediaBox\s*\[0 0 612\.? 1008\.?\]/, 'Legal raster PDF MediaBox');
    rmSync(path.join(DOWNLOADS, filename));

    await evalJS(page, () => {
      const stage = document.getElementById('printStage');
      stage.innerHTML = '';
      document.querySelectorAll('#renderStage .poster-page').forEach((p) => stage.appendChild(p.cloneNode(true)));
    });
    const printPdf = await page.pdf({ format: 'letter', printBackground: true, preferCSSPageSize: true });
    assert.equal(countPdfPages(printPdf), 1, 'Legal print PDF page count');
    assert.match(pdfText(printPdf), /\/MediaBox\s*\[0 0 612 1008\]/, 'Legal print PDF MediaBox');
  });

  await scenario('Tabloid and custom page sizes drive preview, PNG, PDF, and print', async () => {
    await evalJS(page, () => {
      const size = document.getElementById('pageSizeSel');
      size.value = 'tabloid';
      size.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clickBuild(page);
    const tabloid = await evalJS(page, async () => {
      const poster = document.querySelector('#renderStage .poster-page');
      const preview = document.querySelector('#previewCanvas .poster-page');
      const { renderPagePng } = await import('/assets/js/pdf.js');
      const png = await renderPagePng(poster, 1);
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = png;
      });
      return {
        pageSize: poster.dataset.pageSize,
        poster: [poster.offsetWidth, poster.offsetHeight],
        preview: [preview.offsetWidth, preview.offsetHeight],
        png: [image.naturalWidth, image.naturalHeight],
        printRule: document.getElementById('printPageSizeStyle').textContent,
      };
    });
    assert.equal(tabloid.pageSize, 'tabloid');
    assert.deepEqual(tabloid.poster, [1056, 1632]);
    assert.deepEqual(tabloid.preview, [1056, 1632]);
    assert.deepEqual(tabloid.png, [1056, 1632]);
    assert.match(tabloid.printRule, /size:\s*11in 17in/);

    await evalJS(page, () => {
      const quality = document.getElementById('qualitySel');
      quality.value = 'draft';
      quality.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('downloadPdfBtn').click();
    });
    let filename = await waitForDownload();
    let rasterPdf = readFileSync(path.join(DOWNLOADS, filename));
    assert.equal(countPdfPages(rasterPdf), 1, 'Tabloid raster PDF page count');
    assert.match(pdfText(rasterPdf), /\/MediaBox\s*\[0 0 792\.? 1224\.?\]/, 'Tabloid raster PDF MediaBox');
    rmSync(path.join(DOWNLOADS, filename));

    await evalJS(page, () => {
      const stage = document.getElementById('printStage');
      stage.innerHTML = '';
      document.querySelectorAll('#renderStage .poster-page').forEach((p) => stage.appendChild(p.cloneNode(true)));
    });
    let printPdf = await page.pdf({ format: 'letter', printBackground: true, preferCSSPageSize: true });
    assert.equal(countPdfPages(printPdf), 1, 'Tabloid print PDF page count');
    assert.match(pdfText(printPdf), /\/MediaBox\s*\[0 0 792 1224\]/, 'Tabloid print PDF MediaBox');

    await evalJS(page, () => {
      const size = document.getElementById('pageSizeSel');
      size.value = 'custom';
      size.dispatchEvent(new Event('change', { bubbles: true }));
      const width = document.getElementById('customPageWidth');
      const height = document.getElementById('customPageHeight');
      width.value = '13';
      height.value = '10';
      width.dispatchEvent(new Event('change', { bubbles: true }));
      height.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(await $eval(page, '#customPageSizeFields', (e) => e.hidden), false);
    await clickBuild(page);
    const custom = await evalJS(page, async () => {
      const poster = document.querySelector('#renderStage .poster-page');
      const preview = document.querySelector('#previewCanvas .poster-page');
      const canvas = document.getElementById('previewCanvas');
      const { renderPagePng } = await import('/assets/js/pdf.js');
      const png = await renderPagePng(poster, 1);
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = png;
      });
      return {
        pageSize: poster.dataset.pageSize,
        poster: [poster.offsetWidth, poster.offsetHeight],
        preview: [preview.offsetWidth, preview.offsetHeight],
        previewAspect: canvas.style.aspectRatio,
        png: [image.naturalWidth, image.naturalHeight],
        printRule: document.getElementById('printPageSizeStyle').textContent,
      };
    });
    assert.equal(custom.pageSize, 'custom');
    assert.deepEqual(custom.poster, [1248, 960]);
    assert.deepEqual(custom.preview, [1248, 960]);
    assert.equal(custom.previewAspect, '1248 / 960');
    assert.deepEqual(custom.png, [1248, 960]);
    assert.match(custom.printRule, /size:\s*13in 10in/);

    await evalJS(page, () => {
      const quality = document.getElementById('qualitySel');
      quality.value = 'draft';
      quality.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('downloadPdfBtn').click();
    });
    filename = await waitForDownload();
    rasterPdf = readFileSync(path.join(DOWNLOADS, filename));
    assert.equal(countPdfPages(rasterPdf), 1, 'custom raster PDF page count');
    assert.match(pdfText(rasterPdf), /\/MediaBox\s*\[0 0 936\.? 720\.?\]/, 'custom raster PDF MediaBox');
    rmSync(path.join(DOWNLOADS, filename));

    await evalJS(page, () => {
      const stage = document.getElementById('printStage');
      stage.innerHTML = '';
      document.querySelectorAll('#renderStage .poster-page').forEach((p) => stage.appendChild(p.cloneNode(true)));
    });
    printPdf = await page.pdf({ format: 'letter', printBackground: true, preferCSSPageSize: true });
    assert.equal(countPdfPages(printPdf), 1, 'custom print PDF page count');
    assert.match(pdfText(printPdf), /\/MediaBox\s*\[0 0 936 720\]/, 'custom print PDF MediaBox');

    await sleep(300);
    const saved = await evalJS(page, () => JSON.parse(localStorage.getItem('mishna-poster-settings-v1')).design);
    assert.equal(saved.pageSize, 'custom');
    assert.equal(saved.customPageWidth, 13);
    assert.equal(saved.customPageHeight, 10);
  });

  await scenario('Yiddish weekdays and optional date-aware Yom Tov labels are customizable', async () => {
    await evalJS(page, () => {
      const skip = document.getElementById('skipYomTov');
      skip.checked = false;
      skip.dispatchEvent(new Event('change', { bubbles: true }));
      const weekday = document.getElementById('weekdayDisplaySel');
      weekday.value = 'yi';
      weekday.dispatchEvent(new Event('change', { bubbles: true }));
      const holiday = document.getElementById('showYomTovName');
      holiday.checked = true;
      holiday.dispatchEvent(new Event('change', { bubbles: true }));
      const style = document.getElementById('yomTovDisplaySel');
      style.value = 'auto';
      style.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await setStartDate(page, '2026-09-12'); // 1 Tishri / Rosh Hashanah
    await clickBuild(page);
    await waitFor(page, () => $eval(page, '#renderStage .pg-info', (e) => e.textContent.includes('א׳ דראש השנה')));
    let dateInfo = await $eval(page, '#renderStage .pg-info', (e) => e.textContent);
    assert.match(dateInfo, /שב"ק/);
    assert.match(dateInfo, /א׳ דראש השנה/);
    assert.equal(await $eval(page, '#yomTovDisplayField', (e) => e.hidden), false);

    // A seven-name list gives institutions complete control over their own
    // weekday vocabulary without changing the schedule itself.
    await evalJS(page, () => {
      const weekday = document.getElementById('weekdayDisplaySel');
      weekday.value = 'custom';
      weekday.dispatchEvent(new Event('change', { bubbles: true }));
      const names = document.getElementById('customWeekdayNames');
      names.value = 'ראשון מיוחד, שני מיוחד, שלישי מיוחד, רביעי מיוחד, חמישי מיוחד, שישי מיוחד, שבת מיוחדת';
      names.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(page, () => $eval(page, '#renderStage .pg-info', (e) => e.textContent.includes('שבת מיוחדת')));
    assert.equal(await $eval(page, '#customWeekdayNamesField', (e) => e.hidden), false);

    await evalJS(page, () => {
      const holiday = document.getElementById('showYomTovName');
      holiday.checked = false;
      holiday.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitFor(page, () => $eval(page, '#renderStage .pg-info', (e) => !e.textContent.includes('א׳ דראש השנה')));
    assert.equal(await $eval(page, '#yomTovDisplayField', (e) => e.hidden), true);

    // The automatic holiday style follows the selected Yiddish weekday style,
    // including the day-aware Chol HaMoed form requested for daily posters.
    await evalJS(page, () => {
      const weekday = document.getElementById('weekdayDisplaySel');
      weekday.value = 'yi';
      weekday.dispatchEvent(new Event('change', { bubbles: true }));
      const holiday = document.getElementById('showYomTovName');
      holiday.checked = true;
      holiday.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await setStartDate(page, '2026-09-29'); // 18 Tishri, Chol HaMoed Sukkot day 2 in diaspora
    await clickBuild(page);
    await waitFor(page, () => $eval(page, '#renderStage .pg-info', (e) => e.textContent.includes('ב׳ חוה״מ סוכות')));
    dateInfo = await $eval(page, '#renderStage .pg-info', (e) => e.textContent);
    assert.match(dateInfo, /דינסטאג/);
    assert.match(dateInfo, /ב׳ חוה״מ סוכות/);

    await sleep(300); // date-display settings use the same debounced persistence path
    const saved = await evalJS(page, () => JSON.parse(localStorage.getItem('mishna-poster-settings-v1')).design);
    assert.equal(saved.weekdayDisplay, 'yi');
    assert.equal(saved.showYomTovName, true);
    assert.equal(saved.yomTovDisplay, 'auto');
  });

  await scenario('holiday Torah readings are omitted from the poster parasha line', async () => {
    await evalJS(page, () => {
      const holiday = document.getElementById('showYomTovName');
      holiday.checked = false;
      holiday.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // The poster is for Sunday, 9 Tishri, while its cached Saturday calendar
    // entry is Sukkot. That reading is helpful in the schedule table but
    // should not be presented as a parasha on the standalone handout.
    await setStartDate(page, '2026-09-20');
    await clickBuild(page);
    const output = await evalJS(page, () => ({
      infoBits: [...document.querySelectorAll('#renderStage .pg-info-bit')].map((e) => e.textContent),
      scheduleRow: document.querySelector('#scheduleTable tbody tr').textContent,
    }));
    assert.match(output.scheduleRow, /Sukkot|סוכות/, 'fixture confirms the weekly calendar returned a Sukkot reading');
    assert.ok(output.infoBits.some((bit) => bit.includes('ט׳ תשרי')), 'Hebrew date remains visible');
    assert.equal(output.infoBits.some((bit) => /סוכות|Sukkot/.test(bit)), false, 'holiday reading is not rendered as a parasha');
  });

  await scenario('responsive: 375px phone - no overflow, mobile tabs work', async () => {
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(300);
    const overflow = await evalJS(page, () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `horizontal overflow: ${overflow}px`);
    const tabsVisible = await $eval(page, '#mobileTabs', (e) => getComputedStyle(e).display !== 'none');
    assert.ok(tabsVisible, 'mobile tabs should be visible');
    await evalJS(page, () => document.querySelector('.mobile-tab[data-tab="preview"]').click());
    await sleep(200);
    const previewVisible = await evalJS(page, () => {
      const p = document.getElementById('previewPanel');
      return getComputedStyle(p).display !== 'none' && document.querySelector('.form-panel').offsetParent === null;
    });
    assert.ok(previewVisible, 'preview tab should show preview and hide the form');
  });

  await scenario('responsive: 768px tablet - no overflow, no mobile tabs', async () => {
    await page.setViewport({ width: 768, height: 1024 });
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(300);
    const overflow = await evalJS(page, () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `horizontal overflow: ${overflow}px`);
    const tabsHidden = await $eval(page, '#mobileTabs', (e) => getComputedStyle(e).display === 'none');
    assert.ok(tabsHidden);
  });

  await scenario('responsive: 1280px desktop - two column layout', async () => {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(300);
    const layout = await evalJS(page, () => {
      const form = document.querySelector('.form-panel').getBoundingClientRect();
      const prev = document.querySelector('.preview-panel').getBoundingClientRect();
      return { side: prev.left > form.right - 5, both: form.width > 200 && prev.width > 200 };
    });
    assert.ok(layout.both, 'both panels visible');
    assert.ok(layout.side, 'preview should sit beside the form');
    const overflow = await evalJS(page, () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `horizontal overflow: ${overflow}px`);
  });

  await scenario('graceful degradation when a text is unavailable (404)', async () => {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await evalJS(page, () => localStorage.removeItem('mishna-poster-settings-v1'));
    await page.reload({ waitUntil: 'networkidle0' });
    await setStartDate(page, '2026-09-03');
    await evalJS(page, () => {
      document.getElementById('count').value = '6';
      document.getElementById('count').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clickBuild(page);
    // fixtures only cover 4 mishnas -> entries 5 & 6 fail softly
    const status = await $eval(page, '#statusLine', (e) => e.textContent);
    assert.ok(status.length > 0, 'an error status should be shown');
    const pages = await evalJS(page, () => document.querySelectorAll('#renderStage .poster-page').length);
    assert.equal(pages, 4, 'the 4 available pages still render');
    const errMarks = await $eval(page, '#scheduleTable', (e) => e.querySelectorAll('.err-cell').length);
    assert.equal(errMarks, 2, 'failed rows are marked');
  });

  await scenario('schedule table + hebrew dates across the week boundary', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await evalJS(page, () => localStorage.removeItem('mishna-poster-settings-v1'));
    await page.reload({ waitUntil: 'networkidle0' });
    await setStartDate(page, '2026-09-03');
    await evalJS(page, () => {
      document.getElementById('count').value = '4';
      document.getElementById('count').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clickBuild(page);
    const rows = await evalJS(page, () => [...document.querySelectorAll('#scheduleTable tbody tr')].map((tr) => tr.textContent));
    assert.match(rows[0], /Nitzavim-Vayeilech/);
    assert.match(rows[1], /Nitzavim-Vayeilech/);
    assert.match(rows[3], /Rosh Hashana I/); // Sat 2026-09-12 reading
    assert.match(rows[0], /Bekhorot 3:2/);
  });

  // Scenario 20: the raster sent to the PDF must match the browser's own
  // rendering of the same DOM. Screenshot the first stage poster natively,
  // rasterize it with html2canvas (what the PDF pipeline uses), and compare
  // pixel-by-pixel. Antialiasing noise is tolerated; wrong RTL order, missing
  // text, or misplaced elements would blow past the threshold.
  await scenario('raster fidelity: html2canvas output matches native render', async () => {
    await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 1 });
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await evalJS(page, () => localStorage.removeItem('mishna-poster-settings-v1'));
    await page.reload({ waitUntil: 'networkidle0' });
    await setStartDate(page, '2026-09-03');
    await evalJS(page, () => {
      document.getElementById('count').value = '4';
      document.getElementById('count').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clickBuild(page);
    await evalJS(page, () => {
      const st = document.createElement('style');
      st.id = 'fidelity-shot-style';
      st.textContent = `
        .topbar, .layout, .app-footer, .mobile-tabs { visibility: hidden !important; }
        #renderStage { left: 0 !important; top: 0 !important; z-index: 9999 !important; }
        #renderStage .poster-page:not(:first-child) { display: none; }
        body { background: #fff !important; }
      `;
      document.head.appendChild(st);
      window.scrollTo(0, 0);
    });
    await sleep(400); // let style recalc settle
    const el = await page.$('#renderStage .poster-page');
    const nativeBuf = await el.screenshot({ type: 'png' });
    assert.ok(nativeBuf.length > 10000, `native screenshot suspiciously small: ${nativeBuf.length}`);
    const stats = await evalJS(page, async (nativeDataUrl) => {
      const el = document.querySelector('#renderStage .poster-page');
      const canvas = await html2canvas(el, { scale: 1, backgroundColor: '#ffffff', logging: false });
      const natImg = new Image();
      await new Promise((res, rej) => { natImg.onload = res; natImg.onerror = rej; natImg.src = nativeDataUrl; });
      if (canvas.width !== natImg.width || canvas.height !== natImg.height) {
        return { sizeMismatch: [canvas.width, canvas.height, natImg.width, natImg.height] };
      }
      const c2 = document.createElement('canvas');
      c2.width = natImg.width; c2.height = natImg.height;
      c2.getContext('2d').drawImage(natImg, 0, 0);
      const a = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const b = c2.getContext('2d').getImageData(0, 0, c2.width, c2.height);
      const TOL = 60;
      let close = 0, far = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const d = Math.max(
          Math.abs(a.data[i] - b.data[i]),
          Math.abs(a.data[i + 1] - b.data[i + 1]),
          Math.abs(a.data[i + 2] - b.data[i + 2]),
        );
        if (d <= TOL) close++; else far++;
      }
      return { w: canvas.width, h: canvas.height, closePct: +(100 * close / (close + far)).toFixed(2) };
    }, `data:image/png;base64,${nativeBuf.toString('base64')}`);
    assert.ok(!stats.sizeMismatch, `size mismatch h2c vs native: ${stats.sizeMismatch}`);
    assert.equal(stats.w, 816); assert.equal(stats.h, 1056);
    assert.ok(stats.closePct >= 95, `raster diverged from native render: only ${stats.closePct}% close pixels`);
    await evalJS(page, () => document.getElementById('fidelity-shot-style').remove());
    console.log(`      (html2canvas vs native: ${stats.closePct}% pixels within tol, ${stats.w}x${stats.h})`);
  });
} finally {
  await browser.close();
  server.close();
}

console.log('====================================');
console.log(`e2e: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log(failures.map((f) => `  ✘ ${f.name}`).join('\n'));
  process.exit(1);
}
process.exit(0);
