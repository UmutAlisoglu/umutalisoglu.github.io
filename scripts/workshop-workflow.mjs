import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [], outbound = [];
await mkdir('.local/browser-check/workshop', { recursive: true });
context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
page.on('pageerror', error => errors.push(error.message));
context.on('request', r => { if (/^https?:/.test(r.url()) && (r.method() !== 'GET' || new URL(r.url()).origin !== new URL(base).origin)) outbound.push(r.url()); });
const workbench = () => page.frameLocator('.workspace-dialog iframe');
const engine = () => workbench().frameLocator('[data-workspace-frame] iframe');
const check = async (name, run) => { await run(); console.log(`PASS ${name}`); };
try {
  await check('tool directory samples reach real tools without exporting automatically', async () => {
    await page.goto(base + '/tools/');
    await page.getByRole('link', { name: /Screenshot → framed image/ }).click();
    await page.locator('#screenshot-export:not(:disabled)').waitFor();
    assert.equal(await page.locator('#screenshot-result').isVisible(), false);
    assert.equal(await page.locator('#screenshot-preview').isVisible(), true);
  });
  await check('screenshot export passes through the workspace to a real PDF', async () => {
    await page.locator('#screenshot-export').click();
    await page.locator('#screenshot-result').waitFor();
    const size = await page.evaluate(async () => { const b = await createImageBitmap(await (await fetch(document.querySelector('#screenshot-download').href)).blob()); const size = [b.width, b.height]; b.close(); return size; });
    assert.deepEqual(size, [1600, 1000]);
    await page.getByRole('button', { name: 'Continue in workspace' }).click();
    await workbench().locator('[data-workspace-tool=image-pdf]').click();
    await engine().locator('#file-list').filter({ hasText: 'fileforge-studio-sample-studio.png' }).waitFor();
    await engine().locator('#conversion-form button[type=submit]:not(:disabled)').waitFor();
    assert.equal(await engine().locator('[name=format]').inputValue(), 'pdf');
    await engine().locator('#conversion-form button[type=submit]').click();
    await workbench().locator('[data-workspace-result]').waitFor();
    const bytes = await workbench().locator('body').evaluate(async () => [...new Uint8Array(await (await fetch(document.querySelector('[data-workspace-download]').href)).arrayBuffer())]);
    assert.equal((await PDFDocument.load(new Uint8Array(bytes))).getPageCount(), 1);
  });
  await check('straightened sample can continue to local OCR and produce meaningful words', async () => {
    await page.goto(base + '/tools/document-scanner/?sample=1');
    await page.locator('#scanner-run:not(:disabled)').waitFor();
    assert.equal(await page.locator('#scanner-result').isVisible(), false);
    await page.locator('#scanner-run').click(); await page.locator('#scanner-result').waitFor();
    await page.locator('#scanner-export:not(:disabled)').click();
    await page.locator('#scanner-download').waitFor();
    await page.getByRole('button', { name: 'Continue in workspace' }).click();
    await workbench().locator('[data-workspace-tool=text]').click();
    await engine().locator('#ocr-run:not(:disabled)').waitFor();
    await engine().locator('#ocr-run').click();
    await engine().locator('#ocr-result').waitFor({ timeout: 120_000 });
    assert.match(await engine().locator('#ocr-text').inputValue(), /A GOOD IDEA/i);
    assert.match(await engine().locator('#ocr-text').inputValue(), /Your files stay on your device/i);
    await page.screenshot({ path: '.local/browser-check/workshop/scanner-to-ocr.png', fullPage: true });
  });
  assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  console.log('PASS both creative workflows stay on device with no browser errors');
} finally { await browser.close(); }
