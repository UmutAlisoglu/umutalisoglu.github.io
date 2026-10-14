import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [], outbound = [];
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => {
  if (!request.url().startsWith('blob:') && (request.method() !== 'GET' || new URL(request.url()).origin !== new URL(base).origin)) outbound.push(`${request.method()} ${request.url()}`);
});
const output = resolve('.local/background-editor-check'); await mkdir(output, { recursive: true });
const [sharedSource, editorSource] = await Promise.all([
  readFile(resolve('src/fileforge/advanced-shared.js'), 'utf8'),
  readFile(resolve('src/fileforge/background-editor.js'), 'utf8'),
]);
const editorModule = sharedSource + '\n' + editorSource.replace(/^import .*;\r?\n/gm, '');

try {
  await page.goto(base + '/tools/remove-background/');
  await page.waitForFunction(() => document.querySelector('#advanced-run').disabled);
  const proof = await page.evaluate(async editorModule => {
    const moduleURL = URL.createObjectURL(new Blob([editorModule], { type: 'text/javascript' }));
    const { createBackgroundEditor, MaskHistory, backgroundColour, brushBounds } = await import(moduleURL); URL.revokeObjectURL(moduleURL);
    const $ = selector => document.querySelector(selector);
    const source = document.createElement('canvas'); source.width = 96; source.height = 64;
    const ctx = source.getContext('2d'); ctx.fillStyle = '#dc382f'; ctx.fillRect(0, 0, 96, 64); ctx.clearRect(0, 0, 16, 16);
    const bitmap = await createImageBitmap(source);
    const mask = new Uint8ClampedArray(320 * 320 * 4);
    for (let i = 0; i < 320 * 320; i++) { mask[i * 4] = mask[i * 4 + 1] = mask[i * 4 + 2] = 255; mask[i * 4 + 3] = i % 320 >= 240 ? 0 : 255; }
    let dirty = 0;
    const editor = createBackgroundEditor({ bitmap, mask: mask.buffer, onDirty: () => dirty++ });
    const change = (id, value) => { $(id).value = value; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
    const sample = async (x, y) => {
      const blob = await editor.exportPNG(); const image = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const result = { pixel: [...context.getImageData(x, y, 1, 1).data], width: image.width, height: image.height };
      image.close(); canvas.width = canvas.height = 1; return result;
    };
    const stamp = (x, y, mode = 'erase') => {
      $(`#background-${mode}`).click(); change('#background-x', x); change('#background-y', y); $('#background-apply').click();
    };
    change('#background-hardness', '100'); change('#background-brush-size', 16);
    const initial = await sample(24, 24), initiallyMissing = await sample(82, 32);
    stamp(24, 24); const erased = await sample(24, 24);
    $('#background-undo').click(); const undone = await sample(24, 24);
    change('#background-hardness', '30'); stamp(24, 24); const softEdge = await sample(30, 24);
    $('#background-undo').click(); const softUndo = await sample(30, 24); change('#background-hardness', '100');
    stamp(82, 32, 'restore'); const restored = await sample(82, 32);
    stamp(8, 8, 'restore'); const originalTransparency = await sample(8, 8);
    const beforeCompare = dirty;
    change('#background-view', 'compare'); $('#background-compare').value = 25; $('#background-compare').dispatchEvent(new Event('input'));
    const comparedExport = await sample(24, 24), afterCompare = dirty;
    change('#background-zoom', '300'); const zoomWidth = $('#background-stage').style.width;
    change('#background-view', 'edit');
    change('#background-colour', '#2144cc'); change('#background-fill', 'custom'); const custom = await sample(8, 8);
    change('#background-fill', 'transparent');
    $('#background-reset').click(); const reset = await sample(82, 32), undoAfterReset = $('#background-undo').disabled;
    change('#background-x', 24); change('#background-y', 24); $('#background-erase').click();
    $('#background-stage').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    $('#background-stage').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const keyboard = await sample(34, 24);
    $('#background-stage').dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    const keyboardUndo = await sample(34, 24);
    const memory = new MaskHistory(10, 2), patch = count => [{ alpha: new Uint8Array(count) }];
    memory.push(patch(4)); memory.push(patch(4)); memory.push(patch(4));
    const capped = { length: memory.length, bytes: memory.bytes }; memory.push(patch(12));
    const oversized = { length: memory.length, bytes: memory.bytes };
    editor.dispose(); bitmap.close();
    return { initial, initiallyMissing, erased, undone, softEdge, softUndo, restored, originalTransparency, comparedExport, beforeCompare, afterCompare, zoomWidth, custom, reset, undoAfterReset, keyboard, keyboardUndo, capped, oversized, hidden: $('#background-editor').hidden, bounds: brushBounds(0, 0, 20, 96, 64), colour: backgroundColour('custom', '#ABCDEF') };
  }, editorModule);
  assert.deepEqual([proof.initial.width, proof.initial.height], [96, 64]);
  assert.deepEqual(proof.initial.pixel, [220, 56, 47, 255]);
  assert.equal(proof.initiallyMissing.pixel[3], 0);
  assert.equal(proof.erased.pixel[3], 0);
  assert.deepEqual(proof.undone.pixel, proof.initial.pixel);
  assert.ok(proof.softEdge.pixel[3] > 0 && proof.softEdge.pixel[3] < 255, 'Soft brush must produce feathered alpha');
  assert.deepEqual(proof.softUndo.pixel, proof.initial.pixel);
  assert.deepEqual(proof.restored.pixel, proof.initial.pixel);
  assert.equal(proof.originalTransparency.pixel[3], 0, 'Restore must not invent originally transparent pixels');
  assert.deepEqual(proof.comparedExport.pixel, proof.initial.pixel);
  assert.equal(proof.afterCompare, proof.beforeCompare, 'Comparison must not change exported pixels or invalidate results');
  assert.equal(proof.zoomWidth, '288px');
  assert.deepEqual(proof.custom.pixel, [33, 68, 204, 255]);
  assert.equal(proof.reset.pixel[3], 0);
  assert.equal(proof.undoAfterReset, true);
  assert.equal(proof.keyboard.pixel[3], 0);
  assert.deepEqual(proof.keyboardUndo.pixel, proof.initial.pixel);
  assert.deepEqual(proof.capped, { length: 2, bytes: 8 });
  assert.deepEqual(proof.oversized, { length: 0, bytes: 0 });
  assert.equal(proof.hidden, true);
  assert.deepEqual(proof.bounds, { x: 0, y: 0, width: 12, height: 12 });
  assert.equal(proof.colour, '#abcdef');
  console.log('PASS real PNG pixels: erase, restore, original alpha, undo/reset, custom backdrop, keyboard, comparison, dimensions and bounded history');

  // Run the real model and prove editor exports replace the actual downloadable
  // result. Fixture is the pinned public U2Net example prepared by test:next.
  const horse = await readFile(resolve('.local/fixtures/u2net-horse.jpg'));
  await page.reload();
  await page.locator('#advanced-input').setInputFiles({ name: 'horse.jpg', mimeType: 'image/jpeg', buffer: horse });
  await page.locator('#advanced-run').click();
  await page.waitForFunction(() => !document.querySelector('#advanced-result').hidden, undefined, { timeout: 120_000 });
  await page.waitForFunction(() => document.querySelector('#advanced-cancel').hidden);
  const readPNG = () => page.evaluate(async () => {
    const blob = await (await fetch(document.querySelector('#advanced-download').href)).blob();
    const bitmap = await createImageBitmap(blob); const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let solid;
    for (let y = 20; y < canvas.height - 20 && !solid; y++) for (let x = 20; x < canvas.width - 20; x++) if (pixels[(y * canvas.width + x) * 4 + 3] > 250) { solid = { x, y }; break; }
    const x = Number(document.querySelector('#background-x').value), y = Number(document.querySelector('#background-y').value);
    const result = { dimensions: [canvas.width, canvas.height], solid, pixel: [...ctx.getImageData(x, y, 1, 1).data] };
    bitmap.close(); canvas.width = canvas.height = 1; return result;
  });
  const initial = await readPNG(); assert.ok(initial.solid, 'Model should retain opaque foreground pixels');
  await page.locator('#background-brush-size').fill('20'); await page.locator('#background-hardness').selectOption('100');
  await page.locator('#background-x').fill(String(initial.solid.x)); await page.locator('#background-y').fill(String(initial.solid.y));
  await page.locator('#background-apply').click();
  assert.equal(await page.locator('#advanced-result').isVisible(), false, 'Edits must hide stale download');
  assert.equal(await page.locator('#advanced-download').getAttribute('href'), null);
  assert.equal(await page.locator('.continue-workspace').isVisible(), false, 'Edits must disable stale workspace handoff');
  await page.locator('#background-export').click();
  await page.waitForFunction(() => !document.querySelector('#advanced-result').hidden);
  await page.waitForFunction(() => document.querySelector('#advanced-cancel').hidden);
  const erased = await readPNG(); assert.equal(erased.pixel[3], 0); assert.deepEqual(erased.dimensions, initial.dimensions);
  assert.equal(await page.locator('.continue-workspace').isVisible(), true);
  await page.locator('#background-undo').click(); await page.locator('#background-export').click();
  await page.waitForFunction(() => document.querySelector('#advanced-cancel').hidden && !document.querySelector('#advanced-result').hidden);
  assert.ok((await readPNG()).pixel[3] > 250, 'Undo must restore the actual model mask');
  await page.locator('#background-stage').scrollIntoViewIfNeeded();
  const bounds = await page.locator('#background-canvas').boundingBox();
  const point = { x: bounds.x + (initial.solid.x + .5) / initial.dimensions[0] * bounds.width, y: bounds.y + (initial.solid.y + .5) / initial.dimensions[1] * bounds.height };
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 8, point.y + 4, { steps: 4 }); await page.mouse.up();
  assert.equal(await page.locator('#advanced-result').isVisible(), false);
  await page.locator('#background-export').click();
  await page.waitForFunction(() => document.querySelector('#advanced-cancel').hidden && !document.querySelector('#advanced-result').hidden);
  const pointer = await readPNG(); assert.equal(pointer.pixel[3], 0, 'Pointer stroke must change exported mask pixels');
  await page.locator('#background-view').selectOption('inspect');
  assert.equal(await page.locator('#background-apply').isDisabled(), true);
  assert.match(await page.locator('#background-stage').evaluate(stage => getComputedStyle(stage).touchAction), /pan-x.*pan-y/);
  assert.equal(await page.locator('#advanced-result').isVisible(), true, 'Pan / inspect must keep the completed export');
  await page.locator('#background-view').selectOption('compare'); await page.locator('#background-compare').fill('35');
  assert.equal(await page.locator('#advanced-result').isVisible(), true, 'Preview-only controls keep the completed export');
  assert.equal(await page.locator('#background-apply').isDisabled(), true);
  await page.screenshot({ path: resolve(output, 'cutout-studio-desktop.png'), fullPage: true });
  await page.locator('#background-view').selectOption('edit');
  await page.locator('#background-fill').selectOption('custom');
  await page.locator('#background-colour').fill('#2144cc');
  await page.locator('#background-export').click();
  await page.waitForFunction(() => !document.querySelector('#advanced-result').hidden);
  await page.waitForFunction(() => document.querySelector('#advanced-cancel').hidden);
  const custom = await readPNG(); assert.deepEqual(custom.pixel, [33, 68, 204, 255]);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${width}px layout should fit`);
  }
  await page.setViewportSize({ width: 390, height: 900 }); await page.screenshot({ path: resolve(output, 'cutout-studio-mobile.png'), fullPage: true });
  await page.locator('#advanced-clear').click();
  assert.equal(await page.locator('#background-editor').isVisible(), false);
  assert.equal(await page.locator('#advanced-download').getAttribute('href'), null);
  assert.equal(await page.locator('#background-export').isDisabled(), true);
  assert.equal(await page.locator('#advanced-run').innerText(), 'Remove background ↗');
  console.log('PASS actual local AI model: regenerated downloads, stale handoff invalidation, comparison, colour, responsive widths and cleanup');
  assert.deepEqual(outbound, [], 'No image or data may leave the local site');
  assert.deepEqual(errors, [], 'No JavaScript errors');
} finally { await browser.close(); }
