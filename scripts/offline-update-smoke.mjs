import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

// Isolated static fixture server: two snapshots of the actual production build.
// Only workspace's title changes. No dist files or public hosting are modified.
const dist = resolve('dist');
const productionManifest = JSON.parse(await readFile(resolve(dist, 'offline-manifest.json'), 'utf8'));
const workspaceSource = await readFile(resolve(dist, 'tools/workspace/index.html'), 'utf8');
const workerSource = await readFile('public/sw.js', 'utf8');
function snapshot(letter) {
  const html = workspaceSource.replace(/<title>[^<]*<\/title>/, `<title>Offline snapshot ${letter}</title>`);
  const body = Buffer.from(html);
  const files = productionManifest.files.map(file => file.url === '/tools/workspace/' ? { ...file, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') } : file);
  const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
  const groups = productionManifest.groups.map(group => ({ ...group, bytes: files.filter(file => file.group === group.id).reduce((sum, file) => sum + file.bytes, 0) }));
  return { html, manifest: { ...productionManifest, version, files, groups }, worker: workerSource.replaceAll('__FILEFORGE_BUILD_VERSION__', version) };
}
const builds = { A: snapshot('A'), B: snapshot('B') }; let current = 'A';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    let body, type;
    if (pathname === '/sw.js') { body = builds[current].worker; type = 'text/javascript'; }
    else if (pathname === '/offline-manifest.json') { body = JSON.stringify(builds[current].manifest); type = 'application/json'; }
    else if (pathname === '/tools/workspace/') { body = builds[current].html; type = 'text/html'; }
    else {
      const path = resolve(dist, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
      if (!path.startsWith(`${dist}${sep}`)) throw new Error('Path outside public fixture');
      body = await readFile(path); type = mime[extname(path)] || 'application/octet-stream';
    }
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/tools/' }); response.end(body);
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Fixture resource unavailable'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext();
const workspace = await context.newPage(), errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
workspace.on('pageerror', error => errors.push(error.message));
const report = [];
try {
  await workspace.goto(`${base}/tools/workspace/`);
  await workspace.locator('[data-offline-group="core"]').waitFor();
  await workspace.locator('[data-offline-save]').click();
  await workspace.locator('[data-offline-badge]').filter({ hasText: /^Offline ready$/ }).waitFor({ timeout: 180_000 });
  assert.equal(await workspace.title(), 'Offline snapshot A');
  const tool = await context.newPage(); await tool.goto(`${base}/tools/image-converter/`);
  const png = await tool.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 24; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#6650c8'; ctx.fillRect(0, 0, 24, 24); return canvas.toDataURL().split(',')[1]; });
  await tool.locator('#files').setInputFiles({ name: 'stay-in-memory.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await tool.locator('#submit-label').click();
  await tool.waitForFunction(() => !document.querySelector('#result').hidden || document.querySelector('#cancel-job').hidden);
  assert.equal(await tool.locator('#result').isVisible(), true, await tool.locator('#job-status').textContent());
  const originalResult = await tool.locator('#download-result').getAttribute('href');
  report.push('Build A saved, and real in-memory image conversion result prepared');
  current = 'B';
  await workspace.locator('[data-offline-update]').click();
  await workspace.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration('/tools/'))?.waiting, undefined, { timeout: 30_000 });
  await workspace.locator('[data-offline-save]').click();
  await workspace.locator('[data-offline-status]').filter({ hasText: 'Update downloaded and verified' }).waitFor({ timeout: 180_000 });
  assert.equal(await workspace.title(), 'Offline snapshot A');
  assert.equal(await tool.locator('#download-result').getAttribute('href'), originalResult);
  const oldState = await workspace.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration('/tools/');
    return { waiting: !!reg.waiting, controller: !!navigator.serviceWorker.controller };
  });
  assert.equal(oldState.waiting, true);
  report.push('Build B verified while existing A tabs and their conversion result remain intact');
  await context.setOffline(true);
  const stillOld = await context.newPage(); await stillOld.goto(`${base}/tools/workspace/`);
  assert.equal(await stillOld.title(), 'Offline snapshot A', 'Waiting update must not take over existing app clients');
  await stillOld.close(); await tool.close(); await workspace.close();
  // Observe activation from a page outside /tools/, so it does not keep the old
  // registration alive. No skipWaiting or forced reload is used.
  const observer = await context.newPage(); await context.setOffline(false); await observer.goto(base);
  await observer.waitForFunction(async () => { const reg = await navigator.serviceWorker.getRegistration('/tools/'); return reg?.active && !reg.waiting && !reg.installing; }, undefined, { timeout: 30_000 });
  await context.setOffline(true);
  const updated = await context.newPage(); await updated.goto(`${base}/tools/workspace/`);
  assert.equal(await updated.title(), 'Offline snapshot B');
  await updated.locator('[data-offline-group="core"]').waitFor();
  await updated.locator('[data-offline-badge]').filter({ hasText: /^Offline ready$/ }).waitFor();
  report.push('After A tabs close naturally, offline navigation uses the complete verified B snapshot');
  assert.deepEqual(errors, []);
  await mkdir('.qa/offline', { recursive: true });
  await writeFile('.qa/offline/update-report.json', JSON.stringify({ ok: true, A: builds.A.manifest.version, B: builds.B.manifest.version, checks: report }, null, 2));
  console.log(report.map(item => `PASS ${item}`).join('\n'));
} finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
