import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const output = '.local/experience-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
try {
  let page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  const finder = page.locator('[data-open-tools]');
  await finder.click();
  await page.locator('#tool-switcher-query').fill('merge pdf');
  await page.locator('#tool-switcher-results a').first().click();
  assert.equal(new URL(page.url()).pathname, '/tools/merge-pdf/');
  console.log('PASS tool finder opens the requested tool directly from the home page.');

  await page.goto(base + '/tools/');
  const search = page.locator('[data-tool-directory] input[type=search]');
  await page.locator('[data-tool-category="Images"]').click();
  await search.fill('crop');
  await page.waitForURL(url => url.searchParams.get('q') === 'crop');
  const searchURL = page.url();
  assert.equal(new URL(searchURL).searchParams.get('category'), 'Images');
  assert.equal(new URL(searchURL).searchParams.get('q'), 'crop');
  await page.reload();
  assert.equal(await search.inputValue(), 'crop');
  assert.equal(await page.locator('[data-tool-category="Images"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-tool-results] a').count(), 1);
  await page.locator('.tool-search-clear').click();
  await page.waitForURL(url => !url.searchParams.has('q'));
  assert.equal(new URL(page.url()).searchParams.has('q'), false);
  console.log('PASS filtered searches survive reload and keep shareable task URLs.');

  await page.goto(base + '/tools/workspace/?demo=pdf');
  const engine = () => page.frameLocator('[data-workspace-frame] iframe');
  await engine().locator('#file-list li').first().waitFor();
  assert.equal(await page.locator('body.workspace-active').count(), 1);
  assert.equal(await page.locator('[data-workspace-step="edit"]').getAttribute('aria-current'), 'step');
  const launcher = await page.locator('.forge-launcher').boundingBox();
  assert.ok(launcher.height < 150, 'File picker compacts while working');
  await engine().locator('#conversion-form button[type=submit]').click();
  await engine().locator('.page-card').last().waitFor();
  await engine().locator('#conversion-form button[type=submit]').click();
  await page.locator('[data-workspace-result]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-workspace-step="download"]').getAttribute('aria-current'), 'step');
  await page.locator('[data-workspace-search]').fill('no matching tool');
  await page.locator('[data-workspace-reset]').click();
  assert.equal(await page.locator('[data-workspace-search]').inputValue(), '');
  assert.ok(await page.locator('[data-workspace-actions] [data-workspace-tool]').count() > 0);
  await page.locator('[data-workspace-input]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('A fresh start') });
  assert.equal(await page.locator('[data-workspace-file-name]').textContent(), 'notes.txt');
  await page.locator('[data-workspace-clear]').click();
  assert.equal(await page.locator('body.workspace-active').count(), 0);
  assert.equal(await page.locator('[data-workspace-session]').isVisible(), false);
  console.log('PASS compact workspace, export progress, reset and file replacement journey.');

  // A stalled frame must offer a way out without discarding the user's file.
  await page.route('**/tools/pdf-organizer/?workspace=1', route => route.abort());
  await page.clock.install();
  await page.goto(base + '/tools/workspace/?demo=pdf');
  await page.locator('[data-workspace-tool="organize"][aria-pressed=true]').waitFor();
  await page.clock.fastForward(21000);
  await page.locator('.forge-frame-recovery').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.forge-frame-recovery a').getAttribute('href'), '/tools/pdf-organizer/');
  assert.match(await page.locator('[data-workspace-file-name]').textContent(), /pdf/i);
  console.log('PASS stalled tool offers direct access while preserving the selected file.');
  await page.close();
  page = await browser.newPage({ reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));

  for (const [path, name, width] of [
    ['/', 'home-desktop', 1440], ['/', 'home-mobile', 390],
    ['/projects/', 'projects', 1440], ['/tools/', 'tools', 1440],
    ['/tools/workspace/?demo=pdf', 'workspace-mobile', 390],
  ]) {
    await page.unrouteAll({ behavior: 'wait' });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + path);
    if (path.includes('demo=')) await engine().locator('#file-list li').first().waitFor();
    await page.evaluate(async () => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.querySelectorAll('img[loading=lazy]').forEach(image => { image.loading = 'eager'; });
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      document.getAnimations().forEach(animation => animation.finish());
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('PASS responsive screenshots and no JavaScript errors.');
} finally { await browser.close(); }
