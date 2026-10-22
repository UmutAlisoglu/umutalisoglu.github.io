import { configureToolBridge, publishToolSelection, publishToolBusy, publishToolResult, invalidateToolResult } from './workspace-bridge.js';
import { formatBytes, resultName } from './shared.js';
import './documents.css';

const $ = selector => document.querySelector(selector);
const kind = document.body.dataset.documentTool;
const extensions = { 'text-pdf': ['txt'], 'pdf-text': ['pdf'], data: ['csv', 'json'] }[kind];
const limit = { 'text-pdf': 1e6, 'pdf-text': 25e6, data: 2e6 }[kind];
let selected, worker, controller, working = false, outputURL, currentResult, sequence = 0, timer;
function report(message, error = false) { $('#document-status').textContent = message; $('#document-status').classList.toggle('is-error', error); }
function busy(value) {
  working = value; publishToolBusy(value); $('#advanced-workspace').setAttribute('aria-busy', String(value));
  $('#document-input').disabled = $('#document-clear').disabled = $('#document-settings').disabled = value;
  if ($('#document-text')) $('#document-text').disabled = value;
  $('#document-run').disabled = value || (kind === 'pdf-text' ? !selected : !$('#document-text').value.trim());
  $('#document-cancel').hidden = !value;
}
function invalidate() {
  invalidateToolResult(); currentResult = null; $('#document-result').hidden = true; $('#document-output-wrap').hidden = true;
  $('#document-download').removeAttribute('href'); $('#document-output').value = '';
  if (outputURL) URL.revokeObjectURL(outputURL); outputURL = null;
}
function stop() { sequence++; worker?.terminate(); worker = null; controller?.abort(); controller = null; clearTimeout(timer); busy(false); }
function clear() {
  stop(); invalidate(); selected = null; $('#document-input').value = ''; $('#document-filename').textContent = 'No file selected';
  if ($('#document-text')) $('#document-text').value = '';
  report('Choose a file or use the text box to start.'); busy(false);
}
async function selectFiles(files) {
  if (working) return;
  clear(); const current = sequence;
  try {
    if (files.length !== 1 || !extensions.includes(files[0].name.split('.').pop().toLowerCase())) throw new Error(`Choose one ${extensions.map(extension => extension.toUpperCase()).join(' or ')} file.`);
    if (!files[0].size || files[0].size > limit) throw new Error(`Choose a non-empty file up to ${limit / 1e6} MB.`);
    const file = files[0];
    if (kind !== 'pdf-text') {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (current !== sequence) return;
      if (text.length > $('#document-text').maxLength) throw new Error('The input contains too much text. Use a smaller file.');
      $('#document-text').value = text;
      if (kind === 'data') $('#document-settings [name=format]').value = file.name.toLowerCase().endsWith('.json') ? 'csv' : 'json';
    }
    selected = file; publishToolSelection(files); $('#document-filename').textContent = `${file.name} · ${formatBytes(file.size)}`; report('Ready when you are.');
  } catch (error) { if (current === sequence) report(error.message || 'Use a UTF-8 text file.', true); }
  if (current === sequence) busy(false);
}
function publish(result) {
  invalidateToolResult();
  if (outputURL) URL.revokeObjectURL(outputURL);
  const name = resultName(selected?.name || (kind === 'data' ? 'data.txt' : 'notes.txt'), result.extension);
  outputURL = URL.createObjectURL(result.blob); currentResult = { ...result, name };
  $('#document-download').href = outputURL; $('#document-download').download = name;
  $('#document-detail').textContent = `${formatBytes(result.blob.size)} · ${result.detail}`; $('#document-result').hidden = false;
  if (typeof result.text === 'string') { $('#document-output').value = result.text; $('#document-output-wrap').hidden = false; }
  publishToolResult({ blob: result.blob, name, detail: result.detail });
}
$('#document-input').accept = extensions.map(extension => `.${extension}`).join(',');
$('#document-input').addEventListener('change', event => void selectFiles([...event.target.files]));
$('#document-clear').addEventListener('click', clear);
$('#document-cancel').addEventListener('click', () => { stop(); invalidate(); report('Cancelled. Your original file is unchanged.'); });
$('#document-text')?.addEventListener('input', () => { invalidate(); busy(false); });
$('#document-settings').addEventListener('input', invalidate);
const drop = $('#document-drop');
drop.addEventListener('dragover', event => { event.preventDefault(); if (!working) drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); void selectFiles([...event.dataTransfer.files]); });
$('#document-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#document-output').value); report('Copied to your clipboard.'); }
  catch { report('Could not copy automatically. Select the text and copy it manually.', true); }
});
$('#document-output').readOnly = kind !== 'pdf-text';
$('#document-output').addEventListener('input', () => {
  if (kind !== 'pdf-text' || !currentResult || working) return;
  const text = $('#document-output').value;
  publish({ ...currentResult, text, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) });
});
$('#document-run').addEventListener('click', async () => {
  if (working || $('#document-run').disabled) return;
  const options = Object.fromEntries(new FormData($('#document-form')));
  invalidate(); stop(); const current = sequence; busy(true); report('Working on your device…');
  timer = setTimeout(() => { if (current === sequence) { stop(); invalidate(); report('This job exceeded two minutes. Try a smaller input.', true); } }, 120000);
  if (kind === 'pdf-text') {
    controller = new AbortController(); const signal = controller.signal;
    try {
      const { extractPDFText } = await import('./pdf-text.js');
      signal.throwIfAborted();
      const result = await extractPDFText(selected, options.pages, signal, message => { if (current === sequence) report(message); });
      if (current !== sequence) return;
      publish({ ...result, extension: 'txt', blob: new Blob([result.text], { type: 'text/plain;charset=utf-8' }) }); report('Your text is ready. You can edit it before downloading.');
    } catch (error) { if (current === sequence) report(error.message || 'Could not read this PDF.', true); }
    finally { if (current === sequence) { clearTimeout(timer); controller = null; busy(false); } }
  } else {
    try {
      worker = new Worker(new URL('./document.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (current !== sequence) return;
        if (data.type === 'error') { stop(); report(data.message, true); return; }
        if (!(data.blob instanceof Blob)) { stop(); report('No result was produced.', true); return; }
        stop(); publish(data); report('Your result is ready.');
      };
      worker.onerror = () => { if (current === sequence) { stop(); report('The local engine could not finish. Try a smaller input.', true); } };
      worker.postMessage({ kind, text: $('#document-text').value, options });
    } catch (error) { stop(); report(error.message || 'Could not start the local engine.', true); }
  }
});
$('#document-sample')?.addEventListener('click', () => {
  if (working) return; clear();
  if (kind === 'data') { $('#document-settings [name=format]').value = 'json'; $('#document-text').value = 'Name,Project,Status\nUmut,FileForge,Available\nUmut,Skate Scape,Fan project'; }
  else $('#document-text').value = 'A little room for ideas\n\nSome notes deserve a page of their own.\n\nYour files stay on your device. This PDF is made in your browser.\n\nHello · Merhaba · Hallo';
  busy(false); report('Sample ready. Change anything you like.');
});
$('#document-form').addEventListener('submit', event => { event.preventDefault(); if (!$('#document-run').disabled) $('#document-run').click(); });
configureToolBridge({ selectFiles, clear, busy: () => working });
window.addEventListener('pagehide', () => { stop(); invalidate(); });
busy(false);
