import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const output = resolve('.local/image-preview-check'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  window.__revokedPreviews = []; window.__closedBitmaps = 0;
  const revoke = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = url => { window.__revokedPreviews.push(url); revoke(url); };
  const close = ImageBitmap.prototype.close; ImageBitmap.prototype.close = function () { window.__closedBitmaps++; return close.call(this); };
  const decode = window.createImageBitmap.bind(window);
  window.createImageBitmap = async (...args) => {
    const bitmap = await decode(...args);
    if (window.__slowPreview && bitmap.width === 90) await new Promise(resolve => setTimeout(resolve, 400));
    if (window.__slowResult && bitmap.width === 40) { window.__resultPreviewStarted = true; await new Promise(resolve => setTimeout(resolve, 400)); }
    return bitmap;
  };
});
const requests = [], errors = [];
context.on('request', request => requests.push({ url: request.url(), method: request.method() }));
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
const check = async (label, work) => { await work(); console.log(`PASS ${label}`); };
const fixture = async (width, height, color = '#e52f42', transparent = false, type = 'image/png') => Buffer.from(await page.evaluate(async ({ width, height, color, transparent, type }) => {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, transparent ? width / 2 : width, height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, type)); const bytes = Array.from(new Uint8Array(await blob.arrayBuffer())); canvas.width = canvas.height = 1; return bytes;
}, { width, height, color, transparent, type }));
const select = (name, buffer, mimeType = 'image/png') => page.locator('#files').setInputFiles({ name, buffer, mimeType });
const waitSource = () => page.waitForFunction(() => { const image = document.querySelector('#image-source-preview'); return !image.hidden && image.complete && image.naturalWidth > 0; });
const convert = async () => {
  await page.locator('#conversion-form button[type=submit]').click();
  await page.locator('#result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result').isVisible(), true, await page.locator('#job-status').innerText());
};
const pixel = selector => page.evaluate(async selector => {
  const image = document.querySelector(selector); const bitmap = await createImageBitmap(await (await fetch(image.src)).blob());
  try { const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); return { width: bitmap.width, height: bitmap.height, left: Array.from(context.getImageData(0, 0, 1, 1).data), right: Array.from(context.getImageData(bitmap.width - 1, 0, 1, 1).data) }; }
  finally { bitmap.close(); }
}, selector);

try {
  await page.goto(`${base}/tools/image-converter/`);
  const red = await fixture(128, 64, '#e52f42', true);
  await check('original preview exposes real dimensions, bytes and transparent pixels before conversion', async () => {
    const start = requests.length; await select('transparent.png', red); await waitSource();
    assert.match(await page.locator('#image-source-meta').innerText(), new RegExp(`128 × 64 px · ${red.length.toLocaleString('en-US')} bytes`));
    const sample = await pixel('#image-source-preview'); assert.deepEqual(sample.left, [229, 47, 66, 255]); assert.equal(sample.right[3], 0);
    assert.equal(await page.locator('#image-result-card').isVisible(), false); assert.equal(await page.locator('#result').isVisible(), false);
    assert.equal(requests.slice(start).some(request => /image\.worker|pdf|ffmpeg|ort|onnx|tesseract|traineddata|\.wasm/.test(request.url)), false, 'Selecting an image does not download a converter engine');
  });
  await check('conversion compares actual source/result pixels, dimensions and exact byte savings', async () => {
    await page.locator('[name=format]').selectOption('jpg'); await page.locator('[name=width]').fill('64'); await convert();
    const sample = await pixel('#image-preview'); assert.equal(sample.width, 64); assert.equal(sample.height, 32); assert.ok(sample.right.slice(0, 3).every(value => value >= 245), 'JPEG fills transparency with white');
    const bytes = await page.evaluate(async () => (await (await fetch(document.querySelector('#download-result').href)).blob()).size);
    assert.match(await page.locator('#image-result-meta').innerText(), new RegExp(`64 × 32 px · ${bytes.toLocaleString('en-US')} bytes`));
    assert.equal(await page.locator('#image-input-bytes').innerText(), `${red.length.toLocaleString('en-US')} bytes`);
    assert.equal(await page.locator('#image-output-bytes').innerText(), `${bytes.toLocaleString('en-US')} bytes`);
    assert.match(await page.locator('#image-size-change').innerText(), new RegExp(`${Math.abs(red.length - bytes).toLocaleString('en-US')} bytes`));
    await page.getByRole('button', { name: 'Original', exact: true }).click(); assert.equal(await page.locator('#image-result-card').isVisible(), false);
    await page.getByRole('button', { name: 'Result', exact: true }).click(); assert.equal(await page.locator('#image-source-card').isVisible(), false);
    await page.getByRole('button', { name: 'Compare', exact: true }).click(); assert.equal(await page.locator('#image-source-card').isVisible(), true); assert.equal(await page.locator('#image-result-card').isVisible(), true);
    await page.screenshot({ path: resolve(output, 'compare-desktop.png'), fullPage: true });
  });
  await check('settings invalidate old downloads/result previews while retaining the original', async () => {
    const previous = await page.locator('#image-preview').getAttribute('src'), download = await page.locator('#download-result').getAttribute('href'), original = await page.locator('#image-source-preview').getAttribute('src');
    await page.locator('[name=format]').selectOption('webp'); assert.equal(await page.locator('#result').isVisible(), false); assert.equal(await page.locator('#image-result-card').isVisible(), false);
    assert.equal(await page.locator('#download-result').getAttribute('href'), null); assert.equal(await page.locator('#image-source-preview').getAttribute('src'), original);
    assert.equal(await page.evaluate(urls => urls.every(url => window.__revokedPreviews.includes(url)), [previous, download]), true);
    await convert(); assert.equal(await page.locator('#image-result-card').isVisible(), true);
  });
  await check('comparison controls and exact-size summaries fit 320px and 390px', async () => {
    for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px`); }
    await page.screenshot({ path: resolve(output, 'compare-mobile.png'), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('batch/PDF exports keep a labeled first-image preview and never masquerade as an image result', async () => {
    const green = await fixture(80, 60, '#12bb67'); await select('green.png', green); await waitSource();
    assert.match(await page.locator('#image-preview-note').innerText(), /first image of 2/); await convert();
    assert.equal(await page.locator('#image-result-card').isVisible(), false); assert.equal(await page.locator('#image-compare-controls').isVisible(), false);
    assert.match(await page.locator('#image-preview-note').innerText(), /ZIP contains 2/); assert.equal(await page.locator('#image-input-label').innerText(), '2 originals combined');
    await page.locator('[name=format]').selectOption('pdf'); await convert(); assert.match(await page.locator('#image-preview-note').innerText(), /PDF contains 2 A4 pages/);
    assert.equal(await page.locator('#image-result-card').isVisible(), false);
    await page.getByRole('button', { name: 'Move green.png up', exact: true }).click(); await waitSource(); assert.match(await page.locator('#image-source-meta').innerText(), /80 × 60/); assert.deepEqual((await pixel('#image-source-preview')).left, [18, 187, 103, 255]);
  });
  await check('a large source keeps original dimensions while limiting preview resolution', async () => {
    await page.locator('#clear-files').click(); const large = await fixture(2048, 1024); await select('large.png', large); await waitSource();
    assert.match(await page.locator('#image-source-meta').innerText(), /2048 × 1024/); const sample = await pixel('#image-source-preview'); assert.equal(sample.width, 960); assert.equal(sample.height, 480);
  });
  await check('rapid clear/reselection cannot bring back a stale decoded preview', async () => {
    await page.locator('#clear-files').click(); const slow = await fixture(90, 50), green = await fixture(80, 60, '#12bb67'); await page.evaluate(() => { window.__slowPreview = true; });
    await select('slow.png', slow); await page.locator('#clear-files').click(); await select('new.png', green); await waitSource(); await page.waitForTimeout(500);
    assert.match(await page.locator('#image-source-meta').innerText(), /80 × 60/); assert.deepEqual((await pixel('#image-source-preview')).left, [18, 187, 103, 255]);
    await page.evaluate(() => { window.__slowPreview = false; });
    const original = await page.locator('#image-source-preview').getAttribute('src'); await page.locator('#clear-files').click(); assert.equal(await page.locator('#image-comparison').isVisible(), false);
    assert.equal(await page.locator('#image-source-preview').getAttribute('src'), null); assert.equal(await page.evaluate(url => window.__revokedPreviews.includes(url), original), true);
    assert.ok(await page.evaluate(() => window.__closedBitmaps >= 8), 'Decoded bitmap resources are closed');
  });
  await check('GIF first frame, BMP, JPG and WebP source previews decode without external services', async () => {
    const bitmap = Buffer.alloc(58); bitmap.write('BM'); bitmap.writeUInt32LE(58, 2); bitmap.writeUInt32LE(54, 10); bitmap.writeUInt32LE(40, 14); bitmap.writeInt32LE(1, 18); bitmap.writeInt32LE(1, 22); bitmap.writeUInt16LE(1, 26); bitmap.writeUInt16LE(24, 28); bitmap.writeUInt32LE(4, 34); bitmap[56] = 255;
    const sources = [
      ['frame.gif', Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'), 'image/gif'],
      ['pixel.bmp', bitmap, 'image/bmp'],
      ['photo.jpg', await fixture(100, 50, '#e52f42', false, 'image/jpeg'), 'image/jpeg'],
      ['web.webp', await fixture(100, 50, '#e52f42', false, 'image/webp'), 'image/webp'],
    ];
    for (const [name, buffer, mimeType] of sources) { if (await page.locator('#clear-files').isVisible()) await page.locator('#clear-files').click(); await select(name, buffer, mimeType); await waitSource(); assert.match(await page.locator('#image-source-meta').innerText(), /px · .* bytes/); }
  });
  await check('cancel during result preview releases URLs/bitmaps and allows a clean restart', async () => {
    await page.locator('#clear-files').click(); await select('cancel.png', await fixture(80, 60)); await waitSource();
    const source = await page.locator('#image-source-preview').getAttribute('src'); await page.locator('[name=format]').selectOption('png'); await page.locator('[name=width]').fill('40');
    await page.evaluate(() => { window.__slowResult = true; window.__resultPreviewStarted = false; });
    await page.locator('#conversion-form button[type=submit]').click(); await page.waitForFunction(() => window.__resultPreviewStarted); await page.locator('#cancel-job').click();
    await page.waitForFunction(() => document.querySelector('#job-status').textContent.startsWith('Cancelled'));
    assert.equal(await page.locator('#result').isVisible(), false); assert.equal(await page.locator('#image-comparison').isVisible(), false); assert.equal(await page.locator('#download-result').getAttribute('href'), null);
    assert.equal(await page.evaluate(url => window.__revokedPreviews.includes(url), source), true); assert.equal(await page.locator('#file-list li').count(), 1);
    await page.evaluate(() => { window.__slowResult = false; }); await convert(); await waitSource(); assert.match(await page.locator('#image-result-meta').innerText(), /40 × 30/);
  });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  assert.equal(requests.some(request => request.method !== 'GET' || (!request.url.startsWith('blob:') && new URL(request.url).origin !== new URL(base).origin)), false, 'Files stay local: same-site GETs only');
  console.log('PASS local-only image previews, real conversions and cleanup');
} finally { await browser.close(); }
