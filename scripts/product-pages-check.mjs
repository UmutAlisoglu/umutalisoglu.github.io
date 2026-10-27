import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const out = '.local/product-pages-check'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  const errors = [], mediaRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\.webm(?:\?|$)/.test(request.url())) mediaRequests.push(request.url()); });
  await page.goto(base + '/projects/fileforge/');
  assert.equal(await page.locator('.edition-choice').count(), 1);
  assert.equal(await page.locator('.product-demo').count(), 1);
  assert.equal(await page.locator('video').getAttribute('autoplay'), null);
  assert.deepEqual(mediaRequests, []);
  await page.locator('video').evaluate(async video => { video.muted = true; await video.play(); });
  await page.waitForFunction(() => document.querySelector('video').currentTime > .3);
  const duration = await page.locator('video').evaluate(video => { video.pause(); return video.duration; });
  assert.ok(duration > 5 && duration < 25);
  assert.equal(await page.locator('#fileforge-demo-transcript').count(), 1);
  await page.locator('#fileforge-demo-transcript summary').click();
  assert.match(await page.locator('#fileforge-demo-transcript').textContent(), /1600 px/);
  console.log('PASS actual recording decodes, requires playback action and has a written alternative.');

  await page.goto(base + '/projects/repodock/');
  for (const [step, match] of [['1', /runtime and dependencies/], ['2', /CPU, memory and uptime/], ['0', /GitHub repository link/]]) {
    const button = page.locator(`[data-tour-step="${step}"]`); await button.focus(); await button.press('Enter');
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('[data-tour-caption]').textContent(), match);
  }
  assert.match(await page.locator('[data-product-tour]').textContent(), /screenshot walkthrough/);
  await page.goto(base + '/downloads/');
  assert.match(await page.locator('.release-footnote').textContent(), /27 October 2026/);
  for (const disclosure of await page.locator('.release-changes').all()) { await disclosure.locator('summary').click(); assert.equal(await disclosure.locator('a').isVisible(), true); }
  const manifest = await (await page.request.get(base + '/offline-manifest.json')).json();
  assert.doesNotMatch(JSON.stringify(manifest), /fileforge-attachment|attachment-poster/);
  console.log('PASS keyboard walkthrough, release details and media exclusion from offline tool packs.');

  await page.goto(base + '/tools/workspace/?job=product');
  const image = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 200;
    const context = canvas.getContext('2d'); context.fillStyle = '#6490c0'; context.fillRect(0, 0, 200, 200);
    return [...new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve))).arrayBuffer())];
  }));
  let held;
  await page.route('**/*.onnx', route => { held = route; });
  await page.locator('[data-workspace-input]').setInputFiles({ name: 'cancel-sample.png', mimeType: 'image/png', buffer: image });
  const engine = page.frameLocator('[data-workspace-frame] iframe');
  await engine.locator('#advanced-run:not(:disabled)').waitFor(); await engine.locator('#advanced-run').click();
  await page.locator('[data-workspace-cancel]').click();
  await engine.locator('#advanced-status').filter({ hasText: /Cancelled/ }).waitFor();
  assert.equal(await page.locator('[data-workspace-result]').isVisible(), false);
  assert.equal(await page.locator('[data-workspace-file-name]').textContent(), 'cancel-sample.png');
  if (held) await held.abort().catch(() => {});
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  console.log('PASS shared Cancel control stops a real job and preserves its source.');

  for (const [path, name, width] of [
    ['/', 'home-desktop', 1440], ['/tools/workspace/', 'quick-jobs-desktop', 1440],
    ['/tools/workspace/', 'quick-jobs-mobile', 390], ['/projects/fileforge/', 'fileforge', 1440],
    ['/projects/repodock/', 'repodock', 1440], ['/downloads/', 'downloads-mobile', 390],
  ]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(base + path);
    await page.evaluate(async () => {
      document.querySelectorAll('img[loading=lazy]').forEach(image => { image.loading = 'eager'; });
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('PASS product and Quick Job screenshots, responsive layouts and no JavaScript errors.');
} finally { await browser.close(); }
