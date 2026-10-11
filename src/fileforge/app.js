import { formatBytes, resultName } from './shared.js';

const tools = {
  image: { title: 'Make your images fit.', action: 'Convert image', accept: '.jpg,.jpeg,.png,.webp,.gif,.bmp', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'], limit: 20_000_000, hint: 'JPG, PNG, WebP, GIF or BMP · up to 20 MB. Animated images use the first frame.' },
  spreadsheet: { title: 'Tables, ready to share.', action: 'Create PDF', accept: '.xlsx,.csv', extensions: ['xlsx', 'csv'], limit: 10_000_000, hint: 'XLSX or UTF-8 CSV · up to 10 MB. Exports visible sheet data as tables; charts, merged cells and print layout are not preserved.' },
  merge: { title: 'One tidy document.', action: 'Merge PDFs', accept: '.pdf', extensions: ['pdf'], limit: 25_000_000, hint: '2–20 unlocked PDFs · 25 MB each, 75 MB total. The list below sets the page order.' },
  video: { title: 'Less size. Still your video.', action: 'Compress video', accept: '.mp4,.mov,.mkv,.webm,.avi,.m4v', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'], limit: 100_000_000, hint: 'MP4, MOV, MKV, WebM, AVI or M4V · up to 100 MB. Browser compression can be slow; use FileForge for Windows for bigger files.' },
};
const $ = selector => document.querySelector(selector);
const form = $('#conversion-form'), input = $('#files'), list = $('#file-list');
let selected = [], currentTool = 'image', outputURL = null, active = null;

function clearOutput() { if (outputURL) URL.revokeObjectURL(outputURL); outputURL = null; $('#result').hidden = true; $('#download-result').removeAttribute('href'); }
function report(message, progress = null) {
  $('#job-status').textContent = message;
  $('#job-progress').hidden = progress == null;
  if (progress != null) $('#job-progress').value = Math.max(0, Math.min(100, progress));
}
function setBusy(busy) {
  form.querySelectorAll('input,select,button').forEach(element => { element.disabled = busy; });
  form.querySelectorAll('[data-options]').forEach(panel => panel.querySelectorAll('input,select').forEach(element => { element.disabled = busy || panel.hidden; }));
  document.querySelectorAll('[data-tool]').forEach(element => { element.disabled = busy; });
  $('#cancel-job').hidden = !busy; $('#cancel-job').disabled = false; $('#clear-files').disabled = busy;
}
function renderFiles() {
  list.replaceChildren();
  selected.forEach((file, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span'); label.textContent = `${index + 1}. ${file.name}`;
    const size = document.createElement('small'); size.textContent = formatBytes(file.size);
    item.append(label, size);
    const actions = document.createElement('div'); actions.className = 'file-actions';
    if (currentTool === 'merge') for (const [text, offset] of [['↑', -1], ['↓', 1]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.setAttribute('aria-label', `Move ${file.name} ${offset < 0 ? 'up' : 'down'}`);
      button.disabled = index + offset < 0 || index + offset >= selected.length;
      button.addEventListener('click', () => { [selected[index], selected[index + offset]] = [selected[index + offset], selected[index]]; clearOutput(); renderFiles(); });
      actions.append(button);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.addEventListener('click', () => { selected.splice(index, 1); input.value = ''; clearOutput(); renderFiles(); }); actions.append(remove);
    item.append(actions); list.append(item);
  });
  $('#selection-summary').textContent = selected.length ? `${selected.length} file(s) · ${formatBytes(selected.reduce((sum, file) => sum + file.size, 0))}` : 'No files selected';
  $('#clear-files').hidden = !selected.length;
}
function addFiles(files) {
  if (active) return;
  clearOutput();
  selected = currentTool === 'merge' ? [...selected, ...files] : files.slice(0, 1);
  input.value = ''; renderFiles(); report('Ready when you are.');
}
function chooseTool(tool, focus = false) {
  if (active || !tools[tool]) return;
  currentTool = tool; selected = []; input.value = ''; clearOutput();
  input.accept = tools[tool].accept; input.multiple = tool === 'merge';
  $('#tool-title').textContent = tools[tool].title; $('#tool-hint').textContent = tools[tool].hint; $('#submit-label').textContent = tools[tool].action;
  $('#tool-panel').setAttribute('aria-labelledby', `tab-${tool}`);
  document.querySelectorAll('[data-tool]').forEach(button => { const chosen = button.dataset.tool === tool; button.setAttribute('aria-selected', String(chosen)); button.tabIndex = chosen ? 0 : -1; if (chosen && focus) button.focus(); });
  document.querySelectorAll('[data-options]').forEach(panel => { panel.hidden = panel.dataset.options !== tool; panel.querySelectorAll('input,select').forEach(element => { element.disabled = panel.hidden; }); });
  $('#video-note').hidden = tool !== 'video'; renderFiles(); report('Ready when you are.');
  history.replaceState(null, '', `#${tool}`);
}
document.querySelectorAll('[data-tool]').forEach((button, index, buttons) => {
  button.addEventListener('click', () => chooseTool(button.dataset.tool));
  button.addEventListener('keydown', event => {
    let next;
    if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = (index + 1) % buttons.length;
    if (['ArrowLeft', 'ArrowUp'].includes(event.key)) next = (index + buttons.length - 1) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next != null) { event.preventDefault(); chooseTool(buttons[next].dataset.tool, true); }
  });
});
input.addEventListener('change', () => addFiles(Array.from(input.files)));
const zone = $('#drop-zone');
zone.addEventListener('dragover', event => { event.preventDefault(); if (!active) zone.classList.add('dragging'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('dragging'); addFiles(Array.from(event.dataTransfer.files)); });
$('#clear-files').addEventListener('click', () => { selected = []; input.value = ''; clearOutput(); renderFiles(); report('Cleared. File data and the result link have been released.'); });
$('#cancel-job').addEventListener('click', () => { active?.abort(); });

async function image(file, options, signal) {
  report('Decoding your image locally…', 15);
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Your browser could not open this image. Try JPG, PNG or WebP.'); }
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('This image exceeds 40 megapixels. Use the desktop app.');
    const scale = options.width ? Math.min(1, Number(options.width) / bitmap.width) : 1;
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (options.format === 'jpg' || options.format === 'pdf') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); signal.throwIfAborted();
    report('Preparing your image…', 75);
    const type = options.format === 'pdf' ? 'image/jpeg' : { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[options.format];
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, Number(options.quality) / 100));
    if (!blob || blob.type !== type) throw new Error('Your browser does not support this output format. Try PNG or JPG.');
    const bytes = await blob.arrayBuffer(); signal.throwIfAborted();
    if (options.format === 'pdf') {
      const { PDFDocument } = await import('pdf-lib'); const pdf = await PDFDocument.create(); const embedded = await pdf.embedJpg(bytes);
      const landscape = canvas.width > canvas.height; const size = landscape ? [841.89, 595.28] : [595.28, 841.89];
      const fit = Math.min((size[0] - 48) / canvas.width, (size[1] - 48) / canvas.height), width = canvas.width * fit, height = canvas.height * fit;
      pdf.addPage(size).drawImage(embedded, { x: (size[0] - width) / 2, y: (size[1] - height) / 2, width, height });
      return { bytes: await pdf.save(), type: 'application/pdf', name: resultName(file.name, 'pdf'), detail: 'One A4 page. Transparent areas use white.' };
    }
    return { bytes, type, name: resultName(file.name, options.format), detail: `${canvas.width} × ${canvas.height} pixels. Source metadata removed.` };
  } finally { bitmap.close(); }
}

async function backgroundConversion(files, options, signal) {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  try {
    const data = await Promise.all(files.map(async file => ({ name: file.name, bytes: await file.arrayBuffer() })));
    signal.throwIfAborted();
    return await new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('Conversion cancelled.', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') report(data.message, data.progress);
        if (data.type === 'result' || data.type === 'error') {
          signal.removeEventListener('abort', abort);
          if (data.type === 'result') resolve(data.result); else reject(new Error(data.message));
        }
      };
      worker.onerror = () => { signal.removeEventListener('abort', abort); reject(new Error('The browser could not finish this job. Try a smaller file or the desktop app.')); };
      worker.postMessage({ tool: currentTool, files: data, options }, data.map(file => file.bytes));
    });
  } finally { worker.terminate(); }
}

form.addEventListener('submit', async event => {
  event.preventDefault(); if (active) return;
  const tool = tools[currentTool];
  try {
    if (!selected.length) throw new Error('Choose a file first.');
    if (currentTool === 'merge' && (selected.length < 2 || selected.length > 20)) throw new Error('Choose between 2 and 20 PDFs.');
    for (const file of selected) {
      if (!file.size) throw new Error(`“${file.name}” is empty.`);
      if (!tool.extensions.includes(file.name.split('.').pop().toLowerCase())) throw new Error(`“${file.name}” is not a supported file type for this tool.`);
      if (file.size > tool.limit) throw new Error(`“${file.name}” exceeds the ${formatBytes(tool.limit)} browser limit. Use the desktop app for bigger files.`);
    }
    if (currentTool === 'merge' && selected.reduce((sum, file) => sum + file.size, 0) > 75_000_000) throw new Error('Keep your PDF selection under 75 MB total.');
  } catch (error) { report(error.message); return; }
  clearOutput();
  const job = new AbortController(); active = job;
  const values = Object.fromEntries(new FormData(form)); values.removeAudio = $('#remove-audio').checked;
  setBusy(true);
  try {
    let result;
    if (currentTool === 'image') result = await image(selected[0], values, job.signal);
    else if (currentTool === 'video') { const { compressVideo } = await import('./video.js'); job.signal.throwIfAborted(); result = await compressVideo(selected[0], values, report, job.signal); }
    else result = await backgroundConversion(selected, values, job.signal);
    job.signal.throwIfAborted();
    const blob = new Blob([result.bytes], { type: result.type });
    outputURL = URL.createObjectURL(blob);
    const link = $('#download-result'); link.href = outputURL; link.download = result.name;
    $('#result-name').textContent = result.name; $('#result-detail').textContent = `${formatBytes(blob.size)} · ${result.detail}`;
    $('#result').hidden = false; report('Done. Your download is ready.', 100);
  } catch (error) { report(job.signal.aborted ? 'Cancelled. You can choose another file or try again.' : error.message || 'The conversion could not finish. Try the desktop app.'); }
  finally { active = null; setBusy(false); renderFiles(); }
});
window.addEventListener('beforeunload', () => { active?.abort(); clearOutput(); });
window.addEventListener('hashchange', () => chooseTool(location.hash.slice(1)));
chooseTool(tools[location.hash.slice(1)] ? location.hash.slice(1) : 'image');
