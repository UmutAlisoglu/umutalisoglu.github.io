import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

const base = process.env.TEST_URL || 'http://127.0.0.1:8782', out = '.local/product-kit-check'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce', acceptDownloads: true });
  const errors = [], external = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { requests.push(request.url()); if (!/^(blob:|data:)/.test(request.url()) && (new URL(request.url()).origin !== new URL(base).origin || request.method() !== 'GET')) external.push(request.url()); });
  await page.goto(base + '/tools/product-kit/');
  assert.equal(await page.locator('h1').count(), 1); assert.equal(await page.locator('#kit-run').isDisabled(), true);
  assert.equal(requests.some(url => /\.onnx|vendor\/ort/.test(url)), false);
  for (const width of [1440, 1024, 768, 680, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `studio at ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1050 }); await page.screenshot({ path: `${out}/studio-desktop.png`, fullPage: true });
  await page.locator('#kit-sample').click(); await page.waitForFunction(() => document.querySelectorAll('#kit-files li').length === 3);
  await page.locator('#kit-remove').uncheck(); await page.locator('#kit-background').selectOption('transparent'); await page.locator('#kit-name').fill('My shop');
  await page.locator('.kit-saved summary').click(); await page.locator('#kit-save').click();
  await page.reload(); await page.locator('.kit-saved summary').click(); await page.locator('#kit-load').click();
  assert.equal(await page.locator('#kit-name').inputValue(), 'My shop'); assert.equal(await page.locator('#kit-remove').isChecked(), false); assert.equal(await page.locator('#kit-files li').count(), 0);
  await page.locator('#kit-sample').click(); await page.waitForFunction(() => document.querySelectorAll('#kit-files li').length === 3);
  await page.locator('#kit-run').click(); await page.locator('#kit-finished').waitFor({ timeout: 120000 });
  const zipBytes = Buffer.from(await page.evaluate(async () => [...new Uint8Array(await (await fetch(document.querySelector('#kit-download').href)).arrayBuffer())]));
  const entries = unzipSync(zipBytes), manifest = JSON.parse(strFromU8(entries['kit.json']));
  assert.equal(manifest.products.length, 3); assert.equal(Object.keys(entries).length, 11); assert.equal(manifest.settings.remove, false);
  for (const product of manifest.products) for (const output of product.exports) {
    assert.equal(entries[output.path].length, output.bytes);
    const dimensions = await page.evaluate(async ({ bytes, type }) => { const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type })); const result = [bitmap.width, bitmap.height]; bitmap.close(); return result; }, { bytes: [...entries[output.path]], type: output.path.endsWith('.png') ? 'image/png' : 'image/webp' });
    assert.deepEqual(dimensions, [output.width, output.height]);
  }
  assert.equal(requests.some(url => /\.onnx|vendor\/ort/.test(url)), false);
  await page.locator('#kit-files li').first().locator('.kit-file-select').click();
  assert.match(await page.locator('#kit-preview-caption').textContent(), /warm/);
  await page.locator('#kit-compare').fill('70'); assert.match(await page.locator('#kit-before-layer').getAttribute('style'), /30%/);
  console.log('PASS real batch ZIP, all nine image dimensions, manifest bytes, private local settings, original comparison, no eager AI.');
  const oldDownload = await page.locator('#kit-download').getAttribute('href');
  await page.locator('#kit-input').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  assert.equal(await page.locator('#kit-files li').count(), 3); assert.equal(await page.locator('#kit-download').getAttribute('href'), oldDownload); assert.match(await page.locator('#kit-status').textContent(), /JPG/);
  await page.locator('#kit-background').selectOption('white'); assert.equal(await page.locator('#kit-finished').isVisible(), false);
  // Hold the model request so cancellation is checked during actual engine startup.
  await page.locator('#kit-remove').check(); let releaseModel;
  const held = new Promise(resolve => { releaseModel = resolve; });
  await page.route('**/assets/models/u2netp.onnx', async route => { await held; await route.continue().catch(() => {}); });
  await page.locator('#kit-run').click(); await page.waitForRequest('**/assets/models/u2netp.onnx'); await page.locator('#kit-cancel').click(); releaseModel(); await page.unroute('**/assets/models/u2netp.onnx');
  assert.equal(await page.locator('#kit-run').isEnabled(), true); assert.equal(await page.locator('#kit-files li').count(), 3); assert.equal(await page.locator('#kit-finished').isVisible(), false);
  // Exercise one shared real ONNX session across multiple photos.
  await page.locator('#kit-files li').last().locator('.kit-file-remove').click();
  await page.locator('#kit-background').selectOption('transparent'); await page.locator('#kit-run').click(); await page.locator('#kit-finished').waitFor({ timeout: 180000 });
  const aiZip = unzipSync(Buffer.from(await page.evaluate(async () => [...new Uint8Array(await (await fetch(document.querySelector('#kit-download').href)).arrayBuffer())])));
  const listing = Object.keys(aiZip).find(path => path.endsWith('listing-1600.png'));
  assert.ok(listing);
  assert.equal(JSON.parse(strFromU8(aiZip['kit.json'])).products.length, 2);
  const alpha = await page.evaluate(async bytes => { const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' })); const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close(); const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let clear = 0, solid = 0; for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) clear++; if (data[i] > 200) solid++; } return { clear, solid }; }, [...aiZip[listing]]);
  assert.ok(alpha.clear > 10000 && alpha.solid > 10000, JSON.stringify(alpha));
  await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${out}/studio-finished.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${out}/studio-mobile.png`, fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#kit-remove').uncheck(); await page.locator('#kit-background').selectOption('white'); await page.locator('#kit-run').click(); await page.locator('#kit-finished').waitFor({ timeout: 120000 });
  const whiteZip = unzipSync(Buffer.from(await page.evaluate(async () => [...new Uint8Array(await (await fetch(document.querySelector('#kit-download').href)).arrayBuffer())])));
  const jpeg = whiteZip[Object.keys(whiteZip).find(path => path.endsWith('listing-1600.jpg'))]; assert.deepEqual([...jpeg.subarray(0, 3)], [255, 216, 255]);
  await page.locator('#kit-forget').click(); assert.equal(await page.evaluate(() => localStorage.getItem('fileforge-product-kit-setup-v1')), null);
  await page.locator('#kit-reset').click(); assert.equal(await page.locator('#kit-files li').count(), 0); assert.equal(await page.locator('#kit-download').getAttribute('href'), null);
  // Corrupt but correctly named images must not replace a valid selection.
  await page.locator('#kit-input').setInputFiles({ name: 'valid.png', mimeType: 'image/png', buffer: await readFile('assets/demos/headphones.png') }); await page.locator('#kit-files li').waitFor();
  await page.locator('#kit-input').setInputFiles({ name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }); await page.waitForFunction(() => document.querySelector('#kit-status').textContent.includes('could not be read'));
  assert.equal(await page.locator('#kit-files li').count(), 1);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS real AI cutout with alpha, cancellation during startup, invalid-file recovery, settings invalidation, reset, six widths and no uploads.');
  await page.goto(base); assert.equal(await page.locator('.hero-copy a[href="/tools/product-kit/"]').count(), 1);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.locator('.premium-project-image').last().scrollIntoViewIfNeeded(); await page.locator('.premium-project-image img').evaluateAll(nodes => Promise.all(nodes.map(node => node.decode()))); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${out}/home-desktop.png`, fullPage: true });
  const noJS = await browser.newContext({ javaScriptEnabled: false }); const staticPage = await noJS.newPage(); await staticPage.goto(base + '/tools/product-kit/'); assert.match(await staticPage.locator('noscript').textContent(), /Enable JavaScript/); await noJS.close();
} finally { await browser.close(); }
