import { formatBytes, resultName } from './shared.js';
import { cropBounds, scaledSize } from './advanced-shared.js';
import { createBackgroundEditor } from './background-editor.js';
import { configureToolBridge, publishToolResult, publishToolSelection, invalidateToolResult } from './workspace-bridge.js';
import './advanced.css';

const $ = selector => document.querySelector(selector);
const kind = document.body.dataset.advancedTool;
const requestedFormat = new URLSearchParams(location.search).get('format');
if (kind === 'pdfimages' && ['png', 'jpg'].includes(requestedFormat)) $('#pdf-format').value = requestedFormat;
const workspace = $('#advanced-workspace');
const input = $('#advanced-input'), drop = $('#advanced-drop');
const settings = $('#advanced-options'), run = $('#advanced-run'), cancel = $('#advanced-cancel');
const limits = { background: 12_000_000, trace: 40_000_000, crop: 40_000_000 };
const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
let selected = null, bitmap = null, sourceURL = null, outputURLs = [], active = null, loading = false, revision = 0;
let crop = null, drag = null;
let backgroundEditor = null;

function report(message, error = false) {
  const status = $('#advanced-status');
  status.textContent = message; status.classList.toggle('is-error', error);
}

function clearOutput() {
  invalidateToolResult();
  $('#advanced-output-preview').removeAttribute('src');
  $('#advanced-result').hidden = true;
  $('#advanced-download').removeAttribute('href');
  outputURLs.forEach(url => URL.revokeObjectURL(url)); outputURLs = [];
}

function releaseSource() {
  backgroundEditor?.dispose(); backgroundEditor = null;
  bitmap?.close(); bitmap = null;
  if (sourceURL) URL.revokeObjectURL(sourceURL); sourceURL = null;
  $('#advanced-original-preview')?.removeAttribute('src');
  if ($('#advanced-original-preview')) $('#advanced-original-preview').hidden = true;
  $('#crop-source')?.removeAttribute('src');
  if ($('#crop-workspace')) $('#crop-workspace').hidden = true;
  crop = null; drag = null;
}

function setBusy() {
  const busy = Boolean(active) || loading;
  workspace.setAttribute('aria-busy', String(busy));
  input.disabled = busy; $('#advanced-clear').disabled = busy;
  settings.disabled = busy;
  run.disabled = busy || !selected;
  cancel.hidden = !active; cancel.disabled = false;
  if (drop.tagName === 'BUTTON') drop.disabled = busy;
  drop.setAttribute('aria-disabled', String(busy));
  $('#crop-stage')?.classList.toggle('is-busy', busy);
  backgroundEditor?.setBusy(busy);
  if (kind === 'background') {
    run.textContent = backgroundEditor ? 'Export PNG ↗' : 'Remove background ↗';
    $('#background-export').disabled = busy || !backgroundEditor;
  }
}

function encode(canvas, type, quality = 0.92) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob || blob.type !== type) reject(new Error('This browser could not export that format. Try PNG.'));
    else if (blob.size > 150_000_000) reject(new Error('The result exceeds 150 MB. Choose a smaller image or crop.'));
    else resolve(blob);
  }, type, quality));
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the image. Try a smaller file.');
  return { canvas, context };
}

function releaseCanvas(canvas) { canvas.width = 1; canvas.height = 1; }

async function selectFiles(files) {
  if (active || loading || !files.length) return;
  input.value = '';
  if (files.length !== 1) { report('Choose one file at a time. Your current selection has been kept.', true); return; }
  const file = files[0], extension = file.name.split('.').pop().toLowerCase();
  const limit = kind === 'pdfimages' ? 25_000_000 : 20_000_000;
  if (!file.size || file.size > limit || !(kind === 'pdfimages' ? extension === 'pdf' : imageExtensions.includes(extension))) {
    report(!file.size ? 'This file is empty.' : file.size > limit ? `Choose a file under ${formatBytes(limit)}. Your current selection has been kept.` : kind === 'pdfimages' ? 'Choose a PDF file.' : 'Choose a JPG, PNG, WebP, GIF or BMP image.', true); return;
  }
  loading = true; setBusy(); const current = ++revision;
  let nextBitmap, preview;
  try {
    report(kind === 'pdfimages' ? 'Preparing your PDF selection…' : 'Opening the image on your device…');
    if (kind !== 'pdfimages') {
      if (typeof createImageBitmap !== 'function') throw new Error('This tool needs a recent browser with image support. Update your browser and try again.');
      try { nextBitmap = await createImageBitmap(file); }
      catch { throw new Error('This image could not be read. Choose a valid JPG, PNG or WebP file.'); }
      if (nextBitmap.width * nextBitmap.height > limits[kind]) throw new Error(`Choose an image below ${limits[kind] / 1_000_000} megapixels. Resize it in Image converter first.`);
      const previewSize = scaledSize(nextBitmap.width, nextBitmap.height, 1200);
      const { canvas, context } = canvasOf(previewSize.width, previewSize.height);
      try {
        context.drawImage(nextBitmap, 0, 0, previewSize.width, previewSize.height);
        preview = await encode(canvas, 'image/png');
      } finally { releaseCanvas(canvas); }
    }
    if (current !== revision) return;
    clearOutput(); releaseSource(); selected = file;
    publishToolSelection([file]);
    bitmap = nextBitmap; nextBitmap = null;
    $('#advanced-filename').textContent = `${file.name} · ${formatBytes(file.size)}${bitmap ? ` · ${bitmap.width} × ${bitmap.height}px` : ''}`;
    $('#advanced-clear').hidden = false;
    if (bitmap) {
      // Use the decoded first frame for both previews and exports, including animated inputs.
      sourceURL = URL.createObjectURL(preview);
      const original = $('#advanced-original-preview');
      if (original) { original.src = sourceURL; original.hidden = false; }
      if (kind === 'crop') {
        $('#crop-source').src = sourceURL; $('#crop-workspace').hidden = false;
        $('#crop-stage').style.maxWidth = `${Math.min(680, 640 * bitmap.width / bitmap.height)}px`;
        resetCrop();
      }
    }
    report(kind === 'pdfimages' ? 'Ready. Choose your pages and export size.' : 'Ready. Your original image stays unchanged.');
  } catch (error) {
    if (current === revision) report(`${error.message || 'This file could not be opened.'}${selected ? ' Your current selection has been kept.' : ''}`, true);
  } finally { nextBitmap?.close(); loading = false; setBusy(); }
}

function workerResult(worker, message, job) {
  return new Promise((resolve, reject) => {
    job.worker = worker;
    const aborted = () => finish(new DOMException('Cancelled', 'AbortError'));
    const finish = (error, result) => {
      job.controller.signal.removeEventListener('abort', aborted);
      worker.terminate(); job.worker = null;
      error ? reject(error) : resolve(result);
    };
    job.controller.signal.addEventListener('abort', aborted, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') report(data.message);
      else if (data.type === 'error') finish(new Error(data.message));
      else if (data.type === 'result') finish(null, data);
    };
    worker.onerror = () => finish(new Error('The local engine stopped. Try a smaller image or refresh this page.'));
    worker.postMessage(message, [message.pixels]);
  });
}

async function traceImage(job) {
  const size = scaledSize(bitmap.width, bitmap.height, 1000);
  const { canvas, context } = canvasOf(size.width, size.height);
  try {
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const pixels = context.getImageData(0, 0, size.width, size.height).data.buffer;
    report('Tracing shapes and colours on your device…');
    const worker = new Worker(new URL('./trace.worker.js', import.meta.url), { type: 'module' });
    const result = await workerResult(worker, { pixels, ...size, colors: Number($('#trace-colors').value), detail: $('#trace-detail').value }, job);
    job.controller.signal.throwIfAborted();
    const blob = new Blob([result.svg], { type: 'image/svg+xml' });
    return { blob, preview: blob, name: resultName(selected.name, 'svg'), detail: `${size.width} × ${size.height} tracing canvas · ${$('#trace-colors').value} colours · editable vector paths. Photographs are approximated.` };
  } finally { releaseCanvas(canvas); }
}

async function removeBackground(job) {
  if (backgroundEditor) return exportBackground(job);
  const { canvas: modelCanvas, context: modelContext } = canvasOf(320, 320);
  try {
    // Transparent source areas are white during inference; source alpha is preserved in the result.
    modelContext.fillStyle = '#ffffff'; modelContext.fillRect(0, 0, 320, 320);
    modelContext.drawImage(bitmap, 0, 0, 320, 320);
    const pixels = modelContext.getImageData(0, 0, 320, 320).data.buffer;
    const worker = new Worker(new URL('./background.worker.js', import.meta.url), { type: 'module' });
    const result = await workerResult(worker, { pixels }, job);
    job.controller.signal.throwIfAborted();
    backgroundEditor = createBackgroundEditor({ bitmap, mask: result.mask, onDirty: clearOutput, report });
    backgroundEditor.setBusy(true);
    return exportBackground(job);
  } finally { releaseCanvas(modelCanvas); }
}

async function exportBackground(job) {
  report('Preparing your full-resolution PNG download…');
  const blob = await backgroundEditor.exportPNG(job.controller.signal);
  return { blob, preview: blob, name: resultName(selected.name, 'png'), detail: `${bitmap.width} × ${bitmap.height}px · ${backgroundEditor.background ? `${backgroundEditor.background} background` : 'transparent background'} · original image unchanged` };
}

async function cropImage(job) {
  const rect = readCrop();
  const format = $('#crop-format').value;
  const type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[format];
  if (!type) throw new Error('Choose PNG, JPG or WebP output.');
  const { canvas, context } = canvasOf(rect.width, rect.height);
  try {
    if (format === 'jpg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, rect.width, rect.height); }
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    report('Exporting your crop…');
    const blob = await encode(canvas, type); job.controller.signal.throwIfAborted();
    return { blob, preview: blob, name: resultName(selected.name, format), detail: `${rect.width} × ${rect.height}px · source metadata removed${format === 'jpg' ? ' · transparent areas use white' : ''}.` };
  } finally { releaseCanvas(canvas); }
}

async function convert() {
  if (active || loading || !selected) return;
  clearOutput();
  const job = { controller: new AbortController(), worker: null }; active = job; setBusy();
  try {
    let result;
    if (kind === 'background') result = await removeBackground(job);
    else if (kind === 'trace') result = await traceImage(job);
    else if (kind === 'crop') result = await cropImage(job);
    else {
      report('Loading the PDF image engine…');
      const { exportPDFImages } = await import('./pdf-images.js'); job.controller.signal.throwIfAborted();
      result = await exportPDFImages(selected, { pages: $('#pdf-pages').value, edge: Number($('#pdf-edge').value), format: $('#pdf-format').value }, job.controller.signal, report);
    }
    job.controller.signal.throwIfAborted();
    const downloadURL = URL.createObjectURL(result.blob); outputURLs.push(downloadURL);
    const previewURL = result.preview === result.blob ? downloadURL : URL.createObjectURL(result.preview);
    if (previewURL !== downloadURL) outputURLs.push(previewURL);
    $('#advanced-output-preview').src = previewURL;
    const link = $('#advanced-download'); link.href = downloadURL; link.download = result.name;
    link.textContent = `Download ${result.blob.type === 'application/zip' ? 'ZIP' : result.name.split('.').pop().toUpperCase()}`;
    $('#advanced-result-detail').textContent = `${result.detail} · ${formatBytes(result.blob.size)}`;
    $('#advanced-result').hidden = false;
    publishToolResult(result);
    report(kind === 'background' ? 'Cutout ready. Refine the edges with erase or restore, then export your changes.' : 'Done. Preview your result, then download it.');
  } catch (error) {
    report(job.controller.signal.aborted ? 'Cancelled. Your file is ready to try again.' : error.message || 'This file could not be processed. Try a smaller file.', !job.controller.signal.aborted);
  } finally { job.worker?.terminate(); if (active === job) active = null; setBusy(); }
}

function readCrop() {
  return cropBounds(Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, $(`#crop-${key}`).value])), bitmap.width, bitmap.height);
}

function paintCrop() {
  if (!crop || !bitmap) return;
  const selection = $('#crop-selection');
  selection.style.left = `${crop.x / bitmap.width * 100}%`;
  selection.style.top = `${crop.y / bitmap.height * 100}%`;
  selection.style.width = `${crop.width / bitmap.width * 100}%`;
  selection.style.height = `${crop.height / bitmap.height * 100}%`;
  for (const key of ['x', 'y', 'width', 'height']) $(`#crop-${key}`).value = crop[key];
}

function aspect() { const value = Number($('#crop-aspect').value); return Number.isFinite(value) && value > 0 ? value : null; }

function resetCrop() {
  if (!bitmap) return;
  const ratio = aspect(); let width = bitmap.width, height = bitmap.height;
  if (ratio) { width = Math.min(width, Math.floor(height * ratio)); height = Math.min(height, Math.round(width / ratio)); }
  crop = { x: Math.floor((bitmap.width - width) / 2), y: Math.floor((bitmap.height - height) / 2), width: Math.max(1, width), height: Math.max(1, height) };
  for (const key of ['x', 'width']) $(`#crop-${key}`).max = bitmap.width;
  for (const key of ['y', 'height']) $(`#crop-${key}`).max = bitmap.height;
  paintCrop(); clearOutput();
}

function point(event) {
  const bounds = $('#crop-source').getBoundingClientRect();
  return { x: Math.max(0, Math.min(bitmap.width - 1, Math.round((event.clientX - bounds.left) / bounds.width * bitmap.width))), y: Math.max(0, Math.min(bitmap.height - 1, Math.round((event.clientY - bounds.top) / bounds.height * bitmap.height))) };
}

function moveCrop(event) {
  if (!drag || event.pointerId !== drag.id || active || loading) return;
  const end = point(event), dx = end.x - drag.start.x, dy = end.y - drag.start.y;
  let width = Math.abs(dx) + 1, height = Math.abs(dy) + 1;
  const ratio = aspect();
  if (ratio) {
    // Fit the chosen ratio inside the dragged rectangle and available image area.
    const availableWidth = dx < 0 ? drag.start.x + 1 : bitmap.width - drag.start.x;
    const availableHeight = dy < 0 ? drag.start.y + 1 : bitmap.height - drag.start.y;
    width = Math.max(1, Math.min(width, Math.round(height * ratio), availableWidth, Math.floor(availableHeight * ratio)));
    height = Math.max(1, Math.min(availableHeight, Math.round(width / ratio)));
  }
  crop = { x: dx < 0 ? Math.max(0, drag.start.x - width + 1) : drag.start.x, y: dy < 0 ? Math.max(0, drag.start.y - height + 1) : drag.start.y, width, height };
  paintCrop(); clearOutput();
}

input.accept = kind === 'pdfimages' ? '.pdf' : '.jpg,.jpeg,.png,.webp,.gif,.bmp'; input.multiple = false;
if (kind === 'pdfimages') {
  $('#advanced-original-preview')?.closest('figure')?.setAttribute('hidden', '');
  $('#advanced-output-preview').closest('.advanced-comparison')?.classList.add('single-preview');
  const caption = $('#advanced-output-preview').closest('figure')?.querySelector('figcaption');
  if (caption) caption.textContent = 'First exported page';
}
input.addEventListener('change', () => void selectFiles(Array.from(input.files)));
if (drop.tagName === 'BUTTON') drop.addEventListener('click', () => { if (!active && !loading) input.click(); });
for (const event of ['dragenter', 'dragover']) drop.addEventListener(event, e => { e.preventDefault(); if (!active && !loading) drop.classList.add('dragging'); });
for (const event of ['dragleave', 'drop']) drop.addEventListener(event, e => { e.preventDefault(); drop.classList.remove('dragging'); });
drop.addEventListener('drop', event => void selectFiles(Array.from(event.dataTransfer.files)));
function clearSelection() {
  if (active || loading) return;
  revision++; selected = null; input.value = ''; clearOutput(); releaseSource();
  $('#advanced-filename').textContent = 'No file selected'; $('#advanced-clear').hidden = true;
  report('Choose a file to begin.'); setBusy();
  publishToolSelection([]);
}
$('#advanced-clear').addEventListener('click', clearSelection);
configureToolBridge({ selectFiles, busy: () => Boolean(active) || loading, clear: clearSelection, applyPreset: preset => {
  if (kind === 'crop' && bitmap && preset === 'product-crop') { $('#crop-aspect').value = '1'; $('#crop-format').value = 'png'; resetCrop(); }
} });
run.addEventListener('click', event => { event.preventDefault(); void convert(); });
cancel.addEventListener('click', () => { if (active) { report('Cancelling…'); cancel.disabled = true; active.controller.abort(); } });
settings.addEventListener('change', event => {
  if (active || loading) return;
  clearOutput();
  if (kind === 'crop' && bitmap && event.target.id.startsWith('crop-') && !['crop-format', 'crop-aspect'].includes(event.target.id)) {
    try {
      const ratio = aspect();
      if (ratio && event.target.id === 'crop-width') $('#crop-height').value = Math.max(1, Math.round(Number($('#crop-width').value) / ratio));
      if (ratio && event.target.id === 'crop-height') $('#crop-width').value = Math.max(1, Math.round(Number($('#crop-height').value) * ratio));
      crop = readCrop(); paintCrop(); report('Crop updated. Your original image stays unchanged.');
    }
    catch (error) { report(error.message, true); }
  }
});
if (kind === 'background') {
  const updateColourControl = () => { $('#background-colour-control').hidden = $('#background-fill').value !== 'custom'; };
  $('#background-fill').addEventListener('change', updateColourControl); updateColourControl();
  $('#background-export').addEventListener('click', () => void convert());
}
if (kind === 'crop') {
  $('#crop-aspect').addEventListener('change', resetCrop);
  $('#crop-reset').addEventListener('click', () => { if (!active && !loading) { $('#crop-aspect').value = 'free'; resetCrop(); report('Full image restored.'); } });
  const stage = $('#crop-stage');
  stage.addEventListener('pointerdown', event => {
    if (active || loading || !bitmap || event.button !== 0) return;
    event.preventDefault(); drag = { id: event.pointerId, start: point(event) };
    stage.setPointerCapture(event.pointerId); moveCrop(event);
  });
  stage.addEventListener('pointermove', moveCrop);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(event, () => { drag = null; });
  $('#crop-source').draggable = false;
}
window.addEventListener('pagehide', () => {
  revision++; active?.controller.abort(); active?.worker?.terminate(); clearOutput(); releaseSource(); selected = null;
  $('#advanced-filename').textContent = 'No file selected'; $('#advanced-clear').hidden = true; setBusy();
});
window.addEventListener('pageshow', event => { if (event.persisted) { report('Choose a file to begin.'); setBusy(); } });
setBusy();
