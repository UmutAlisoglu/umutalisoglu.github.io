import test from 'node:test';
import assert from 'node:assert/strict';
import { cropBounds, pageSelection, scaledSize } from '../src/fileforge/advanced-shared.js';

test('page ranges produce ordered unique pages and enforce the export limit', () => {
  assert.deepEqual(pageSelection('5, 1-3, 2, 7-8', 10), [1, 2, 3, 5, 7, 8]);
  assert.deepEqual(pageSelection('   ', 3), [1, 2, 3]);
  assert.deepEqual(pageSelection('1-50, 1-50', 100), Array.from({ length: 50 }, (_, index) => index + 1));
  assert.throws(() => pageSelection('', 51), /up to 50/);
  assert.throws(() => pageSelection('1-51', 100), /up to 50/);
  assert.throws(() => pageSelection('1-30, 40-60', 100), /up to 50/);
  for (const text of ['0', '11', '3-2', '1.5', '1,,2', '1-', '1-2-3', 'all', '1,']) {
    assert.throws(() => pageSelection(text, 10), undefined, text);
  }
  for (const total of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => pageSelection('', total), /no pages/);
});

test('crop bounds permit exact image edges and reject invalid or overflowing regions', () => {
  assert.deepEqual(cropBounds({ x: '0', y: '0', width: '100', height: '50' }, 100, 50), { x: 0, y: 0, width: 100, height: 50 });
  assert.deepEqual(cropBounds({ x: 99, y: 49, width: 1, height: 1 }, 100, 50), { x: 99, y: 49, width: 1, height: 1 });
  const region = { x: 10, y: 10, width: 20, height: 20 };
  for (const values of [
    { ...region, x: -1 }, { ...region, y: -1 }, { ...region, width: 0 }, { ...region, height: -1 },
    { ...region, x: 81 }, { ...region, y: 31 }, { ...region, width: 91 }, { ...region, height: 41 },
    { ...region, x: .5 }, { ...region, width: Infinity }, { ...region, height: NaN }, { ...region, y: 'invalid' },
  ]) assert.throws(() => cropBounds(values, 100, 50), undefined, JSON.stringify(values));
});

test('tracing dimensions preserve orientation without enlarging the original image', () => {
  assert.deepEqual(scaledSize(2000, 1000, 1000), { width: 1000, height: 500 });
  assert.deepEqual(scaledSize(1000, 2000, 1000), { width: 500, height: 1000 });
  assert.deepEqual(scaledSize(12, 8, 1000), { width: 12, height: 8 });
  assert.deepEqual(scaledSize(10000, 1, 1000), { width: 1000, height: 1 });
});
