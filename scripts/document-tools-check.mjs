import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { documentTools, toolCatalog } from '../src/site/tool-catalog.js';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const fixtures = resolve('tests/fixtures/documents'), out = resolve('.local/document-check'); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage(), errors = [], outbound = [];
context.on('page', p => p.on('pageerror', error => errors.push(error.message))); page.on('pageerror', error => errors.push(error.message));
context.on('request', request => { if (/^https?:/.test(request.url()) && (request.method() !== 'GET' || new URL(request.url()).origin !== new URL(base).origin)) outbound.push(request.url()); });
page.on('console', message => { if (message.type() === 'error') console.log('BROWSER', message.text().slice(0,250)); });
const check = async (name, fn) => { await fn(); console.log(`PASS ${name}`); };
async function waitResult(selector = '#document-result') {
  await page.waitForFunction(selector => !document.querySelector(selector).hidden || document.querySelector('#document-status').classList.contains('is-error'), selector, { timeout: 90000 });
  assert.equal(await page.locator('#document-status').evaluate(node => node.classList.contains('is-error')), false, await page.locator('#document-status').innerText());
  await page.locator(selector).waitFor();
}
async function download() { const pending = page.waitForEvent('download'); await page.locator('#document-download').click(); const d = await pending; return readFile(await d.path()); }
const officePDFs = [];
try {
  await check('Word and PowerPoint previews export real, two-page PDFs with visible artwork', async () => {
    for (const [slug, extension] of [['word-to-pdf','docx'],['powerpoint-to-pdf','pptx']]) {
      await page.goto(`${base}/tools/${slug}/`);
      await page.locator('#document-input').setInputFiles(resolve(fixtures, `sample.${extension}`));
      await page.locator('#document-run').click(); await waitResult('#document-preview');
      assert.equal(await page.locator('#document-page option').count(), 2, `${slug} page count`);
      const image = await page.locator('#document-preview-image').evaluate(async img => {
        const bitmap = await createImageBitmap(await (await fetch(img.src)).blob()); const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; const x = c.getContext('2d'); x.drawImage(bitmap,0,0); const data=x.getImageData(0,0,c.width,c.height).data; let colourful=0,dark=0; for(let i=0;i<data.length;i+=4){ if(Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>50)colourful++; if(data[i]<100&&data[i+1]<100&&data[i+2]<100)dark++; } return {colourful,dark};
      });
      assert.ok(image.colourful > 1000, `embedded artwork: ${JSON.stringify(image)}`); assert.ok(image.dark > 100, `visible text: ${JSON.stringify(image)}`);
      await page.locator('#document-page').selectOption('1'); await page.screenshot({ path: resolve(out, `${slug}-preview.png`), fullPage: true });
      await page.locator('#document-export').click(); await waitResult();
      const bytes = await download(), pdf = await PDFDocument.load(bytes); assert.equal(pdf.getPageCount(),2);
      assert.ok(pdf.getPage(0).getWidth() > 500); officePDFs.push(bytes);
      assert.equal(await page.getByRole('button',{name:'Continue in workspace'}).isVisible(),true);
      await page.locator('#document-clear').click(); assert.equal(await page.locator('#document-result').isVisible(),false); assert.equal(await page.locator('#document-preview').isVisible(),false);
    }
  });
  await check('Office external relationships are removed; cancel and malformed files recover without stale exports', async () => {
    const entries = unzipSync(new Uint8Array(await readFile(resolve(fixtures,'sample.docx'))));
    const rel = 'word/_rels/document.xml.rels'; entries[rel]=strToU8(strFromU8(entries[rel]).replace('</Relationships>', '<Relationship Id="external-image" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://external.invalid/tracker.png" TargetMode="External"/></Relationships>'));
    await page.goto(base+'/tools/word-to-pdf/'); await page.locator('#document-input').setInputFiles({name:'external.docx',mimeType:'application/octet-stream',buffer:Buffer.from(zipSync(entries))});
    await page.locator('#document-run').click(); await waitResult('#document-preview'); assert.match(await page.locator('#document-warning').innerText(),/Linked external content/);
    await page.locator('#document-run').click(); await page.locator('#document-cancel').click(); assert.match(await page.locator('#document-status').innerText(),/Cancelled/); assert.equal(await page.locator('iframe.office-engine').count(),0);
    await page.locator('#document-input').setInputFiles({name:'bad.docx',mimeType:'application/octet-stream',buffer:Buffer.from('not a docx')}); await page.locator('#document-run').click();
    await page.waitForFunction(()=>document.querySelector('#document-status').classList.contains('is-error')); assert.equal(await page.locator('#document-export').isDisabled(),true);
  });
  await check('text PDF preserves selectable multilingual text and PDF text extraction handles page ranges and scan guidance', async () => {
    await page.goto(base+'/tools/text-to-pdf/'); await page.locator('#document-sample').click(); await page.locator('#document-run').click(); await waitResult();
    const bytes = await download(); assert.ok((await PDFDocument.load(bytes)).getPageCount()>=1);
    await page.goto(base+'/tools/pdf-to-text/'); await page.locator('#document-input').setInputFiles({name:'notes.pdf',mimeType:'application/pdf',buffer:bytes}); await page.locator('#document-run').click(); await waitResult();
    assert.match(await page.locator('#document-output').inputValue(),/Merhaba/); assert.match(await page.locator('#document-output').inputValue(),/Your files stay/);
    await page.locator('#document-output').fill('Edited output, kept local.'); assert.equal((await download()).toString(),'Edited output, kept local.');
    await page.locator('[name=pages]').fill('999'); assert.equal(await page.locator('#document-result').isVisible(),false); await page.locator('#document-run').click(); await page.waitForFunction(()=>document.querySelector('#document-status').classList.contains('is-error'));
    await page.locator('#document-input').setInputFiles({name:'flattened.pdf',mimeType:'application/pdf',buffer:officePDFs[0]}); await page.locator('[name=pages]').fill(''); await page.locator('#document-run').click(); await page.waitForFunction(()=>document.querySelector('#document-status').classList.contains('is-error')); assert.match(await page.locator('#document-status').innerText(),/OCR/);
  });
  await check('CSV and JSON conversion downloads correct contents and input changes invalidate old exports', async () => {
    await page.goto(base+'/tools/csv-json/'); await page.locator('#document-text').fill('name,code\nAda,001'); await page.locator('#document-run').click(); await waitResult();
    assert.deepEqual(JSON.parse((await download()).toString()),[{name:'Ada',code:'001'}]);
    await page.locator('#document-text').fill('[{"name":"=1+1","n":-5}]'); assert.equal(await page.locator('#document-result').isVisible(),false);
    await page.locator('[name=format]').selectOption('csv'); await page.locator('#document-run').click(); await waitResult(); assert.match((await download()).toString(),/'=1\+1/);
  });
  await check('new formats enter the connected workspace and Office PDF output continues to page tools', async () => {
    await page.goto(base+'/tools/workspace/'); await page.locator('[data-workspace-input]').setInputFiles(resolve(fixtures,'sample.pptx'));
    const engine=page.frameLocator('[data-workspace-frame] iframe'); await engine.locator('#document-run:not(:disabled)').waitFor(); await engine.locator('#document-run').click(); await engine.locator('#document-preview').waitFor({timeout:90000}); await engine.locator('#document-export').click(); await page.locator('[data-workspace-result]').waitFor({timeout:90000}); assert.equal(await page.locator('[data-workspace-continue=organize]').isVisible(),true);
    await page.locator('[data-workspace-continue=organize]').click(); await engine.locator('#file-list li').first().waitFor(); assert.match(await engine.locator('#selection-summary').innerText(),/1 file/);
  });
  await check('new pages fit phones and carry accessible navigation, metadata and discovery links', async () => {
    for(const width of [320,390,768,1440]) { await page.setViewportSize({width,height:1000}); for(const tool of documentTools){await page.goto(`${base}/tools/${tool.slug}/`); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${tool.slug} ${width}`);assert.equal(await page.locator('h1').count(),1); const schema=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());assert.ok(schema['@graph'].some(item=>item['@type']==='WebApplication'&&item.isAccessibleForFree));} }
    await page.goto(base+'/tools/');assert.equal(await page.locator('[data-tool-results] .task-card').count(),toolCatalog.length);
    const llms=await context.request.get(base+'/llms.txt');assert.equal(llms.status(),200);assert.match(await llms.text(),/fan project/);
    for(const path of ['/llm.txt','/llms-full.txt','/tools/word-to-pdf/index.md'])assert.equal((await context.request.get(base+path)).status(),200,path);
    await page.setViewportSize({width:390,height:1000});await page.goto(base+'/tools/word-to-pdf/');await page.screenshot({path:resolve(out,'word-mobile.png'),fullPage:true});
  });
  await check('optional Office pack renders and exports after the network is disconnected', async () => {
    const offlineContext = await browser.newContext();
    try {
      const offlinePage = await offlineContext.newPage();
      await offlinePage.goto(base+'/tools/workspace/');
      await offlinePage.locator('[data-open-offline]').first().click();
      await offlinePage.locator('[data-offline-group=office]').check();
      await offlinePage.locator('[data-offline-save]').click();
      await offlinePage.locator('[data-offline-badge]').filter({hasText:/^Offline ready$/}).waitFor({timeout:180000});
      await offlineContext.setOffline(true);
      const localPage = await offlineContext.newPage();
      await localPage.goto(base+'/tools/powerpoint-to-pdf/');
      await localPage.locator('#document-input').setInputFiles(resolve(fixtures,'sample.pptx'));
      await localPage.locator('#document-run').click();
      await localPage.waitForFunction(()=>!document.querySelector('#document-preview').hidden||document.querySelector('#document-status').classList.contains('is-error'),null,{timeout:90000});
      assert.equal(await localPage.locator('#document-status').evaluate(node=>node.classList.contains('is-error')),false,await localPage.locator('#document-status').innerText());
      await localPage.locator('#document-export').click();await localPage.locator('#document-result').waitFor();
      const bytes=await localPage.evaluate(async()=>Array.from(new Uint8Array(await(await fetch(document.querySelector('#document-download').href)).arrayBuffer())));
      assert.equal((await PDFDocument.load(new Uint8Array(bytes))).getPageCount(),2);
    }finally{await offlineContext.close();}
  });
  assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);console.log('PASS no browser errors, uploads or external runtime requests.');
} finally { await browser.close(); }
