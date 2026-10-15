import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const base=process.env.TEST_URL||'http://127.0.0.1:8780';
const out=resolve('.local/browser-check/workflow-refinement'); await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}), page=await context.newPage();
const errors=[], requests=[];page.on('pageerror',error=>errors.push(error.message));
context.on('request',request=>{if(!/^(blob:|data:)/.test(request.url())&&(request.method()!=='GET'||new URL(request.url()).origin!==new URL(base).origin))requests.push(request.url());});
const frame=()=>page.frameLocator('[data-workspace-frame] iframe');
const check=async(name,run)=>{await run();console.log(`PASS ${name}`)};
async function output(){await page.locator('[data-workspace-result]').waitFor({state:'visible'});}
async function size(){return page.evaluate(async()=>{const img=await createImageBitmap(await(await fetch(document.querySelector('[data-workspace-download]').href)).blob());const value=[img.width,img.height];img.close();return value;});}
async function crop(){await page.locator('[data-workspace-tool=crop]').click();await frame().locator('#crop-width').waitFor();await frame().locator('#crop-width').fill('100');await frame().locator('#crop-height').fill('60');await frame().locator('#advanced-run').click();await output();}
try{
 await page.goto(base+'/tools/workspace/');
 const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=240;c.height=160;const x=c.getContext('2d');x.fillStyle='#124fc3';x.fillRect(0,0,240,160);return [...new Uint8Array(await(await new Promise(r=>c.toBlob(r))).arrayBuffer())]});
 const image={name:'original.png',mimeType:'image/png',buffer:Buffer.from(bytes)};
 await page.locator('[data-workspace-input]').setInputFiles(image);
 await check('keyboard choice keeps focus at the tool and brings it into view on a phone',async()=>{
  const button=page.locator('[data-workspace-tool=crop]');await button.focus();await button.press('Enter');await frame().locator('#crop-width').waitFor();
  assert.equal(await page.locator('[data-workspace-tool-name]').evaluate(el=>el===document.activeElement),true);
  await page.waitForFunction(()=>document.querySelector('.forge-stage-heading').getBoundingClientRect().top<100);
  await frame().locator('#crop-width').fill('100');await frame().locator('#crop-height').fill('60');await frame().locator('#advanced-run').click();await output();assert.deepEqual(await size(),[100,60]);
 });
 await check('sidebar carries the completed crop forward by default and preserves the renamed download',async()=>{
  assert.equal(await page.locator('[data-workspace-source=result]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-workspace-rename]').fill('Blue portrait');
  assert.equal(await page.locator('[data-workspace-download]').getAttribute('download'),'Blue portrait.png');
  await page.locator('[data-workspace-tool=image]').click();await frame().locator('#files').waitFor();
  assert.match(await frame().locator('#file-list').innerText(),/Blue portrait\.png/);
  await frame().locator('[name=format]').selectOption('png');await frame().locator('#conversion-form button[type=submit]').click();await output();assert.deepEqual(await size(),[100,60]);
  assert.doesNotMatch(await page.locator('[data-workspace-result-name]').innerText(),/fileforge-fileforge/);
 });
 await check('choosing Original starts a clearly separate branch using full source dimensions',async()=>{
  await page.locator('[data-workspace-source=original]').click();await page.locator('[data-workspace-tool=crop]').click();await frame().locator('#crop-width').waitFor();
  assert.equal(await frame().locator('#crop-width').inputValue(),'240');assert.equal(await frame().locator('#crop-height').inputValue(),'160');
  assert.equal(await page.locator('[data-workspace-steps] li').count(),0);
  await frame().locator('#advanced-run').click();await output();assert.deepEqual(await size(),[240,160]);
 });
 await check('paste supports screenshots while text fields retain normal clipboard behavior',async()=>{
  await page.locator('[data-workspace-clear]').click();
  assert.equal(await page.locator('[data-workspace-input]').evaluate(el=>el===document.activeElement),true,'Clear returns focus to the file launcher');
  await page.locator('[data-workspace-input]').evaluate((el,bytes)=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(bytes)],'pasted.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},bytes);
  await page.locator('[data-workspace-session]').waitFor({state:'visible'});assert.equal(await page.locator('[data-workspace-file-name]').innerText(),'pasted.png');
  const search=page.locator('[data-workspace-search]');await search.focus();await search.evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','crop');el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
  assert.equal(await page.locator('[data-workspace-file-name]').innerText(),'pasted.png');
  await page.locator('[data-workspace-tool=crop]').click();await frame().locator('#advanced-run:not(:disabled)').waitFor();
  await frame().locator('#advanced-input').evaluate((el,bytes)=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(bytes)],'child-paste.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},bytes);
  await page.waitForFunction(()=>document.querySelector('[data-workspace-file-name]').textContent==='child-paste.png');
  await page.screenshot({path:resolve(out,'workflow-phone.png'),fullPage:true});
 });
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log('PASS same-origin local processing and no JavaScript errors');
}finally{await browser.close()}
