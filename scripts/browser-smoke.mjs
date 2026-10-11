import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const output = resolve('.local/browser-check'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
const errors = [], outbound = [];
context.on('request', request => {
  if (request.method() !== 'GET' || (new URL(request.url()).origin !== new URL(base).origin && !request.url().startsWith('blob:'))) outbound.push(`${request.method()} ${request.url()}`);
});
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
const check = async (label, work) => { await work(); console.log(`PASS ${label}`); };
async function download() {
  await page.waitForFunction(() => !document.querySelector('#result').hidden || document.querySelector('#cancel-job').hidden, undefined, { timeout: 180_000 });
  assert.equal(await page.locator('#result').isVisible(), true, await page.locator('#job-status').innerText());
  const pending = page.waitForEvent('download'); await page.locator('#download-result').click();
  const file = await pending; const path = resolve(output, file.suggestedFilename()); await file.saveAs(path); return path;
}
async function select(tool, files) { await page.locator(`[data-tool="${tool}"]`).click(); await page.locator('#files').setInputFiles(files); }
const button = () => page.locator('#conversion-form button[type=submit]');
try {
  await check('home, games and downloads open without overflow', async () => {
    for (const path of ['/', '/games/', '/downloads/']) { const response = await page.goto(base + path); assert.equal(response.status(), 200); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    await page.goto(base); await page.screenshot({ path: resolve(output, 'home-desktop.png'), fullPage: true });
  });
  await page.goto(`${base}/tools/fileforge/`);
  await check('empty selection gives a useful message', async () => { await button().click(); assert.match(await page.locator('#job-status').innerText(), /Choose a file/); });
  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 60;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#6045e9'; ctx.fillRect(0, 0, 60, 60);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await check('image conversion resizes and downloads a real JPG', async () => {
    await select('image', { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png) }); await page.locator('[name=format]').selectOption('jpg'); await page.locator('[name=width]').fill('60'); await button().click();
    const bytes = await readFile(await download()); assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8); assert.match(await page.locator('#result-detail').innerText(), /60 × 30/);
  });
  await check('image to PDF produces an A4 document', async () => {
    await page.locator('[name=format]').selectOption('pdf'); await button().click(); const pdf = await PDFDocument.load(await readFile(await download())); assert.equal(pdf.getPageCount(), 1); assert.ok(pdf.getPage(0).getWidth() > 800);
  });
  const one = await PDFDocument.create(); one.addPage([100, 120]); const two = await PDFDocument.create(); two.addPage([200, 220]); two.addPage([300, 320]);
  await check('merge respects the visitor’s reordered PDFs', async () => {
    await select('merge', [{ name: 'one.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await one.save()) }, { name: 'two.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await two.save()) }]);
    await page.getByRole('button', { name: 'Move two.pdf up', exact: true }).click(); await button().click(); const pdf = await PDFDocument.load(await readFile(await download())); assert.deepEqual(pdf.getPages().map(page => page.getWidth()), [200, 300, 100]);
  });
  await check('invalid PDF reports failure and allows another job', async () => {
    await select('merge', [{ name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') }, { name: 'one.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await one.save()) }]);
    await button().click(); await page.waitForFunction(() => document.querySelector('#job-status').textContent.includes('could not be opened')); assert.equal(await button().isEnabled(), true); assert.equal(await page.locator('#result').isVisible(), false);
  });
  const book = XLSX.utils.book_new(); const rows = [Array.from({ length: 10 }, (_, column) => `Column ${column + 1}`), ...Array.from({ length: 55 }, (_, row) => Array.from({ length: 10 }, (_, column) => column === 0 ? `İstanbul, Grüße ${row}` : `Data ${row}/${column}`))];
  const sheet = XLSX.utils.aoa_to_sheet(rows); sheet.B2 = { t: 'n', v: 42, f: '21*2' }; sheet.C2 = { t: 'n', f: '21*3' }; XLSX.utils.book_append_sheet(book, sheet, 'Visible data');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Hidden data']]), 'Hidden'); book.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
  await check('XLSX export paginates, skips hidden sheets and warns on uncached formulas', async () => {
    await select('spreadsheet', { name: 'table.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) }); await button().click();
    const pdf = await PDFDocument.load(await readFile(await download())); assert.ok(pdf.getPageCount() >= 4); const detail = await page.locator('#result-detail').innerText(); assert.match(detail, /1 visible sheet/); assert.match(detail, /formula/);
  });
  await check('CSV export produces a valid portrait PDF', async () => {
    await select('spreadsheet', { name: 'sample.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Value\r\n"İstanbul, Türkiye",42\r\nGrüße,12\r\n') }); await page.locator('[name=orientation]').selectOption('portrait'); await button().click();
    const pdf = await PDFDocument.load(await readFile(await download())); assert.equal(pdf.getPageCount(), 1); assert.ok(pdf.getPage(0).getHeight() > pdf.getPage(0).getWidth());
  });
  const videoPath = resolve('.local/fixtures/video.mp4');
  await check('video conversion can be cancelled and restarted', async () => {
    await select('video', videoPath); await button().click(); await page.locator('#cancel-job').click(); await page.waitForFunction(() => document.querySelector('#job-status').textContent.startsWith('Cancelled')); assert.equal(await button().isEnabled(), true);
  });
  await check('video runs both FFmpeg passes locally and meets the byte target', async () => {
    await page.locator('[name=target]').fill('1'); await page.locator('[name=height]').selectOption('480'); await button().click(); const path = await download(); const bytes = await readFile(path);
    assert.ok(bytes.length <= 1_000_000); assert.ok(bytes.length > 100); assert.equal(bytes.toString('ascii', 4, 8), 'ftyp'); await writeFile(resolve(output, 'video-output-path.txt'), path);
  });
  await check('clear releases selected files and result links', async () => {
    await page.locator('#clear-files').click(); assert.equal(await page.locator('#file-list li').count(), 0); assert.equal(await page.locator('#result').isVisible(), false); assert.equal(await page.locator('#download-result').getAttribute('href'), null);
  });
  await check('mobile menus and pages fit a 390px screen', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/', '/games/', '/downloads/', '/tools/fileforge/']) { await page.goto(base + path); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path); assert.equal(await page.getByRole('navigation').getByRole('link', { name: 'Tools', exact: true }).isVisible(), true); }
    await page.screenshot({ path: resolve(output, 'tools-mobile.png'), fullPage: true });
  });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(`${base}/tools/fileforge/`); await page.screenshot({ path: resolve(output, 'tools-desktop.png'), fullPage: true });
  assert.deepEqual(outbound, [], 'No uploads, API writes or external runtime requests'); assert.deepEqual(errors, [], 'No uncaught browser errors'); console.log('PASS privacy: only same-site GET requests, no uploads');
} finally { await browser.close(); }
