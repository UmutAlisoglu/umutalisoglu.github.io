import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const workerSource = (await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')).replace('__FILEFORGE_BUILD_VERSION__', 'verified-test-build');
async function harness({ gzip = false } = {}) {
  const origin = 'https://fileforge.test';
  const handlers = new Map(), cacheStores = new Map();
  const fixture = new Map([['/tools/workspace/', '<!doctype html><title>Workspace</title>'], ['/tools/_assets/tool-check.js', 'console.log("public tool code");'], ['/assets/models/u2netp.onnx', 'public test model bytes']]);
  if (gzip) { fixture.set('/tools/engines/tesseract/worker.min.js', 'public OCR worker'); fixture.set('/vendor/tesseract/lang/eng.traineddata.gz', gzipSync('Pinned public language data.')); }
  const entries = [...fixture].map(([url, body]) => {
    const file = { url, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex'), group: url.includes('/lang/') ? 'ocr-eng' : url.includes('/tesseract/') ? 'ocr' : url.includes('models') ? 'background' : 'core' };
    if (url.endsWith('.gz')) { const decoded = gunzipSync(body); file.decodedBytes = decoded.length; file.decodedSha256 = createHash('sha256').update(decoded).digest('hex'); }
    return file;
  });
  const manifest = { schema: 1, version: 'verified-test-build', groups: [...new Set(entries.map(file => file.group))].map(id => ({ id, bytes: entries.filter(file => file.group === id).reduce((sum, file) => sum + file.bytes, 0) })), files: entries };
  let mode = 'normal', blocked;
  const requests = [];
  const caches = {
    async keys() { return [...cacheStores.keys()]; },
    async delete(name) { return cacheStores.delete(name); },
    async open(name) {
      if (!cacheStores.has(name)) cacheStores.set(name, new Map());
      const store = cacheStores.get(name);
      const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
      return {
        async match(request) { return store.get(key(request))?.clone(); },
        async put(request, response) { store.set(key(request), response.clone()); },
        async delete(request) { return store.delete(key(request)); },
        async keys() { return [...store.keys()].map(url => new Request(url)); },
      };
    },
  };
  const clients = { async claim() {}, async matchAll() { return []; }, async get() { throw new Error('Fetch must not wait for a pending dedicated-worker client'); } };
  const context = vm.createContext({
    console, URL, Request, Response, Headers, DOMException, AbortController, crypto: webcrypto, Uint8Array,
    caches,
    self: { location: { origin, href: `${origin}/sw.js` }, clients, registration: { active: { scriptURL: `${origin}/sw.js` }, async unregister() { return true; } }, addEventListener(name, handler) { handlers.set(name, handler); } },
    async fetch(input, options = {}) {
      const path = new URL(typeof input === 'string' ? input : input.url, origin).pathname;
      requests.push(path);
      if (path === '/offline-manifest.json') return Response.json(manifest);
      if (mode === 'block' && path.includes('models')) {
        blocked?.();
        return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }));
      }
      if (!fixture.has(path)) throw new TypeError('Network unavailable for unknown file');
      if (mode === 'decoded' && path.endsWith('.gz')) return new Response(gunzipSync(fixture.get(path)), { headers: { 'Content-Encoding': 'gzip' } });
      const body = mode === 'corrupt' && path.includes('models') ? 'a different payload' : fixture.get(path);
      return new Response(body, { headers: { 'Content-Type': path.endsWith('/') ? 'text/html' : 'application/octet-stream' } });
    },
  });
  vm.runInContext(workerSource, context);
  async function message(data) {
    const replies = []; let task;
    handlers.get('message')({ data, ports: [{ postMessage(value) { replies.push(value); } }], waitUntil(promise) { task = promise; } });
    await task; return replies;
  }
  async function request(path, { method = 'GET', clientId = 'window', mode = 'cors' } = {}) {
    let response;
    handlers.get('fetch')({ request: { url: new URL(path, origin).href, method, mode }, clientId, resultingClientId: mode === 'navigate' ? 'new-window' : '', respondWith(promise) { response = promise; } });
    return response ? await response : null;
  }
  return { message, request, caches, requests, setMode(value) { mode = value; }, waitBlocked() { return new Promise(resolve => { blocked = resolve; }); } };
}

test('offline pack is opt-in, verified and atomic when a new engine is corrupt', async () => {
  const app = await harness();
  assert.deepEqual(await app.caches.keys(), []);
  const replies = await app.message({ type: 'save', groups: ['core'] });
  assert.equal(replies.at(-1).type, 'result');
  assert.equal(app.requests.some(path => path.includes('models')), false);
  const before = await app.message({ type: 'status' });
  assert.equal(before.at(-1).value.pack.complete, true);
  assert.deepEqual([...before.at(-1).value.pack.groups], ['core']);
  app.setMode('corrupt');
  const failed = await app.message({ type: 'save', groups: ['core', 'background'] });
  assert.equal(failed.at(-1).type, 'error');
  assert.match(failed.at(-1).message, /Verification failed|Download changed/);
  const after = await app.message({ type: 'status' });
  assert.deepEqual([...after.at(-1).value.pack.groups], ['core']);
  assert.equal(after.at(-1).value.pack.complete, true);
  assert.equal((await app.caches.keys()).filter(name => !name.endsWith('control')).length, 1, 'Failed staging cache is deleted');
});

test('gzip language payloads verify both exact host representations without double decoding', async () => {
  for (const mode of ['normal', 'decoded']) {
    const app = await harness({ gzip: true }); app.setMode(mode);
    const replies = await app.message({ type: 'save', groups: ['ocr-eng'] });
    assert.equal(replies.at(-1).type, 'result', mode);
    const response = await app.request('/vendor/tesseract/lang/eng.traineddata.gz');
    assert.equal(response.headers.has('Content-Encoding'), false);
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal((mode === 'normal' ? gunzipSync(body) : body).toString(), 'Pinned public language data.');
  }
});

test('cancelling an offline engine download preserves the complete previous pack', async () => {
  const app = await harness();
  await app.message({ type: 'save', groups: ['core'] });
  app.setMode('block');
  const blocked = app.waitBlocked();
  const running = app.message({ type: 'save', groups: ['background'] });
  await blocked;
  await app.message({ type: 'cancel' });
  const replies = await running;
  assert.equal(replies.at(-1).type, 'error');
  assert.match(replies.at(-1).message, /cancelled/);
  const status = await app.message({ type: 'status' });
  assert.equal(status.at(-1).value.pack.complete, true);
  assert.deepEqual([...status.at(-1).value.pack.groups], ['core']);
});

test('offline responses are allowlisted; games, uploads and external requests are untouched', async () => {
  const app = await harness();
  await app.message({ type: 'save', groups: ['core'] });
  const page = await app.request('/tools/workspace/?format=png', { mode: 'navigate' });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Workspace/);
  const worker = await app.request('/tools/_assets/tool-check.js', { clientId: 'pending-worker' });
  assert.match(await worker.text(), /public tool code/, 'Worker scripts load without waiting for their own client to initialize');
  assert.equal(await app.request('/skate-scape/cache/game.bin'), null);
  assert.equal(await app.request('/tools/workspace/', { method: 'POST' }), null);
  assert.equal(await app.request('https://elsewhere.test/file'), null);
  await assert.rejects(app.request('/tools/unknown/', { mode: 'navigate' }), /Network unavailable/);
  await app.message({ type: 'clear' });
  assert.deepEqual(await app.caches.keys(), []);
  await app.request('/tools/_assets/tool-check.js');
  assert.deepEqual(await app.caches.keys(), [], 'A still-open client does not recreate cleared cache metadata');
});
