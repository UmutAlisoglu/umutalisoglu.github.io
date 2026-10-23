import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://127.0.0.1:8780';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage();
const errors=[],outbound=[];
page.on('pageerror',error=>errors.push(error.message));
context.on('request',request=>{if(!/^(?:data:|blob:)/.test(request.url())&&(request.method()!=='GET'||new URL(request.url()).origin!==new URL(base).origin))outbound.push(request.url());});
const form=()=>page.locator('[data-conversion-form]');
async function choose(from,to){await page.goto(base+'/tools/');await form().locator('[name=from]').selectOption(from);await form().locator('[name=to]').selectOption(to);}
async function download(button){const pending=page.waitForEvent('download');await button.click();const file=await pending;return {name:file.suggestedFilename(),bytes:await readFile(await file.path())};}
try{
  await page.goto(base+'/tools/');assert.equal(await form().isVisible(),true);
  assert.match(await page.locator('.conversion-facts').innerText(),/DOCX up to 10 MB/);
  assert.match(await page.locator('.conversion-facts').innerText(),/flattened page images/);
  await form().locator('[name=from]').selectOption('pptx');assert.match(await page.locator('.conversion-facts').innerText(),/1–20 slides/);
  await form().locator('[name=from]').selectOption('heic');assert.deepEqual(await form().locator('[name=to] option').evaluateAll(nodes=>nodes.map(n=>n.value)),['jpg']);
  await choose('pdf','txt');assert.match(await page.locator('.conversion-facts').innerText(),/without OCR/);
  await page.goto(base+'/tools/?from=json&to=csv');assert.equal(await form().locator('[name=to]').inputValue(),'csv');
  console.log('PASS picker shows supported outputs, accurate limits and format-only deep links.');

  await choose('png','jpg');await form().getByRole('button',{name:'Open converter'}).click();
  await page.waitForURL('**/tools/image-converter/?format=jpg');assert.equal(await page.locator('[name=format]').inputValue(),'jpg');
  const png=Buffer.from(await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=24;c.height=16;c.getContext('2d').fillRect(0,0,24,16);return [...new Uint8Array(await(await new Promise(r=>c.toBlob(r))).arrayBuffer())];}));
  await page.locator('#files').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:png});
  await page.locator('#conversion-form button[type=submit]').click();await page.locator('#result').waitFor({state:'visible'});
  const image=await download(page.locator('#download-result'));assert.match(image.name,/\.jpg$/);assert.deepEqual([...image.bytes.subarray(0,2)],[255,216]);
  console.log('PASS PNG → JPG opens the requested format and produces an actual JPEG.');

  await choose('pdf','jpg');await form().getByRole('button',{name:'Open converter'}).click();await page.waitForURL('**/tools/pdf-to-images/?format=jpg');
  assert.equal(await page.locator('#pdf-format').inputValue(),'jpg');
  const pdf=await PDFDocument.create();pdf.addPage([120,80]);
  await page.locator('#advanced-input').setInputFiles({name:'page.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.locator('#advanced-run').click();await page.locator('#advanced-result').waitFor({state:'visible'});
  const pageImage=await download(page.locator('#advanced-download'));assert.match(pageImage.name,/\.jpg$/);assert.deepEqual([...pageImage.bytes.subarray(0,2)],[255,216]);
  console.log('PASS PDF → JPG retains the requested format and produces an actual page image.');

  await choose('json','csv');await form().getByRole('button',{name:'Open converter'}).click();await page.waitForURL('**/tools/csv-json/?format=csv');
  assert.equal(await page.locator('#document-settings [name=format]').inputValue(),'csv');
  await page.locator('#document-text').fill('[{"name":"Sample","count":2}]');await page.locator('#document-run').click();await page.locator('#document-result').waitFor({state:'visible'});
  const csv=await download(page.locator('#document-download'));assert.match(csv.name,/\.csv$/);assert.equal(csv.bytes.toString('utf8').replace(/^\uFEFF/,''),'"name","count"\r\n"Sample","2"');
  console.log('PASS JSON → CSV opens in the right direction and exports real CSV data.');

  await page.goto(base+'/tools/image-converter/?format=unsupported');assert.equal(await page.locator('[name=format]').inputValue(),'webp');
  await page.goto(base+'/tools/pdf-to-images/?format=unsupported');assert.equal(await page.locator('#pdf-format').inputValue(),'png');
  await page.goto(base+'/tools/');assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);
  await mkdir('.local/browser-check/conversion-picker',{recursive:true});
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});await page.goto(base+'/tools/');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}px`);
    await page.locator('[data-conversion-picker]').screenshot({path:`.local/browser-check/conversion-picker/${width}.png`});
  }
  const staticContext=await browser.newContext({javaScriptEnabled:false});const staticPage=await staticContext.newPage();await staticPage.goto(base+'/tools/');
  assert.equal(await staticPage.locator('[data-conversion-fallback]').isVisible(),true);assert.equal(await staticPage.locator('[data-conversion-form]').isVisible(),false);
  await staticPage.locator('[data-conversion-fallback] a').first().click();assert.equal(new URL(staticPage.url()).pathname,'/tools/word-to-pdf/');await staticContext.close();
  assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
  console.log('PASS mobile layouts, no-JavaScript fallback, unknown-preset handling and no uploads or preference storage.');
}finally{await browser.close();}
