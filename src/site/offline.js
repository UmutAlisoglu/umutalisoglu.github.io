import './offline.css';

const MANIFEST = '/offline-manifest.json';
let installPrompt = null, registration = null, catalog = null, busy = false, downloadWorker = null, hasPack = false;
const supportsOffline = 'serviceWorker' in navigator && 'caches' in window && window.isSecureContext;
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const bytes = value => value < 1_000_000 ? `${Math.ceil(value / 1000)} kB` : `${(value / 1_000_000).toFixed(1)} MB`;
const exactBytes = value => `${value.toLocaleString()} bytes`;

const markup = `<div class="offline-heading"><div><p class="eyebrow">YOUR TOOLBOX, EVERYWHERE</p><h2>Take FileForge offline.</h2><p>Download just the tools you want. Your files never enter the offline cache.</p></div><span class="offline-badge" data-offline-badge>Optional</span></div>
<div class="offline-controls"><button type="button" class="offline-install" data-offline-install>Add FileForge to your device</button><button type="button" class="text-button" data-offline-update>Check for updates</button></div>
<p class="offline-install-help" data-offline-install-help>Installation depends on your browser. Offline packs also work in a normal browser tab.</p>
<fieldset class="offline-packs"><legend>Choose your offline tools</legend><div data-offline-packs><p>Open this panel online to see exact download sizes.</p></div></fieldset>
<div class="offline-total"><span data-offline-total>No pack selected</span><small data-offline-storage></small></div>
<div class="offline-actions"><button type="button" class="offline-primary" data-offline-save>Save selected tools offline</button><button type="button" class="text-button" data-offline-cancel hidden>Cancel download</button><button type="button" class="text-button" data-offline-clear disabled>Clear offline tools</button></div>
<progress class="offline-progress" data-offline-progress max="100" value="0" hidden aria-label="Offline download progress"></progress><p class="offline-status" data-offline-status role="status" aria-live="polite">No tools are downloaded automatically.</p>
<p class="offline-note">Browser storage can be cleared or evicted. Keep important results as downloads. Offline updates wait for existing tool tabs to close; your running work is never reloaded.</p>`;

const inline = document.querySelector('[data-offline-panel]');
const dialog = document.createElement('dialog');
dialog.className = 'offline-dialog';
dialog.setAttribute('aria-label', 'Offline FileForge tools');
dialog.innerHTML = '<button type="button" class="offline-close" aria-label="Close offline tools">×</button><section class="offline-panel"></section>';
document.body.append(dialog);
const panel = inline || dialog.querySelector('.offline-panel');
panel.classList.add('offline-panel'); panel.innerHTML = markup;
if (inline) dialog.remove();
const $ = selector => panel.querySelector(selector);
function report(text, error = false) { $('[data-offline-status]').textContent = text; $('[data-offline-status]').classList.toggle('is-error', error); }
function installState() {
  const button = $('[data-offline-install]'), help = $('[data-offline-install-help]');
  if (isInstalled()) { button.textContent = 'Installed on this device'; button.disabled = true; help.textContent = 'Choose an offline pack below to make the tools available without a connection.'; }
  else if (installPrompt) { button.textContent = 'Install FileForge'; button.disabled = false; help.textContent = 'Your browser can add FileForge as its own app window.'; }
  else { button.textContent = supportsOffline ? 'How to install FileForge' : 'Installation help'; button.disabled = false; help.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'In Safari: Share → Add to Home Screen. Download an offline pack below before disconnecting.' : 'Look for Install app in your browser menu or address bar. Some browsers only offer a shortcut. You can always use a normal tab.'; }
}
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installState(); });
window.addEventListener('appinstalled', () => { installPrompt = null; installState(); });
matchMedia('(display-mode: standalone)').addEventListener?.('change', installState);

function rpc(worker, command, onProgress) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = () => { channel.port1.close(); clearTimeout(timeout); };
    const timeout = setTimeout(() => { finish(); reject(new Error('The offline worker did not respond. Reopen this panel and try again.')); }, command.type === 'save' ? 20 * 60_000 : 30_000);
    channel.port1.onmessage = ({ data }) => {
      if (data.type === 'progress') { onProgress?.(data); return; }
      finish(); if (data.type === 'error') reject(new Error(data.message)); else resolve(data.value);
    };
    worker.postMessage(command, [channel.port2]);
  });
}
async function existingRegistration() {
  if (!supportsOffline) return null;
  const found = await navigator.serviceWorker.getRegistration('/tools/');
  return found?.scope === new URL('/tools/', location.origin).href ? found : null;
}
async function register() {
  if (!supportsOffline) throw new Error('Offline tools need HTTPS and a browser that supports service workers. The online tools still work.');
  registration = await navigator.serviceWorker.register('/sw.js', { scope: '/tools/', updateViaCache: 'none' });
  if (registration.installing) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Offline setup timed out. Please try again.')), 30_000);
      const worker = registration.installing;
      if (!worker) { clearTimeout(timeout); resolve(); return; }
      const hasActive = !!registration.active;
      const check = () => { if (worker.state === 'redundant' || worker.state === 'activated' || hasActive && worker.state === 'installed') { clearTimeout(timeout); worker.removeEventListener('statechange', check); worker.state === 'redundant' ? reject(new Error('Offline setup failed. Please try again online.')) : resolve(); } };
      worker.addEventListener('statechange', check); check();
    });
  }
  return registration;
}
function selected() {
  const groups = [...panel.querySelectorAll('[data-offline-group]:checked')].map(input => input.value);
  if (groups.some(group => group.startsWith('ocr-')) && !groups.includes('ocr')) groups.push('ocr');
  return groups;
}
function total() {
  if (!catalog) return;
  const groups = selected(), size = catalog.groups.filter(group => groups.includes(group.id)).reduce((sum, group) => sum + group.bytes, 0);
  $('[data-offline-total]').textContent = `${bytes(size)} total · ${exactBytes(size)}`;
  $('[data-offline-save]').disabled = busy || !navigator.onLine;
}
function renderPacks(saved = []) {
  if (!catalog) return;
  const list = $('[data-offline-packs]'); list.replaceChildren();
  for (const group of catalog.groups) {
    const row = document.createElement('label'); row.className = 'offline-pack';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = group.id; input.dataset.offlineGroup = group.id;
    input.checked = group.id === 'core' || saved.includes(group.id); input.disabled = group.id === 'core' || busy;
    const text = document.createElement('span'), title = document.createElement('strong'), description = document.createElement('small'), size = document.createElement('span');
    title.textContent = group.label; description.textContent = group.description; size.className = 'offline-pack-size'; size.textContent = bytes(group.bytes); size.title = exactBytes(group.bytes);
    text.append(title, description); row.append(input, text, size); list.append(row);
  }
  total();
}
$('[data-offline-packs]').addEventListener('change', () => {
  const groups = selected();
  if (groups.some(group => group.startsWith('ocr-'))) { const engine = panel.querySelector('[data-offline-group="ocr"]'); if (engine) engine.checked = true; }
  total();
});
async function storage() {
  if (!navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate();
  if (estimate.quota) $('[data-offline-storage]').textContent = `${bytes(Math.max(0, estimate.quota - (estimate.usage || 0)))} estimated browser storage available`;
}
async function refresh({ check = false } = {}) {
  if (busy) return;
  registration = await existingRegistration();
  if (check && registration && navigator.onLine) await registration.update();
  let status;
  const worker = registration?.waiting || registration?.active;
  if (worker) status = await rpc(worker, { type: 'status' });
  try {
    const response = await fetch(MANIFEST, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('Offline pack list is unavailable.');
    catalog = await response.json();
    if (catalog.schema !== 1 || !Array.isArray(catalog.groups)) throw new Error('Offline pack list is invalid.');
  } catch (error) {
    if (status?.catalog?.length) catalog = { groups: status.catalog, version: status.pack.version };
    else if (!catalog) report(navigator.onLine ? 'Offline packs are prepared in the published build. They are unavailable in the development server.' : 'Connect once to download an offline pack.', true);
  }
  renderPacks(status?.pack?.groups || []);
  hasPack = !!status?.pack;
  $('[data-offline-clear]').disabled = busy || !hasPack;
  if (status?.pack?.complete) {
    const stale = catalog && status.pack.version !== catalog.version;
    $('[data-offline-badge]').textContent = stale ? 'Update available' : 'Offline ready';
    report(stale ? `Your saved tools are version ${status.pack.version.slice(0, 8)}. Download the update below, then close tool tabs to use it.` : `Verified offline tools · ${bytes(status.pack.bytes)} · version ${status.pack.version.slice(0, 8)}. New tool tabs use this pack.`);
  } else if (status?.pack) { $('[data-offline-badge]').textContent = 'Pack incomplete'; report('Some offline resources were cleared. Connect and save the pack again before relying on offline use.', true); }
  else $('[data-offline-badge]').textContent = 'Optional';
  await storage(); installState(); total();
}
function busyState(value) {
  busy = value;
  panel.querySelectorAll('[data-offline-group]').forEach(input => { input.disabled = value || input.value === 'core'; });
  $('[data-offline-save]').disabled = value || !catalog || !navigator.onLine;
  $('[data-offline-cancel]').hidden = !value;
  $('[data-offline-clear]').disabled = value || !hasPack;
  $('[data-offline-update]').disabled = value;
  $('[data-offline-progress]').hidden = !value;
}
$('[data-offline-save]').addEventListener('click', async () => {
  if (busy || !catalog) return;
  const groups = selected();
  busyState(true); report('Preparing your private offline toolbox…');
  try {
    const reg = await register();
    downloadWorker = reg.waiting || reg.active;
    if (!downloadWorker) throw new Error('The offline worker is not ready. Try again in a moment.');
    const wasWaiting = !!reg.waiting;
    await rpc(downloadWorker, { type: 'save', groups }, progress => {
      $('[data-offline-progress]').value = progress.total ? progress.loaded / progress.total * 100 : 0;
      report(`Downloading & verifying ${bytes(progress.loaded)} of ${bytes(progress.total)}…`);
    });
    busyState(false); await refresh();
    if (wasWaiting) report('Update downloaded and verified. Close all FileForge tool tabs, then reopen to use it. Your current work can finish safely.');
    else report('Offline pack verified. Open a new tool tab to use it. Save important results as downloads; browser storage can be cleared.');
    $('[data-offline-badge]').textContent = wasWaiting ? 'Update ready' : 'Offline ready';
  } catch (error) { report(error.message, true); }
  finally { busyState(false); downloadWorker = null; await storage(); }
});
$('[data-offline-cancel]').addEventListener('click', async () => { if (downloadWorker) try { await rpc(downloadWorker, { type: 'cancel' }); } catch (error) { report(error.message, true); } });
$('[data-offline-clear]').addEventListener('click', async () => {
  if (busy) return;
  try {
    registration = await existingRegistration();
    const workers = [registration?.waiting, registration?.active].filter(Boolean);
    // An update worker and the active worker can coexist. Finish cancelling
    // their public-pack downloads before deleting any shared caches.
    for (const worker of workers) await rpc(worker, { type: 'cancel' });
    if (workers.length) await rpc(registration.active || registration.waiting, { type: 'clear' });
    registration = null; hasPack = false; $('[data-offline-badge]').textContent = 'Optional'; $('[data-offline-clear]').disabled = true;
    report('Offline app resources cleared. Your downloaded files are untouched. Reconnect before opening another tool page.');
    await storage();
  } catch (error) { report(error.message, true); }
});
$('[data-offline-update]').addEventListener('click', () => refresh({ check: true }).catch(error => report(error.message, true)));
$('[data-offline-install]').addEventListener('click', async () => {
  if (installPrompt) {
    const prompt = installPrompt; installPrompt = null;
    try { await prompt.prompt(); const choice = await prompt.userChoice; report(choice.outcome === 'accepted' ? 'Installation requested. Choose an offline pack for use without a connection.' : 'You can keep using FileForge in your browser.'); } catch (error) { report(error.message, true); }
    installState();
  } else {
    installState();
    if (supportsOffline && navigator.onLine) { try { await register(); report('App support enabled. If your browser offers installation, the install button will appear. Otherwise use its menu or a normal tab. No tool engines were downloaded.'); } catch (error) { report(error.message, true); } }
    $('[data-offline-install-help]').focus();
  }
});
document.addEventListener('click', event => {
  if (!event.target.closest('[data-open-offline]')) return;
  if (inline) { inline.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
  else { dialog.showModal(); }
  refresh().catch(error => report(error.message, true));
});
if (!inline) { dialog.querySelector('.offline-close').addEventListener('click', () => dialog.close()); dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }); }
window.addEventListener('online', () => { total(); report('Back online. You can download or update your offline tools.'); });
window.addEventListener('offline', () => { total(); report('You are offline. Only fully downloaded tools and language packs are available.'); });
installState();
if (!supportsOffline) { $('[data-offline-save]').disabled = true; $('[data-offline-update]').disabled = true; report('Offline packs need HTTPS and service-worker support. You can still use the online tools.', true); }
else if (inline) refresh().catch(error => report(error.message, true));

