import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_PAGE_MIN_IN,
  CUSTOM_PAGE_MAX_IN,
  MIN_CONTENT_AREA_PX,
  getPageSize,
  getPageSizeForElement,
  resolveContentInsets,
} from '../../assets/js/poster.js';

test('page-size presets include portrait Tabloid', () => {
  const tabloid = getPageSize('tabloid');
  assert.equal(tabloid.id, 'tabloid');
  assert.equal(tabloid.widthIn, 11);
  assert.equal(tabloid.heightIn, 17);
  assert.equal(tabloid.width, 1056);
  assert.equal(tabloid.height, 1632);
  assert.equal(tabloid.widthPt, 792);
  assert.equal(tabloid.heightPt, 1224);
  assert.equal(tabloid.pdfFormat, 'tabloid');
  assert.equal(tabloid.printFormat, '11in 17in');
});

test('custom page dimensions are bounded and survive element round-tripping', () => {
  const portrait = getPageSize({
    pageSize: 'custom',
    customPageWidth: 10,
    customPageHeight: 13,
  });
  assert.equal(portrait.id, 'custom');
  assert.equal(portrait.widthIn, 10);
  assert.equal(portrait.heightIn, 13);
  assert.equal(portrait.width, 960);
  assert.equal(portrait.height, 1248);
  assert.deepEqual(portrait.pdfFormat, [720, 936]);
  assert.equal(portrait.printFormat, '10in 13in');
  assert.equal(portrait.orientation, 'portrait');

  const fromPoster = getPageSizeForElement({
    dataset: { pageSize: 'custom', pageWidthIn: '13', pageHeightIn: '10' },
  });
  assert.equal(fromPoster.orientation, 'landscape');
  assert.deepEqual(fromPoster.pdfFormat, [936, 720]);

  const bounded = getPageSize({ pageSize: 'custom', customPageWidth: 1, customPageHeight: 99 });
  assert.equal(bounded.widthIn, CUSTOM_PAGE_MIN_IN);
  assert.equal(bounded.heightIn, CUSTOM_PAGE_MAX_IN);
});

test('resolveContentInsets passes supported margins through untouched', () => {
  const letter = getPageSize('letter'); // 816 x 1056 px
  // The reported regression case: 3 in on every side must render at 288 px.
  const three = resolveContentInsets(
    { marginTop: 3, marginRight: 3, marginBottom: 3, marginLeft: 3 },
    letter,
  );
  assert.deepEqual(three, { top: 288, right: 288, bottom: 288, left: 288 });

  // Full supported range on every standard page size.
  for (const id of ['letter', 'legal', 'tabloid']) {
    const size = getPageSize(id);
    const max = resolveContentInsets(
      { marginTop: 4, marginRight: 4, marginBottom: 4, marginLeft: 4 },
      size,
    );
    assert.deepEqual(max, { top: 384, right: 384, bottom: 384, left: 384 }, id);
  }

  // Mixed valid values convert at exactly 96 px/in.
  const mixed = resolveContentInsets(
    { marginTop: 0.5, marginRight: 1.25, marginBottom: 2.5, marginLeft: 0 },
    letter,
  );
  assert.deepEqual(mixed, { top: 48, right: 120, bottom: 240, left: 0 });
});

test('resolveContentInsets rescues margins that would erase the text area', () => {
  const tiny = getPageSize({ pageSize: 'custom', customPageWidth: 5, customPageHeight: 5 }); // 480 x 480 px
  const insets = resolveContentInsets(
    { marginTop: 4, marginRight: 4, marginBottom: 4, marginLeft: 4 },
    tiny,
  );
  // Opposing margins are scaled down proportionally so a content area of at
  // least MIN_CONTENT_AREA_PX survives on each axis (never negative, never
  // larger than requested).
  assert.ok(insets.top + insets.bottom <= tiny.height - MIN_CONTENT_AREA_PX);
  assert.ok(insets.left + insets.right <= tiny.width - MIN_CONTENT_AREA_PX);
  assert.equal(insets.top, insets.bottom);
  assert.ok(insets.top > 0 && insets.top <= 384);
});
