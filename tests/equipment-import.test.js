'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existingMatch, imageName } = require('../scripts/import-highvalley');
const manifest = require('../scripts/imports/highvalley-equipment-2026-10-10.json');

test('supplier import detects duplicates across different slugs and formatting', () => {
  const item = manifest.listings[0];
  assert.ok(existingMatch(item, [{ id: 7, year: 2009, make: 'CATERPILLAR', model: '420 E', slug: 'other-source' }]));
  assert.equal(existingMatch(item, [{ year: 2010, make: 'Caterpillar', model: '420E' }]), undefined);
  const withSerial = manifest.listings[1];
  assert.ok(existingMatch(withSerial, [{ serial_number: withSerial.data.serial_number.toLowerCase(), slug: 'different' }]));
});

test('catalogue has six additions, two explicit exclusions and valid local photo names', () => {
  assert.equal(manifest.listings.length, 6);
  assert.equal(manifest.excluded.length, 2);
  assert.equal(manifest.listings.reduce((n, item) => n + item.images.length, 0), 107);
  for (const item of manifest.listings) {
    assert.equal(item.data.quantity, 1);
    assert.equal(item.data.keep_selling, 0);
    assert.equal(item.data.buy_now_price > 0, true);
    assert.equal(item.data.inspection_grade, undefined);
    item.images.forEach(url => assert.match(imageName(url), /^hv-[a-f0-9]{24}\.webp$/));
  }
  for (const url of ['http://images.imagingprocessing.com/cdn/foo', 'https://example.com/photo', 'https://images.imagingprocessing.com/cdn/../../secret']) assert.throws(() => imageName(url));
});
