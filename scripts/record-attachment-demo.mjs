import { chromium } from 'playwright';
import { mkdir, readFile, copyFile } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://127.0.0.1:8780';
await mkdir('.local/demo-recording', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', acceptDownloads: true, recordVideo: { dir: '.local/demo-recording', size: { width: 1280, height: 800 } } });
  const page = await context.newPage();
  const video = page.video();
  await page.goto(base + '/tools/workspace/?job=attachment');
  await page.locator('[data-workspace-launcher]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1300);
  await page.locator('[data-workspace-input]').setInputFiles({ name: 'studio-headphones.png', mimeType: 'image/png', buffer: await readFile('assets/demos/headphones.png') });
  const engine = page.frameLocator('[data-workspace-frame] iframe');
  await engine.locator('#file-list li').waitFor();
  await engine.locator('#conversion-form button[type=submit]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  await engine.locator('#conversion-form button[type=submit]').click();
  await page.locator('[data-workspace-result]').waitFor();
  await page.locator('.workspace-result-previews img').last().waitFor();
  await page.waitForTimeout(1800);
  await page.locator('[data-workspace-result]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'assets/demos/attachment-poster.png' });
  const pending = page.waitForEvent('download');
  await page.locator('[data-workspace-download]').click();
  const download = await pending;
  await download.saveAs('.local/demo-recording/' + download.suggestedFilename());
  await page.waitForTimeout(1800);
  await context.close();
  await copyFile(await video.path(), 'assets/demos/fileforge-attachment.webm');
  console.log('Saved a real, silent attachment-job recording and poster. Original sample artwork; no visitor files.');
} finally { await browser.close(); }
