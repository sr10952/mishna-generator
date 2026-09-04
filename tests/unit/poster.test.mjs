import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_PAGE_MIN_IN,
  CUSTOM_PAGE_MAX_IN,
  getPageSize,
  getPageSizeForElement,
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
