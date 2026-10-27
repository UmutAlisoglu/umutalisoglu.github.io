import test from 'node:test';
import assert from 'node:assert/strict';
import { kitSettings, validateKitFiles, kitSlug, fitProduct, KIT_DEFAULTS } from '../src/fileforge/product-kit-shared.js';
const file = (name = 'photo.jpg', size = 1000) => ({ name, size });
test('kit settings clamp untrusted saved values and keep explicit false', () => {
  assert.equal(KIT_DEFAULTS.remove, false);
  assert.deepEqual(kitSettings(null), KIT_DEFAULTS);
  assert.deepEqual(kitSettings([]), KIT_DEFAULTS);
  assert.deepEqual(kitSettings({ size: 90000, padding: -1, background: '<script>', remove: false, name: '  Shop  ' }), { ...KIT_DEFAULTS, remove: false, name: 'Shop' });
  assert.equal(kitSettings({ name: 'x'.repeat(100) }).name.length, 60);
  assert.equal(kitSettings({ size: '2000', padding: '20', background: 'transparent' }).size, 2000);
});
test('kit file limits reject invalid batches before replacing current selection', () => {
  assert.doesNotThrow(() => validateKitFiles([file('UPPER.PNG'), file('other.webp')]));
  assert.throws(() => validateKitFiles([]), /at least/);
  assert.throws(() => validateKitFiles(Array.from({ length: 13 }, () => file())), /12 photos/);
  assert.throws(() => validateKitFiles([file('x.svg')]), /JPG/);
  assert.throws(() => validateKitFiles([file('x.jpg', 0)]), /non-empty/);
  assert.throws(() => validateKitFiles([file('x.jpg', 20_000_001)]), /20 MB/);
  assert.throws(() => validateKitFiles(Array.from({ length: 5 }, () => file('x.jpg', 19_000_000))), /80 MB/);
});
test('product framing preserves aspect ratio and fits the requested whitespace', () => {
  assert.deepEqual(fitProduct({ width: 200, height: 400 }, 1000, 20), { x: 350, y: 200, width: 300, height: 600 });
  assert.deepEqual(fitProduct({ width: 400, height: 200 }, 1000, 20), { x: 200, y: 350, width: 600, height: 300 });
});
test('kit paths are safe slugs, including duplicate and non-Latin source names', () => {
  assert.equal(kitSlug('../../My SHÖP?!'), 'my-shop');
  assert.equal(kitSlug('你好'), 'product');
  assert.equal(kitSlug('x'.repeat(100)).length, 50);
});
