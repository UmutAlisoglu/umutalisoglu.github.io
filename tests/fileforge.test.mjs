import test from 'node:test';
import assert from 'node:assert/strict';
import { columnGroups, resultName, videoBudget } from '../src/fileforge/shared.js';

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
