import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const output = resolve('.local/browser-check'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
const page = await context.newPage(), errors = [], outbound = [];
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => {
  if (request.method() !== 'GET' || (new URL(request.url()).origin !== new URL(base).origin && !request.url().startsWith('blob:'))) outbound.push(`${request.method()} ${request.url()}`);
});
const check = async (label, work) => { await work(); console.log(`PASS ${label}`); };
const submit = () => page.locator('#conversion-form button[type=submit]');
async function idle() { await page.waitForFunction(() => document.querySelector('#cancel-job').hidden, undefined, { timeout: 60_000 }); }
async function download() {
  await idle(); assert.equal(await page.locator('#result').isVisible(), true, await page.locator('#job-status').innerText());
  const pending = page.waitForEvent('download'); await page.locator('#download-result').click();
  const file = await pending, path = resolve(output, file.suggestedFilename()); await file.saveAs(path); return readFile(path);
}
async function select(tool, files) { await page.locator(`[data-tool="${tool}"]`).click(); await page.locator('#files').setInputFiles(files); }
async function pdfFile(name, dimensions, rotation = 0) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  dimensions.forEach(([width, height], index) => {
    const page = pdf.addPage([width, height]); page.setRotation(degrees(rotation));
    page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40, color: rgb(.9, .86, .98) });
    page.drawText(`${name} / ${index + 1}`, { x: 30, y: height - 55, size: 20, font, color: rgb(.3, .15, .6) });
  });
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}
const card = id => page.locator(`[data-page-id="${id}"]`);
const pageOrder = () => page.locator('.page-card').evaluateAll(cards => cards.map(card => card.dataset.pageId));

try {
  await page.goto(`${base}/tools/fileforge/`);
  const png = async (width, height) => ({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(await page.evaluate(async ({ width, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#6045e9'; ctx.fillRect(0, 0, width / 2, height);
    return Array.from(new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer()));
  }, { width, height })) });
  const landscape = await png(120, 60), portrait = await png(60, 120);

  await check('batch images keep duplicate filenames and convert every entry', async () => {
    await select('image', [landscape, portrait]);
    await page.getByRole('button', { name: 'Email-ready photos', exact: true }).click();
    await page.locator('[name=width]').fill('60'); await submit().click();
    const zip = unzipSync(await download()), names = Object.keys(zip);
    assert.deepEqual(names, ['photo-fileforge.jpg', 'photo-fileforge-2.jpg']);
    const dimensions = await page.evaluate(async images => {
      const results = [];
      for (const data of images) {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)]));
        results.push([bitmap.width, bitmap.height]); bitmap.close();
      }
      return results;
    }, Object.values(zip).map(bytes => Array.from(bytes)));
    assert.deepEqual(dimensions, [[60, 30], [60, 120]]);
    assert.equal(await page.locator('#image-preview').isVisible(), false);
  });
  await check('image order becomes page order in a combined PDF', async () => {
    await select('image', [landscape, { ...portrait, name: 'portrait.png' }]);
    await page.getByRole('button', { name: 'Move portrait.png up', exact: true }).click();
    await page.getByRole('button', { name: 'Images → one PDF', exact: true }).click(); await submit().click();
    const pdf = await PDFDocument.load(await download());
    assert.equal(pdf.getPageCount(), 2);
    assert.ok(pdf.getPage(0).getHeight() > pdf.getPage(0).getWidth());
    assert.ok(pdf.getPage(1).getWidth() > pdf.getPage(1).getHeight());
  });
  await check('invalid batch entries fail visibly and the next job can succeed', async () => {
    await select('image', [landscape, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('bad image') }]); await submit().click(); await idle();
    assert.match(await page.locator('#job-status').innerText(), /broken.png.*could not be opened/);
    assert.equal(await page.locator('#result').isVisible(), false);
    await page.getByRole('button', { name: 'Remove broken.png', exact: true }).click();
    await page.locator('[name=format]').selectOption('png'); await submit().click();
    const bytes = await download(); assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
    assert.equal(await page.locator('#image-preview').isVisible(), true);
  });
  await check('selection limits keep the existing files intact', async () => {
    await page.locator('#files').setInputFiles(Array.from({ length: 50 }, (_, index) => ({ ...landscape, name: `${index}.png` })));
    assert.match(await page.locator('#job-status').innerText(), /at most 50/);
    assert.equal(await page.locator('#file-list li').count(), 1);
  });
  await check('image cancellation leaves the tool reusable', async () => {
    await page.evaluate(() => { document.querySelector('#conversion-form').requestSubmit(); document.querySelector('#cancel-job').click(); }); await idle();
    assert.match(await page.locator('#job-status').innerText(), /Cancelled/);
    assert.equal(await submit().isEnabled(), true);
  });
  await check('settings are opt-in, reload correctly, and contain no file data', async () => {
    assert.equal(await page.evaluate(() => localStorage.getItem('fileforge:image-settings:v1')), null);
    await page.getByRole('button', { name: 'Website images', exact: true }).click(); await page.locator('#remember-image').check();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fileforge:image-settings:v1')));
    assert.deepEqual(saved, { version: 1, format: 'webp', quality: 82, width: 1920 });
    await page.reload(); assert.equal(await page.locator('[name=width]').inputValue(), '1920'); assert.equal(await page.locator('#remember-image').isChecked(), true);
    await page.locator('#remember-image').uncheck(); assert.equal(await page.evaluate(() => localStorage.getItem('fileforge:image-settings:v1')), null);
  });
  const first = await pdfFile('Notes.pdf', [[300, 400], [450, 350]]), second = await pdfFile('Cover.pdf', [[250, 500]], 90);
  await check('password-protected PDFs give an actionable error', async () => {
    await select('organize', resolve('tests/fixtures/locked.pdf')); await submit().click(); await idle();
    assert.match(await page.locator('#job-status').innerText(), /password-protected.*unlocked PDF/);
    assert.equal(await page.locator('.page-card').count(), 0);
  });
  await check('cancelling an active PDF renderer cleans up before another job', async () => {
    await select('organize', first);
    await page.evaluate(() => {
      const status = document.querySelector('#job-status');
      const observer = new MutationObserver(() => {
        if (status.textContent.startsWith('Previewing')) { observer.disconnect(); document.querySelector('#cancel-job').click(); }
      });
      observer.observe(status, { childList: true });
      document.querySelector('#conversion-form').requestSubmit();
    });
    await idle(); assert.match(await page.locator('#job-status').innerText(), /Cancelled/);
    assert.equal(await page.locator('.page-card').count(), 0);
  });
  await check('PDF organizer previews all pages and supports cancellation/restart', async () => {
    await select('organize', [first, second]);
    await page.evaluate(() => { document.querySelector('#conversion-form').requestSubmit(); document.querySelector('#cancel-job').click(); }); await idle();
    assert.match(await page.locator('#job-status').innerText(), /Cancelled/);
    await submit().click(); await idle();
    assert.equal(await page.locator('.page-card').count(), 3, await page.locator('#job-status').innerText());
    assert.equal(await page.locator('.page-thumb img').count(), 3);
    await page.waitForFunction(() => [...document.querySelectorAll('.page-thumb img')].every(image => image.complete && image.naturalWidth > 0));
    assert.match(await page.locator('#page-summary').innerText(), /3 of 3/);
    await page.screenshot({ path: resolve(output, 'organizer-desktop.png'), fullPage: true });
  });
  await check('PDF export retains selected content, ordering and existing plus new rotations', async () => {
    await card('1-0').locator('[data-action=earlier]').click(); await card('1-0').locator('[data-action=earlier]').click();
    await card('1-0').locator('[data-action=rotate]').click(); await card('0-1').locator('input').uncheck();
    assert.deepEqual(await pageOrder(), ['1-0', '0-0', '0-1']);
    await submit().click(); const pdf = await PDFDocument.load(await download());
    assert.deepEqual(pdf.getPages().map(page => page.getWidth()), [250, 300]);
    assert.deepEqual(pdf.getPages().map(page => page.getRotation().angle), [180, 0]);
    assert.equal(pdf.getPageCount(), 2);
    assert.ok(pdf.getPages().every(page => page.node.Contents()), 'Selected pages retain their original content streams');
  });
  await check('drag-and-drop changes export order and reset restores all originals', async () => {
    await card('0-0').dragTo(card('1-0'));
    assert.deepEqual(await pageOrder(), ['0-0', '1-0', '0-1']);
    await submit().click(); const pdf = await PDFDocument.load(await download()); assert.deepEqual(pdf.getPages().map(page => page.getWidth()), [300, 250]);
    await page.locator('#select-no-pages').click(); await submit().click(); assert.match(await page.locator('#job-status').innerText(), /at least one page/);
    await page.locator('#reset-pages').click(); assert.deepEqual(await pageOrder(), ['0-0', '0-1', '1-0']);
    await submit().click(); const reset = await PDFDocument.load(await download()); assert.deepEqual(reset.getPages().map(page => page.getRotation().angle), [0, 0, 90]);
  });
  await check('mobile PDF organizer fits, includes usable controls, and clears previews', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await card('0-0').locator('[data-action=rotate]').isVisible(), true);
    await page.screenshot({ path: resolve(output, 'organizer-mobile.png'), fullPage: true });
    await page.locator('#clear-files').click(); assert.equal(await page.locator('.page-card').count(), 0); assert.equal(await page.locator('#download-result').getAttribute('href'), null);
  });
  await check('malformed and over-limit PDFs fail without leaving stale previews', async () => {
    await select('organize', { name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') }); await submit().click(); await idle();
    assert.match(await page.locator('#job-status').innerText(), /valid PDF/); assert.equal(await page.locator('.page-card').count(), 0);
    const large = await PDFDocument.create(); for (let index = 0; index < 201; index++) large.addPage([100, 120]);
    await select('organize', { name: 'too-many.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await large.save()) }); await submit().click(); await idle();
    assert.match(await page.locator('#job-status').innerText(), /200 pages/); assert.equal(await page.locator('.page-card').count(), 0);
    await select('organize', first); await submit().click(); await idle(); assert.equal(await page.locator('.page-card').count(), 2);
  });
  await page.setViewportSize({ width: 1440, height: 1100 }); await select('image', [landscape, portrait]);
  await page.screenshot({ path: resolve(output, 'image-studio-desktop.png'), fullPage: true });
  assert.deepEqual(outbound, [], 'Every runtime request is a same-site GET or a local blob');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('PASS privacy: local conversions, same-origin libraries, no uploads');
} finally { await browser.close(); }
