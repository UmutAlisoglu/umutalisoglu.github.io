import { kitSettings, validateKitFiles, KIT_DEFAULTS } from '../fileforge/product-kit-shared.js';
import { formatBytes } from '../fileforge/shared.js';

const $ = selector => document.querySelector(selector), storageKey = 'fileforge-product-kit-setup-v1';
let items = [], selected = 0, worker = null, downloadURL = null, loading = false, revision = 0;
function settings() { return kitSettings({ name: $('#kit-name').value, background: $('#kit-background').value, remove: $('#kit-remove').checked, padding: $('#kit-padding').value, size: $('#kit-size').value }); }
function applySettings(value) {
  const next = kitSettings(value); $('#kit-name').value = next.name; $('#kit-background').value = next.background; $('#kit-remove').checked = next.remove; $('#kit-padding').value = next.padding; $('#kit-size').value = next.size; updateSpec();
}
function report(message, error = false) { $('#kit-status').textContent = message; $('#kit-status').classList.toggle('is-error', error); }
function updateSpec() {
  const value = settings(); $('#kit-listing-spec').textContent = `${value.size} px · ${value.background === 'transparent' ? 'PNG' : 'JPG'}`;
  $('[data-kit-stage="0"]').lastChild.textContent = value.remove ? 'Find the subject' : 'Keep the original';
}
function busy() {
  const active = Boolean(worker) || loading;
  $('#kit-settings').disabled = active; $('#kit-input').disabled = active; $('#kit-sample').disabled = active || Boolean(items.length);
  $('#kit-run').disabled = active || !items.length; $('#kit-reset').disabled = active || !items.length;
  $('#kit-save').disabled = active; $('#kit-load').disabled = active || !hasSaved(); $('#kit-forget').disabled = active || !hasSaved();
  $('#kit-cancel').hidden = !worker; $('.kit-studio').setAttribute('aria-busy', String(active));
  document.querySelectorAll('.kit-file-remove').forEach(button => { button.disabled = active; });
  document.querySelectorAll('.kit-keep-background input').forEach(input => { input.disabled = active; });
}
function clearResult() {
  if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL = null;
  $('#kit-download').removeAttribute('href'); $('#kit-finished').hidden = true; $('#kit-progress').hidden = true; $('#kit-progress').value = 0;
  $('#kit-stale-note').hidden = true; $('#kit-errors').replaceChildren();
  for (const item of items) { item.outputs?.forEach(output => URL.revokeObjectURL(output.url)); item.outputs = []; item.product = null; item.error = null; }
  document.querySelectorAll('[data-kit-stage]').forEach(node => { node.classList.remove('is-active', 'is-done'); });
  showPreview();
}
function showPreview() {
  const item = items[selected], ready = Boolean(item?.outputs?.length);
  $('#kit-placeholder').hidden = ready; $('#kit-comparison').hidden = !ready;
  $('#kit-image-actions').hidden = !ready;
  if (ready) {
    const output = item.outputs.find(output => output.id === $('#kit-variant').value) || item.outputs[0];
    $('#kit-before').src = item.sourceURL; $('#kit-after').src = output.url;
    $('#kit-before').alt = `Original: ${item.file.name}`; $('#kit-after').alt = `Finished: ${item.file.name}`;
    $('#kit-preview-caption').textContent = `${item.file.name} · ${output.side} × ${output.side} · ${formatBytes(output.blob.size)} · ${item.product.backgroundRemoved ? 'Background removed' : 'Original background kept'}${item.product.warning ? ` · ${item.product.warning}` : ''}`;
    $('#kit-open-image').href = output.url; $('#kit-image-download').href = output.url; $('#kit-image-download').download = output.path.replaceAll('/', '-');
  } else { $('#kit-before').removeAttribute('src'); $('#kit-after').removeAttribute('src'); }
  document.querySelectorAll('[data-kit-index]').forEach(node => { const current = Number(node.dataset.kitIndex) === selected; node.classList.toggle('is-selected', current); node.querySelector('.kit-file-select').setAttribute('aria-pressed', String(current)); });
}
function renderFiles() {
  const list = $('#kit-files'); list.replaceChildren();
  items.forEach((item, index) => {
    const row = document.createElement('li'); row.dataset.kitIndex = index;
    const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'kit-file-select'; choose.setAttribute('aria-label', `Inspect ${item.file.name}`);
    const image = document.createElement('img'); image.src = item.sourceURL; image.alt = ''; image.width = 40; image.height = 44;
    const text = document.createElement('span'), name = document.createElement('strong'), detail = document.createElement('small'); name.textContent = item.file.name;
    detail.textContent = `${formatBytes(item.file.size)} · ${item.product ? '3 sizes ready ✓' : item.error ? 'Skipped — see details below' : 'Ready to prepare'}`; text.append(name, detail); choose.append(image, text);
    choose.addEventListener('click', () => { selected = index; showPreview(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'kit-file-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${item.file.name}`);
    remove.addEventListener('click', () => {
      if (worker || loading) return; clearResult(); URL.revokeObjectURL(item.sourceURL); items.splice(index, 1); selected = Math.min(selected, Math.max(0, items.length - 1)); renderFiles(); busy(); report(items.length ? 'Photo removed. Ready to build your kit.' : 'Add photos to start. Everything happens on your device.');
    }); row.append(choose, remove);
    if (settings().remove) {
      const label = document.createElement('label'); label.className = 'kit-keep-background';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(item.keepBackground); checkbox.disabled = Boolean(worker) || loading; checkbox.setAttribute('aria-label', `Keep original background for ${item.file.name}`);
      checkbox.addEventListener('change', () => { item.keepBackground = checkbox.checked; markStale(); report('Photo setting changed. Rebuild to apply it.'); });
      label.append(checkbox, document.createTextNode('Keep this photo’s background')); row.append(label);
    }
    list.append(row);
  });
  const prepared = items.filter(item => item.product).length;
  $('#kit-count').textContent = items.length ? `${items.length} photo${items.length === 1 ? '' : 's'} · ${prepared ? `${prepared * 3} images ready` : `up to ${items.length * 3} images`}` : 'No photos yet'; showPreview();
}
async function thumbnail(file) {
  let bitmap, canvas;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 24_000_000) throw new Error(`${file.name} is over 24 megapixels. Resize it in Image converter first.`);
    const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height)); canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('This browser could not prepare a preview.'); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This photo could not be previewed.')), 'image/png'));
  } catch (error) { throw new Error(error.message?.includes('megapixels') ? error.message : `${file.name} could not be read. Choose a valid JPG, PNG or WebP photo.`); }
  finally { bitmap?.close(); if (canvas) canvas.width = canvas.height = 1; }
}
async function addFiles(files, replace = false) {
  if (worker || loading || !files.length) return;
  const created = []; const current = ++revision;
  try {
    const combined = replace ? files : [...items.map(item => item.file), ...files]; validateKitFiles(combined);
    loading = true; busy(); report('Opening your photos on this device…');
    for (const file of files) created.push({ file, sourceURL: URL.createObjectURL(await thumbnail(file)), outputURL: null, product: null });
    if (current !== revision) { created.forEach(item => URL.revokeObjectURL(item.sourceURL)); return; }
    clearResult(); if (replace) { items.forEach(item => URL.revokeObjectURL(item.sourceURL)); items = []; }
    items.push(...created); selected = 0; renderFiles(); report(`${items.length} photo${items.length === 1 ? '' : 's'} ready. Choose your finish, then build the kit.`);
  } catch (error) { created.forEach(item => URL.revokeObjectURL(item.sourceURL)); report(error.message, true); }
  finally { loading = false; $('#kit-input').value = ''; busy(); }
}
$('#kit-input').addEventListener('change', event => addFiles([...event.target.files]));
for (const eventName of ['dragenter', 'dragover']) $('#kit-drop').addEventListener(eventName, event => { event.preventDefault(); if (!worker && !loading) $('#kit-drop').classList.add('is-dragging'); });
$('#kit-drop').addEventListener('dragleave', () => $('#kit-drop').classList.remove('is-dragging'));
$('#kit-drop').addEventListener('drop', event => { event.preventDefault(); $('#kit-drop').classList.remove('is-dragging'); addFiles([...event.dataTransfer.files]); });
// A drop outside the input must not navigate away from files already in memory.
window.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
window.addEventListener('drop', event => { if (event.dataTransfer?.files.length) event.preventDefault(); });
$('#kit-sample').addEventListener('click', async () => {
  if (worker || loading) return; loading = true; busy(); report('Preparing the sample collection…');
  try {
    const response = await fetch('/assets/demos/headphones.png'); if (!response.ok) throw new Error('The sample could not load. Try again online, or choose your own photos.');
    const blob = await response.blob(), bitmap = await createImageBitmap(blob), samples = [];
    try {
      for (const [index, background] of ['#ead9c1', '#e4e9ed', '#f8f7f2'].entries()) {
        const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 850;
        try {
          const context = canvas.getContext('2d'); context.fillStyle = background; context.fillRect(0, 0, 1000, 850);
          const scale = Math.min(730 / bitmap.width, 670 / bitmap.height), width = bitmap.width * scale, height = bitmap.height * scale;
          context.save(); context.translate(500 + (index - 1) * 70, 425); context.rotate((index - 1) * .09); context.drawImage(bitmap, -width / 2, -height / 2, width, height); context.restore();
          const photo = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The sample could not be prepared.')), 'image/png'));
          samples.push(new File([photo], `headphones-${['warm', 'cool', 'studio'][index]}.png`, { type: 'image/png' }));
        } finally { canvas.width = canvas.height = 1; }
      }
    } finally { bitmap.close(); }
    loading = false; await addFiles(samples, true);
  } catch (error) { report(error.message, true); } finally { loading = false; busy(); }
});
$('#kit-settings').addEventListener('input', () => {
  markStale(); updateSpec(); renderFiles(); if (items.length) report('Settings changed. Build the kit to apply your new finish.');
});
function markStale() { $('#kit-stale-note').hidden = !downloadURL; }
$('#kit-variant').addEventListener('change', showPreview);
$('#kit-compare').addEventListener('input', event => { $('#kit-before-layer').style.clipPath = `inset(0 ${100 - Number(event.target.value)}% 0 0)`; });
function stopWorker() { worker?.terminate(); worker = null; busy(); }
$('#kit-form').addEventListener('submit', event => {
  event.preventDefault(); if (worker || loading || !items.length) return;
  const pending = [], failed = [], builtSettings = settings();
  markStale(); $('#kit-retry').hidden = true; $('#kit-progress').value = 0; $('#kit-progress').hidden = false; report('Starting your product kit…');
  try { worker = new Worker(new URL('../fileforge/product-kit.worker.js', import.meta.url), { type: 'module' }); }
  catch { report('This browser could not start the local engine. Update your browser and try again.', true); busy(); return; }
  busy();
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      report(`${data.index + 1} of ${items.length} · ${data.message}`); $('#kit-progress').value = Math.min(97, (data.index + (data.stage + .2) / 3) / items.length * 100);
      document.querySelectorAll('[data-kit-stage]').forEach(node => { const stage = Number(node.dataset.kitStage); node.classList.toggle('is-active', stage === data.stage); node.classList.toggle('is-done', stage < data.stage); });
    } else if (data.type === 'item') {
      pending[data.index] = data;
    } else if (data.type === 'item-error') {
      failed.push(data);
    } else if (data.type === 'result') {
      clearResult();
      pending.forEach((entry, index) => { if (entry && items[index]) { items[index].outputs = entry.outputs.map(output => ({ ...output, url: URL.createObjectURL(output.blob) })); items[index].product = entry.product; } });
      failed.forEach(entry => { if (items[entry.index]) items[entry.index].error = entry.message; const line = document.createElement('li'); line.textContent = `${items[entry.index]?.file.name || 'Photo'}: ${entry.message}`; $('#kit-errors').append(line); });
      selected = pending.findIndex(Boolean); renderFiles();
      downloadURL = URL.createObjectURL(new Blob([data.bytes], { type: 'application/zip' })); const link = $('#kit-download'); link.href = downloadURL; link.download = data.name;
      $('#kit-result-summary').textContent = `${builtSettings.name} · ${data.count} images · ${formatBytes(data.bytes.byteLength)}${data.skipped ? ` · ${data.skipped} skipped` : ''}`;
      $('#kit-finished').hidden = false; $('#kit-progress').hidden = false; $('#kit-progress').value = 100; report(data.skipped ? 'Your kit contains the photos that finished. Skipped photos and reasons are listed below and in kit.json.' : 'Your kit is ready. Inspect the full-size images before publishing.');
      document.querySelectorAll('[data-kit-stage]').forEach(node => { node.classList.remove('is-active'); node.classList.add('is-done'); }); stopWorker();
      if (matchMedia('(max-width: 600px)').matches) $('#kit-finished').scrollIntoView({ behavior: 'instant', block: 'center' });
      link.focus({ preventScroll: true });
    } else if (data.type === 'error') { failedRun(data.message); }
  };
  worker.onerror = event => { event.preventDefault(); failedRun('The local engine stopped. Try fewer or smaller photos, or turn off background removal.'); };
  worker.postMessage({ files: items.map(item => item.file), settings: builtSettings, keepBackground: items.flatMap((item, index) => item.keepBackground ? [index] : []) });
});
function failedRun(message) { stopWorker(); $('#kit-progress').hidden = true; $('#kit-retry').hidden = !settings().remove; report(`${message}${downloadURL ? ' Your previous kit is still available to download.' : ' Your original photos are still here.'}`, true); }
$('#kit-cancel').addEventListener('click', () => { stopWorker(); $('#kit-progress').hidden = true; report(`Processing cancelled. Your original photos and settings are ready to try again.${downloadURL ? ' Your previous kit is still available.' : ''}`); });
$('#kit-retry').addEventListener('click', () => { $('#kit-remove').checked = false; updateSpec(); $('#kit-form').requestSubmit(); });
$('#kit-reset').addEventListener('click', () => { if (worker || loading) return; ++revision; clearResult(); items.forEach(item => URL.revokeObjectURL(item.sourceURL)); items = []; selected = 0; renderFiles(); busy(); report('Workspace cleared. Add photos to start a fresh kit.'); $('#kit-input').focus(); });
function hasSaved() { try { return Boolean(localStorage.getItem(storageKey)); } catch { return false; } }
$('#kit-save').addEventListener('click', () => { try { localStorage.setItem(storageKey, JSON.stringify(settings())); $('#kit-save-status').textContent = 'Setup saved on this device. No photos were saved.'; } catch { $('#kit-save-status').textContent = 'Your browser blocked saving. You can still build a kit.'; } busy(); });
$('#kit-load').addEventListener('click', () => { try { const saved = JSON.parse(localStorage.getItem(storageKey)); applySettings(saved); markStale(); $('#kit-save-status').textContent = 'Saved setup loaded. Build the kit to apply it.'; } catch { $('#kit-save-status').textContent = 'The saved setup could not be read. Save a new one.'; } });
$('#kit-forget').addEventListener('click', () => { try { localStorage.removeItem(storageKey); $('#kit-save-status').textContent = 'Saved setup forgotten.'; } catch { $('#kit-save-status').textContent = 'Your browser blocked the change.'; } busy(); });
window.addEventListener('pagehide', () => { if (worker) { stopWorker(); $('#kit-progress').hidden = true; report('Processing stopped when you left. Your selected photos and any previous kit are still here.'); } });
applySettings(KIT_DEFAULTS); busy();
