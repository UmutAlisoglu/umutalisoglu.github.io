import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuickJob, quickJobs } from '../src/site/quick-jobs.js';
import { outputMetrics } from '../src/fileforge/output-summary.js';
const file = (name, size = 1000) => ({ name, size });
test('attachment job routes by actual supported extension and retains practical limits', () => {
  for (const [name, ids] of [['PHOTO.PNG', ['image']], ['iphone.heic', ['heic', 'image']], ['pages.pdf', ['compress']], ['clip.MOV', ['video']]]) {
    assert.deepEqual(resolveQuickJob('attachment', [file(name)]).steps.map(step => step.tool), ids);
  }
  assert.throws(() => resolveQuickJob('attachment', [file('x.pdf', 25e6 + 1)]), /25 MB/);
  assert.throws(() => resolveQuickJob('attachment', [file('x.docx')]), /full toolbox/);
});
test('product and document jobs require a single supported image and resolve independent sessions', () => {
  assert.deepEqual(resolveQuickJob('product', [file('x.jpg')]).steps.map(step => step.tool), ['background', 'crop', 'image']);
  assert.deepEqual(resolveQuickJob('document', [file('x.png')]).steps.map(step => step.tool), ['scanner', 'image-pdf']);
  for (const job of quickJobs) assert.throws(() => resolveQuickJob(job.id, [file('one.png'), file('two.png')]), /one file/);
  assert.throws(() => resolveQuickJob('document', [file('scan.pdf')]), /one jpg/i);
  const first = resolveQuickJob('product', [file('x.png')]); first.index++;
  assert.equal(resolveQuickJob('product', [file('x.png')]).index, 0);
  assert.equal(resolveQuickJob('unknown', [file('x.png')]), null);
});
test('output facts distinguish savings, larger results, unchanged size and created documents', () => {
  assert.equal(outputMetrics([file('x', 1000)], { size: 400 }).label, '60.0% smaller');
  assert.equal(outputMetrics([file('x', 1000)], { size: 1600 }).label, '60.0% larger');
  assert.equal(outputMetrics([file('x', 1000)], { size: 1000 }).label, 'About the same size');
  assert.equal(outputMetrics([], { size: 1000 }).label, 'New file created');
});
