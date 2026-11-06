// Browser check for /tools/file-inspector/. Run against `npm run preview` (or TEST_URL).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780', out = resolve('.local/inspector-check');
await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
const errors = [], outbound = [];
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => { const url = request.url(); if (!/^(blob:|data:)/.test(url) && !url.startsWith(base)) outbound.push(`${request.method()} ${url}`); });
const done = () => page.waitForFunction(() => document.querySelector('#advanced-workspace').getAttribute('aria-busy') === 'false' && !document.querySelector('#inspector-result').hidden, null, { timeout: 30000 });
try {
  await page.goto(`${base}/tools/file-inspector/`);
  assert.equal(await page.locator('h1').count(), 1);
  assert.match(await page.locator('.page-intro').innerText(), /100 MB/);
  assert.equal(await page.locator('.tool-nav a[aria-current]').getAttribute('href'), '/tools/file-inspector/');

  await page.locator('#inspector-sample').click(); await done();
  assert.equal(await page.locator('#inspector-format-name').textContent(), 'JPEG image');
  assert.match(await page.locator('#inspector-verdict').textContent(), /\.png, but the content is a JPEG/);
  const findings = await page.locator('#inspector-findings').innerText();
  for (const text of ['GPS location is stored in this file', 'Hidden data after the end of the file', 'The extension does not match the content']) assert.ok(findings.includes(text), text);
  assert.match(await page.locator('#inspector-metadata').innerText(), /Alisoglu Optics/);
  assert.equal(await page.locator('#inspector-hashes code').first().textContent().then(t => t.length), 64);
  await page.screenshot({ path: resolve(out, 'sample-1440.png'), fullPage: true });

  // Save the appended ZIP and check it is exactly the archive.
  const download = page.waitForEvent('download');
  await page.locator('#inspector-findings [data-save]').first().click();
  const saved = await readFile(await (await download).path());
  assert.equal(saved.subarray(0, 4).toString('latin1'), 'PK\x03\x04');

  await page.locator('#inspector-findings [data-hex]').first().click();
  assert.equal(await page.locator('#tab-hex').getAttribute('aria-selected'), 'true');
  await page.locator('#inspector-hex mark').first().waitFor();
  await page.locator('#tab-hex').press('ArrowRight');
  assert.equal(await page.locator('#tab-strings').getAttribute('aria-selected'), 'true');
  assert.match(await page.locator('#inspector-interesting').innerText(), /sample-user/);
  await page.locator('#tab-contents').click();
  assert.match(await page.locator('#inspector-embedded').innerText(), /ZIP archive/);

  // A disguised program and an Office document with macros.
  await page.locator('#inspector-input').setInputFiles({ name: 'invoice.pdf.exe', mimeType: 'application/octet-stream', buffer: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(0x3a), Buffer.from([0x40, 0, 0, 0]), Buffer.from('PE\0\0'), Buffer.from([0x64, 0x86, 1, 0]), Buffer.alloc(400)]) });
  await page.waitForFunction(() => /Windows program/.test(document.querySelector('#inspector-format-name').textContent));
  assert.match(await page.locator('#inspector-findings').innerText(), /Double file extension/);
  const docx = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'docProps/core.xml': strToU8('<cp:coreProperties><dc:creator>Jane Roe</dc:creator></cp:coreProperties>'), 'word/document.xml': strToU8('<w:document/>'), 'word/vbaProject.bin': strToU8('x') });
  await page.locator('#inspector-input').setInputFiles({ name: 'offer.docx', mimeType: 'application/octet-stream', buffer: Buffer.from(docx) });
  await page.waitForFunction(() => /Word document/.test(document.querySelector('#inspector-format-name').textContent));
  await page.locator('#tab-contents').click();
  assert.equal(await page.locator('#inspector-entries tbody tr').count(), 4);
  assert.match(await page.locator('#inspector-findings').innerText(), /Contains macros/);

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#inspector-sample').click(); await done();
    for (const tab of ['#tab-overview', '#tab-contents', '#tab-hex', '#tab-strings']) {
      await page.locator(tab).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no horizontal scroll at ${width}px on ${tab}`);
    }
    await page.locator('#tab-overview').click();
    await page.screenshot({ path: resolve(out, `sample-${width}.png`), fullPage: true });
  }
  await page.locator('#inspector-clear').click();
  assert.equal(await page.locator('#inspector-result').isVisible(), false);
  assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  console.log('PASS file inspector: sample findings, hex jump, strings, contents, saved hidden ZIP, disguised program, macro DOCX, mobile layouts, no uploads.');
} finally { await browser.close(); }
