import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

// Raster fallbacks for search engines and home-screen bookmarks. The source is
// the same SVG monogram used in the site's navigation.
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const svg = await readFile('assets/monogram.svg', 'utf8');
  for (const [size, name] of [[96, 'favicon-96'], [180, 'apple-touch-icon']]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.locator('svg').screenshot({ path: `assets/${name}.png`, omitBackground: true });
    await page.close();
  }
} finally { await browser.close(); }
