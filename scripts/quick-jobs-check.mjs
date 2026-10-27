import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const out = '.local/quick-jobs-check'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce', acceptDownloads: true });
  const errors = [], external = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    requests.push(request.url());
    if (!/^(data:|blob:)/.test(request.url()) && (new URL(request.url()).origin !== new URL(base).origin || request.method() !== 'GET')) external.push(request.url());
  });
  const engine = () => page.frameLocator('[data-workspace-frame] iframe');
  const result = () => page.locator('[data-workspace-result]').waitFor({ state: 'visible', timeout: 120000 });
  const bytes = async () => Buffer.from(await page.evaluate(async () => [...new Uint8Array(await (await fetch(document.querySelector('[data-workspace-download]').href)).arrayBuffer())]));
  const image = { name: 'sample-photo.png', mimeType: 'image/png', buffer: await readFile('assets/demos/headphones.png') };
  await page.goto(base + '/tools/workspace/');
  assert.equal(await page.locator('[data-quick-job]').count(), 3);
  assert.equal(await page.locator('[data-workspace-offline]').getAttribute('open'), null);
  assert.equal(requests.some(url => /vendor\/(ort|ffmpeg|tesseract)|\.onnx/.test(url)), false);
  await page.locator('[data-open-offline]').first().click();
  await page.locator('[data-offline-group="core"]').waitFor();
  assert.equal(await page.locator('[data-workspace-offline]').getAttribute('open'), '');
  console.log('PASS three Quick Jobs, collapsed offline options and no eager heavy engines.');

  await page.goto(base + '/tools/workspace/?job=attachment');
  await page.locator('[data-workspace-input]').setInputFiles(image);
  await engine().locator('#file-list li').waitFor();
  assert.equal(await engine().locator('#drop-zone').isVisible(), false);
  assert.equal(await engine().locator('[name=format]').inputValue(), 'jpg');
  assert.equal(await engine().locator('[name=width]').inputValue(), '1600');
  assert.equal(await engine().locator('[name=quality]').inputValue(), '78');
  await engine().locator('#conversion-form button[type=submit]').click(); await result();
  const jpeg = await bytes(); assert.deepEqual([...jpeg.subarray(0, 3)], [255, 216, 255]);
  assert.equal(await page.locator('[data-job-next]').isVisible(), false);
  assert.match(await page.locator('[data-workspace-comparison]').textContent(), /JPG/);
  await page.locator('.workspace-result-previews img').last().waitFor();
  assert.equal(await page.locator('.workspace-result-previews img').count(), 2);
  assert.ok(await page.locator('[data-workspace-result]').evaluate(node => node.getBoundingClientRect().top >= 0));
  await page.locator('.workspace-editor > summary').click();
  assert.equal(await page.locator('.workspace-editor').getAttribute('open'), '');
  await page.locator('.workspace-editor > summary').click();
  assert.equal(await page.locator('.workspace-editor').getAttribute('open'), null);
  const oldName = await page.locator('[data-workspace-file-name]').textContent();
  assert.equal(await page.locator('[data-workspace-input]').getAttribute('multiple'), null);
  await page.locator('[data-workspace-drop]').evaluate(async drop => {
    const blob = await (await fetch('/assets/demos/headphones.png')).blob();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([blob], 'one.png', { type: 'image/png' })); dataTransfer.items.add(new File([blob], 'two.png', { type: 'image/png' }));
    drop.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
  });
  assert.equal(await page.locator('[data-workspace-file-name]').textContent(), oldName);
  assert.equal(await page.locator('[data-workspace-result]').isVisible(), true);
  assert.match(await page.locator('[data-workspace-frame-status]').textContent(), /one file/);
  await page.screenshot({ path: `${out}/attachment-result.png`, fullPage: true });
  console.log('PASS attachment preset, single picker, actual JPEG, comparison and safe invalid-selection recovery.');

  await page.goto(base + '/tools/workspace/?job=document');
  await page.locator('[data-workspace-input]').setInputFiles(image);
  await engine().locator('#scanner-editor').waitFor();
  await engine().locator('#scanner-run').click();
  await engine().locator('#scanner-result').waitFor();
  await engine().locator('#scanner-export').click(); await result();
  await page.locator('[data-job-next]').click();
  await engine().locator('#file-list li').waitFor();
  assert.equal(await engine().locator('[name=format]').inputValue(), 'pdf');
  await engine().locator('#conversion-form button[type=submit]').click(); await result();
  const pdf = await PDFDocument.load(await bytes()); assert.equal(pdf.getPageCount(), 1);
  assert.equal(await page.locator('[data-job-next]').isVisible(), false);
  assert.match(await page.locator('[data-job-hint]').textContent(), /job is ready/);
  await page.screenshot({ path: `${out}/document-result.png`, fullPage: true });
  console.log('PASS real photo straightening → PNG → one-page PDF with in-memory handoff.');

  await page.goto(base + '/tools/workspace/?job=product');
  await page.locator('[data-workspace-input]').setInputFiles(image);
  await engine().locator('#advanced-filename').waitFor();
  await engine().locator('#advanced-run').click();
  await result();
  await page.locator('.workspace-editor:not([open]) > summary').click();
  await engine().locator('#background-editor').waitFor({ state: 'visible', timeout: 120000 });
  await engine().locator('#background-export').click(); await result();
  await page.locator('[data-job-next]').click();
  await engine().locator('#crop-source').waitFor();
  assert.equal(await engine().locator('#crop-aspect').inputValue(), '1');
  assert.equal(await engine().locator('#crop-format').inputValue(), 'png');
  await engine().locator('#advanced-run').click(); await result();
  await page.locator('[data-job-next]').click();
  await engine().locator('#file-list li').waitFor();
  assert.equal(await engine().locator('[name=format]').inputValue(), 'png');
  await engine().locator('#conversion-form button[type=submit]').click(); await result();
  const png = await bytes();
  const properties = await page.evaluate(async data => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = false, opaque = false;
    for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] < 20) transparent = true; if (pixels[i] > 240) opaque = true; }
    const value = { width: bitmap.width, height: bitmap.height, transparent, opaque }; bitmap.close(); return value;
  }, [...png]);
  assert.equal(properties.width, properties.height); assert.ok(properties.width <= 1600);
  assert.equal(properties.transparent, true); assert.equal(properties.opaque, true);
  await page.locator('[data-guided-reset]').click();
  await engine().locator('#advanced-filename').waitFor();
  assert.equal(await page.locator('[data-job-steps] [aria-current]').textContent(), '1Remove background');
  await page.locator('[data-job-exit]').click();
  assert.equal(await page.locator('[data-guided-job]').isVisible(), false);
  assert.equal(new URL(page.url()).searchParams.has('job'), false);
  console.log('PASS actual background removal → square crop → PNG, transparency, reset and exit to full toolbox.');

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/tools/workspace/', '/tools/', '/projects/fileforge/', '/projects/repodock/', '/downloads/']) {
      await page.goto(base + path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} at ${width}`);
    }
  }
  await page.getByRole('link', { name: 'Setup & requirements' }).first().count();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS small screens, local processing and no JavaScript errors.');
} finally { await browser.close(); }
