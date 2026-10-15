import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const output = resolve('.local/screenshot-studio-check'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addInitScript(() => {
  window.__revokedScreenshotURLs = []; window.__openScreenshotBitmaps = new Set();
  const revoke = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = url => { window.__revokedScreenshotURLs.push(url); revoke(url); };
  const decode = window.createImageBitmap.bind(window); window.createImageBitmap = async (...args) => { const bitmap = await decode(...args); window.__openScreenshotBitmaps.add(bitmap); return bitmap; };
  const close = ImageBitmap.prototype.close; ImageBitmap.prototype.close = function () { window.__openScreenshotBitmaps.delete(this); return close.call(this); };
  const encode = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
    const delay = window.__slowScreenshotExport && this.width > 1000 && this.width !== 1240;
    return encode.call(this, blob => { if (delay) { window.__screenshotEncoding = true; setTimeout(() => callback(blob), 400); } else callback(blob); }, ...args);
  };
});
const requests = [], errors = []; context.on('request', request => requests.push([request.method(), request.url()]));
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
const check = async (label, work) => { await work(); console.log(`PASS ${label}`); };
async function ready() { await page.waitForFunction(() => !document.querySelector('#screenshot-preview').hidden && !document.querySelector('#screenshot-options').disabled); }
async function settings(values) {
  await page.evaluate(values => { for (const [key, value] of Object.entries(values)) { const element = document.querySelector(`#screenshot-${key}`); element.value = String(value); element.dispatchEvent(new Event('input', { bubbles: true })); } }, values);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function exportImage(format = 'png') { await page.locator('#screenshot-format').selectOption(format); await page.locator('#screenshot-export').click(); await page.locator('#screenshot-result').waitFor({ state: 'visible' }); }
async function readResult() {
  return page.evaluate(async () => {
    const blob = await (await fetch(document.querySelector('#screenshot-download').href)).blob(), bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
      const sample = (x, y) => Array.from(context.getImageData(Math.round(x), Math.round(y), 1, 1).data);
      const caption = context.getImageData(0, 0, canvas.width, Math.min(150, canvas.height)).data; let lightCaptionPixels = 0;
      for (let i = 0; i < caption.length; i += 4) if (caption[i] > 245 && caption[i + 1] > 245 && caption[i + 2] > 245) lightCaptionPixels++;
      return { width: bitmap.width, height: bitmap.height, size: blob.size, type: blob.type, background: sample(4, 4), red: sample(canvas.width * .25, canvas.height * .35), green: sample(canvas.width * .75, canvas.height * .35), blue: sample(canvas.width * .25, canvas.height * .65), yellow: sample(canvas.width * .75, canvas.height * .65), lightCaptionPixels };
    } finally { bitmap.close(); }
  });
}
async function fixture(type = 'image/png', width = 800, height = 400) {
  return Buffer.from(await page.evaluate(async ({ type, width, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const context = canvas.getContext('2d');
    ['#e34c67', '#3ccba9', '#5370db', '#f6cf79'].forEach((color, index) => { context.fillStyle = color; context.fillRect(index % 2 * width / 2, Math.floor(index / 2) * height / 2, width / 2, height / 2); });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type)); const bytes = Array.from(new Uint8Array(await blob.arrayBuffer())); canvas.width = canvas.height = 1; return bytes;
  }, { type, width, height }));
}

try {
  await check('sample CTA generates a real original screenshot and preview without an automatic export', async () => {
    await page.goto(`${base}/tools/screenshot-studio/?sample=1`); await ready();
    assert.match(await page.locator('#screenshot-file').innerText(), /Sample · generated on your device · 1240 × 780/);
    assert.equal(await page.locator('#screenshot-result').isVisible(), false);
    assert.equal(await page.locator('#screenshot-preview').evaluate(canvas => canvas.width), 1000);
    assert.equal(await page.locator('#screenshot-preview').evaluate(canvas => canvas.height), 625);
    assert.ok(await page.locator('.tool-nav a').count() >= 9);
    await page.screenshot({ path: resolve(output, 'sample-desktop.png'), fullPage: true });
  });
  const source = await fixture();
  await check('a real selected screenshot exports all four source quadrants at exact PNG dimensions', async () => {
    await page.locator('#screenshot-input').setInputFiles({ name: 'project.png', buffer: source, mimeType: 'image/png' }); await ready();
    await settings({ background: 'solid', color: '#123456', frame: 'minimal', tilt: 0, caption: '', padding: 96, roundness: 0, shadow: 0 });
    await exportImage(); const result = await readResult(); assert.equal(result.width, 1600); assert.equal(result.height, 1000); assert.equal(result.type, 'image/png');
    assert.deepEqual(result.background, [18, 52, 86, 255]); assert.deepEqual(result.red, [227, 76, 103, 255]); assert.deepEqual(result.green, [60, 203, 169, 255]); assert.deepEqual(result.blue, [83, 112, 219, 255]); assert.deepEqual(result.yellow, [246, 207, 121, 255]);
    assert.match(await page.locator('#screenshot-result-detail').innerText(), new RegExp(`${result.size.toLocaleString('en-US')} bytes`)); assert.equal(await page.locator('#screenshot-download').getAttribute('download'), 'project-studio.png');
  });
  await check('frame, caption, tilt, background, padding and shadow change the actual rendered composition', async () => {
    const signature = () => page.locator('#screenshot-preview').evaluate(canvas => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let result = 0; for (let i = 0; i < data.length; i += 73) result = (result * 31 + data[i]) >>> 0; return result; });
    let before = await signature();
    for (const values of [{ frame: 'browser' }, { caption: 'HELLO FROM YOUR DEVICE', 'text-color': 'auto' }, { tilt: 6 }, { background: 'sunset' }, { padding: 160 }, { shadow: 90 }, { roundness: 48 }]) { await settings(values); const after = await signature(); assert.notEqual(after, before, JSON.stringify(values)); before = after; }
    await settings({ background: 'solid', color: '#123456', tilt: 0 }); await exportImage(); assert.ok((await readResult()).lightCaptionPixels > 500, 'Automatic caption contrast renders real light text on a dark background');
  });
  await check('square WebP and widescreen JPG exports preserve exact dimensions and native MIME', async () => {
    await settings({ size: 'square', caption: 'Made to share.' }); await exportImage('webp'); let result = await readResult(); assert.deepEqual([result.width, result.height, result.type], [1080, 1080, 'image/webp']);
    await settings({ size: 'widescreen' }); await exportImage('jpg'); result = await readResult(); assert.deepEqual([result.width, result.height, result.type], [1920, 1080, 'image/jpeg']);
    assert.ok(result.width * result.height <= 4_000_000);
  });
  await check('view zoom leaves export pixels unchanged and styling releases the old download URL', async () => {
    const previous = await page.locator('#screenshot-download').getAttribute('href'); await settings({ zoom: 150 });
    assert.equal(await page.locator('#screenshot-preview').evaluate(canvas => canvas.style.width), '150%');
    assert.equal(await page.locator('#screenshot-result').isVisible(), true, 'View-only zoom keeps an existing download valid');
    await settings({ background: 'aurora' }); assert.equal(await page.locator('#screenshot-result').isVisible(), false); assert.equal(await page.locator('#screenshot-download').getAttribute('href'), null);
    assert.equal(await page.evaluate(url => window.__revokedScreenshotURLs.includes(url), previous), true); await exportImage(); assert.deepEqual([(await readResult()).width, (await readResult()).height], [1920, 1080]);
  });
  await check('mobile controls and zoomed preview stay within 320/390/768px screens', async () => {
    for (const width of [320, 390, 768]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px`); }
    await page.setViewportSize({ width: 390, height: 900 }); await settings({ zoom: 100 }); await page.screenshot({ path: resolve(output, 'sample-mobile.png'), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1100 });
  });
  await check('cancellation during native encoding keeps the working image and permits a new export', async () => {
    await page.evaluate(() => { window.__slowScreenshotExport = true; window.__screenshotEncoding = false; }); await page.locator('#screenshot-export').click(); await page.waitForFunction(() => window.__screenshotEncoding);
    await page.locator('#screenshot-cancel').click(); await page.waitForFunction(() => document.querySelector('#screenshot-status').textContent.startsWith('Export cancelled'));
    assert.equal(await page.locator('#screenshot-result').isVisible(), false); assert.equal(await page.locator('#screenshot-preview').isVisible(), true); await page.evaluate(() => { window.__slowScreenshotExport = false; }); await exportImage();
  });
  await check('clear releases bitmap/download memory and malformed files fail usefully', async () => {
    const previous = await page.locator('#screenshot-download').getAttribute('href'); await page.locator('#screenshot-clear').click(); assert.equal(await page.locator('#screenshot-preview').isVisible(), false); assert.equal(await page.locator('#screenshot-result').isVisible(), false);
    assert.equal(await page.evaluate(url => window.__revokedScreenshotURLs.includes(url), previous), true); assert.equal(await page.evaluate(() => window.__openScreenshotBitmaps.size), 0);
    assert.equal(await page.locator('#screenshot-export').isDisabled(), true);
    await page.locator('#screenshot-input').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') }); await page.waitForFunction(() => document.querySelector('#screenshot-status').textContent.includes('not a valid'));
    for (const [name, mimeType] of [['photo.jpg', 'image/jpeg'], ['web.webp', 'image/webp']]) { await page.locator('#screenshot-input').setInputFiles({ name, mimeType, buffer: await fixture(mimeType) }); await ready(); assert.match(await page.locator('#screenshot-file').innerText(), /800 × 400/); }
  });
  await check('workspace bridge awaits source decoding and publishes only explicit exports', async () => {
    await page.goto(`${base}/tools/`);
    await page.evaluate(() => { window.__studioMessages = []; const frame = document.createElement('iframe'); frame.id = 'studio-test'; frame.src = '/tools/screenshot-studio/?workspace=1'; document.body.append(frame); window.addEventListener('message', event => { if (event.source === frame.contentWindow && event.data?.protocol === 'fileforge-workspace-v1') window.__studioMessages.push(event.data); }); });
    await page.waitForFunction(() => window.__studioMessages.some(message => message.type === 'ready'));
    await page.evaluate(bytes => document.querySelector('#studio-test').contentWindow.postMessage({ protocol: 'fileforge-workspace-v1', type: 'files', files: [new File([new Uint8Array(bytes)], 'bridge.png', { type: 'image/png' })] }, location.origin), [...source]);
    const frame = page.frameLocator('#studio-test'); await frame.locator('#screenshot-export').waitFor({ state: 'visible' }); await page.waitForFunction(() => window.__studioMessages.some(message => message.type === 'selection' && message.files?.[0]?.name === 'bridge.png'));
    assert.equal(await page.evaluate(() => window.__studioMessages.some(message => message.type === 'result')), false);
    await frame.locator('#screenshot-export').click(); await page.waitForFunction(() => window.__studioMessages.some(message => message.type === 'result'));
    assert.equal(await page.evaluate(() => window.__studioMessages.find(message => message.type === 'result').blob.type), 'image/png');
  });
  assert.deepEqual(errors, [], 'No uncaught browser errors'); assert.equal(requests.some(([method, url]) => method !== 'GET' || (!url.startsWith('blob:') && new URL(url).origin !== new URL(base).origin)), false, 'No uploads or external requests');
  console.log('PASS Screenshot studio real native graphics, source cleanup and local-only execution');
} finally { await browser.close(); }
