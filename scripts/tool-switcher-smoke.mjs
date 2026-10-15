import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const output = resolve('.local/browser-check/tool-switcher');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [], outbound = [];
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => {
  if (/^(?:blob:|data:)/.test(request.url())) return;
  if (request.method() !== 'GET' || new URL(request.url()).origin !== new URL(base).origin) outbound.push(request.url());
});
const finder = () => page.getByRole('dialog', { name: 'Find a tool', exact: true });
const query = () => finder().getByRole('searchbox', { name: 'What would you like to do?' });
const check = async (name, run) => { await run(); console.log(`PASS ${name}`); };
async function open() { await page.locator('[data-open-tools]').first().click(); await finder().waitFor(); }
async function focusedTool() { return page.evaluate(() => document.activeElement?.dataset.switcherTool || null); }

try {
  await page.goto(base + '/tools/');
  await check('native tool finder has a labelled search, keyboard navigation and restored focus', async () => {
    await open();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tool-switcher-query');
    assert.equal(await finder().locator('[data-switcher-tool]').count(), 13);
    await query().press('ArrowDown'); assert.equal(await focusedTool(), 'image-pdf');
    await page.keyboard.press('ArrowDown'); assert.equal(await focusedTool(), 'background');
    await page.keyboard.press('ArrowUp'); assert.equal(await focusedTool(), 'image-pdf');
    await page.keyboard.press('ArrowUp'); assert.equal(await focusedTool(), 'scanner');
    await page.keyboard.press('Escape');
    assert.equal(await finder().count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-open-tools')), true);
    await page.keyboard.press('Control+k'); await finder().waitFor();
    await query().press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-close-tools')), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await focusedTool(), 'scanner', 'Native modal keeps focus inside the finder');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+k'); await finder().waitFor();
    await page.keyboard.press('Escape');
  });
  await check('supported conversions and synonyms open exact destinations; unsupported directions stay empty', async () => {
    await open();
    for (const [text, id, href] of [
      ['PNG to PDF', 'image-pdf', '/tools/image-converter/?format=pdf'],
      ['pdf → png', 'pdf-images', '/tools/pdf-to-images/'],
      ['remove bg', 'background', '/tools/remove-background/'],
      ['jpg to svg', 'svg', '/tools/image-to-svg/'],
      ['png to txt', 'text', '/tools/extract-text/'],
      ['video smaller', 'video', '/tools/video-compressor/'],
    ]) {
      await query().fill(text);
      assert.equal(await finder().locator('[data-switcher-tool]').count(), 1, text);
      assert.equal(await finder().locator(`[data-switcher-tool="${id}"]`).getAttribute('href'), href, text);
    }
    await query().fill('SVG to PNG');
    assert.equal(await finder().locator('[data-switcher-tool]').count(), 0);
    assert.equal(await finder().getByText('No matching tools yet').isVisible(), true);
    const before = page.url(); await query().press('Enter'); assert.equal(page.url(), before);
    await query().fill('PNG to PDF'); await query().press('Enter');
    await page.waitForURL(base + '/tools/image-converter/?format=pdf');
    assert.equal(await page.locator('[name=format]').inputValue(), 'pdf');
    await page.locator('[name=width]').focus();
    await page.keyboard.press('Control+k'); await finder().waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[name=width]').evaluate(node => node === document.activeElement), true);
  });
  await check('active workspace offers only compatible tasks and switches in memory without navigation', async () => {
    await page.goto(base + '/tools/workspace/');
    const buffer = Buffer.from(await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 16;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#bc42b2'; ctx.fillRect(0, 0, 24, 16);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return [...new Uint8Array(await blob.arrayBuffer())];
    }));
    await page.locator('[data-workspace-input]').setInputFiles({ name: 'finder-test.png', mimeType: 'image/png', buffer });
    await page.locator('[data-workspace-session]').waitFor({ state: 'visible' });
    await open();
    assert.equal(await finder().locator('[data-switcher-tool]').count(), 8);
    assert.equal(await finder().locator('[data-switcher-tool=video]').count(), 0);
    assert.equal(await finder().locator('a[data-switcher-tool]').count(), 0);
    await query().fill('crop'); await query().press('Enter');
    const engine = page.frameLocator('[data-workspace-frame] iframe');
    await engine.locator('#crop-source').waitFor({ state: 'visible' });
    assert.equal(page.url(), base + '/tools/workspace/');
    assert.match(await engine.locator('#advanced-filename').innerText(), /finder-test\.png/);
    assert.equal(await engine.locator('#crop-width').inputValue(), '24');
    assert.equal(await engine.locator('#crop-height').inputValue(), '16');
    assert.equal(await page.locator('[data-workspace-tool-name]').evaluate(node => node === document.activeElement), true, 'Opened tool heading receives focus after the dialog closes');
    await engine.locator('#crop-width').press('Control+k'); await finder().waitFor();
    assert.equal(await engine.locator('.tool-switcher[open]').count(), 0, 'Embedded engine opens its owning workspace finder');
    assert.equal(await finder().locator('button[data-switcher-tool]').count(), 8);
    await page.keyboard.press('Escape');
    assert.equal(page.url(), base + '/tools/workspace/');
    await open();
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('fileforge:workspace-state', { detail: { active: true, compatibleIDs: ['crop', 'image'], busy: true } })));
    assert.equal(await finder().locator('button[data-switcher-tool]').count(), 2);
    assert.equal(await finder().locator('button[data-switcher-tool]:disabled').count(), 2);
    assert.match(await finder().getByRole('status').innerText(), /Finish or cancel/);
    await query().press('Enter'); assert.equal(await finder().isVisible(), true);
    await page.keyboard.press('Escape');
    await open(); // The request event must replace stale state with the real controller state.
    assert.equal(await finder().locator('button[data-switcher-tool]').count(), 8);
    assert.equal(await finder().locator('button[data-switcher-tool]:disabled').count(), 0);
    await page.keyboard.press('Escape');
    await page.locator('[data-workspace-clear]').click();
    await open(); assert.equal(await finder().locator('a[data-switcher-tool]').count(), 13);
    await page.keyboard.press('Escape');
  });
  await check('finder fits 320px, tablet and desktop without horizontal overflow', async () => {
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await open();
      const bounds = await finder().boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `${width}px dialog fits viewport`);
      assert.equal(await finder().evaluate(node => node.scrollWidth <= node.clientWidth), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: resolve(output, `finder-${width}.png`), fullPage: true });
      await finder().getByRole('button', { name: 'Close tool finder' }).click();
    }
  });
  assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  console.log('PASS no external requests, uploads or JavaScript errors');
} finally { await browser.close(); }
