import { formatBytes, resultName } from './shared.js';
import { scaledSize } from './advanced-shared.js';
import { validateQuad, quadHomography } from './scanner-math.js';
import { drawAngledSample, SAMPLE_NAME, SAMPLE_QUAD, SAMPLE_SIZE } from './scanner-sample.js';
import { configureToolBridge, publishToolSelection, publishToolBusy, invalidateToolResult, publishToolResult } from './workspace-bridge.js';
import './scanner.css';

const $ = selector => document.querySelector(selector);
const workspace = $('#advanced-workspace'), input = $('#scanner-input'), stage = $('#scanner-stage');
const treatments = { original: 'original colour', color: 'clean colour', gray: 'grayscale', bw: 'black & white' };
let selected = null, bitmap = null, points = [], sourceURL = null, previewURL = null, downloadURL = null, previewCanvas = null;
let active = null, loading = false, revision = 0, valid = false, drag = null, previewDetail = '';

const busy = () => Boolean(active) || loading;
function report(message, error = false) { $('#scanner-status').textContent = message; $('#scanner-status').classList.toggle('is-error', error); }
function updateBusy() {
  const value = busy(); workspace.setAttribute('aria-busy', String(value)); publishToolBusy(value);
  input.disabled = value; $('#scanner-clear').disabled = value; $('#scanner-sample').disabled = value; $('#scanner-reset').disabled = value;
  $('#scanner-options').disabled = value; $('#scanner-coordinates').disabled = value;
  document.querySelectorAll('.scanner-handle').forEach(handle => { handle.disabled = value; });
  $('#scanner-run').disabled = value || !selected || !valid; $('#scanner-cancel').hidden = !active; $('#scanner-progress').hidden = !active;
  $('#scanner-format').disabled = value; $('#scanner-export').disabled = value || !previewCanvas;
  stage.classList.toggle('is-busy', value); $('#scanner-drop').setAttribute('aria-disabled', String(value));
}
function invalidateExport() {
  invalidateToolResult();
  $('#scanner-download').hidden = true; $('#scanner-download').removeAttribute('href');
  if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL = null;
}
function invalidatePreview() {
  invalidateExport(); $('#scanner-result').hidden = true; $('#scanner-output').removeAttribute('src');
  if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null;
  if (previewCanvas) { previewCanvas.width = previewCanvas.height = 1; previewCanvas = null; }
  previewDetail = '';
}
function releaseSource() {
  bitmap?.close(); bitmap = null;
  if (sourceURL) URL.revokeObjectURL(sourceURL); sourceURL = null;
  $('#scanner-source').removeAttribute('src'); $('#scanner-editor').hidden = true; points = []; valid = false; drag = null;
}
function clear() {
  if (busy()) return;
  revision++; selected = null; input.value = ''; invalidatePreview(); releaseSource();
  $('#scanner-filename').textContent = 'No photo selected'; $('#scanner-clear').hidden = true;
  publishToolSelection([]); report('Cleared. Choose another photo or try the angled sample.'); updateBusy();
}
function encode(canvas, type = 'image/png', quality = .92) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob || blob.type !== type) reject(new Error('This browser could not export that format. Try PNG.'));
    else if (blob.size > 40_000_000) reject(new Error('The scan exceeds 40 MB. Choose JPG for a smaller file.'));
    else resolve(blob);
  }, type, quality));
}
function fullImage() { return [{ x: 0, y: 0 }, { x: bitmap.width - 1, y: 0 }, { x: bitmap.width - 1, y: bitmap.height - 1 }, { x: 0, y: bitmap.height - 1 }]; }
function paintCorners(writeInputs = true) {
  if (!bitmap) return;
  const width = bitmap.width - 1, height = bitmap.height - 1;
  $('#scanner-overlay').setAttribute('viewBox', `0 0 ${width} ${height}`);
  const polygon = points.map(point => `${point.x},${point.y}`).join(' ');
  $('#scanner-outline').setAttribute('points', polygon);
  $('#scanner-dim').setAttribute('d', `M0 0H${width}V${height}H0Z M${points.map(point => `${point.x} ${point.y}`).join('L')}Z`);
  points.forEach((point, index) => {
    const handle = $(`[data-corner="${index}"]`); handle.style.left = `${Math.max(0, Math.min(100, point.x / width * 100))}%`; handle.style.top = `${Math.max(0, Math.min(100, point.y / height * 100))}%`;
    handle.setAttribute('aria-label', `${['Top left', 'Top right', 'Bottom right', 'Bottom left'][index]} corner, X ${point.x}, Y ${point.y}. Use arrow keys to move.`);
    if (writeInputs) { $(`#scanner-x-${index}`).value = point.x; $(`#scanner-y-${index}`).value = point.y; }
  });
  try { validateQuad(points, bitmap.width, bitmap.height); quadHomography(points); valid = true; stage.classList.remove('is-invalid'); }
  catch (error) { valid = false; stage.classList.add('is-invalid'); report(error.message, true); }
  updateBusy();
}
function selectionChanged() { invalidatePreview(); paintCorners(); if (valid) report('Corners updated. Straighten the page to see your real preview.'); }

async function selectFiles(files, samplePoints = null) {
  if (busy() || !files?.length) return;
  input.value = '';
  if (files.length !== 1) { report('Choose one document photo at a time. Your current selection has been kept.', true); return; }
  const file = files[0], extension = file.name.split('.').pop().toLowerCase();
  if (!file.size || file.size > 20_000_000 || !['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(extension)) { report(!file.size ? 'This photo is empty.' : file.size > 20_000_000 ? 'Choose a photo under 20 MB.' : 'Choose a JPG, PNG, WebP, GIF or BMP photo.', true); return; }
  loading = true; updateBusy(); const current = ++revision;
  let nextBitmap, preview;
  try {
    report('Opening the photo on your device…');
    try { nextBitmap = await createImageBitmap(file); } catch { throw new Error('This image could not be read. Choose a valid image file.'); }
    if (nextBitmap.width * nextBitmap.height > 12_000_000 || nextBitmap.width < 2 || nextBitmap.height < 2) throw new Error('Choose a photo between 2 pixels and 12 megapixels. Resize larger photos in Image studio first.');
    const size = scaledSize(nextBitmap.width, nextBitmap.height, 1200), canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
    try { const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height); context.drawImage(nextBitmap, 0, 0, size.width, size.height); preview = await encode(canvas); }
    finally { canvas.width = canvas.height = 1; }
    if (current !== revision) return;
    invalidatePreview(); releaseSource(); selected = file; bitmap = nextBitmap; nextBitmap = null;
    // The workspace's document demo hands over the same generated page: reuse its known corners.
    if (!samplePoints && file.name === SAMPLE_NAME && bitmap.width === SAMPLE_SIZE.width && bitmap.height === SAMPLE_SIZE.height) samplePoints = SAMPLE_QUAD;
    points = samplePoints ? validateQuad(samplePoints, bitmap.width, bitmap.height) : fullImage();
    sourceURL = URL.createObjectURL(preview); $('#scanner-source').src = sourceURL; $('#scanner-editor').hidden = false;
    $('#scanner-filename').textContent = `${file.name} · ${formatBytes(file.size)} · ${bitmap.width} × ${bitmap.height}px${samplePoints ? ' · generated sample' : ''}`;
    $('#scanner-clear').hidden = false;
    for (let index = 0; index < 4; index++) { $(`#scanner-x-${index}`).max = bitmap.width - 1; $(`#scanner-y-${index}`).max = bitmap.height - 1; }
    paintCorners(); publishToolSelection([file]);
    report(samplePoints ? 'Generated sample: its known page corners are selected. Straighten it, or move a handle to explore.' : 'Place the four handles on your page corners, then straighten & preview.');
  } catch (error) { if (current === revision) report(`${error.message}${selected ? ' Your current selection has been kept.' : ''}`, true); }
  finally { nextBitmap?.close(); loading = false; updateBusy(); }
}

function runWorker(job, message) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./scanner.worker.js', import.meta.url), { type: 'module' }); job.worker = worker;
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    let settled = false;
    function finish(error, data) {
      if (settled) return; settled = true; job.controller.signal.removeEventListener('abort', abort); worker.terminate(); job.worker = null; error ? reject(error) : resolve(data);
    }
    job.controller.signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => { if (data.type === 'progress') { report(data.message); $('#scanner-progress').value = data.progress; } else if (data.type === 'result') finish(null, data); else if (data.type === 'error') finish(new Error(data.message)); };
    worker.onerror = () => finish(new Error('The scanner stopped. Try a smaller photo or refresh this page.'));
    worker.postMessage(message, [message.pixels]);
  });
}
async function straighten() {
  if (!selected || busy() || !valid) return;
  const quad = validateQuad(points, bitmap.width, bitmap.height), mode = $('#scanner-treatment').value;
  invalidatePreview(); const job = { controller: new AbortController(), worker: null, revision }; active = job; updateBusy();
  let canvas;
  const timeout = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, 60_000);
  try {
    report('Preparing the real photo pixels…'); $('#scanner-progress').value = 0;
    canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer;
    const width = bitmap.width, height = bitmap.height; canvas.width = canvas.height = 1;
    const result = await runWorker(job, { pixels, width, height, points: quad, mode }); job.controller.signal.throwIfAborted();
    canvas = document.createElement('canvas'); canvas.width = result.width; canvas.height = result.height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.pixels), result.width, result.height), 0, 0);
    const blob = await encode(canvas); job.controller.signal.throwIfAborted();
    if (job.revision !== revision) return;
    previewCanvas = canvas; canvas = null; previewURL = URL.createObjectURL(blob); $('#scanner-output').src = previewURL;
    previewDetail = `${result.width} × ${result.height}px · ${treatments[mode]}`;
    $('#scanner-result-detail').textContent = previewDetail; $('#scanner-result').hidden = false; $('#scanner-progress').value = 1;
    report('Straightened. Review your page, then prepare an image or PDF to download.');
  } catch (error) { if (job.timedOut) report('The scanner reached its one-minute limit. Try a smaller photo.', true); else if (job.controller.signal.aborted || error.name === 'AbortError') report('Cancelled. Your photo and corners are ready to try again.'); else report(error.message || 'This document could not be straightened.', true); }
  finally { clearTimeout(timeout); job.worker?.terminate(); if (canvas) canvas.width = canvas.height = 1; if (active === job) active = null; updateBusy(); }
}
async function exportScan() {
  if (!previewCanvas || busy()) return;
  invalidateExport(); const job = { controller: new AbortController(), revision }; active = job; updateBusy();
  const format = $('#scanner-format').value;
  try {
    report(`Preparing your ${format.toUpperCase()} on this device…`);
    let blob;
    if (format === 'pdf') {
      const { PDFDocument } = await import('pdf-lib'); job.controller.signal.throwIfAborted();
      const png = await encode(previewCanvas); job.controller.signal.throwIfAborted();
      const doc = await PDFDocument.create(), image = await doc.embedPng(await png.arrayBuffer()); job.controller.signal.throwIfAborted();
      const scale = Math.min(1, 842 / Math.max(image.width, image.height)), width = image.width * scale, height = image.height * scale;
      doc.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
      blob = new Blob([await doc.save()], { type: 'application/pdf' });
    } else {
      if (!['png', 'jpg'].includes(format)) throw new Error('Choose PNG, JPG or PDF.');
      blob = await encode(previewCanvas, format === 'jpg' ? 'image/jpeg' : 'image/png', .92);
    }
    job.controller.signal.throwIfAborted(); if (job.revision !== revision) return;
    if (blob.size > 40_000_000) throw new Error('The exported file exceeds 40 MB. Try JPG for a smaller scan.');
    const name = resultName(selected.name, format); downloadURL = URL.createObjectURL(blob);
    $('#scanner-download').href = downloadURL; $('#scanner-download').download = name; $('#scanner-download').hidden = false;
    publishToolResult({ blob, name, detail: `${previewDetail}${format === 'pdf' ? ' · image-only PDF' : ''}` });
    report(`${format.toUpperCase()} ready · ${formatBytes(blob.size)}. Download it, or continue in the workspace.`);
  } catch (error) { report(job.controller.signal.aborted || error.name === 'AbortError' ? 'Export cancelled. Your preview is ready to try again.' : error.message || 'The scan could not be exported.', !job.controller.signal.aborted); }
  finally { if (active === job) active = null; updateBusy(); }
}

async function sample() {
  if (busy()) return;
  loading = true; updateBusy(); report('Drawing an original sample document on your device…');
  const current = revision;
  try {
    const created = await drawAngledSample(() => current !== revision);
    if (!created || current !== revision) return;
    const { blob, quad } = created;
    loading = false; updateBusy(); await selectFiles([new File([blob], SAMPLE_NAME, { type: 'image/png' })], quad);
  } catch (error) { report(error.message || 'Could not draw the sample. Choose your own document photo.', true); }
  finally { loading = false; updateBusy(); }
}

input.addEventListener('change', () => void selectFiles([...input.files]));
$('#scanner-clear').addEventListener('click', clear); $('#scanner-sample').addEventListener('click', () => void sample());
$('#scanner-run').addEventListener('click', () => void straighten()); $('#scanner-export').addEventListener('click', () => void exportScan());
$('#scanner-cancel').addEventListener('click', () => { active?.controller.abort(); report('Cancelling…'); });
$('#scanner-reset').addEventListener('click', () => { if (busy() || !bitmap) return; points = fullImage(); selectionChanged(); });
$('#scanner-treatment').addEventListener('change', () => { if (!busy()) { invalidatePreview(); report('Paper treatment updated. Straighten again to see the new preview.'); } });
$('#scanner-format').addEventListener('change', () => { if (!busy()) { invalidateExport(); $('#scanner-export').textContent = `Prepare ${$('#scanner-format').value.toUpperCase()} ↓`; report('Export format updated. Prepare the current preview in your chosen format.'); } });
document.querySelectorAll('#scanner-coordinates input').forEach(control => control.addEventListener('input', () => {
  if (busy() || !bitmap) return;
  if ([...document.querySelectorAll('#scanner-coordinates input')].some(input => input.value === '' || !Number.isInteger(Number(input.value)))) { valid = false; invalidatePreview(); report('Set all corner coordinates to whole pixels.', true); updateBusy(); return; }
  points = points.map((_, index) => ({ x: Number($(`#scanner-x-${index}`).value), y: Number($(`#scanner-y-${index}`).value) }));
  invalidatePreview(); paintCorners(false); if (valid) report('Coordinates updated. Straighten the page to review.');
}));
document.querySelectorAll('.scanner-handle').forEach(handle => {
  handle.addEventListener('pointerdown', event => { if (busy() || !bitmap || event.button !== 0) return; event.preventDefault(); handle.focus(); drag = { pointer: event.pointerId, index: Number(handle.dataset.corner) }; handle.setPointerCapture(event.pointerId); });
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer || busy()) return;
    const rect = stage.getBoundingClientRect(); points[drag.index] = { x: Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * (bitmap.width - 1)), y: Math.round(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * (bitmap.height - 1)) }; selectionChanged();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(event, () => { drag = null; });
  handle.addEventListener('keydown', event => {
    if (busy() || !bitmap || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const index = Number(handle.dataset.corner), step = event.shiftKey ? 10 : 1;
    points[index].x = Math.max(0, Math.min(bitmap.width - 1, points[index].x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)));
    points[index].y = Math.max(0, Math.min(bitmap.height - 1, points[index].y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))); selectionChanged();
  });
});
const drop = $('#scanner-drop');
for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, event => { event.preventDefault(); if (!busy()) drop.classList.add('dragging'); });
for (const name of ['dragleave', 'drop']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove('dragging'); });
drop.addEventListener('drop', event => void selectFiles([...event.dataTransfer.files]));
window.addEventListener('pagehide', () => { revision++; active?.controller.abort(); active?.worker?.terminate(); invalidatePreview(); releaseSource(); selected = null; });
configureToolBridge({ selectFiles, busy, clear, applyPreset: preset => {
  if (preset === 'document-photo') { $('#scanner-format').value = 'png'; $('#scanner-export').textContent = 'Prepare PNG ↓'; }
} }); updateBusy();
if (new URLSearchParams(location.search).get('sample') === '1') void sample();
