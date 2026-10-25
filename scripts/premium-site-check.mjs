import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
const output = resolve('.local/premium-check');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
const errors = [], outbound = [];
try {
  const context = await browser.newContext();
  context.on('request', request => {
    if (!/^(data:|blob:)/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) outbound.push(request.url());
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 1024, 768, 680, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/', '/about/', '/projects/', '/projects/fileforge/', '/projects/repodock/', '/tools/', '/tools/workspace/', '/contact/']) {
      await page.goto(base + path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} at ${width}px`);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), `https://alisoglu.com${path}`);
      if (width <= 680) {
        const menu = page.locator('.site-menu-toggle');
        await menu.waitFor();
        assert.equal(await page.locator('#site-navigation').isVisible(), false);
        await menu.click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('#site-navigation').isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await menu.getAttribute('aria-expanded'), 'false');
        assert.equal(await menu.evaluate(node => node === document.activeElement), true);
      } else {
        assert.equal(await page.locator('#site-navigation').isVisible(), true);
        assert.equal(await page.locator('.site-menu-toggle').isVisible(), false);
      }
    }
  }
  console.log('PASS responsive pages at six widths; mobile menu, Escape and focus restoration.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.locator('#site-navigation').getByRole('link', { name: 'About', exact: true }).click();
  await page.locator('.site-menu-toggle').waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).pathname, '/about/');
  assert.equal(await page.locator('#site-navigation').isVisible(), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#site-navigation').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#site-navigation').isVisible(), true);
  await page.goto(base);
  await page.getByRole('link', { name: 'Explore my work' }).click();
  await page.waitForFunction(() => {
    const heading = document.querySelector('#projects-title').getBoundingClientRect();
    return heading.top >= document.querySelector('.site-header-band').getBoundingClientRect().bottom && heading.bottom < innerHeight;
  });
  assert.ok(await page.locator('#projects-title').evaluate(node => node.getBoundingClientRect().top >= document.querySelector('.site-header-band').getBoundingClientRect().bottom));
  assert.equal(await page.locator('.site-header-band').evaluate(node => getComputedStyle(node).position), 'sticky');
  console.log('PASS navigation, viewport changes, project anchor and sticky header.');

  await page.goto(base);
  assert.doesNotMatch(await page.content(), /AI took over|Account of Umut/i);
  const graph = await page.locator('script[type="application/ld+json"]').evaluate(node => JSON.parse(node.textContent)['@graph']);
  assert.equal(graph.find(node => node['@type'] === 'WebSite').alternateName[0], 'Alisoglu');
  assert.match(await page.title(), /^Umut Alisoglu/);
  assert.match(await page.locator('meta[name=description]').getAttribute('content'), /Hi, I’m Umut/);
  assert.equal((await context.request.get(base + '/assets/favicon-96.png')).status(), 200);
  assert.equal((await context.request.get(base + '/assets/apple-touch-icon.png')).status(), 200);
  console.log('PASS clean title, description, identity schema and raster favicons.');

  const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(base);
  await reducedPage.locator('.premium-project').last().scrollIntoViewIfNeeded();
  assert.equal(await reducedPage.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0);
  assert.equal(await reducedPage.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
  await reduced.close();
  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  assert.equal(await staticPage.locator('#site-navigation').getByRole('link', { name: 'Tools', exact: true }).isVisible(), true);
  assert.equal(await staticPage.locator('#intro-title').isVisible(), true);
  assert.equal(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await staticContext.close();
  console.log('PASS reduced motion and complete navigation without JavaScript.');

  for (const [path, name, width] of [['/', 'home', 1440], ['/', 'home-mobile', 390], ['/about/', 'about', 1440], ['/tools/', 'tools-mobile', 390], ['/projects/fileforge/', 'fileforge', 1440]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + path);
    await page.evaluate(async () => {
      document.querySelectorAll('img[loading=lazy]').forEach(image => { image.loading = 'eager'; });
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      document.getAnimations().forEach(animation => animation.finish());
    });
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(outbound, []);
  console.log('PASS no browser errors or external runtime requests. Screenshots: .local/premium-check/');
} finally { await browser.close(); }
