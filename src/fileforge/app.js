import { formatBytes, imageSettings } from './shared.js';
import './fileforge.css';

const tools = {
  image: { title: 'Make your images fit.', action: 'Convert images', accept: '.jpg,.jpeg,.png,.webp,.gif,.bmp', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'], limit: 20_000_000, count: 50, total: 100_000_000, hint: 'Up to 50 JPG, PNG, WebP, GIF or BMP images · 20 MB each, 100 MB total. Animated images use the first frame. Add more files to your batch at any time.' },
  organize: { title: 'Every page in its place.', action: 'Load pages', accept: '.pdf', extensions: ['pdf'], limit: 25_000_000, count: 20, total: 75_000_000, hint: 'Preview, reorder, rotate and select pages from one or more unlocked PDFs. Up to 200 pages · 25 MB per file, 75 MB total. Your original files stay unchanged.' },
  spreadsheet: { title: 'Tables, ready to share.', action: 'Create PDF', accept: '.xlsx,.csv', extensions: ['xlsx', 'csv'], limit: 10_000_000, count: 1, hint: 'XLSX or UTF-8 CSV · up to 10 MB. Exports visible sheet data as tables; charts, merged cells and print layout are not preserved.' },
  merge: { title: 'One tidy document.', action: 'Merge PDFs', accept: '.pdf', extensions: ['pdf'], limit: 25_000_000, count: 20, total: 75_000_000, hint: '2–20 unlocked PDFs · 25 MB each, 75 MB total. The list below sets the page order. For individual pages, use PDF organizer.' },
  video: { title: 'Less size. Still your video.', action: 'Compress video', accept: '.mp4,.mov,.mkv,.webm,.avi,.m4v', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'], limit: 100_000_000, count: 1, hint: 'MP4, MOV, MKV, WebM, AVI or M4V · up to 100 MB. Browser compression can be slow; use FileForge for Windows for bigger files.' },
};
const $ = selector => document.querySelector(selector);
const form = $('#conversion-form'), input = $('#files'), list = $('#file-list');
// Dedicated URLs stay on their selected tool; the original studio retains its tabs.
const dedicatedTool = document.body.dataset.fileforgeTool;
let selected = [], pages = [], currentTool = 'image', outputURL = null, active = null, draggedPage = null;

function clearOutput() {
  $('#image-preview').removeAttribute('src'); $('#image-preview').hidden = true;
  if (outputURL) URL.revokeObjectURL(outputURL);
  outputURL = null; $('#result').hidden = true; $('#download-result').removeAttribute('href');
}
function resetPages() {
  pages.forEach(page => { if (page.thumbnail) URL.revokeObjectURL(page.thumbnail); });
  pages = []; draggedPage = null; $('#page-grid').replaceChildren(); $('#pdf-workspace').hidden = true; updateAction();
}
function report(message, progress = null) {
  $('#job-status').textContent = message;
  $('#job-progress').hidden = progress == null;
  if (progress != null) $('#job-progress').value = Math.max(0, Math.min(100, progress));
}
function updateAction() {
  $('#submit-label').textContent = currentTool === 'organize' && pages.length ? 'Export selected pages' : currentTool === 'image' && $('[name=format]').value === 'pdf' ? 'Create PDF' : tools[currentTool].action;
}
function setBusy(busy) {
  form.querySelectorAll('input,select,button').forEach(element => { element.disabled = busy; });
  form.querySelectorAll('[data-options]').forEach(panel => panel.querySelectorAll('input,select,button').forEach(element => { element.disabled = busy || panel.hidden; }));
  document.querySelectorAll('[data-tool]').forEach(element => { element.disabled = busy; });
  $('#cancel-job').hidden = !busy; $('#cancel-job').disabled = false; $('#clear-files').disabled = busy;
  $('#tool-panel').setAttribute('aria-busy', String(busy));
  $('#page-grid').querySelectorAll('li').forEach(card => { card.draggable = !busy; });
}
function selectionChanged() {
  input.value = ''; clearOutput(); resetPages(); renderFiles();
}
function renderFiles() {
  list.replaceChildren();
  selected.forEach((file, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span'); label.textContent = `${index + 1}. ${file.name}`;
    const size = document.createElement('small'); size.textContent = formatBytes(file.size);
    item.append(label, size);
    const actions = document.createElement('div'); actions.className = 'file-actions';
    if (tools[currentTool].count > 1) for (const [text, offset] of [['↑', -1], ['↓', 1]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.setAttribute('aria-label', `Move ${file.name} ${offset < 0 ? 'up' : 'down'}`);
      button.disabled = index + offset < 0 || index + offset >= selected.length;
      button.addEventListener('click', () => { [selected[index], selected[index + offset]] = [selected[index + offset], selected[index]]; selectionChanged(); });
      actions.append(button);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.addEventListener('click', () => { selected.splice(index, 1); selectionChanged(); }); actions.append(remove);
    item.append(actions); list.append(item);
  });
  $('#selection-summary').textContent = selected.length ? `${selected.length} file(s) · ${formatBytes(selected.reduce((sum, file) => sum + file.size, 0))}` : 'No files selected';
  $('#clear-files').hidden = !selected.length;
}
function validateFiles(files) {
  const tool = tools[currentTool];
  if (files.length > tool.count) throw new Error(`Choose at most ${tool.count} files for this tool.`);
  for (const file of files) {
    if (!file.size) throw new Error(`“${file.name}” is empty.`);
    if (!tool.extensions.includes(file.name.split('.').pop().toLowerCase())) throw new Error(`“${file.name}” is not a supported file type for this tool.`);
    if (file.size > tool.limit) throw new Error(`“${file.name}” exceeds the ${formatBytes(tool.limit)} browser limit. Use the desktop app for bigger files.`);
  }
  if (tool.total && files.reduce((sum, file) => sum + file.size, 0) > tool.total) throw new Error(`Keep your selection under ${formatBytes(tool.total)} total.`);
}
function addFiles(files) {
  if (active || !files.length) return;
  const next = tools[currentTool].count > 1 ? [...selected, ...files] : files.slice(0, 1);
  input.value = '';
  try { validateFiles(next); }
  catch (error) { report(`${error.message} Your existing selection has been kept.`); return; }
  selected = next; selectionChanged(); report('Ready when you are.');
}
function chooseTool(tool, focus = false) {
  if (active || !tools[tool]) return;
  currentTool = tool; selected = []; input.value = ''; clearOutput(); resetPages();
  input.accept = tools[tool].accept; input.multiple = tools[tool].count > 1;
  $('#tool-title').textContent = tools[tool].title; $('#tool-hint').textContent = tools[tool].hint;
  $('#tool-panel').setAttribute('aria-labelledby', dedicatedTool ? 'tool-title' : `tab-${tool}`);
  document.querySelectorAll('[data-tool]').forEach(button => { const chosen = button.dataset.tool === tool; button.setAttribute('aria-selected', String(chosen)); button.tabIndex = chosen ? 0 : -1; if (chosen && focus) button.focus(); });
  document.querySelectorAll('[data-options]').forEach(panel => { panel.hidden = panel.dataset.options !== tool; });
  $('#video-note').hidden = tool !== 'video'; setBusy(false); renderFiles(); report('Ready when you are.');
  if (!dedicatedTool) history.replaceState(null, '', `#${tool}`);
}

function renderPages(focusId, focusAction) {
  const grid = $('#page-grid'); grid.replaceChildren();
  $('#pdf-workspace').hidden = !pages.length;
  $('#page-summary').textContent = `${pages.filter(page => page.selected).length} of ${pages.length} pages selected`;
  pages.forEach((page, index) => {
    const card = document.createElement('li'); card.className = `page-card${page.selected ? '' : ' excluded'}`; card.dataset.pageId = page.id; card.draggable = !active;
    const description = `${page.name}, page ${page.pageIndex + 1} (file ${page.fileIndex + 1})`;
    const label = document.createElement('label'); label.className = 'page-select';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = page.selected; checkbox.dataset.action = 'select'; checkbox.setAttribute('aria-label', `Include ${description}`);
    const position = document.createElement('span'); position.textContent = `Position ${index + 1}`;
    label.append(checkbox, position); card.append(label);
    const thumb = document.createElement('div'); thumb.className = 'page-thumb';
    if (page.thumbnail) {
      const image = document.createElement('img'); image.src = page.thumbnail; image.alt = `Preview of ${description}`; image.draggable = false; image.style.transform = `rotate(${page.rotation}deg)`; thumb.append(image);
    } else { thumb.textContent = 'Preview unavailable'; }
    const caption = document.createElement('p'); caption.className = 'page-caption'; caption.textContent = page.name; caption.title = page.name;
    const number = document.createElement('small'); number.textContent = `Source page ${page.pageIndex + 1} · +${page.rotation}°`;
    card.append(thumb, caption, number);
    checkbox.addEventListener('change', () => { page.selected = checkbox.checked; clearOutput(); renderPages(page.id, 'select'); });
    const actions = document.createElement('div'); actions.className = 'page-actions';
    for (const [text, action, title] of [['←', 'earlier', 'Move earlier'], ['↻', 'rotate', 'Rotate clockwise'], ['→', 'later', 'Move later']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.dataset.action = action; button.title = title; button.setAttribute('aria-label', `${title}: ${description}`);
      button.disabled = active || (action === 'earlier' && index === 0) || (action === 'later' && index === pages.length - 1);
      button.addEventListener('click', () => {
        if (action === 'rotate') page.rotation = (page.rotation + 90) % 360;
        else { const next = index + (action === 'earlier' ? -1 : 1); [pages[index], pages[next]] = [pages[next], pages[index]]; }
        clearOutput(); renderPages(page.id, action); report(action === 'rotate' ? `Rotated source page ${page.pageIndex + 1} by 90°. Your original PDF is unchanged.` : `Moved source page ${page.pageIndex + 1} to position ${pages.indexOf(page) + 1}.`);
      });
      actions.append(button);
    }
    card.append(actions);
    card.addEventListener('dragstart', event => { if (active) { event.preventDefault(); return; } draggedPage = page.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', page.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => { draggedPage = null; grid.querySelectorAll('.drag-over,.dragging').forEach(element => element.classList.remove('drag-over', 'dragging')); });
    card.addEventListener('dragover', event => { if (!active && draggedPage && draggedPage !== page.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; card.classList.add('drag-over'); } });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', event => {
      event.preventDefault();
      if (active || !draggedPage || draggedPage === page.id) return;
      const from = pages.findIndex(item => item.id === draggedPage), to = pages.indexOf(page);
      if (from < 0) return;
      const [moved] = pages.splice(from, 1); pages.splice(to, 0, moved); draggedPage = null;
      clearOutput(); renderPages(moved.id, 'select'); report(`Moved source page ${moved.pageIndex + 1} to position ${to + 1}.`);
    });
    grid.append(card);
  });
  if (focusId) {
    const card = Array.from(grid.children).find(element => element.dataset.pageId === focusId);
    const target = card?.querySelector(`[data-action="${focusAction}"]`);
    (target && !target.disabled ? target : card?.querySelector('input'))?.focus({ preventScroll: true });
  }
  updateAction();
}
$('#select-all-pages').addEventListener('click', () => { pages.forEach(page => { page.selected = true; }); clearOutput(); renderPages(); });
$('#select-no-pages').addEventListener('click', () => { pages.forEach(page => { page.selected = false; }); clearOutput(); renderPages(); });
$('#reset-pages').addEventListener('click', () => { pages.sort((a, b) => a.fileIndex - b.fileIndex || a.pageIndex - b.pageIndex); pages.forEach(page => { page.rotation = 0; page.selected = true; }); clearOutput(); renderPages(); report('Original page order and rotation restored.'); });

// Preference persistence is opt-in and contains no file data, names or history.
const settingsKey = 'fileforge:image-settings:v1';
const imageControls = ['format', 'quality', 'width'];
function getImageSettings() { return imageSettings(Object.fromEntries(imageControls.map(name => [name, $(`[name=${name}]`).value]))); }
function updateImageHint() {
  const pdf = $('[name=format]').value === 'pdf';
  $('#image-output-hint').textContent = pdf ? 'One image per A4 page, in the order above. Transparent areas use white.' : 'Multiple images download together as a ZIP. Transparent areas stay transparent in PNG and WebP; JPG uses white.';
  updateAction();
}
function storeImageSettings() {
  try {
    if ($('#remember-image').checked) {
      const settings = getImageSettings();
      if (!settings) return;
      localStorage.setItem(settingsKey, JSON.stringify({ version: 1, ...settings }));
      $('#settings-note').textContent = 'Settings saved on this device. Uncheck to forget them. Files and filenames are never saved.';
    } else { localStorage.removeItem(settingsKey); $('#settings-note').textContent = 'Optional. Saves settings only, never files or filenames.'; }
  } catch { $('#remember-image').checked = false; $('#settings-note').textContent = 'This browser blocked preference storage. You can still use every tool.'; }
}
try {
  const saved = JSON.parse(localStorage.getItem(settingsKey));
  const settings = saved?.version === 1 && imageSettings(saved);
  if (settings) { imageControls.forEach(name => { $(`[name=${name}]`).value = settings[name]; }); $('#remember-image').checked = true; $('#settings-note').textContent = 'Using your saved settings. Uncheck to forget them.'; }
} catch { /* Corrupt or unavailable preferences must never prevent conversions. */ }
$('#remember-image').addEventListener('change', storeImageSettings);
imageControls.forEach(name => $(`[name=${name}]`).addEventListener('input', () => { clearOutput(); updateImageHint(); if ($('#remember-image').checked) storeImageSettings(); }));
const presets = { email: { format: 'jpg', quality: 78, width: 1600 }, web: { format: 'webp', quality: 82, width: 1920 }, document: { format: 'pdf', quality: 90, width: 0 } };
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  imageControls.forEach(name => { $(`[name=${name}]`).value = presets[button.dataset.preset][name]; });
  clearOutput(); updateImageHint(); if ($('#remember-image').checked) storeImageSettings(); report(`${button.textContent} settings applied. You can adjust them below.`);
}));

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
$('#clear-files').addEventListener('click', () => { selected = []; selectionChanged(); report('Cleared. File data, previews and the result link have been released.'); });
$('#cancel-job').addEventListener('click', () => { active?.abort(); });

async function backgroundConversion(files, options, signal) {
  const worker = currentTool === 'image' ? new Worker(new URL('./image.worker.js', import.meta.url), { type: 'module' }) : new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
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
      worker.onerror = () => { signal.removeEventListener('abort', abort); reject(new Error('The browser could not finish this job. Try smaller files or the desktop app.')); };
      worker.postMessage({ tool: currentTool, files: data, options }, data.map(file => file.bytes));
    });
  } finally { worker.terminate(); }
}

form.addEventListener('submit', async event => {
  event.preventDefault(); if (active) return;
  try {
    if (!selected.length) throw new Error('Choose a file first.');
    validateFiles(selected);
    if (currentTool === 'merge' && selected.length < 2) throw new Error('Choose between 2 and 20 PDFs.');
    if (currentTool === 'organize' && pages.length && !pages.some(page => page.selected)) throw new Error('Select at least one page to export.');
  } catch (error) { report(error.message); return; }
  clearOutput();
  const job = new AbortController(); active = job;
  const values = Object.fromEntries(new FormData(form)); values.removeAudio = $('#remove-audio').checked;
  setBusy(true); report('Starting locally…', 0);
  try {
    if (currentTool === 'organize' && !pages.length) {
      const { previewPages } = await import('./pdf-preview.js'); job.signal.throwIfAborted();
      pages = await previewPages(selected, job.signal, report);
      report(`Pages ready. Choose their order, rotation and which to include.${pages.some(page => !page.thumbnail) ? ' Some previews are unavailable; those pages are still included.' : ''}`);
      return;
    }
    let result;
    if (currentTool === 'video') { const { compressVideo } = await import('./video.js'); job.signal.throwIfAborted(); result = await compressVideo(selected[0], values, report, job.signal); }
    else {
      if (currentTool === 'organize') values.pages = pages.filter(page => page.selected).map(({ fileIndex, pageIndex, rotation }) => ({ fileIndex, pageIndex, rotation }));
      result = await backgroundConversion(selected, values, job.signal);
    }
    job.signal.throwIfAborted();
    const blob = new Blob([result.bytes], { type: result.type });
    outputURL = URL.createObjectURL(blob);
    const link = $('#download-result'); link.href = outputURL; link.download = result.name;
    $('#result-name').textContent = result.name;
    let detail = `${formatBytes(blob.size)} · ${result.detail}`;
    if (currentTool === 'image' && result.type !== 'application/pdf') {
      const original = selected.reduce((total, file) => total + file.size, 0), difference = Math.round((1 - blob.size / original) * 100);
      detail += ` ${difference > 0 ? `${difference}% smaller` : difference < 0 ? `${Math.abs(difference)}% larger` : 'About the same size'} than the original${selected.length > 1 ? 's' : ''}.`;
    }
    $('#result-detail').textContent = detail;
    if (result.type.startsWith('image/')) { $('#image-preview').src = outputURL; $('#image-preview').hidden = false; }
    $('#result').hidden = false; report('Done. Your download is ready.', 100);
  } catch (error) { report(job.signal.aborted ? 'Cancelled. You can choose another file or try again.' : error.message || 'The conversion could not finish. Try the desktop app.'); }
  finally { active = null; setBusy(false); renderFiles(); if (currentTool === 'organize') renderPages(); }
});
window.addEventListener('beforeunload', () => { active?.abort(); clearOutput(); resetPages(); });
window.addEventListener('hashchange', () => { if (dedicatedTool) return; if (active) history.replaceState(null, '', `#${currentTool}`); else chooseTool(location.hash.slice(1)); });
updateImageHint();
chooseTool(tools[dedicatedTool] ? dedicatedTool : tools[location.hash.slice(1)] ? location.hash.slice(1) : 'image');
// A task link can open Image studio with PDF selected, without changing saved settings.
if (currentTool === 'image' && new URLSearchParams(location.search).get('format') === 'pdf') {
  $('[name=format]').value = 'pdf'; updateImageHint(); updateAction();
}
