import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sitePaths, toolPages } from '../src/site/templates.js';
import { advancedTools } from '../src/site/tool-catalog.js';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const output = resolve('.local/browser-check'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [], outbound = [], links = new Set(), titles = new Set();
context.on('page', item => item.on('pageerror', error => errors.push(error.message)));
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => {
  if (request.method() !== 'GET' || (!request.url().startsWith('blob:') && new URL(request.url()).origin !== new URL(base).origin)) outbound.push(`${request.method()} ${request.url()}`);
});
const check = async (label, run) => { await run(); console.log(`PASS ${label}`); };
async function resultPDF() {
  await page.waitForFunction(() => !document.querySelector('#result').hidden, null, { timeout: 30_000 });
  const pending = page.waitForEvent('download'); await page.locator('#download-result').click();
  const download = await pending; const file = resolve(output, download.suggestedFilename()); await download.saveAs(file);
  return PDFDocument.load(await readFile(file));
}
try {
  await check('all pages render complete HTML with unique titles, canonical URLs and navigation', async () => {
    for (const path of sitePaths) {
      const response = await page.goto(base + path); assert.equal(response.status(), 200, path);
      const source = await response.text(); assert.doesNotMatch(source, /<site-header|<site-footer|<fileforge-workspace/, path);
      assert.equal(await page.locator('h1').count(), 1, path);
      const title = await page.title(); assert.ok(!titles.has(title), title); titles.add(title);
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), `https://alisoglu.com${path}`);
      assert.equal(await page.locator('header nav [aria-current]').count(), path === '/privacy/' ? 0 : 1, path);
      assert.equal(await page.locator('footer a[href="/privacy/"]').count(), 1);
      const duplicates = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(node => node.id); return ids.filter((id, index) => ids.indexOf(id) !== index); });
      assert.deepEqual(duplicates, [], path);
      for (const href of await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.href))) {
        const url = new URL(href); if (url.origin === new URL(base).origin) links.add(url.pathname + url.hash);
      }
    }
  });
  await check('internal destinations, fragments and sitemap entries resolve', async () => {
    for (const href of links) {
      const [path, fragment] = href.split('#');
      // GitHub serves the game from a separate repository; it isn't in local dist.
      const destination = path.startsWith('/skate-scape/') ? `https://alisoglu.com${path}` : base + path;
      const response = await context.request.get(destination); assert.equal(response.status(), 200, href);
      if (fragment) assert.ok((await response.text()).includes(`id="${fragment}"`), `Missing fragment: ${href}`);
    }
    const sitemap = await (await context.request.get(base + '/sitemap.xml')).text();
    for (const path of sitePaths) assert.ok(sitemap.includes(`<loc>https://alisoglu.com${path}</loc>`), path);
  });
  await check('dedicated URLs select the right tool and retain it through reload and anchor changes', async () => {
    for (const tool of toolPages) {
      await page.goto(`${base}/tools/${tool.slug}/`);
      assert.equal(await page.locator('body').getAttribute('data-fileforge-tool'), tool.id);
      assert.equal(await page.locator(`.tool-nav a[aria-current]`).getAttribute('href'), `/tools/${tool.slug}/`);
      assert.equal(await page.locator('#tool-panel').getAttribute('aria-labelledby'), 'tool-title');
      await page.locator('#conversion-form button[type=submit]').click(); assert.match(await page.locator('#job-status').innerText(), /Choose a file/);
      await page.evaluate(() => { location.hash = 'faq-title'; }); await page.reload();
      assert.equal(await page.locator('#video-note').isVisible(), tool.id === 'video');
      assert.equal(await page.locator(`[data-options="${tool.id}"]`).isVisible(), tool.id !== 'merge');
    }
  });
  await check('dedicated image page produces a real PDF and retains the original studio deep links', async () => {
    await page.goto(base + '/tools/image-converter/#video');
    const image = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 100; c.height = 50; const ctx = c.getContext('2d'); ctx.fillStyle = '#6045e9'; ctx.fillRect(0, 0, 100, 50); return Array.from(new Uint8Array(await (await new Promise(resolve => c.toBlob(resolve))).arrayBuffer())); });
    await page.locator('#files').setInputFiles({ name: 'example.png', mimeType: 'image/png', buffer: Buffer.from(image) });
    await page.locator('[name=format]').selectOption('pdf'); await page.locator('#conversion-form button[type=submit]').click();
    assert.equal((await resultPDF()).getPageCount(), 1);
    await page.goto(base + '/tools/fileforge/#organize'); assert.equal(await page.locator('#tab-organize').getAttribute('aria-selected'), 'true');
    await page.locator('#tab-organize').press('ArrowRight'); assert.equal(await page.locator('#tab-spreadsheet').getAttribute('aria-selected'), 'true');
  });
  await check('dedicated organizer and spreadsheet routes export valid documents', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage([300, 400]); pdf.addPage([500, 600]);
    await page.goto(base + '/tools/pdf-organizer/'); await page.locator('#files').setInputFiles({ name: 'example.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
    await page.locator('#conversion-form button[type=submit]').click(); await page.locator('.page-card').last().waitFor();
    await page.locator('.page-card').first().getByRole('button', { name: /Rotate clockwise/ }).click();
    await page.locator('#conversion-form button[type=submit]').click(); const result = await resultPDF(); assert.equal(result.getPage(0).getRotation().angle, 90); assert.equal(result.getPageCount(), 2);
    await page.goto(base + '/tools/excel-to-pdf/'); await page.locator('#files').setInputFiles({ name: 'example.csv', mimeType: 'text/csv', buffer: Buffer.from('Item,Count\nBoards,2\nWheels,8') });
    await page.locator('#conversion-form button[type=submit]').click(); assert.equal((await resultPDF()).getPageCount(), 1);
  });
  await check('feedback stays local, escapes text, routes drafts correctly and clears stale previews', async () => {
    await page.goto(base + '/contact/');
    assert.equal(await page.locator('a[href="mailto:umu@alisoglu.com"]').count(), 1);
    await page.locator('#feedback-title-input').fill('A test & an idea'); await page.locator('#feedback-details').fill('<script>alert("test")</script>\nSteps: open a tool.');
    for (const [project, repo] of [['website', 'umutalisoglu.github.io'], ['fileforge', 'fileforge'], ['repodock', 'repodock'], ['skate-scape', 'skate-scape']]) {
      await page.locator('#feedback-project').selectOption(project);
      assert.equal(await page.locator('#feedback-preview').isVisible(), false);
    await page.getByRole('button', { name: 'Preview my report' }).click();
      const url = new URL(await page.locator('#feedback-github').getAttribute('href'));
      assert.equal(url.pathname, `/UmutAlisoglu/${repo}/issues/new`); assert.equal(url.searchParams.get('title'), 'A test & an idea'); assert.match(url.searchParams.get('body'), /<script>/);
      assert.equal(await page.locator('#feedback-draft script').count(), 0);
    }
    await page.locator('#feedback-details').fill('Edited draft'); assert.equal(await page.locator('#feedback-preview').isVisible(), false); assert.equal(await page.locator('#feedback-github').getAttribute('href'), null);
    await page.reload(); assert.equal(await page.locator('#feedback-details').inputValue(), '');
    await page.locator('#feedback-title-input').fill('Unicode report');
    await page.locator('#feedback-details').fill('例'.repeat(1500));
    await page.getByRole('button', { name: 'Preview my report' }).click();
    assert.equal(await page.locator('#feedback-preview').isVisible(), false);
    assert.match(await page.locator('#feedback-details').evaluate(node => node.validationMessage), /too long/);
  });
  await check('homepage shortcuts and the idea machine work', async () => {
    await page.goto(base); assert.equal(await page.locator('#quick-tools .task-card').count(), 4);
    await page.locator('#quick-tools .task-card').first().click(); assert.ok(page.url().includes('/tools/pdf-organizer/'));
    await page.goto(base); await page.locator('#surprise-button').click(); assert.equal(await page.locator('#prompt-result').isVisible(), true);
  });
  await check('all pages fit desktop, tablet and narrow phones', async () => {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of sitePaths) {
        await page.goto(base + path);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} @ ${width}px`);
        assert.equal(await page.getByRole('navigation').getByRole('link', { name: 'Tools', exact: true }).isVisible(), true);
        const brokenImages = await page.locator('img[src]').evaluateAll(images => images.filter(image => image.complete && !image.naturalWidth).map(image => image.src)); assert.deepEqual(brokenImages, [], path);
      }
    }
  });
  for (const [path, name, width] of [['/', 'hub-home', 1440], ['/', 'hub-home-mobile', 390], ['/tools/pdf-organizer/', 'hub-organizer', 1440], ['/projects/fileforge/', 'hub-fileforge', 1440], ['/projects/repodock/', 'hub-repodock', 1440], ['/games/', 'hub-games', 1440], ['/contact/', 'hub-contact-mobile', 390]]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(base + path); await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  }
  await check('navigation and page content remain available without JavaScript', async () => {
    const staticContext = await browser.newContext({ javaScriptEnabled: false }); const staticPage = await staticContext.newPage();
    await staticPage.goto(base + '/tools/pdf-organizer/'); assert.equal(await staticPage.locator('.tool-nav a').count(), toolPages.length + advancedTools.length); assert.equal(await staticPage.locator('noscript').isVisible(), true);
    await staticPage.getByRole('navigation').getByRole('link', { name: 'Projects', exact: true }).click(); assert.equal(await staticPage.locator('.project-row').count(), 3);
    await staticPage.goto(base + '/contact/'); assert.equal(await staticPage.locator('#feedback-form').isVisible(), false); assert.equal(await staticPage.locator('a[href="mailto:umu@alisoglu.com"]').isVisible(), true); await staticContext.close();
  });
  assert.deepEqual(errors, [], 'No browser errors'); assert.deepEqual(outbound, [], 'No uploads or external runtime requests');
  console.log('PASS privacy: all runtime requests are same-site GETs; no issues submitted');
} finally { await browser.close(); }
