// Browser check for /tools/edit-pdf/. Run against `npm run preview` (or TEST_URL).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780', out = resolve('.local/pdf-editor-check');
await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
const errors = [], outbound = [];
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => { const url = request.url(); if (!/^(blob:|data:)/.test(url) && !url.startsWith(base)) outbound.push(`${request.method()} ${url}`); });
const ready = () => page.waitForFunction(() => document.querySelector('#advanced-workspace').getAttribute('aria-busy') === 'false' && !document.querySelector('#pe-editor').hidden && document.querySelectorAll('#pe-overlay .pe-seg').length > 0, null, { timeout: 30000 });
async function saved(trigger) {
  const download = page.waitForEvent('download'); await trigger(); const file = await download;
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}
async function textOf(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise, pages = [];
  for (let n = 1; n <= pdf.numPages; n++) pages.push((await (await pdf.getPage(n)).getTextContent()).items.map(i => i.str).join(' ').replace(/\s+/g, ' '));
  return pages;
}
try {
  await page.goto(`${base}/tools/edit-pdf/`);
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('.tool-nav a[aria-current]').getAttribute('href'), '/tools/edit-pdf/');
  assert.equal(await page.locator('#pe-download').isDisabled(), true);

  // Sample: lines are found, editing one patches it with the sampled colours.
  await page.locator('#pe-sample').click(); await ready();
  assert.match(await page.locator('#pe-pages').textContent(), /of 2/);
  const names = await page.locator('#pe-overlay .pe-seg').evaluateAll(list => list.map(el => el.getAttribute('aria-label')));
  assert.ok(names.includes('Edit text: Billed to: Alice Smith'), names.join(' | '));
  assert.ok(names.includes('Edit text: Invoice 2026-0042'));
  await page.locator('#pe-overlay .pe-seg', { hasText: 'Billed to: Alice Smith' }).click();
  assert.equal(await page.locator('#pe-fields').isVisible(), true);
  assert.equal(await page.locator('#pe-text').inputValue(), 'Billed to: Alice Smith');
  assert.equal(await page.locator('#pe-font').inputValue(), 'sans');
  await page.locator('.pe-input').fill('Billed to: Bob Jones');
  assert.match(await page.locator('#pe-summary').textContent(), /1 change on 1 page/);
  // Header band: the patch colour must be the page colour of that line (white), the title sits on light blue.
  await page.locator('#pe-overlay .pe-seg', { hasText: 'Invoice 2026-0042' }).click();
  assert.equal(await page.locator('#pe-bg').inputValue(), '#e3edfc');
  assert.equal(await page.locator('#pe-bold').isChecked(), true);
  await page.locator('#pe-text').fill('Invoice 2026-0043');
  await page.screenshot({ path: resolve(out, 'edited-1440.png'), fullPage: true });

  // Text with Turkish letters falls back to Noto Sans, and a line can be removed.
  await page.locator('#pe-overlay .pe-seg', { hasText: 'Hosting for one year' }).click();
  await page.locator('#pe-text').fill('Şirket hizmeti');
  assert.equal(await page.locator('#pe-font-note').isVisible(), true);
  await page.locator('#pe-overlay .pe-seg', { hasText: 'Thank you for your business.' }).click();
  await page.locator('#pe-remove').click();
  assert.match(await page.locator('#pe-summary').textContent(), /4 changes/);

  // Add text on page 2, then go back: edits survive page changes.
  await page.locator('#pe-next').click(); await page.waitForFunction(() => document.querySelector('#pe-page').value === '2' && document.querySelector('#advanced-workspace').getAttribute('aria-busy') === 'false');
  await page.locator('#pe-add').click();
  assert.equal(await page.locator('#pe-add').getAttribute('aria-pressed'), 'true');
  await page.locator('#pe-overlay').click({ position: { x: 80, y: 260 } });
  await page.locator('.pe-input').fill('Paid in full');
  await page.locator('#pe-size').fill('20');
  await page.locator('#pe-color').fill('#3159d9');
  assert.match(await page.locator('#pe-summary').textContent(), /5 changes on 2 pages/);
  await page.locator('#pe-prev').click(); await page.waitForFunction(() => document.querySelector('#pe-page').value === '1' && document.querySelectorAll('#pe-overlay .pe-seg.is-edited').length === 4);

  // Default export: patched, original still underneath, other text untouched, metadata kept.
  const plain = await saved(() => page.locator('#pe-download').click());
  assert.equal(plain.name, 'sample-invoice-edited.pdf');
  const [first, second] = await textOf(plain.bytes);
  assert.match(first, /Billed to: Bob Jones/); assert.match(first, /Invoice 2026-0043/); assert.match(first, /Şirket hizmeti/); assert.match(first, /Date: 12 March 2026/);
  assert.match(first, /Billed to: Alice Smith/, 'covered text is still in the file without flatten');
  assert.match(second, /Paid in full/); assert.match(second, /Payment terms/);
  assert.equal((await PDFDocument.load(plain.bytes, { updateMetadata: false })).getTitle(), 'Sample invoice');
  assert.match(await page.locator('#pe-status').textContent(), /only covered/);

  // Flatten: the original words are gone from the file, new text is real text.
  await page.locator('#pe-flatten').check();
  const flat = await saved(() => page.locator('#pe-download').click());
  const [flatFirst, flatSecond] = await textOf(flat.bytes);
  assert.doesNotMatch(flatFirst, /Alice Smith/); assert.doesNotMatch(flatFirst, /Date: 12 March/); assert.match(flatFirst, /Billed to: Bob Jones/); assert.match(flatFirst, /Şirket hizmeti/);
  assert.doesNotMatch(flatFirst, /Thank you/);
  assert.match(flatSecond, /Paid in full/);
  assert.ok((await PDFDocument.load(flat.bytes)).getPageCount() === 2);
  await page.screenshot({ path: resolve(out, 'flattened-1440.png'), fullPage: true });

  // Revert restores the line and the count.
  await page.locator('#pe-overlay .pe-seg', { hasText: 'Invoice 2026-0043' }).click();
  await page.locator('#pe-revert').click();
  assert.match(await page.locator('#pe-summary').textContent(), /4 changes/);

  // Own upload, bad files, zoom and mobile layouts.
  await page.locator('#pe-clear').click();
  assert.equal(await page.locator('#pe-editor').isVisible(), false);
  await page.locator('#pe-input').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf at all') });
  await page.waitForFunction(() => /could not be opened/.test(document.querySelector('#pe-status').textContent));
  const blank = await PDFDocument.create(); blank.addPage([300, 200]);
  await page.locator('#pe-input').setInputFiles({ name: 'blank.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await blank.save()) });
  await page.waitForFunction(() => /No selectable text/.test(document.querySelector('#pe-status').textContent));
  await page.locator('#pe-add').click(); await page.locator('#pe-overlay').click({ position: { x: 40, y: 60 } });
  const added = await saved(async () => { await page.locator('#pe-download').click(); });
  assert.match((await textOf(added.bytes))[0], /New text/);
  await page.locator('#pe-zoom-in').click(); await page.waitForFunction(() => document.querySelector('#pe-zoom').textContent === '125%');

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#pe-sample').click(); await ready();
    await page.locator('#pe-overlay .pe-seg').first().click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `no horizontal page scroll at ${width}px (${overflow})`);
    await page.screenshot({ path: resolve(out, `sample-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  console.log('PASS PDF editor: lines found, colours sampled, edit, Unicode fallback, remove, add on another page, plain and flattened export, revert, bad files, zoom, mobile layouts, no uploads.');
} finally { await browser.close(); }
