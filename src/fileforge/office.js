import { configureToolBridge, publishToolSelection, publishToolBusy, publishToolResult, invalidateToolResult } from './workspace-bridge.js';
import { formatBytes, resultName } from './shared.js';
import './documents.css';

const $ = selector => document.querySelector(selector);
const kind = document.body.dataset.documentTool;
const extension = kind === 'word-pdf' ? 'docx' : 'pptx';
const protocol = 'fileforge-office-v1';
let selected, engine, token, timer, outputURL, pages = [], previews = [], working = false, generation = 0;
function report(message, error = false) { $('#document-status').textContent = message; $('#document-status').classList.toggle('is-error', error); }
function busy(value) {
  working = value; publishToolBusy(value); $('#advanced-workspace').setAttribute('aria-busy', String(value));
  $('#document-input').disabled = value; $('#document-run').disabled = value || !selected;
  $('#document-export').disabled = value || !pages.length; $('#document-clear').disabled = value; $('#document-cancel').hidden = !value;
}
function stop() { generation++; engine?.remove(); engine = null; clearTimeout(timer); busy(false); }
function discard() {
  invalidateToolResult(); $('#document-result').hidden = $('#document-preview').hidden = true;
  $('#document-download').removeAttribute('href'); $('#document-preview-image').removeAttribute('src');
  if (outputURL) URL.revokeObjectURL(outputURL); outputURL = null;
  previews.forEach(url => URL.revokeObjectURL(url)); previews = []; pages = []; $('#document-page').replaceChildren();
}
function clear() { stop(); discard(); selected = null; $('#document-input').value = ''; $('#document-filename').textContent = 'No file selected'; report('Choose a file to start.'); busy(false); }
async function selectFiles(files) {
  if (working) return;
  clear();
  try {
    if (files.length !== 1 || !files[0].name.toLowerCase().endsWith(`.${extension}`)) throw new Error(`Choose one .${extension} file. Older .doc and .ppt files need to be saved in the newer format first.`);
    if (!files[0].size || files[0].size > 10e6) throw new Error('Choose a non-empty file up to 10 MB.');
    selected = files[0]; publishToolSelection(files); $('#document-filename').textContent = `${selected.name} · ${formatBytes(selected.size)}`;
    report('Ready to preview. Nothing has been uploaded.');
  } catch (error) { report(error.message, true); }
  busy(false);
}
$('#document-input').accept = `.${extension}`;
$('#document-input').addEventListener('change', event => void selectFiles([...event.target.files]));
$('#document-clear').addEventListener('click', clear);
$('#document-cancel').addEventListener('click', () => { stop(); discard(); report('Cancelled. Choose Preview to start again.'); });
$('#document-page').addEventListener('change', () => { $('#document-preview-image').src = previews[Number($('#document-page').value)]; });
const drop = $('#document-drop');
drop.addEventListener('dragover', event => { event.preventDefault(); if (!working) drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); void selectFiles([...event.dataTransfer.files]); });
$('#document-run').addEventListener('click', () => {
  if (working || !selected) return;
  discard(); stop(); busy(true); token = crypto.randomUUID(); report('Loading the local document renderer…');
  engine = document.createElement('iframe'); engine.title = 'Local Office renderer'; engine.className = 'office-engine';
  engine.setAttribute('sandbox', 'allow-scripts allow-same-origin'); engine.setAttribute('aria-hidden', 'true'); engine.tabIndex = -1;
  engine.src = '/tools/office-engine/'; document.body.append(engine);
  timer = setTimeout(() => { stop(); discard(); report('Preview exceeded two minutes. Try a smaller file or export from the original app.', true); }, 120000);
});
window.addEventListener('message', event => {
  if (!engine || event.source !== engine.contentWindow || event.origin !== location.origin || event.data?.protocol !== protocol) return;
  const data = event.data;
  if (data.type === 'ready') { engine.contentWindow.postMessage({ protocol, type: 'render', token, kind, file: selected }, location.origin); return; }
  if (data.token !== token) return;
  if (data.type === 'progress') { report(data.message); return; }
  if (data.type === 'error') { stop(); discard(); report(data.message, true); return; }
  if (data.type !== 'rendered') return;
  if (!Array.isArray(data.pages) || !data.pages.length || data.pages.length > 20 || data.pages.some(page => !(page.blob instanceof Blob) || page.blob.type !== 'image/png' || !Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width <= 0 || page.height <= 0)) { stop(); discard(); report('The document renderer returned an invalid preview.', true); return; }
  pages = data.pages; previews = pages.map(page => URL.createObjectURL(page.blob));
  pages.forEach((page, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = `Page ${index + 1} of ${pages.length}`; $('#document-page').append(option); });
  $('#document-preview-image').src = previews[0]; $('#document-preview').hidden = false;
  $('#document-warning').textContent = `${data.warning || ''}Check every page. Fonts, charts and page breaks can differ from Office. The PDF contains page images, without selectable text.`;
  stop(); report(`${pages.length} page${pages.length === 1 ? '' : 's'} ready to review. Export when you’re happy with the preview.`);
});
$('#document-export').addEventListener('click', async () => {
  if (working || !pages.length || !selected) return;
  const current = ++generation; busy(true); report('Preparing your PDF…');
  try {
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    for (const page of pages) {
      const image = await pdf.embedPng(await page.blob.arrayBuffer());
      if (current !== generation) return;
      const sheet = pdf.addPage([page.width * .75, page.height * .75]);
      sheet.drawImage(image, { x: 0, y: 0, width: sheet.getWidth(), height: sheet.getHeight() });
    }
    const blob = new Blob([await pdf.save()], { type: 'application/pdf' });
    if (current !== generation) return;
    if (outputURL) URL.revokeObjectURL(outputURL); outputURL = URL.createObjectURL(blob);
    const name = resultName(selected.name, 'pdf'); $('#document-download').href = outputURL; $('#document-download').download = name;
    $('#document-detail').textContent = `${pages.length} flattened page(s) · ${formatBytes(blob.size)}. Download before leaving this tab.`;
    $('#document-result').hidden = false; publishToolResult({ blob, name, detail: `${pages.length} flattened pages. Preview-based Office export.` });
    report('Your PDF is ready.');
  } catch (error) { if (current === generation) report(error.message || 'Could not prepare this PDF.', true); }
  finally { if (current === generation) busy(false); }
});
configureToolBridge({ selectFiles, clear, busy: () => working });
window.addEventListener('pagehide', () => { stop(); discard(); });
busy(false);
