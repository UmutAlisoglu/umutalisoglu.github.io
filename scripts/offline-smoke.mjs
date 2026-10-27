import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';

const base = process.env.TEST_URL || process.env.FILEFORGE_BASE_URL || 'http://127.0.0.1:8780';
await mkdir('.qa/offline', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [], external = [], engines = [], failed = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => {
  requests.push(request.url());
  const url = new URL(request.url());
  if (url.protocol.startsWith('http') && url.origin !== new URL(base).origin) external.push(request.url());
  if (/\.wasm|traineddata|u2netp\.onnx/.test(url.pathname)) engines.push(url.pathname);
});
context.on('requestfailed', request => failed.push(`${request.url()} ${request.failure()?.errorText}`));
const report = [];
let tool;
try {
  await page.goto(`${base}/tools/workspace/`);
  await page.locator('[data-open-offline]').first().click();
  await page.locator('[data-offline-group="core"]').waitFor();
  assert.equal(engines.length, 0, 'No heavy engines download before opt-in');
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).filter(reg => reg.scope.endsWith('/tools/')).length), 0, 'No service worker before opt-in');
  const manifest = await page.evaluate(async () => (await fetch('/offline-manifest.json')).json());
  assert.equal(manifest.schema, 1);
  assert.ok(manifest.files.every(file => !file.url.startsWith('/skate-scape/') && /^[a-f0-9]{64}$/.test(file.sha256)));
  const coreBytes = manifest.files.filter(file => file.group === 'core').reduce((sum, file) => sum + file.bytes, 0);
  assert.equal(manifest.groups.find(group => group.id === 'core').bytes, coreBytes);
  assert.ok((await page.locator('[data-offline-total]').textContent()).includes(coreBytes.toLocaleString('en-US')));
  report.push('No background/video/OCR engines or service worker before opt-in; exact build sizes');
  await page.locator('[data-offline-save]').click();
  await page.locator('[data-offline-badge]').filter({ hasText: /^Offline ready$/ }).waitFor({ timeout: 180_000 });
  const keys = await page.evaluate(async () => {
    const result = [];
    for (const name of await caches.keys()) if (name.startsWith('fileforge-offline-v1-') && !name.endsWith('control')) for (const request of await (await caches.open(name)).keys()) result.push(request.url);
    return result;
  });
  assert.ok(keys.every(url => url.startsWith(base)));
  assert.ok(keys.every(url => !/u2netp\.onnx|vendor\/ort\/|vendor\/ffmpeg\/|\.traineddata(?:\.gz)?$/.test(url)), 'Optional engines remain uncached');
  assert.ok(keys.every(url => !url.startsWith('blob:')));
  report.push('Verified opt-in core pack, with no files/blobs or optional engines in CacheStorage');
  // Explicitly download optional engines, then prove they work without a
  // connection rather than assuming a cache entry means a usable tool.
  for (const group of ['heic', 'background', 'video', 'ocr-eng']) await page.locator(`[data-offline-group="${group}"]`).check();
  await page.locator('[data-offline-save]').click();
  await page.locator('[data-offline-cancel]').waitFor({ state: 'hidden', timeout: 180_000 });
  assert.equal(await page.locator('[data-offline-status]').evaluate(element => element.classList.contains('is-error')), false, await page.locator('[data-offline-status]').textContent());
  report.push('Optional background/video/OCR English packs explicitly downloaded and verified');
  await context.setOffline(true);
  tool = await context.newPage();
  tool.on('pageerror', error => errors.push(error.message));
  await tool.goto(`${base}/tools/image-converter/`);
  assert.ok(await tool.evaluate(() => !!navigator.serviceWorker.controller));
  const png = await tool.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#6650c8'; ctx.fillRect(0, 0, 120, 80); return canvas.toDataURL('image/png').split(',')[1]; });
  await tool.locator('#files').setInputFiles({ name: 'private-offline-test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await tool.locator('[name="format"]').selectOption('png');
  await tool.locator('#submit-label').click();
  await tool.waitForFunction(() => !document.querySelector('#result').hidden || document.querySelector('#cancel-job').hidden, undefined, { timeout: 45_000 });
  assert.equal(await tool.locator('#result').isVisible(), true, await tool.locator('#job-status').textContent());
  assert.match(await tool.locator('#download-result').getAttribute('href'), /^blob:/);
  report.push('New offline navigation + real PNG conversion succeeded entirely offline');
  const finishing = await context.newPage(); finishing.on('pageerror', error => errors.push(error.message));
  const pdf = await PDFDocument.create(); pdf.addPage().drawText('OFFLINE SELECTABLE TEXT'); const pdfBytes = Buffer.from(await pdf.save());
  for (const [slug, name, bytes] of [
    ['heic-to-jpg','offline.heic',await readFile('.local/fixtures/example.heic')],
    ['compress-pdf','offline.pdf',pdfBytes],
    ['split-pdf','offline.pdf',pdfBytes],
    ['remove-metadata','offline.png',Buffer.from(png,'base64')],
  ]) {
    await finishing.goto(`${base}/tools/${slug}/`);
    await finishing.locator('#finish-input').setInputFiles({name,mimeType:'application/octet-stream',buffer:bytes});
    await finishing.locator('#finish-run').click();
    await finishing.locator('#finish-result').waitFor({timeout:60000});
    assert.match(await finishing.locator('#finish-download').getAttribute('href'),/^blob:/,slug);
  }
  await finishing.close(); report.push('HEIC decoding, PDF compression/splitting and metadata removal produce real results offline');
  const creative = await context.newPage(); creative.on('pageerror', error => errors.push(error.message));
  await creative.goto(`${base}/tools/screenshot-studio/?sample=1`);
  await creative.locator('#screenshot-export:not(:disabled)').waitFor();
  await creative.locator('#screenshot-export').click();
  await creative.locator('#screenshot-result').waitFor();
  assert.match(await creative.locator('#screenshot-download').getAttribute('href'), /^blob:/);
  await creative.goto(`${base}/tools/document-scanner/?sample=1`);
  await creative.locator('#scanner-run:not(:disabled)').waitFor();
  await creative.locator('#scanner-run').click(); await creative.locator('#scanner-result').waitFor();
  await creative.locator('#scanner-format').selectOption('pdf');
  await creative.locator('#scanner-export:not(:disabled)').click();
  await creative.locator('#scanner-download').waitFor();
  assert.match(await creative.locator('#scanner-download').getAttribute('download'), /\.pdf$/);
  await creative.close();
  report.push('Screenshot composition and scanner perspective worker/PDF export work offline');
  const ocr = await context.newPage(); ocr.on('pageerror', error => errors.push(error.message));
  await ocr.goto(`${base}/tools/extract-text/`); await ocr.locator('#ocr-sample').click();
  await ocr.waitForFunction(() => document.querySelector('#ocr-workspace').getAttribute('aria-busy') === 'false');
  await ocr.locator('#ocr-run').click();
  await ocr.waitForFunction(() => document.querySelector('#ocr-workspace').getAttribute('aria-busy') === 'false', undefined, { timeout: 120_000 });
  assert.equal(await ocr.locator('#ocr-result').isVisible(), true, await ocr.locator('#ocr-status').textContent());
  assert.match(await ocr.locator('#ocr-text').inputValue(), /Make room for better ideas/i);
  report.push('Actual English OCR works offline, including its classic worker/core/language data');
  const background = await context.newPage(); background.on('pageerror', error => errors.push(error.message));
  await background.goto(`${base}/tools/remove-background/`);
  const sample = await background.evaluate(async () => Array.from(new Uint8Array(await (await fetch('/assets/demos/headphones.png')).arrayBuffer())));
  await background.locator('#advanced-input').setInputFiles({ name: 'public-demo.png', mimeType: 'image/png', buffer: Buffer.from(sample) });
  await background.locator('#advanced-run').click();
  await background.waitForFunction(() => document.querySelector('#advanced-cancel').hidden, undefined, { timeout: 120_000 });
  assert.equal(await background.locator('#advanced-result').isVisible(), true, await background.locator('#advanced-status').textContent());
  assert.match(await background.locator('#advanced-download').getAttribute('href'), /^blob:/);
  report.push('Actual local background model inference works offline');
  const video = await context.newPage(); video.on('pageerror', error => errors.push(error.message));
  await video.goto(`${base}/tools/video-compressor/`);
  // Reuse the repository's generated video fixture, also used by browser-smoke.
  // MediaRecorder WebM intentionally lacks a duration header in some browsers.
  const recording = await readFile(process.env.FILEFORGE_VIDEO_FIXTURE || '.local/fixtures/video.mp4');
  await video.locator('#files').setInputFiles({ name: 'generated-offline-video.mp4', mimeType: 'video/mp4', buffer: recording });
  await video.locator('[name="target"]').fill('1');
  await video.locator('#submit-label').click();
  await video.waitForFunction(() => !document.querySelector('#result').hidden || document.querySelector('#cancel-job').hidden, undefined, { timeout: 120_000 });
  assert.equal(await video.locator('#result').isVisible(), true, await video.locator('#job-status').textContent());
  report.push('Actual FFmpeg two-pass MP4 compression works offline');
  const unknown = await context.newPage();
  let unknownFailed = false;
  try { await unknown.goto(`${base}/tools/not-a-real-tool/`, { timeout: 15_000 }); } catch { unknownFailed = true; }
  assert.ok(unknownFailed, 'Unknown offline pages must not receive a fake successful workspace');
  await unknown.close();
  const game = await context.newPage(); let gameFailed = false;
  try { await game.goto(`${base}/skate-scape/`, { timeout: 15_000 }); } catch { gameFailed = true; }
  assert.ok(gameFailed, 'FileForge worker must not intercept game navigation');
  await game.close();
  report.push('Unknown pages fail honestly; /skate-scape/ stays outside FileForge scope');
  await page.locator('[data-offline-update]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.qa/offline/offline-ready.png', fullPage: true });
  await page.locator('[data-offline-clear]').click();
  await page.locator('[data-offline-status]').filter({ hasText: 'Offline app resources cleared' }).waitFor();
  assert.equal(await page.evaluate(async () => (await caches.keys()).filter(name => name.startsWith('fileforge-offline-v1-')).length), 0);
  assert.match(await tool.locator('#download-result').getAttribute('href'), /^blob:/, 'Clearing app cache must leave active result intact');
  report.push('Clear removes only FileForge app caches and preserves active conversion result');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile('.qa/offline/report.json', JSON.stringify({ ok: true, version: manifest.version, coreBytes, checks: report }, null, 2));
  console.log(report.map(check => `PASS ${check}`).join('\n'));
} catch (error) {
  await page.screenshot({ path: '.qa/offline/failure-panel.png', fullPage: true }).catch(() => {});
  if (tool) {
    await tool.screenshot({ path: '.qa/offline/failure-tool.png', fullPage: true }).catch(() => {});
    console.error('Offline tool status:', await tool.locator('#job-status').textContent().catch(() => 'unavailable'));
  }
  console.error('Offline checks before failure:', report, 'Page errors:', errors, 'Failed requests:', failed, 'Last requests:', requests.slice(-15));
  throw error;
} finally { await context.close(); await browser.close(); }
