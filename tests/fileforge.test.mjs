import test from 'node:test';
import assert from 'node:assert/strict';
import { batchNames, columnGroups, imageSettings, resultName, videoBudget } from '../src/fileforge/shared.js';

test('video budget accounts for audio and MP4 overhead over the full duration', () => {
  const { video, audio } = videoBudget(10_000_000, 120, true);
  assert.ok((video + audio) * 120 / 8 < 10_000_000);
  assert.ok(audio >= 8000); assert.ok(video > audio);
  assert.equal(videoBudget(10_000_000, 120, false).audio, 0);
  assert.throws(() => videoBudget(100_000, 3600, true), /too small/);
  assert.throws(() => videoBudget(10_000_000, NaN, true), /duration/);
});
test('wide table groups cover every column exactly once', () => {
  const groups = columnGroups(80, 7);
  const columns = groups.flatMap(([start, end]) => Array.from({ length: end - start }, (_, index) => start + index));
  assert.deepEqual(columns, Array.from({ length: 80 }, (_, index) => index));
});
test('download filenames retain readable names without path separators', () => {
  assert.equal(resultName('İstanbul.xlsx', 'pdf'), 'İstanbul-fileforge.pdf');
  assert.equal(resultName('../a.png', 'webp'), '.._a-fileforge.webp');
});

test('batch filenames never overwrite duplicate or case-variant images', () => {
  const names = batchNames(['photo.jpg', 'photo.png', 'PHOTO.webp', '../photo.png', 'İstanbul.png'].map(name => ({ name })), 'jpg');
  assert.equal(new Set(names.map(name => name.toLowerCase())).size, names.length);
  assert.deepEqual(names.slice(0, 3), ['photo-fileforge.jpg', 'photo-fileforge-2.jpg', 'PHOTO-fileforge-3.jpg']);
  assert.ok(names.every(name => !/[\\/]/.test(name)));
});

test('saved image settings accept only supported formats and bounded dimensions', () => {
  assert.deepEqual(imageSettings({ format: 'jpg', quality: '85', width: '1600', filename: 'private.png' }), { format: 'jpg', quality: 85, width: 1600 });
  for (const value of [null, {}, { format: 'svg', quality: 85, width: 0 }, { format: 'jpg', quality: -1, width: 0 }, { format: 'png', quality: 85, width: 99999 }, { format: 'jpg', quality: 85, width: 1.5 }]) assert.equal(imageSettings(value), null);
});
