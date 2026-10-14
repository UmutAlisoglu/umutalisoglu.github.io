import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const output = resolve('.local/browser-check');
const fixtures = resolve('.local/fixtures');
await mkdir(output, { recursive: true }); await mkdir(fixtures, { recursive: true });

// Public example from the Apache-2.0 U-2-Net repository. It stays in ignored
// .local and is never shipped with the site. Pin both commit and content hash.
const horsePath = resolve(fixtures, 'u2net-horse.jpg');
const horseSHA = 'ef7a90ef39ae6265db3ad9c03cf9a6f1ff7be3b3fe11b203ae05e300b7d8aaa1';
let horse;
try { horse = await readFile(horsePath); }
catch {
  const response = await fetch('https://raw.githubusercontent.com/xuebinqin/U-2-Net/ac7e1c817ecab7c7dff5ce6b1abba61cd213ff29/test_data/test_images/horse.jpg');
  assert.equal(response.ok, true, 'Could not download the public foreground fixture');
  horse = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(horse).digest('hex'), horseSHA);
  await writeFile(horsePath, horse);
}
assert.equal(createHash('sha256').update(horse).digest('hex'), horseSHA);

const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [], outbound = [], requested = [];
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => {
  requested.push(request.url());
  if (request.method() !== 'GET' || (!request.url().startsWith('blob:') && new URL(request.url()).origin !== new URL(base).origin)) outbound.push(`${request.method()} ${request.url()}`);
});
const check = async (label, run) => { await run(); console.log(`PASS ${label}`); };
const status = () => page.locator('#advanced-status').innerText();
async function idle() { await page.waitForFunction(() => document.querySelector('#advanced-cancel').hidden, undefined, { timeout: 120_000 }); }
async function open(slug, file) {
  await page.goto(`${base}/tools/${slug}/`);
  await page.locator('#advanced-input').setInputFiles(file);
}
async function run() { await page.locator('#advanced-run').click(); await idle(); }
async function download() {
  await idle(); assert.equal(await page.locator('#advanced-result').isVisible(), true, await status());
  const pending = page.waitForEvent('download'); await page.locator('#advanced-download').click();
  const item = await pending, path = resolve(output, item.suggestedFilename());
  await item.saveAs(path);
  return { bytes: await readFile(path), name: item.suggestedFilename(), path };
}
async function imageInfo(bytes, fractions = [[.1, .1], [.5, .5], [.9, .9]]) {
  return page.evaluate(async ({ bytes, fractions }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0, opaque = 0, white = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 16) clear++; if (pixels[i] > 239) opaque++;
      if (pixels[i] > 239 && pixels[i - 1] > 240 && pixels[i - 2] > 240 && pixels[i - 3] > 240) white++;
    }
    const samples = fractions.map(([x, y]) => Array.from(ctx.getImageData(Math.min(canvas.width - 1, Math.floor(canvas.width * x)), Math.min(canvas.height - 1, Math.floor(canvas.height * y)), 1, 1).data));
    const result = { width: canvas.width, height: canvas.height, samples, clear: clear / (pixels.length / 4), opaque: opaque / (pixels.length / 4), white: white / (pixels.length / 4) };
    bitmap.close(); canvas.width = canvas.height = 1; return result;
  }, { bytes: Array.from(bytes), fractions });
}
function closeColour(actual, expected, tolerance = 3) { expected.forEach((value, index) => assert.ok(Math.abs(actual[index] - value) <= tolerance, `${actual} should match ${expected}`)); }
async function observeCancel(prefix) {
  await page.waitForFunction(() => !document.querySelector('#advanced-run').disabled);
  await page.evaluate(prefix => {
    const node = document.querySelector('#advanced-status');
    const observer = new MutationObserver(() => {
      if (node.textContent.startsWith(prefix)) { observer.disconnect(); document.querySelector('#advanced-cancel').click(); }
    });
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    document.querySelector('#advanced-run').click();
  }, prefix);
  await idle(); assert.match(await status(), /cancel/i);
  assert.equal(await page.locator('#advanced-result').isVisible(), false);
  assert.equal(await page.locator('#advanced-run').isEnabled(), true);
}

try {
  await page.goto(base + '/tools/');
  const quadrants = { name: 'quadrants.png', mimeType: 'image/png', buffer: Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    for (const [x, y, colour] of [[0, 0, '#ed2b2b'], [120, 0, '#159d46'], [0, 80, '#ffc400'], [120, 80, '#124fc3']]) { ctx.fillStyle = colour; ctx.fillRect(x, y, 120, 80); }
    return Array.from(new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer()));
  })) };
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  [[300, 200, rgb(.9, .1, .2)], [200, 300, rgb(.1, .7, .3)], [200, 300, rgb(.1, .2, .9)]].forEach(([width, height, colour], index) => {
    const p = pdf.addPage([width, height]); p.drawRectangle({ x: 0, y: 0, width, height, color: colour });
    p.drawText(`Actual PDF page ${index + 1}`, { x: 20, y: height / 2, size: 14, font, color: rgb(1, 1, 1) });
    if (index === 1) p.setRotation(degrees(90));
  });
  const pdfFile = { name: 'coloured-pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };

  await check('task search handles everyday aliases, categories and empty results locally', async () => {
    const directory = page.locator('[data-tool-directory]'), search = directory.locator('input[type=search]');
    const aliases = [['png to pdf', 'image-pdf'], ['remove bg', 'background'], ['jpg svg', 'svg'], ['mp4 compress', 'video'], ['excel pdf', 'spreadsheet'], ['crop screenshot', 'crop'], ['pdf to png', 'pdf-images']];
    for (const [query, id] of aliases) {
      await search.fill(query); assert.equal(await directory.locator(`[data-tool-id="${id}"]`).isVisible(), true, query);
    }
    await search.fill('png to pdf'); assert.equal(await directory.locator('[data-tool-id=image-pdf]').getAttribute('href'), '/tools/image-converter/?format=pdf');
    await directory.locator('.tool-search-clear').click();
    for (const [category, count] of [['Images', 4], ['PDFs', 4], ['Video', 1], ['Documents', 2], ['All tools', 11]]) {
      await directory.locator(`[data-tool-category="${category}"]`).click();
      assert.equal(await directory.locator('[data-tool-results] .task-card').count(), count, category);
      assert.equal(await directory.locator(`[data-tool-category="${category}"]`).getAttribute('aria-pressed'), 'true');
    }
    await search.fill('not-a-supported-task'); assert.equal(await directory.locator('.tool-search-empty').isVisible(), true);
    await directory.locator('[data-tool-reset]').click(); assert.equal(await directory.locator('[data-tool-results] .task-card').count(), 11);
    await page.goto(base + '/tools/?q=remove%20bg'); assert.equal(await page.locator('[data-tool-id=background]').isVisible(), true);
    await page.screenshot({ path: resolve(output, 'fileforge-search.png'), fullPage: true });
  });
  await check('crop exports only the selected pixels at their original resolution', async () => {
    await open('crop-image', quadrants);
    await page.locator('#crop-width').fill('100'); await page.locator('#crop-height').fill('60');
    await page.locator('#crop-x').fill('120'); await page.locator('#crop-y').fill('80');
    await page.locator('#crop-format').selectOption('png'); await run();
    const result = await download(), info = await imageInfo(result.bytes);
    assert.equal(result.bytes.toString('ascii', 1, 4), 'PNG'); assert.deepEqual([info.width, info.height], [100, 60]);
    info.samples.forEach(sample => closeColour(sample, [18, 79, 195, 255], 0));
    await page.screenshot({ path: resolve(output, 'fileforge-crop.png'), fullPage: true });
    await page.locator('#crop-reset').click(); assert.equal(await page.locator('#crop-width').inputValue(), '240'); assert.equal(await page.locator('#crop-height').inputValue(), '160');
    await page.locator('#crop-format').selectOption('jpg'); await run();
    const jpg = await download(); assert.equal(jpg.bytes.readUInt16BE(0), 0xffd8); assert.deepEqual([(await imageInfo(jpg.bytes)).width, (await imageInfo(jpg.bytes)).height], [240, 160]);
    await page.locator('#advanced-clear').click(); assert.equal(await page.locator('#advanced-result').isVisible(), false); assert.equal(await page.locator('#advanced-download').getAttribute('href'), null);
  });
  await check('image tracing downloads genuine vector paths and survives cancel/restart', async () => {
    await open('image-to-svg', quadrants);
    await page.locator('#trace-colors').selectOption('4'); await page.locator('#trace-detail').selectOption('fine');
    await page.evaluate(() => { document.querySelector('#advanced-run').click(); document.querySelector('#advanced-cancel').click(); });
    await idle(); assert.match(await status(), /cancel/i);
    await run(); const result = await download(), text = result.bytes.toString('utf8');
    assert.match(text, /<svg\b/); assert.match(text, /<path\b/); assert.doesNotMatch(text, /<image\b|data:image|<script\b|onload=/i);
    const svg = await page.evaluate(text => { const doc = new DOMParser().parseFromString(text, 'image/svg+xml'); return { errors: doc.querySelectorAll('parsererror').length, paths: doc.querySelectorAll('path').length, colours: [...new Set([...doc.querySelectorAll('path')].map(path => path.getAttribute('fill')))], viewBox: doc.documentElement.getAttribute('viewBox') }; }, text);
    assert.equal(svg.errors, 0); assert.ok(svg.paths >= 4, 'The four-colour fixture should become multiple vector shapes'); assert.equal(svg.viewBox, '0 0 240 160');
    for (const colour of ['rgb(237,43,43)', 'rgb(21,157,70)', 'rgb(255,196,0)', 'rgb(18,79,195)']) assert.ok(svg.colours.includes(colour), `Tracing should retain the fixture colour ${colour}`);
    assert.equal(await page.locator('#advanced-output-preview').isVisible(), true);
    await page.screenshot({ path: resolve(output, 'fileforge-svg.png'), fullPage: true });
  });
  await check('PDF export creates selected PNG pages in ZIP order and renders their real content', async () => {
    await open('pdf-to-images', pdfFile);
    await page.locator('#pdf-pages').fill('3, 1, 3'); await page.locator('#pdf-edge').selectOption('1200'); await page.locator('#pdf-format').selectOption('png');
    await run(); const result = await download(), entries = unzipSync(result.bytes), names = Object.keys(entries);
    assert.equal(names.length, 2); assert.match(names[0], /page-001\.png$/); assert.match(names[1], /page-003\.png$/);
    const first = await imageInfo(entries[names[0]]), third = await imageInfo(entries[names[1]]);
    assert.deepEqual([first.width, first.height], [1200, 800]); assert.deepEqual([third.width, third.height], [800, 1200]);
    closeColour(first.samples[0], [230, 26, 51, 255]); closeColour(third.samples[0], [26, 51, 230, 255]);
    assert.ok(first.white > .002 && third.white > .002, 'White text must render over the coloured page backgrounds');
    await page.screenshot({ path: resolve(output, 'fileforge-pdf-images.png'), fullPage: true });
    await page.locator('#pdf-pages').fill('2'); await page.locator('#pdf-format').selectOption('jpg'); await run();
    const jpg = await download(), second = await imageInfo(jpg.bytes);
    assert.match(jpg.name, /page-002\.jpg$/); assert.equal(jpg.bytes.readUInt16BE(0), 0xffd8); assert.deepEqual([second.width, second.height], [1200, 800]); closeColour(second.samples[0], [26, 179, 77, 255], 5);
  });
  await check('PDF range errors, protected files and active-render cancellation leave the tool reusable', async () => {
    await page.locator('#pdf-pages').fill('4'); await run(); assert.match(await status(), /between 1 and 3/); assert.equal(await page.locator('#advanced-result').isVisible(), false);
    await page.locator('#pdf-pages').fill(''); await page.locator('#pdf-edge').selectOption('3600'); await observeCancel('Rendering page');
    await page.locator('#pdf-edge').selectOption('1200'); await run(); assert.equal(await page.locator('#advanced-result').isVisible(), true);
    await page.locator('#advanced-input').setInputFiles(resolve('tests/fixtures/locked.pdf')); await run(); assert.match(await status(), /password-protected.*unlocked/);
    await page.locator('#advanced-input').setInputFiles({ name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') }); await run(); assert.match(await status(), /could not be read.*PDF/);
    await page.locator('#advanced-input').setInputFiles(pdfFile); await run(); assert.equal(await page.locator('#advanced-result').isVisible(), true);
  });
  await check('real local background model retains the foreground and produces transparency', async () => {
    await open('remove-background', horsePath); await page.locator('#background-fill').selectOption('transparent');
    await run(); const result = await download(), info = await imageInfo(result.bytes, [[.5, .5], [.1, .05], [.5, .95]]);
    assert.equal(result.bytes.toString('ascii', 1, 4), 'PNG'); assert.deepEqual([info.width, info.height], [770, 595]);
    assert.ok(info.clear > .25, `Expected substantial removed background; actual ${info.clear}`); assert.ok(info.opaque > .15, `Expected retained foreground; actual ${info.opaque}`);
    assert.ok(info.samples[0][3] > 220, `Horse body should stay opaque: ${info.samples[0]}`); assert.ok(info.samples[1][3] < 30, `Sky should be transparent: ${info.samples[1]}`);
    assert.ok(requested.some(url => url.endsWith('/assets/models/u2netp.onnx')), 'The actual model was fetched');
    assert.ok(requested.some(url => /ort.*\.wasm/.test(url)), 'The actual inference WASM was fetched');
    await writeFile(resolve(output, 'background-transparent.png'), result.bytes);
    await page.screenshot({ path: resolve(output, 'fileforge-background.png'), fullPage: true });
  });
  await check('background inference cancels, restarts and supports an opaque white result', async () => {
    // A completed cutout keeps its editable mask; Run then exports those edits.
    // Selecting a fresh source is the operation that starts model inference.
    await open('remove-background', horsePath);
    await observeCancel('Finding the subject');
    await page.locator('#background-fill').selectOption('white'); await run(); const result = await download(), info = await imageInfo(result.bytes, [[.1, .05], [.5, .5]]);
    closeColour(info.samples[0], [255, 255, 255, 255], 8); assert.equal(info.clear, 0); assert.ok(info.opaque > .999);
    await page.locator('#advanced-clear').click(); assert.equal(await page.locator('#advanced-original-preview').getAttribute('src'), null);
    await page.reload(); assert.equal(await page.locator('#advanced-input').inputValue(), ''); assert.equal(await page.locator('#advanced-result').isVisible(), false);
  });
  await check('new tools fit phone layouts and retain useful navigation without JavaScript', async () => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const slug of ['remove-background', 'image-to-svg', 'crop-image', 'pdf-to-images']) {
        await page.goto(`${base}/tools/${slug}/`); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${slug} @ ${width}`);
        assert.equal(await page.locator('#advanced-input').isVisible(), true);
      }
    }
    await page.goto(base + '/tools/'); await page.screenshot({ path: resolve(output, 'fileforge-directory-mobile.png'), fullPage: true });
    const staticContext = await browser.newContext({ javaScriptEnabled: false }); const staticPage = await staticContext.newPage();
    await staticPage.goto(base + '/tools/'); assert.equal(await staticPage.locator('[data-tool-results] .task-card').count(), 11);
    for (const slug of ['remove-background', 'image-to-svg', 'crop-image', 'pdf-to-images']) {
      const link = staticPage.locator(`[data-tool-results] a[href="/tools/${slug}/"]`); assert.equal(await link.isVisible(), true);
    }
    await staticPage.locator('[data-tool-results] a[href="/tools/crop-image/"]').click(); assert.equal(await staticPage.locator('h1').count(), 1); assert.equal(await staticPage.locator('noscript').isVisible(), true);
    await staticContext.close();
  });
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [], 'No files or settings persisted by advanced tools');
  assert.deepEqual(await page.evaluate(async () => (await indexedDB.databases()).map(database => database.name)), [], 'No file data retained in IndexedDB');
  assert.deepEqual(outbound, [], 'Runtime conversions use only same-origin GETs and local blobs; no uploads');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('PASS privacy: real conversions run locally; no uploads or stored files');
} finally { await browser.close(); }
