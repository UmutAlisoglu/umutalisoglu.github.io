import './screenshot-studio.css';
import { formatBytes } from './shared.js';
import { renderScreenshot, createScreenshotSample } from './screenshot-renderer.js';
import { configureToolBridge, publishToolSelection, publishToolBusy, invalidateToolResult, publishToolResult } from './workspace-bridge.js';

const $ = selector => document.querySelector(selector);
const input = $('#screenshot-input'), canvas = $('#screenshot-preview'), optionsPanel = $('#screenshot-options');
let source = null, selectedFile = null, outputURL = null, decoding = false, exportJob = null, selectionVersion = 0, previewFrame = null;
const busy = () => decoding || Boolean(exportJob);
const controls = { preset: 'size', frame: 'frame', background: 'background', color: 'color', padding: 'padding', roundness: 'roundness', shadow: 'shadow', tilt: 'tilt', caption: 'caption', textColor: 'text-color' };
const defaults = { size: 'landscape', frame: 'browser', background: 'aurora', color: '#eeeafa', padding: '96', roundness: '22', shadow: '45', tilt: '-2', caption: '', 'text-color': 'auto', format: 'png' };
const options = () => Object.fromEntries(Object.entries(controls).map(([key, id]) => [key, $(`#screenshot-${id}`).value]));
const report = text => { $('#screenshot-status').textContent = text; };
function clearOutput() {
  invalidateToolResult(); if (outputURL) URL.revokeObjectURL(outputURL); outputURL = null;
  $('#screenshot-download').removeAttribute('href'); $('#screenshot-result').hidden = true;
}
function updateBusy() {
  const value = busy(); $('#advanced-workspace').setAttribute('aria-busy', String(value)); publishToolBusy(value);
  optionsPanel.disabled = !source || value; input.disabled = value; $('#screenshot-sample').disabled = value;
  $('#screenshot-export').disabled = !source || value; $('#screenshot-zoom').disabled = !source || value; $('#screenshot-cancel').hidden = !value;
}
function clearSelection(announce = true) {
  selectionVersion++; exportJob?.abort(); exportJob = null; decoding = false;
  if (previewFrame != null) cancelAnimationFrame(previewFrame); previewFrame = null;
  source?.close(); source = null; selectedFile = null; clearOutput(); input.value = '';
  canvas.width = 1; canvas.height = 1; canvas.hidden = true; $('#screenshot-empty').hidden = false;
  $('#screenshot-clear').hidden = true; $('#screenshot-file').textContent = 'No screenshot selected'; $('#screenshot-dimensions').textContent = 'Live preview';
  publishToolSelection([]); updateBusy(); if (announce) report('Cleared. Your working image and download have been released.');
}
function syncLabels() {
  for (const [key, suffix] of [['padding', ' px'], ['roundness', ' px'], ['shadow', '%'], ['tilt', '°']]) $(`#screenshot-${key}-value`).textContent = $(`#screenshot-${key}`).value + suffix;
  $('#screenshot-color-label').hidden = $('#screenshot-background').value !== 'solid';
}
function paintPreview() {
  previewFrame = null; if (!source) return;
  try {
    const result = renderScreenshot(canvas, source, options(), 1000); canvas.hidden = false; $('#screenshot-empty').hidden = true;
    $('#screenshot-dimensions').textContent = `${result.width} × ${result.height} px export`;
    canvas.setAttribute('aria-label', `${result.frame} screenshot preview. Export size ${result.width} by ${result.height} pixels.`);
  } catch (error) { report(error.message || 'Your browser could not render this image.'); }
}
function updatePreview() {
  clearOutput(); syncLabels(); if (previewFrame != null) cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(paintPreview);
  if (source) report('Preview updated. Export when it looks right.');
}
async function supportedImage(file) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return png || jpg || webp;
}
async function selectFiles(files, sample = false) {
  if (busy() || !files?.length) return;
  if (files.length !== 1) { report('Choose one screenshot at a time.'); return; }
  const file = files[0];
  if (!/\.(png|jpe?g|webp)$/i.test(file.name) || !file.size || file.size > 20_000_000) { report('Choose a PNG, JPG or WebP image up to 20 MB.'); input.value = ''; return; }
  clearSelection(false); const version = selectionVersion; decoding = true; $('#screenshot-clear').hidden = false; updateBusy(); report('Opening your screenshot locally…');
  let bitmap;
  try {
    if (!await supportedImage(file)) throw new Error('This file is not a valid PNG, JPG or WebP image.');
    if (version !== selectionVersion) return;
    bitmap = await createImageBitmap(file);
    if (version !== selectionVersion) return;
    if (bitmap.width * bitmap.height > 20_000_000) throw new Error('This image exceeds 20 megapixels. Choose a smaller screenshot.');
    source = bitmap; bitmap = null; selectedFile = file;
    $('#screenshot-file').textContent = `${sample ? 'Sample · generated on your device' : file.name} · ${source.width} × ${source.height} px · ${formatBytes(file.size)}`;
    publishToolSelection([file]); paintPreview(); report(sample ? 'Original demo artwork, generated on your device. Make it yours with the controls.' : 'Ready to style. Your entire screenshot stays in the frame.');
  } catch (error) {
    if (version === selectionVersion) { clearSelection(false); report(error.message || 'This image could not be opened. Try a valid PNG, JPG or WebP.'); }
  } finally { bitmap?.close(); if (version === selectionVersion) { decoding = false; updateBusy(); } }
}

input.addEventListener('change', () => { void selectFiles(Array.from(input.files)); });
const drop = $('#screenshot-drop');
drop.addEventListener('dragover', event => { event.preventDefault(); if (!busy()) drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); void selectFiles(Array.from(event.dataTransfer.files)); });
$('#screenshot-clear').addEventListener('click', () => clearSelection());
optionsPanel.addEventListener('input', updatePreview);
$('#screenshot-zoom').addEventListener('input', () => { canvas.style.width = `${$('#screenshot-zoom').value}%`; $('#screenshot-zoom-value').textContent = `${$('#screenshot-zoom').value}%`; });
$('#screenshot-reset').addEventListener('click', () => { Object.entries(defaults).forEach(([id, value]) => { $(`#screenshot-${id}`).value = value; }); updatePreview(); });
$('#screenshot-cancel').addEventListener('click', () => {
  if (decoding) { clearSelection(false); report('Cancelled. Choose another screenshot or try the sample.'); }
  else if (exportJob) { exportJob.abort(); clearOutput(); report('Cancelling export…'); }
});
async function trySample() {
  if (busy()) return;
  const version = selectionVersion; decoding = true; updateBusy(); report('Drawing original demo artwork on your device…');
  try {
    const blob = await createScreenshotSample(); if (version !== selectionVersion) return;
    decoding = false; $('#screenshot-caption').value = 'Make your work stand out.';
    await selectFiles([new File([blob], 'fileforge-studio-sample.png', { type: 'image/png' })], true);
  } catch (error) { if (version === selectionVersion) { decoding = false; updateBusy(); report(error.message || 'The sample could not be created. Choose your own screenshot.'); } }
}
$('#screenshot-sample').addEventListener('click', () => { void trySample(); });
$('#screenshot-export').addEventListener('click', async () => {
  if (!source || busy()) return;
  clearOutput(); const job = new AbortController(); exportJob = job; updateBusy(); report('Rendering your full-size screenshot…');
  const exportCanvas = document.createElement('canvas'), settings = options(), format = $('#screenshot-format').value;
  const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[format] || 'image/png';
  try {
    // Yield one frame so the cancel action and busy state remain available.
    await new Promise(resolve => requestAnimationFrame(resolve)); job.signal.throwIfAborted();
    const metadata = renderScreenshot(exportCanvas, source, settings); job.signal.throwIfAborted();
    const blob = await new Promise((resolve, reject) => exportCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Your browser could not encode this image.')), mime, .92));
    job.signal.throwIfAborted(); if (blob.type !== mime) throw new Error('Your browser does not support this format. Choose PNG or JPG.');
    const name = `${selectedFile.name.replace(/\.[^.]+$/, '').slice(0, 110)}-studio.${format}`;
    const detail = `${metadata.width} × ${metadata.height} pixels · ${metadata.frame} · ${format.toUpperCase()} · ${blob.size.toLocaleString('en-US')} bytes`;
    outputURL = URL.createObjectURL(blob); const link = $('#screenshot-download'); link.href = outputURL; link.download = name;
    $('#screenshot-result-detail').textContent = detail; $('#screenshot-result').hidden = false; report('Ready to share. Download your screenshot or keep creating in the workspace.');
    publishToolResult({ blob, name, detail });
  } catch (error) { if (exportJob === job) report(job.signal.aborted ? 'Export cancelled. Your screenshot is still ready to edit.' : error.message || 'This screenshot could not be exported.'); }
  finally { exportCanvas.width = 1; exportCanvas.height = 1; if (exportJob === job) { exportJob = null; updateBusy(); } }
});

syncLabels(); updateBusy();
configureToolBridge({ selectFiles, busy, clear: () => clearSelection(false) });
if (new URLSearchParams(location.search).get('sample') === '1') void trySample();
window.addEventListener('pagehide', () => clearSelection(false));
