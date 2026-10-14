import { formatBytes, resultName } from './shared.js';
import { scaledSize } from './advanced-shared.js';
import { configureToolBridge, publishToolResult, publishToolSelection, invalidateToolResult } from './workspace-bridge.js';
import './ocr.css';

const $ = selector => document.querySelector(selector);
const workspace = $('#ocr-workspace'), input = $('#ocr-input'), drop = $('#ocr-drop');
const languageNames = { eng: 'English', deu: 'German', tur: 'Turkish' };
const engineSizes = { eng: '7 MB', deu: '5.4 MB', tur: '6.2 MB' };
let selected = null, bitmap = null, sourceURL = null, outputURL = null;
let active = null, loading = false, revision = 0, resultDetail = '';

function report(message, progress, error = false) {
  $('#ocr-status').textContent = message; $('#ocr-status').classList.toggle('is-error', error);
  if (typeof progress === 'number') $('#ocr-progress').value = Math.max(0, Math.min(1, progress));
}
function busy() { return Boolean(active) || loading; }
function updateBusy() {
  const processing = busy(); workspace.setAttribute('aria-busy', String(processing));
  input.disabled = processing; $('#ocr-options').disabled = processing;
  $('#ocr-sample').disabled = processing; $('#ocr-clear').disabled = processing;
  $('#ocr-run').disabled = processing || !selected;
  $('#ocr-cancel').hidden = !active; $('#ocr-progress').hidden = !active;
  drop.setAttribute('aria-disabled', String(processing));
  $('#ocr-text').disabled = processing; $('#ocr-copy').disabled = processing; $('#ocr-download').disabled = processing; $('#ocr-prepare').disabled = processing;
}
function clearOutput() {
  $('#ocr-result').hidden = true; $('#ocr-text').value = ''; $('#ocr-prepare').hidden = true;
  $('#ocr-count').textContent = ''; $('#ocr-result-detail').textContent = ''; resultDetail = '';
  if (outputURL) URL.revokeObjectURL(outputURL); outputURL = null;
  invalidateToolResult();
}
function releaseSource() {
  bitmap?.close(); bitmap = null;
  if (sourceURL) URL.revokeObjectURL(sourceURL); sourceURL = null;
  $('#ocr-source-preview').removeAttribute('src'); $('#ocr-source-preview').hidden = true;
  $('#ocr-source-card').hidden = true; $('#ocr-source-pdf').hidden = true;
}
function clear() {
  if (busy()) return;
  revision++; selected = null; input.value = ''; releaseSource(); clearOutput();
  $('#ocr-filename').textContent = 'No file selected'; $('#ocr-clear').hidden = true;
  $('#ocr-pdf-pages-label').hidden = true; $('#ocr-pdf-pages').value = '';
  publishToolSelection([]); report('Cleared. Choose another file, or try the sample.'); updateBusy();
}
function encode(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This browser could not prepare the image. Try a smaller image.')), 'image/png'));
}
async function selectFiles(files) {
  if (busy() || !files?.length) return;
  input.value = '';
  if (files.length !== 1) { report('Choose one image or PDF at a time. Your current selection has been kept.', undefined, true); return; }
  const file = files[0], extension = file.name.split('.').pop().toLowerCase(), isPDF = extension === 'pdf';
  const limit = isPDF ? 25_000_000 : 20_000_000;
  if (!file.size || file.size > limit || !['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'pdf'].includes(extension)) {
    report(!file.size ? 'This file is empty.' : file.size > limit ? `Choose a file under ${formatBytes(limit)}.` : 'Choose a JPG, PNG, WebP, GIF, BMP or PDF file.', undefined, true); return;
  }
  loading = true; updateBusy(); const current = ++revision;
  let nextBitmap, preview;
  try {
    report(isPDF ? 'Preparing your PDF selection…' : 'Opening your image locally…');
    if (!isPDF) {
      if (typeof createImageBitmap !== 'function') throw new Error('Use a recent browser with image support to read this file.');
      try { nextBitmap = await createImageBitmap(file); } catch { throw new Error('This image could not be decoded. Choose a valid image file.'); }
      if (nextBitmap.width * nextBitmap.height > 12_000_000) throw new Error('Choose an image below 12 megapixels. Resize it with Image converter first.');
      const size = scaledSize(nextBitmap.width, nextBitmap.height, 1000);
      const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
      try { const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height); context.drawImage(nextBitmap, 0, 0, size.width, size.height); preview = await encode(canvas); }
      finally { canvas.width = canvas.height = 1; }
    }
    if (current !== revision) return;
    releaseSource(); clearOutput(); selected = file; bitmap = nextBitmap; nextBitmap = null;
    const dimensions = bitmap ? `${bitmap.width} × ${bitmap.height}px` : 'Scanned or regular PDF';
    $('#ocr-filename').textContent = `${file.name} · ${formatBytes(file.size)}`;
    $('#ocr-source-label').textContent = dimensions; $('#ocr-source-card').hidden = false;
    $('#ocr-clear').hidden = false; $('#ocr-pdf-pages-label').hidden = !isPDF;
    $('#ocr-source-pdf').hidden = !isPDF;
    if (preview) { sourceURL = URL.createObjectURL(preview); $('#ocr-source-preview').src = sourceURL; $('#ocr-source-preview').hidden = false; }
    publishToolSelection([selected]); report(isPDF ? 'Ready. Choose your language and up to 10 pages.' : 'Ready. Choose your text language, then extract.');
  } catch (error) { report(`${error.message}${selected ? ' Your current selection has been kept.' : ''}`, undefined, true); }
  finally { nextBitmap?.close(); loading = false; updateBusy(); }
}

function countText() {
  const text = $('#ocr-text').value;
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  $('#ocr-count').textContent = `${words.toLocaleString()} words · ${text.length.toLocaleString()} characters`;
}
function publishDraft() {
  const blob = new Blob([$('#ocr-text').value], { type: 'text/plain;charset=utf-8' });
  const name = resultName(selected?.name || 'extracted-text', 'txt');
  if (outputURL) URL.revokeObjectURL(outputURL); outputURL = URL.createObjectURL(blob);
  $('#ocr-prepare').hidden = true;
  publishToolResult({ blob, name, detail: `${resultDetail} · editable plain text` });
  return { blob, name, url: outputURL };
}

async function start() {
  if (!selected || busy()) return;
  clearOutput();
  const job = { controller: new AbortController(), engine: null, label: '', index: 0, total: 1, initialized: false };
  active = job; updateBusy(); $('#ocr-progress').value = 0;
  const language = $('#ocr-language').value, layout = $('#ocr-layout').value;
  const timeout = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, 6 * 60_000);
  try {
    report(`Preparing the ${languageNames[language]} text engine locally…`, 0);
    const { createOCREngine } = await import('./ocr-engine.js'); job.controller.signal.throwIfAborted();
    job.engine = createOCREngine(job.controller.signal, ({ status, progress = 0 }) => {
      if (active !== job || job.controller.signal.aborted) return;
      const labels = { 'loading tesseract core': 'Loading the local text engine…', 'initializing tesseract': 'Starting the text engine…', 'loading language traineddata': `Loading the ${languageNames[language]} language…`, 'initializing api': 'Preparing the text reader…' };
      const message = status === 'recognizing text' ? `${job.label || 'Reading your image'} · ${Math.round(progress * 100)}%` : labels[status] || 'Preparing local text extraction…';
      report(message, job.initialized ? .15 + .8 * ((job.index + progress) / job.total) : progress * .12);
    });
    await job.engine.initialize(language, layout); job.initialized = true; job.controller.signal.throwIfAborted();
    let result;
    if (selected.name.toLowerCase().endsWith('.pdf')) {
      const { recognizePDF } = await import('./ocr-pdf.js'); job.controller.signal.throwIfAborted();
      result = await recognizePDF(selected, $('#ocr-pdf-pages').value, job.controller.signal, async (blob, index, total, page) => {
        job.index = index; job.total = total; job.label = `Reading page ${page} · ${index + 1} of ${total}`;
        return job.engine.recognize(blob);
      }, (message, progress) => report(message, .15 + .8 * progress));
    } else {
      const size = scaledSize(bitmap.width, bitmap.height, 3000);
      const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
      try {
        const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height); context.drawImage(bitmap, 0, 0, size.width, size.height);
        const blob = await encode(canvas); job.controller.signal.throwIfAborted();
        job.label = 'Reading your image'; report('Reading your image locally…', .15);
        result = { ...await job.engine.recognize(blob), pages: 1 };
      } finally { canvas.width = canvas.height = 1; }
    }
    job.controller.signal.throwIfAborted();
    if (result.text.length > 2_000_000) throw new Error('The extracted text exceeds the editor limit. Choose fewer pages or a smaller image.');
    $('#ocr-text').value = result.text.trim(); countText();
    resultDetail = `${languageNames[language]} · ${result.pages} ${result.pages === 1 ? 'page' : 'pages'}`;
    const confidence = Number(result.confidence);
    $('#ocr-result-detail').textContent = `${resultDetail}${Number.isFinite(confidence) ? ` · engine confidence ${Math.round(confidence)}% (not an accuracy guarantee)` : ''}`;
    $('#ocr-result').hidden = false;
    publishDraft(); report(result.text.trim() ? 'Text extracted. Review it, make your edits, then copy or download.' : 'No readable text found. Try another language, layout, or a sharper image.', 1);
  } catch (error) {
    clearOutput();
    if (job.timedOut) report('The reader reached its six-minute limit. Try a smaller image or fewer pages.', undefined, true);
    else if (job.controller.signal.aborted || error.name === 'AbortError') report('Cancelled. Your selected file is ready to try again.');
    else report(error.message || 'The text could not be extracted. Try another file.', undefined, true);
  } finally { clearTimeout(timeout); job.engine?.close(); if (active === job) active = null; updateBusy(); }
}

$('#ocr-run').addEventListener('click', () => { void start(); });
$('#ocr-cancel').addEventListener('click', () => { active?.controller.abort(); report('Cancelling local extraction…'); });
$('#ocr-clear').addEventListener('click', clear);
input.addEventListener('change', () => { void selectFiles([...input.files]); });
drop.addEventListener('dragover', event => { event.preventDefault(); if (!busy()) drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); void selectFiles([...event.dataTransfer.files]); });
$('#ocr-language').addEventListener('change', () => { const language = $('#ocr-language').value; $('#ocr-engine-note').textContent = `Extract text downloads the local engine and chosen language on first use: about ${engineSizes[language]} for ${languageNames[language]}. Your file is never uploaded.`; });
$('#ocr-text').addEventListener('input', () => { countText(); invalidateToolResult(); $('#ocr-prepare').hidden = false; });
$('#ocr-prepare').addEventListener('click', () => { publishDraft(); report('Your edited text is ready to download or continue with.'); });
$('#ocr-download').addEventListener('click', () => { const draft = publishDraft(), link = document.createElement('a'); link.href = draft.url; link.download = draft.name; link.click(); report('Your current text is ready in the download.'); });
$('#ocr-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#ocr-text').value); report('Current text copied to your clipboard.'); }
  catch { $('#ocr-text').focus(); $('#ocr-text').select(); report('Select the text and press Ctrl+C or use your device’s Copy command.'); }
});
$('#ocr-sample').addEventListener('click', async () => {
  if (busy()) return;
  const canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = 600;
  try {
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#222'; context.font = 'bold 64px Arial'; context.fillText('Make room for better ideas.', 90, 145);
    context.font = '40px Arial'; context.fillText('Your files stay on your device.', 90, 260); context.fillText('Turn screenshots into editable text.', 90, 340); context.fillText('Create something worth sharing.', 90, 420);
    const blob = await encode(canvas); await selectFiles([new File([blob], 'fileforge-sample.png', { type: 'image/png' })]);
  } catch (error) { report(error.message, undefined, true); }
  finally { canvas.width = canvas.height = 1; }
});
window.addEventListener('pagehide', () => { revision++; active?.controller.abort(); releaseSource(); clearOutput(); });
configureToolBridge({ selectFiles, busy, clear });
updateBusy();
