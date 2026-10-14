/* FileForge is opt-in. This worker is registered only at scope /tools/.
 * It never caches uploads, blobs, POST requests, game files or arbitrary URLs.
 * Build-generated SHA-256 checks make an offline pack an atomic snapshot. */
const VERSION = '__FILEFORGE_BUILD_VERSION__';
const PREFIX = 'fileforge-offline-v1-';
const CONTROL = `${PREFIX}control`;
const META = '/__fileforge_pack_metadata__';
let transfer = null;
let transferDone = null, finishTransfer = null;
const metadataMemo = new Map();
const clientPins = new Map();

self.addEventListener('install', () => {
  // No precache and no skipWaiting: existing jobs keep their current worker.
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function packs() {
  const result = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX) || name === CONTROL) continue;
    let meta = metadataMemo.get(name);
    if (!meta) {
      const response = await (await caches.open(name)).match(META);
      if (response) { meta = await response.json(); metadataMemo.set(name, meta); }
    }
    if (meta?.ready) result.push({ name, ...meta });
  }
  return result.sort((a, b) => b.saved - a.saved);
}
async function newest() {
  const ready = await packs();
  return ready.find(pack => pack.version === VERSION) || ready[0] || null;
}
async function pin(id, name) {
  if (!id || !name) return;
  clientPins.set(id, name);
  await (await caches.open(CONTROL)).put(`/__fileforge_client__/${id}`, new Response(name));
}
async function pinned(id) {
  if (!id) return null;
  if (clientPins.has(id)) return clientPins.get(id);
  if (!(await caches.keys()).includes(CONTROL)) return null;
  const response = await (await caches.open(CONTROL)).match(`/__fileforge_client__/${id}`);
  const name = response ? await response.text() : null;
  if (name) clientPins.set(id, name);
  return name;
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/skate-scape/') || !event.clientId && !event.resultingClientId) return;
  event.respondWith((async () => {
    const navigation = event.request.mode === 'navigate';
    // Queries are UI options, never file content. Only an allowlisted public
    // artifact can be returned; an unknown offline page fails normally.
    const path = url.pathname;
    let pack;
    if (!navigation) {
      const name = await pinned(event.clientId);
      pack = (await packs()).find(candidate => candidate.name === name);
      if (!pack && event.request.referrer) {
        // Never await clients.get() for a worker script request: the new worker
        // cannot become ready until this response arrives. Subsequent worker
        // fetches identify their immutable entry through the referrer instead.
        const source = new URL(event.request.referrer).pathname;
        if (source.startsWith('/tools/_assets/') || source.startsWith('/assets/')) pack = (await packs()).find(candidate => candidate.files.some(file => file.url === source));
      }
    }
    pack ||= await newest();
    // Adding an optional engine to the same immutable build is safe for an
    // already open tab. A different build stays pinned to its old resources.
    if (!navigation && pack && !pack.files.some(file => file.url === path)) pack = (await packs()).find(candidate => candidate.version === pack.version && candidate.files.some(file => file.url === path)) || pack;
    if (!navigation && pack && !pack.files.some(file => file.url === path) && /\/(?:assets|tools\/_assets)\/.+-[A-Za-z0-9_-]{6,}\./.test(path)) pack = (await packs()).find(candidate => candidate.files.some(file => file.url === path)) || pack;
    if (pack?.files.some(file => file.url === path)) {
      const cached = await (await caches.open(pack.name)).match(path);
      if (cached) {
        if (navigation) await pin(event.resultingClientId, pack.name);
        return cached;
      }
    }
    return fetch(event.request);
  })());
});

function validateManifest(manifest) {
  if (manifest.schema !== 1 || manifest.version !== VERSION || !Array.isArray(manifest.files) || !Array.isArray(manifest.groups)) throw new Error('The website is updating. Close tool tabs, reopen online and try again.');
  for (const file of manifest.files) {
    if (typeof file.url !== 'string' || !file.url.startsWith('/') || file.url.startsWith('//') || /[?#\\]/.test(file.url) || new URL(file.url, self.location.origin).pathname !== file.url || file.url.startsWith('/skate-scape/') || !/^(?:\/tools\/|\/assets\/|\/vendor\/|\/fonts\/|\/icons\/|\/licenses\/|\/manifest\.webmanifest$|\/THIRD_PARTY_NOTICES\.md$)/.test(file.url) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('This offline manifest contains an invalid resource.');
    if (file.decodedBytes !== undefined && (!file.url.endsWith('.gz') || !Number.isSafeInteger(file.decodedBytes) || file.decodedBytes < 0 || !/^[a-f0-9]{64}$/.test(file.decodedSha256))) throw new Error('This offline manifest contains an invalid compressed resource.');
  }
  return manifest;
}
async function manifestOnline(signal) {
  const response = await fetch('/offline-manifest.json', { cache: 'no-store', credentials: 'omit', signal });
  if (!response.ok) throw new Error('Offline packs are unavailable. Connect to the internet and try again.');
  return validateManifest(await response.json());
}
async function hash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function validBytes(file, bytes) {
  if (bytes.byteLength !== file.bytes && bytes.byteLength !== file.decodedBytes) return false;
  const digest = await hash(bytes);
  return bytes.byteLength === file.bytes && digest === file.sha256 || bytes.byteLength === file.decodedBytes && digest === file.decodedSha256;
}
async function download(file, signal, progress) {
  const response = await fetch(file.url, { cache: 'no-store', credentials: 'omit', signal });
  if (!response.ok || response.type === 'opaque' || response.redirected) throw new Error(`Could not download ${file.url}. Your previous offline pack is safe.`);
  const reader = response.body?.getReader();
  const chunks = []; let length = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) { await reader.cancel(); throw new DOMException('Cancelled', 'AbortError'); }
      chunks.push(value); length += value.byteLength;
      const encoded = response.headers.get('Content-Encoding');
      progress(file.decodedBytes && encoded?.includes('gzip') ? Math.min(file.bytes, length / file.decodedBytes * file.bytes) : Math.min(file.bytes, length));
      if (length > Math.max(file.bytes, file.decodedBytes || 0)) { await reader.cancel(); throw new Error(`Download changed: ${file.url}. Try again after the website update finishes.`); }
    }
  } else { const bytes = new Uint8Array(await response.arrayBuffer()); chunks.push(bytes); length = bytes.length; }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (!await validBytes(file, bytes)) throw new Error(`Verification failed for ${file.url}. Your previous offline pack is safe.`);
  const headers = new Headers(response.headers);
  // Fetch has already consumed any HTTP compression. Persist the verified
  // body as-is, without telling a later cache reader to decode it again.
  headers.delete('Content-Encoding'); headers.delete('Content-Length');
  return new Response(bytes, { status: 200, headers });
}
async function save(groups, port) {
  if (transfer) throw new Error('An offline download is already running in another tab.');
  const controller = new AbortController(); transfer = controller;
  transferDone = new Promise(resolve => { finishTransfer = resolve; });
  const name = `${PREFIX}${VERSION}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const manifest = await manifestOnline(controller.signal);
    const selected = [...new Set(['core', ...groups])];
    if (selected.some(group => !manifest.groups.some(known => known.id === group))) throw new Error('Choose a valid offline pack.');
    if (selected.some(group => group.startsWith('ocr-')) && !selected.includes('ocr')) selected.push('ocr');
    const files = manifest.files.filter(file => selected.includes(file.group));
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    const cache = await caches.open(name);
    const previous = (await packs()).find(pack => pack.version === VERSION);
    const existing = previous ? await caches.open(previous.name) : null;
    let complete = 0;
    for (const file of files) {
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      let response = existing ? await existing.match(file.url) : null;
      if (response) {
        const bytes = await response.clone().arrayBuffer();
        if (!await validBytes(file, bytes)) response = null;
      }
      response ||= await download(file, controller.signal, loaded => port.postMessage({ type: 'progress', loaded: complete + loaded, total, file: file.url }));
      await cache.put(file.url, response);
      complete += file.bytes; port.postMessage({ type: 'progress', loaded: complete, total, file: file.url });
    }
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const meta = { ready: true, version: VERSION, saved: Date.now(), groups: selected, catalog: manifest.groups, files, bytes: total };
    await cache.put(META, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
    metadataMemo.set(name, meta);
    port.postMessage({ type: 'result', value: meta });
    // Preserve snapshots pinned by existing tabs. They can finish their jobs;
    // future navigations use the new verified snapshot after normal activation.
    await prune(name);
  } catch (error) { await caches.delete(name); metadataMemo.delete(name); throw error; }
  finally { transfer = null; finishTransfer?.(); finishTransfer = null; transferDone = null; }
}
async function prune(keep) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const tools = clients.filter(client => new URL(client.url).pathname.startsWith('/tools/'));
  const pins = await Promise.all(tools.map(client => pinned(client.id)));
  // A page loaded before opt-in may have no pin. Keep its previous snapshot.
  if (pins.some(name => !name)) return;
  const retain = new Set([keep, ...pins]);
  for (const pack of await packs()) if (!retain.has(pack.name)) { await caches.delete(pack.name); metadataMemo.delete(pack.name); }
  const control = await caches.open(CONTROL);
  const ids = new Set(tools.map(client => client.id));
  for (const request of await control.keys()) {
    const id = new URL(request.url).pathname.split('/').pop();
    if (!ids.has(id)) await control.delete(request);
  }
}
self.addEventListener('message', event => {
  const message = event.data || {}, port = event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    try {
      if (message.type === 'status') {
        const pack = await newest();
        let complete = true;
        if (pack) {
          const cache = await caches.open(pack.name);
          for (const file of pack.files) if (!await cache.match(file.url)) { complete = false; break; }
        }
        port.postMessage({ type: 'result', value: { version: VERSION, catalog: pack?.catalog || null, pack: pack ? { version: pack.version, groups: pack.groups, bytes: pack.bytes, saved: pack.saved, complete } : null } });
      } else if (message.type === 'save') await save(Array.isArray(message.groups) ? message.groups : [], port);
      else if (message.type === 'cancel') {
        const done = transferDone;
        transfer?.abort();
        if (done) await done; // A cancelled staging cache is gone before acknowledgment.
        port.postMessage({ type: 'result', value: true });
      }
      else if (message.type === 'clear') {
        if (transfer) throw new Error('Cancel the active offline download before clearing the cache.');
        for (const name of await caches.keys()) if (name.startsWith(PREFIX)) await caches.delete(name);
        metadataMemo.clear(); clientPins.clear();
        await self.registration.unregister();
        port.postMessage({ type: 'result', value: true });
      } else throw new Error('Unknown offline command.');
    } catch (error) { port.postMessage({ type: 'error', message: error.name === 'AbortError' ? 'Download cancelled. Your previous offline pack is safe.' : error.message }); }
  })());
});
