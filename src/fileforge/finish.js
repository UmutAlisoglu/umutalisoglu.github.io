import { configureToolBridge, publishToolSelection, publishToolBusy, publishToolResult, invalidateToolResult } from './workspace-bridge.js';
import { formatBytes, resultName } from './shared.js';
import './advanced.css';

const $ = selector => document.querySelector(selector);
const kind = document.body.dataset.finishTool;
const extensions = { heic: ['heic','heif'], compress: ['pdf'], split: ['pdf'], metadata: ['jpg','jpeg','png'] }[kind];
const input = $('#finish-input'), run = $('#finish-run'), cancel = $('#finish-cancel'), settings = $('#finish-options');
let selected, worker, url, timeout;
function report(message, error = false) { $('#finish-status').textContent = message; $('#finish-status').classList.toggle('is-error', error); }
function invalidate() {
  invalidateToolResult(); $('#finish-result').hidden = true; $('#finish-download').removeAttribute('href');
  if (url) URL.revokeObjectURL(url); url = null;
}
function busy() {
  const active = Boolean(worker); $('#advanced-workspace').setAttribute('aria-busy', String(active));
  publishToolBusy(active); input.disabled = settings.disabled = active; $('#finish-clear').disabled = active;
  run.disabled = active || !selected; cancel.hidden = !active;
}
function stop() { worker?.terminate(); worker = null; clearTimeout(timeout); busy(); }
function clear() { stop(); invalidate(); selected = null; input.value = ''; $('#finish-filename').textContent = 'No file selected'; $('#finish-clear').hidden = true; report('Choose a file to start.'); busy(); }
async function selectFiles(files) {
  if (worker) return;
  clear();
  try {
    if (files.length !== 1) throw new Error('Choose one file at a time.');
    const file = files[0], limit = ['compress','split'].includes(kind) ? 25e6 : 20e6;
    if (!extensions.includes(file.name.split('.').pop().toLowerCase())) throw new Error(`Choose ${extensions.map(ext => ext.toUpperCase()).join(' or ')}.`);
    if (!file.size || file.size > limit) throw new Error(`Choose a non-empty file up to ${limit/1e6} MB.`);
    selected = file; $('#finish-filename').textContent = `${file.name} · ${formatBytes(file.size)}`; $('#finish-clear').hidden = false;
    publishToolSelection([file]); report('Ready when you are.');
  } catch (error) { report(error.message, true); }
  busy();
}
input.accept = extensions.map(ext => `.${ext}`).join(',');
input.addEventListener('change', () => selectFiles([...input.files]));
$('#finish-clear').addEventListener('click', clear);
settings.addEventListener('input', invalidate);
$('#finish-form').addEventListener('submit', event => { event.preventDefault(); if (!run.disabled) run.click(); });
const drop = $('#finish-drop');
drop.addEventListener('dragover', event => { event.preventDefault(); if (!worker) drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); void selectFiles([...event.dataTransfer.files]); });
cancel.addEventListener('click', () => { stop(); invalidate(); report('Cancelled. Your original file is unchanged.'); });
run.addEventListener('click', () => {
  if (!selected || worker) return;
  invalidate(); report('Starting local processing…');
  const options = Object.fromEntries(new FormData($('#finish-form')));
  try { worker = new Worker(new URL('./finish.worker.js', import.meta.url), { type: 'module' }); }
  catch { report('This browser could not start the local engine. Try a recent browser.', true); return; }
  const current = worker;
  worker.onmessage = ({ data }) => {
    if (worker !== current) return;
    if (data.type === 'progress') { report(data.message); return; }
    stop();
    if (data.type === 'error') { report(data.message, true); return; }
    if (!(data.blob instanceof Blob) || !data.blob.size) { report('No result was produced. Try another file.', true); return; }
    const name = resultName(selected.name, data.extension).replace(/(\.[^.]+)$/, `-${kind === 'metadata' ? 'clean' : kind === 'split' ? 'pages' : kind === 'compress' ? data.suffix || 'checked' : 'converted'}$1`);
    url = URL.createObjectURL(data.blob); $('#finish-download').href = url; $('#finish-download').download = name;
    $('#finish-detail').textContent = `${formatBytes(selected.size)} → ${formatBytes(data.blob.size)}. ${data.detail}`;
    $('#finish-result').hidden = false; report('Your result is ready.');
    publishToolResult({ blob: data.blob, name, detail: data.detail });
  };
  worker.onerror = () => { if (worker !== current) return; stop(); report('The local engine could not finish. Try a smaller file or another browser.', true); };
  timeout = setTimeout(() => { if (worker !== current) return; stop(); report('This job exceeded two minutes. Try a smaller file.', true); }, 120000);
  worker.postMessage({ kind, file: selected, options }); busy();
});
configureToolBridge({ selectFiles, clear, busy: () => Boolean(worker) });
window.addEventListener('pagehide', () => { stop(); if (url) URL.revokeObjectURL(url); });
busy();
