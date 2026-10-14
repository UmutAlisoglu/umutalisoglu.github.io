import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const output = resolve('.local/browser-check/ocr'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [], outbound = [], requested = [];
context.on('page', item => item.on('pageerror', error => errors.push(error.message)));
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => {
  const url = request.url(); requested.push(url);
  if (request.method() !== 'GET' || (!url.startsWith('blob:') && !url.startsWith('data:') && new URL(url).origin !== new URL(base).origin)) outbound.push(`${request.method()} ${url}`);
});
const check = async (name, run) => { await run(); console.log(`PASS ${name}`); };
const status = () => page.locator('#ocr-status').innerText();
async function idle() { await page.waitForFunction(() => document.querySelector('#ocr-workspace').getAttribute('aria-busy') === 'false', undefined, { timeout: 120_000 }); }
async function run() { await page.locator('#ocr-run').click(); await idle(); assert.equal(await page.locator('#ocr-result').isVisible(), true, await status()); return page.locator('#ocr-text').inputValue(); }
async function fixture(name, lines) {
  const buffer = Buffer.from(await page.evaluate(async lines => {
    const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 850;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#171717'; ctx.font = '52px Arial';
    lines.forEach((text, index) => ctx.fillText(text, 100, 160 + index * 110));
    return Array.from(new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer()));
  }, lines));
  return { name, mimeType: 'image/png', buffer };
}

try {
  await page.goto(`${base}/tools/extract-text/`);
  await check('OCR assets load only after explicit extraction; sample is generated locally', async () => {
    assert.equal(requested.some(url => url.includes('/vendor/tesseract/')), false);
    assert.equal(await page.locator('#ocr-run').isDisabled(), true);
    await page.locator('#ocr-sample').click(); await idle();
    assert.match(await page.locator('#ocr-filename').innerText(), /fileforge-sample/);
    assert.equal(requested.some(url => url.includes('/vendor/tesseract/')), false);
    assert.equal(await page.locator('#ocr-run').isEnabled(), true);
  });
  await check('actual English OCR produces readable text and current editable TXT download', async () => {
    const text = await run();
    assert.match(text, /Make room for better ideas/i); assert.match(text, /files stay on your device/i);
    assert.match(await page.locator('#ocr-result-detail').innerText(), /English.*1 page.*confidence/);
    assert.ok(requested.some(url => url.endsWith('/lang/eng.traineddata.gz')));
    assert.ok(requested.some(url => /core\/tesseract-core-.*lstm\.wasm\.js$/.test(url)));
    await page.locator('#ocr-text').fill('An edited result.\nNames and numbers checked: 12345.');
    assert.equal(await page.locator('#ocr-prepare').isVisible(), true);
    const pending = page.waitForEvent('download'); await page.locator('#ocr-download').click();
    const download = await pending, path = resolve(output, download.suggestedFilename()); await download.saveAs(path);
    assert.equal(await readFile(path, 'utf8'), 'An edited result.\nNames and numbers checked: 12345.');
    assert.equal(await page.locator('#ocr-prepare').isVisible(), false);
  });
  await check('real German and Turkish language packs recognize their accented text', async () => {
    const german = await fixture('german.png', ['Überraschend einfach.', 'Größe und Qualität.', 'Gute Ideen bleiben lokal.']);
    await page.locator('#ocr-input').setInputFiles(german); await idle(); await page.locator('#ocr-language').selectOption('deu');
    const de = await run(); assert.match(de, /Überraschend einfach/); assert.match(de, /Größe und Qualität/);
    const turkish = await fixture('turkish.png', ['Türkçe metin.', 'İstanbul ve güzel fikirler.', 'Dosyalar cihazınızda kalır.']);
    await page.locator('#ocr-input').setInputFiles(turkish); await idle(); await page.locator('#ocr-language').selectOption('tur');
    const tr = await run(); assert.match(tr, /Türkçe metin/); assert.match(tr, /İstanbul ve güzel fikirler/);
    assert.ok(requested.some(url => url.endsWith('/lang/deu.traineddata.gz'))); assert.ok(requested.some(url => url.endsWith('/lang/tur.traineddata.gz')));
  });
  const first = await fixture('scan-one.png', ['Scanned page one.', 'Only the selected page is read.']);
  const second = await fixture('scan-two.png', ['Scanned page two.', 'Text stays on your device.']);
  const pdf = await PDFDocument.create();
  for (const source of [first, second]) { const image = await pdf.embedPng(source.buffer); pdf.addPage([900, 425]).drawImage(image, { x: 0, y: 0, width: 900, height: 425 }); }
  const pdfFile = { name: 'scanned-document.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
  await check('scanned PDF pages are rasterized and OCR respects page ranges', async () => {
    await page.locator('#ocr-input').setInputFiles(pdfFile); await idle();
    assert.equal(await page.locator('#ocr-pdf-pages-label').isVisible(), true);
    await page.locator('#ocr-language').selectOption('eng'); await page.locator('#ocr-pdf-pages').fill('2');
    const text = await run(); assert.match(text, /Scanned page two/); assert.doesNotMatch(text, /page one/);
    await page.locator('#ocr-pdf-pages').fill('1-2');
    const both = await run(); assert.match(both, /--- Page 1 ---[\s\S]*Scanned page one[\s\S]*--- Page 2 ---[\s\S]*Scanned page two/);
    await page.locator('#ocr-pdf-pages').fill('3'); await page.locator('#ocr-run').click(); await idle();
    assert.match(await status(), /between 1 and 2/); assert.equal(await page.locator('#ocr-result').isVisible(), false);
  });
  await check('unsupported files preserve selection; clear releases source and output', async () => {
    await page.locator('#ocr-input').setInputFiles({ name: 'not-supported.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    assert.match(await status(), /Choose a JPG/); assert.match(await page.locator('#ocr-filename').innerText(), /scanned-document/);
    await page.locator('#ocr-clear').click(); assert.equal(await page.locator('#ocr-result').isVisible(), false);
    assert.equal(await page.locator('#ocr-source-card').isVisible(), false); assert.equal(await page.locator('#ocr-text').inputValue(), '');
    assert.equal(await page.locator('#ocr-run').isDisabled(), true);
  });
  await check('Cancel terminates the worker even while its core is downloading', async () => {
    await page.locator('#ocr-sample').click(); await idle();
    let requestedCore = false;
    await context.route('**/vendor/tesseract/core/**', async route => { requestedCore = true; await new Promise(resolve => setTimeout(resolve, 2000)); try { await route.continue(); } catch {} });
    await page.locator('#ocr-run').click();
    for (let tries = 0; tries < 100 && !requestedCore; tries++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(requestedCore, true);
    await page.locator('#ocr-cancel').click(); await idle(); assert.match(await status(), /Cancelled/);
    assert.equal(await page.locator('#ocr-result').isVisible(), false); assert.equal(await page.locator('#ocr-run').isEnabled(), true);
    await context.unroute('**/vendor/tesseract/core/**');
    const text = await run(); assert.match(text, /Make room for better ideas/);
  });
  await check('OCR interface stays within mobile and desktop widths', async () => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px overflow`);
      await page.screenshot({ path: resolve(output, `extract-text-${width}.png`), fullPage: true });
    }
  });
  assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  console.log('PASS OCR processing sends no files or runtime requests off origin and raises no JavaScript errors');
} finally { await context.close(); await browser.close(); }
