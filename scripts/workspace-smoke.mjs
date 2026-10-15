import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const out = resolve('.local/browser-check/workspace'); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => {
  if (!/^(?:blob:|data:)/.test(request.url()) && (request.method() !== 'GET' || new URL(request.url()).origin !== new URL(base).origin)) requests.push(request.url());
});
const check = async (name, run) => { await run(); console.log(`PASS ${name}`); };
const engine = () => page.frameLocator('[data-workspace-frame] iframe');
async function selectTask(id, wait = '#files') {
  await page.locator(`[data-workspace-tool="${id}"]`).click();
  await engine().locator(wait).waitFor();
}
async function result() { await page.locator('[data-workspace-result]').waitFor({ state: 'visible', timeout: 90_000 }); }
async function bytes() { return Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(document.querySelector('[data-workspace-download]').href)).arrayBuffer())))); }
async function pixels(bytes) {
  return page.evaluate(async data => { const image = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' })); const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); const colour = [...ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data]; image.close(); return { width: c.width, height: c.height, colour }; }, [...bytes]);
}
try {
  await page.goto(base + '/');
  const image = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 160;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ed2b2b'; ctx.fillRect(0, 0, 240, 160); ctx.fillStyle = '#124fc3'; ctx.fillRect(120, 80, 120, 80);
    return [...new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve))).arrayBuffer())];
  }));
  const fixture = { name: 'quadrants.png', mimeType: 'image/png', buffer: image };
  await check('homepage selects locally and shows only compatible actions', async () => {
    const initial = await page.evaluate(async () => ({ sw: await navigator.serviceWorker.getRegistrations(), storage: Object.keys(localStorage) }));
    assert.equal(initial.sw.length, 0); assert.ok(!initial.storage.includes('fileforge:favourite-tools:v1'));
    await page.locator('[data-workspace-input]').setInputFiles(fixture);
    await page.locator('[data-workspace-session]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-workspace-actions] [data-workspace-tool]').count(), 8);
    assert.equal(await page.locator('[data-workspace-tool=video]').count(), 0);
    assert.equal(await page.locator('[data-workspace-file-name]').innerText(), 'quadrants.png');
    await page.locator('[data-workspace-search]').fill('crop'); assert.equal(await page.locator('[data-workspace-actions] [data-workspace-tool]').count(), 1); await page.locator('[data-workspace-search]').fill('');
    for (const [query, id] of [['png to pdf', 'image-pdf'], ['remove bg', 'background'], ['extract text', 'text']]) {
      await page.locator('[data-workspace-search]').fill(query);
      assert.equal(await page.locator('[data-workspace-actions] [data-workspace-tool]').count(), 1, query);
      assert.equal(await page.locator(`[data-workspace-tool="${id}"]`).count(), 1, query);
    }
    await page.locator('[data-workspace-search]').fill('svg to png');
    assert.equal(await page.locator('[data-workspace-actions] [data-workspace-tool]').count(), 0);
    await page.locator('[data-workspace-search]').fill('');
  });
  await check('crop → image conversion → PDF handoff preserves actual data without upload or reselection', async () => {
    await selectTask('crop', '#advanced-input'); await engine().locator('#crop-source').waitFor({ state: 'visible' });
    for (const [id, value] of [['x',120], ['y',80], ['width',100], ['height',60]]) await engine().locator(`#crop-${id}`).fill(String(value));
    await engine().locator('#advanced-run').click(); await result();
    assert.deepEqual(await pixels(await bytes()), { width: 100, height: 60, colour: [18,79,195,255] });
    await page.locator('[data-workspace-continue=image]').click(); await engine().locator('#files').waitFor();
    assert.match(await engine().locator('#selection-summary').innerText(), /1 file/);
    await engine().locator('[name=format]').selectOption('png'); await engine().locator('#conversion-form button[type=submit]').click(); await result();
    assert.deepEqual(await pixels(await bytes()), { width: 100, height: 60, colour: [18,79,195,255] });
    await page.locator('[data-workspace-continue=image-pdf]').click(); await engine().locator('#files').waitFor();
    await engine().locator('#conversion-form button[type=submit]').click(); await result();
    const pdf = await PDFDocument.load(await bytes()); assert.equal(pdf.getPageCount(), 1); assert.deepEqual(pdf.getPage(0).getSize(), { width: 841.89, height: 595.28 });
    assert.equal(await page.locator('[data-workspace-steps] li').count(), 3);
    assert.equal(await page.locator('[data-workspace-continue=organize]').count(), 1);
    await page.screenshot({ path: resolve(out,'connected-workspace.png'), fullPage: true });
  });
  await check('invalidation disables stale result and reset restores original selection', async () => {
    await engine().locator('[name=quality]').fill('70'); assert.equal(await page.locator('[data-workspace-result]').isVisible(), false);
    await page.locator('[data-workspace-reset]').click(); assert.equal(await page.locator('[data-workspace-file-name]').innerText(), 'quadrants.png');
    assert.equal(await page.locator('[data-workspace-steps] li').count(), 0);
    await page.evaluate(() => window.postMessage({protocol:'fileforge-workspace-v1',type:'result',blob:new Blob(['spoofed'],{type:'text/plain'}),name:'spoof.txt'},location.origin));
    assert.equal(await page.locator('[data-workspace-result]').isVisible(), false);
  });
  await check('favourites persist only with explicit preference and clear releases the session', async () => {
    await page.locator('[data-workspace-tool=crop]').locator('..').locator('.forge-favourite').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('fileforge:favourite-tools:v1')), null);
    await page.locator('[data-workspace-remember]').check();
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('fileforge:favourite-tools:v1'))); assert.deepEqual(saved, {version:1,tools:['crop']});
    await page.locator('[data-workspace-remember]').uncheck();
    assert.equal(await page.evaluate(() => localStorage.getItem('fileforge:favourite-tools:v1')), null);
    await page.locator('[data-workspace-clear]').click(); assert.equal(await page.locator('[data-workspace-session]').isVisible(), false); assert.equal(await page.locator('[data-workspace-frame] iframe').count(),0);
    assert.equal(await page.locator('[data-workspace-thumb]').getAttribute('src'),null);
  });
  await check('sample PDF is generated locally and page operations export a real rotated PDF', async () => {
    await page.locator('[data-workspace-demo=pdf]').first().click(); await engine().locator('#files').waitFor();
    await engine().locator('#conversion-form button[type=submit]').click(); await engine().locator('.page-card').last().waitFor();
    assert.equal(await engine().locator('.page-card').count(),3);
    await engine().locator('.page-card').first().getByRole('button',{name:/Rotate clockwise/}).click();
    await engine().locator('#conversion-form button[type=submit]').click(); await result();
    const doc = await PDFDocument.load(await bytes()); assert.equal(doc.getPageCount(),3); assert.equal(doc.getPage(0).getRotation().angle,90);
  });
  await check('standalone result opens a connected workspace in memory', async () => {
    await page.goto(base+'/tools/crop-image/'); await page.locator('#advanced-input').setInputFiles(fixture);
    await page.locator('#advanced-run').click(); await page.locator('#advanced-result').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Continue in workspace'}).click();
    const workspace = page.frameLocator('.workspace-dialog iframe'); await workspace.locator('[data-workspace-session]').waitFor({state:'visible'});
    assert.match(await workspace.locator('[data-workspace-file-name]').innerText(),/quadrants/);
    await workspace.locator('[data-workspace-tool=image-pdf]').click();
    const nested = workspace.frameLocator('[data-workspace-frame] iframe'); await nested.locator('#files').waitFor();
    await nested.locator('#conversion-form button[type=submit]').click(); await workspace.locator('[data-workspace-result]').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Close ✕'}).click(); await page.locator('.workspace-dialog').waitFor({state:'detached'}); assert.equal(await page.locator('.workspace-dialog').count(),0);
  });
  await check('photo and OCR demos open real engines and no heavy runtime loads before starting', async () => {
    await page.goto(base+'/tools/workspace/?demo=text'); await engine().locator('#ocr-run').waitFor();
    assert.match(await engine().locator('#ocr-filename').innerText(),/sample/);
    await engine().locator('#ocr-run').click(); await result(); assert.match((await bytes()).toString('utf8'),/Your files stay on your device/i);
    await page.goto(base+'/tools/workspace/?demo=photo'); await engine().locator('#advanced-run').waitFor();
    await engine().locator('#advanced-run').click(); await result();
    const data = await pixels(await bytes()); assert.deepEqual([data.width,data.height],[1254,1254]);
    await page.screenshot({path:resolve(out,'photo-cutout-workspace.png'),fullPage:true});
  });
  await check('clearing a child releases its result and switching tools cannot resurrect its file', async () => {
    await page.goto(base + '/tools/workspace/');
    await page.locator('[data-workspace-input]').setInputFiles(fixture);
    await selectTask('crop', '#advanced-input'); await engine().locator('#crop-source').waitFor({ state: 'visible' });
    await engine().locator('#advanced-run').click(); await result();
    const previousURL = await page.locator('[data-workspace-download]').getAttribute('href');
    await engine().locator('#advanced-clear').click();
    await page.waitForFunction(() => document.querySelector('[data-workspace-file-name]').textContent === '0 selected files');
    assert.equal(await page.locator('[data-workspace-result]').isVisible(), false);
    assert.equal(await page.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, previousURL), true, 'Cleared result URL must be revoked');
    await selectTask('image');
    assert.equal(await engine().locator('#selection-summary').innerText(), 'No files selected');
    const first = { ...fixture, name: 'first.png' }, second = { ...fixture, name: 'second.png' };
    await engine().locator('#files').setInputFiles([first, second]);
    await page.waitForFunction(() => document.querySelector('[data-workspace-file-name]').textContent === '2 selected files');
    await engine().getByRole('button', { name: 'Remove first.png', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-workspace-file-name]').textContent === 'second.png');
    await engine().locator('#clear-files').click();
    await page.waitForFunction(() => document.querySelector('[data-workspace-file-name]').textContent === '0 selected files');
    await selectTask('crop', '#advanced-input');
    assert.equal(await engine().locator('#advanced-filename').innerText(), 'No file selected');
    assert.equal(await engine().locator('#advanced-run').isDisabled(), true);
  });
  await check('terminal TXT, SVG and ZIP results remain downloadable without opening an empty continuation', async () => {
    await page.goto(base + '/tools/extract-text/');
    await page.locator('#ocr-sample').click(); await page.locator('#ocr-run').click();
    await page.locator('#ocr-result').waitFor({ state: 'visible', timeout: 90_000 });
    assert.match(await page.locator('#ocr-text').inputValue(), /Your files stay on your device/i);
    assert.equal(await page.getByRole('button', { name: 'Continue in workspace' }).count(), 0);
    assert.equal(await page.locator('#ocr-download').isEnabled(), true);
    await page.goto(base + '/tools/image-to-svg/'); await page.locator('#advanced-input').setInputFiles(fixture);
    await page.locator('#advanced-run').click(); await page.locator('#advanced-result').waitFor({ state: 'visible', timeout: 90_000 });
    assert.equal(await page.getByRole('button', { name: 'Continue in workspace' }).count(), 0);
    assert.match(await page.locator('#advanced-download').getAttribute('download'), /\.svg$/);
    await page.goto(base + '/tools/image-converter/');
    await page.locator('#files').setInputFiles([fixture, { ...fixture, name: 'second.png' }]);
    await page.locator('[name=format]').selectOption('png'); await page.locator('#conversion-form button[type=submit]').click();
    await page.locator('#result').waitFor({ state: 'visible', timeout: 90_000 });
    assert.equal(await page.getByRole('button', { name: 'Continue in workspace' }).count(), 0);
    assert.match(await page.locator('#download-result').getAttribute('download'), /\.zip$/);
  });
  await check('homepage and workspace fit phone, tablet and desktop widths', async () => {
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:1000});
      for(const path of ['/','/tools/workspace/?demo=text']) {
        await page.goto(base+path); if(path.includes('demo')) {
          await engine().locator('#ocr-run').waitFor();
          assert.equal(await engine().locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`embedded tool ${width}`);
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${path} ${width}`);
      }
      await page.screenshot({path:resolve(out,`workspace-${width}.png`),fullPage:true});
    }
  });
  assert.deepEqual(errors,[]); assert.deepEqual(requests,[]);
  console.log('PASS local request policy and JavaScript errors');
} finally { await browser.close(); }
