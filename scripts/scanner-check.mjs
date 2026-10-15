import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780', out = resolve('.local/browser-check/scanner'); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage(), errors = [], outbound = [];
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => { const url = request.url(); if (!/^(?:blob:|data:)/.test(url) && (request.method() !== 'GET' || new URL(url).origin !== new URL(base).origin)) outbound.push(`${request.method()} ${url}`); });
const check = async (label, fn) => { await fn(); console.log(`PASS ${label}`); };
async function idle() { await page.waitForFunction(() => document.querySelector('#advanced-workspace').getAttribute('aria-busy') === 'false', undefined, { timeout: 60_000 }); }
async function preview() { await page.locator('#scanner-run').click(); await idle(); assert.equal(await page.locator('#scanner-result').isVisible(), true, await page.locator('#scanner-status').innerText()); }
async function exportBytes(format) {
  await page.locator('#scanner-format').selectOption(format); await page.locator('#scanner-export').click(); await idle();
  await page.locator('#scanner-download').waitFor({ state: 'visible' });
  const pending = page.waitForEvent('download'); await page.locator('#scanner-download').click(); const download = await pending, path = resolve(out, download.suggestedFilename()); await download.saveAs(path);
  return { name: download.suggestedFilename(), bytes: await readFile(path) };
}
async function imageInfo(bytes) {
  return page.evaluate(async data => {
    const image = await createImageBitmap(new Blob([new Uint8Array(data)])), canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0, white = 0, gray = 0, binary = true;
    for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] < 65 && pixels[i + 1] < 65 && pixels[i + 2] < 65) dark++; if (pixels[i] > 245 && pixels[i + 1] > 245 && pixels[i + 2] > 245) white++; if (pixels[i] === pixels[i + 1] && pixels[i] === pixels[i + 2]) gray++; if (pixels[i] !== pixels[i + 1] || pixels[i] !== pixels[i + 2] || ![0,255].includes(pixels[i])) binary = false; }
    const samples = [[.08,.06],[.9,.2],[.8,.75]].map(([x,y]) => [...ctx.getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1).data]);
    const result = { width: image.width, height: image.height, dark, white: white/(image.width*image.height), gray: gray/(image.width*image.height), binary, samples };
    image.close(); canvas.width = canvas.height = 1; return result;
  }, [...bytes]);
}
try {
  await page.goto(base + '/tools/document-scanner/?sample=1');
  await check('generated angled paper straightens with real perspective correction and cleaner white paper', async () => {
    await preview(); assert.match(await page.locator('#scanner-filename').innerText(), /generated sample/);
    assert.equal(await page.locator('#scanner-x-0').inputValue(), '250');
    const file = await exportBytes('png'), info = await imageInfo(file.bytes);
    assert.deepEqual([info.width, info.height], [795,927]); assert.ok(info.dark > 5000, 'Printed text must survive'); assert.ok(info.white > .85, `Clean paper should be predominantly white: ${info.white}`);
    for (const sample of info.samples) assert.ok(sample[0] > 245 && sample[1] > 245 && sample[2] > 245, `Paper sample ${sample}`);
    assert.equal(await page.locator('.continue-workspace').isVisible(), true);
    await page.screenshot({ path: resolve(out,'document-scanner-desktop.png'), fullPage: true });
  });
  await check('four treatments and PNG, JPG, image PDF exports contain actual page data', async () => {
    const png = await exportBytes('png');
    const jpg = await exportBytes('jpg'); assert.match(jpg.name,/\.jpg$/); assert.deepEqual((await imageInfo(jpg.bytes)).width,795);
    const pdf = await exportBytes('pdf'), doc = await PDFDocument.load(pdf.bytes); assert.equal(doc.getPageCount(),1); assert.ok(doc.getPage(0).getWidth() < doc.getPage(0).getHeight());
    assert.ok(pdf.bytes.length > 10_000, 'Image PDF must contain document image bytes');
    for (const [mode, condition] of [['original',info=>info.white<.1], ['gray',info=>info.gray===1], ['bw',info=>info.binary]]) {
      await page.locator('#scanner-treatment').selectOption(mode); assert.equal(await page.locator('#scanner-result').isVisible(),false); await preview();
      const file=await exportBytes('png'), info=await imageInfo(file.bytes); assert.ok(condition(info),`${mode}: ${JSON.stringify(info)}`); assert.ok(info.dark>1000);
    }
    // Read the actual rectified scan with the existing OCR tool, proving the
    // sample contains legible document text instead of an illustrative mockup.
    await page.goto(base+'/tools/extract-text/');await page.locator('#ocr-input').setInputFiles({name:'straightened-scan.png',mimeType:'image/png',buffer:png.bytes});await page.locator('#ocr-run').click();await page.locator('#ocr-result').waitFor({state:'visible',timeout:120000});
    const text=await page.locator('#ocr-text').inputValue();assert.match(text,/A GOOD IDEA/i);assert.match(text,/Your files stay on your device/i);
  });
  await check('handles support keyboard, pointer and numeric corners; crossed corners cannot be scanned', async () => {
    await page.goto(base+'/tools/document-scanner/?sample=1');await page.locator('#scanner-run').click();await idle();
    const handle=page.locator('[data-corner="0"]');await handle.focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#scanner-x-0').inputValue(),'251');await page.keyboard.press('Shift+ArrowDown');assert.equal(await page.locator('#scanner-y-0').inputValue(),'70');
    await handle.scrollIntoViewIfNeeded();const rect=await handle.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+15,rect.y+rect.height/2+10);await page.mouse.up();assert.ok(Number(await page.locator('#scanner-x-0').inputValue())>251);
    await page.locator('.scanner-precise summary').click();await page.locator('#scanner-x-0').fill('1000');await page.locator('#scanner-y-0').fill('1000');assert.equal(await page.locator('#scanner-run').isDisabled(),true);assert.match(await page.locator('#scanner-status').innerText(),/clockwise|crossing|angle/);
    await page.locator('#scanner-reset').click();assert.equal(await page.locator('#scanner-run').isEnabled(),true);assert.equal(await page.locator('#scanner-x-0').inputValue(),'0');assert.equal(await page.locator('#scanner-x-2').inputValue(),'1149');
  });
  await check('cancellation terminates the local worker and clear revokes exported URLs', async () => {
    await page.evaluate(()=>{
      const node=document.querySelector('#scanner-status'), observer=new MutationObserver(()=>{if(node.textContent.startsWith('Straightening your document')){observer.disconnect();document.querySelector('#scanner-cancel').click();}});observer.observe(node,{subtree:true,childList:true,characterData:true});document.querySelector('#scanner-run').click();
    });await idle();assert.match(await page.locator('#scanner-status').innerText(),/Cancelled/);assert.equal(await page.locator('#scanner-result').isVisible(),false);
    await preview();await exportBytes('png');const old=await page.locator('#scanner-download').getAttribute('href');
    await page.locator('#scanner-input').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('not a photo')});assert.match(await page.locator('#scanner-filename').innerText(),/angled-page-sample/);assert.equal(await page.locator('#scanner-result').isVisible(),true);
    await page.locator('#scanner-clear').click();assert.equal(await page.locator('#scanner-editor').isVisible(),false);assert.equal(await page.locator('#scanner-result').isVisible(),false);assert.equal(await page.locator('#scanner-run').isDisabled(),true);
    assert.equal(await page.evaluate(async url=>{try{await fetch(url);return false;}catch{return true;}},old),true);
  });
  await check('phone and desktop scanner controls fit the viewport without external processing', async () => {
    await page.goto(base+'/tools/document-scanner/?sample=1');await preview();
    for(const width of[320,390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}px`);await page.screenshot({path:resolve(out,`scanner-${width}.png`),fullPage:true});}
    assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
  });
} finally { await browser.close(); }
