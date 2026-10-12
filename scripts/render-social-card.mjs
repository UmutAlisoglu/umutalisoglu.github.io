import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${await readFile('assets/social-card.svg','utf8')}`);
  await page.locator('svg').screenshot({ path: 'assets/social-card.png' });
} finally { await browser.close(); }
