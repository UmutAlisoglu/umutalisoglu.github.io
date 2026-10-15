import { compatibleTools, validateWorkspaceFiles, workspaceTools } from './workspace-tools.js';
import { findTools } from './tool-catalog.js';
import { formatBytes, downloadName, isTextEditingTarget } from '../fileforge/shared.js';
import './workspace.css';

const protocol = 'fileforge-workspace-v1';
const session = document.querySelector('[data-workspace-session]');
const $ = selector => session.querySelector(selector);
const launchers = [...document.querySelectorAll('[data-workspace-launcher]')];
let files = [], originals = [], frame = null, tool = null, busy = false, loading = false, output = null;
let downloadURL, thumbURL, sourceMode = 'current', steps = [], favourites = new Set(), remembers = false, currentStep = 0;
const stageHeading = $('[data-workspace-tool-name]'); stageHeading.tabIndex = -1;
const renameLabel = document.createElement('label'); renameLabel.className = 'forge-rename'; renameLabel.textContent = 'Download name';
const renameField = document.createElement('input'); renameField.type = 'text'; renameField.maxLength = 140; renameField.dataset.workspaceRename = ''; renameField.autocomplete = 'off';
const renameSuffix = document.createElement('span'); renameSuffix.className = 'forge-rename-suffix';
const renameControls = document.createElement('span'); renameControls.append(renameField, renameSuffix); renameLabel.append(renameControls);
$('[data-workspace-result] .forge-result-label').after(renameLabel);
const favouriteKey = 'fileforge:favourite-tools:v1';
try {
  const stored = JSON.parse(localStorage.getItem(favouriteKey));
  if (stored?.version === 1 && Array.isArray(stored.tools)) {
    favourites = new Set(stored.tools.filter(id => workspaceTools.some(tool => tool.id === id)));
    remembers = true;
  }
} catch { /* Storage is optional; unavailable preferences do not block work. */ }

function report(message, error = false) {
  launchers.forEach(launcher => { const status = launcher.querySelector('[data-workspace-launch-status]'); status.textContent = message; status.classList.toggle('is-error', error); });
  $('[data-workspace-frame-status]').textContent = message;
}
function updateBusy(value) {
  busy = value;
  session.setAttribute('aria-busy', String(busy || loading));
  document.querySelectorAll('[data-workspace-input],[data-workspace-demo],[data-workspace-reset],[data-workspace-clear]').forEach(control => { control.disabled = busy || loading; });
  renameField.disabled = busy || loading; renderActions(); renderNext(); renderSourcePicker();
}
function clearOutput() {
  output = null; if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL = null;
  $('[data-workspace-result]').hidden = true; $('[data-workspace-download]').removeAttribute('href');
  if (sourceMode === 'result') sourceMode = 'current';
  renderSourcePicker();
}
function routeFiles() {
  if (sourceMode === 'original') return originals;
  if (sourceMode === 'result' && output) return [new File([output.blob], output.name, { type: output.blob.type })];
  return files;
}
function renderSourcePicker() {
  document.querySelectorAll('[data-workspace-source]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.workspaceSource === sourceMode));
    button.hidden = button.dataset.workspaceSource === 'result' && !output;
    button.disabled = busy || loading || (button.dataset.workspaceSource === 'original' && !originals.length);
  });
  const names = routeFiles();
  const summary = names.length === 1 ? names[0].name : names.length ? `${names.length} files` : 'Choose a file inside a tool';
  $('[data-workspace-source-note]').textContent = `${sourceMode === 'result' ? 'Latest result' : sourceMode === 'original' ? 'Original selection' : 'Current input'} · ${summary}`;
}
function publishWorkspaceState() {
  document.dispatchEvent(new CustomEvent('fileforge:workspace-state', { detail: { active: !session.hidden, compatibleIDs: compatibleTools(routeFiles()).map(item => item.id), busy: busy || loading } }));
}
function revealStage() {
  stageHeading.focus({ preventScroll: true });
  const bounds = $('.forge-stage-heading').getBoundingClientRect();
  if (innerWidth <= 760 || bounds.top < 0 || bounds.top > innerHeight * .6) $('.forge-stage-heading').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}
function sourcePreview() {
  const image = $('[data-workspace-thumb]'); image.removeAttribute('src'); image.hidden = true;
  if (thumbURL) URL.revokeObjectURL(thumbURL); thumbURL = null;
  $('[data-workspace-file-name]').textContent = files.length === 1 ? files[0].name : `${files.length} selected files`;
  $('[data-workspace-file-detail]').textContent = files.length ? `${formatBytes(files.reduce((sum, file) => sum + file.size, 0))} · ${files.length === 1 ? files[0].name.split('.').pop().toUpperCase() : 'batch'}` : 'Choose files inside your tool';
  if (files.length === 1 && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(files[0].name.split('.').pop().toLowerCase())) {
    thumbURL = URL.createObjectURL(files[0]); image.src = thumbURL; image.hidden = false;
  }
}
function persistFavourites() {
  try {
    if (remembers) localStorage.setItem(favouriteKey, JSON.stringify({ version: 1, tools: [...favourites] }));
    else localStorage.removeItem(favouriteKey);
    $('[data-workspace-preference-note]').textContent = remembers ? 'Saved on this device. No files or filenames.' : 'Optional. Saves tool choices only.';
  } catch { remembers = false; $('[data-workspace-remember]').checked = false; $('[data-workspace-preference-note]').textContent = 'Preference storage is unavailable. Your tools still work.'; }
}
function renderActions() {
  const focused = document.activeElement?.closest('[data-workspace-tool], [data-workspace-favourite]');
  const focusID = focused?.dataset.workspaceTool || focused?.dataset.workspaceFavourite;
  const isFavourite = focused?.hasAttribute('data-workspace-favourite');
  const query = $('[data-workspace-search]').value.trim().toLowerCase();
  const matches = new Set(findTools(query).map(item => item.id));
  const tools = compatibleTools(routeFiles()).filter(item => matches.has(item.id)).sort((a, b) => Number(favourites.has(b.id)) - Number(favourites.has(a.id)));
  const target = $('[data-workspace-actions]'); target.replaceChildren();
  for (const item of tools) {
    const row = document.createElement('div'); row.className = 'forge-action-row';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'forge-action'; button.dataset.workspaceTool = item.id;
    button.setAttribute('aria-pressed', String(tool?.id === item.id)); button.disabled = busy || loading;
    const symbol = document.createElement('span'); symbol.className = `forge-action-icon tone-${item.color}`; symbol.textContent = item.symbol; symbol.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'), strong = document.createElement('strong'), small = document.createElement('small'); strong.textContent = item.name; small.textContent = item.short; label.append(strong, small); button.append(symbol, label);
    button.addEventListener('click', () => openTool(item));
    const star = document.createElement('button'); star.type = 'button'; star.className = 'forge-favourite'; star.dataset.workspaceFavourite = item.id; star.textContent = favourites.has(item.id) ? '★' : '☆';
    star.setAttribute('aria-label', `${favourites.has(item.id) ? 'Remove' : 'Add'} ${item.name} ${favourites.has(item.id) ? 'from' : 'to'} favourites`); star.setAttribute('aria-pressed', String(favourites.has(item.id)));
    star.addEventListener('click', () => { favourites.has(item.id) ? favourites.delete(item.id) : favourites.add(item.id); persistFavourites(); renderActions(); });
    row.append(button, star); target.append(row);
  }
  $('[data-workspace-no-actions]').hidden = Boolean(tools.length);
  if (focusID) {
    const replacement = target.querySelector(`[data-workspace-${isFavourite ? 'favourite' : 'tool'}="${focusID}"]`);
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
  }
  renderSourcePicker(); publishWorkspaceState();
}
function renderNext() {
  const target = $('[data-workspace-next]'); target.replaceChildren();
  if (!output) return;
  const file = new File([output.blob], output.name, { type: output.blob.type });
  const options = compatibleTools([file]);
  for (const item of options.filter(item => item.id !== tool?.id)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary'; button.textContent = item.name; button.disabled = busy || loading;
    button.dataset.workspaceContinue = item.id; button.addEventListener('click', () => {
      sourceMode = 'result'; openTool(item);
    }); target.append(button);
  }
  $('[data-workspace-result] .forge-next-row').hidden = !target.children.length;
}
function renderTrail() {
  const list = $('[data-workspace-steps]'); list.replaceChildren();
  for (const step of steps.slice(-6)) {
    const item = document.createElement('li'); item.textContent = `${step.title} · ${formatBytes(step.size)}`; list.append(item);
  }
  $('[data-workspace-trail]').hidden = !steps.length;
}
function openTool(item) {
  if (busy || loading) { report('Finish or cancel your current job before changing tools.'); return; }
  const nextFiles = routeFiles();
  if (nextFiles.length && !compatibleTools(nextFiles).some(candidate => candidate.id === item.id)) { report('Choose a tool that accepts the selected source.', true); return; }
  if (sourceMode === 'original') { steps = []; renderTrail(); }
  files = Array.from(nextFiles); sourceMode = 'current'; sourcePreview();
  clearOutput(); tool = item; currentStep++;
  frame?.remove(); frame = document.createElement('iframe'); frame.title = `${item.name} — local FileForge tool`;
  frame.setAttribute('allow', 'clipboard-write');
  const url = new URL(item.url, location.origin); url.searchParams.set('workspace', '1'); frame.src = url.href;
  $('[data-workspace-frame]').replaceChildren(frame); $('[data-workspace-empty]').hidden = true;
  $('[data-workspace-tool-name]').textContent = item.name; $('[data-workspace-tool-icon]').textContent = item.symbol;
  const guide = $('[data-workspace-tool-guide]'); guide.href = item.url; guide.hidden = false;
  report(`Opening ${item.name.toLowerCase()}…`); renderActions(); revealStage();
}
async function begin(nextFiles, preferred) {
  if (busy || loading) return;
  try { validateWorkspaceFiles(nextFiles); }
  catch (error) { report(error.message, true); return; }
  frame?.remove(); frame = null; tool = null; clearOutput(); steps = []; currentStep = 0;
  files = Array.from(nextFiles); originals = Array.from(nextFiles); sourceMode = 'current'; sourcePreview(); renderTrail();
  $('[data-workspace-empty]').hidden = false; session.hidden = false;
  $('[data-workspace-tool-name]').textContent = 'Choose a tool to begin'; $('[data-workspace-tool-guide]').hidden = true;
  const available = compatibleTools(files);
  const first = available.find(item => item.id === preferred) || (available.length === 1 ? available[0] : null);
  if (first) openTool(first); else {
    report(`${files.length === 1 ? 'Your file is' : 'Your files are'} ready. Choose a task to begin.`); renderActions();
    session.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
}
function clearSession() {
  if (busy || loading) return;
  frame?.remove(); frame = null; files = []; originals = []; tool = null; steps = []; clearOutput(); sourcePreview(); renderTrail();
  session.hidden = true; document.querySelectorAll('[data-workspace-input]').forEach(input => { input.value = ''; });
  report('Cleared. Choose a file or try a sample.'); renderActions();
  const launcherInput = document.querySelector('[data-workspace-input]');
  if (launcherInput && launcherInput.getClientRects().length) {
    launcherInput.focus({ preventScroll: true });
    launcherInput.closest('[data-workspace-launcher]').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  }
}

async function sample(kind) {
  if (busy || loading) return;
  loading = true; updateBusy(false); report('Preparing an original sample on your device…');
  try {
    const { createSample } = await import('./workspace-samples.js');
    const created = await createSample(kind); loading = false; updateBusy(false); await begin(created.files, created.tool);
  } catch (error) { report(error.message || 'Could not open this sample. Choose a file instead.', true); }
  finally { loading = false; updateBusy(busy); }
}
for (const launcher of launchers) {
  const input = launcher.querySelector('[data-workspace-input]'), drop = launcher.querySelector('[data-workspace-drop]');
  input.addEventListener('change', () => { const selected = Array.from(input.files); input.value = ''; void begin(selected); });
  for (const event of ['dragenter', 'dragover']) drop.addEventListener(event, e => { e.preventDefault(); if (!busy && !loading) drop.classList.add('dragging'); });
  for (const event of ['dragleave', 'drop']) drop.addEventListener(event, e => { e.preventDefault(); drop.classList.remove('dragging'); });
  drop.addEventListener('drop', e => void begin(Array.from(e.dataTransfer.files)));
}
document.querySelectorAll('[data-workspace-demo]').forEach(button => button.addEventListener('click', () => void sample(button.dataset.workspaceDemo)));
$('[data-workspace-search]').addEventListener('input', renderActions);
$('[data-workspace-remember]').checked = remembers;
$('[data-workspace-remember]').addEventListener('change', event => { remembers = event.target.checked; persistFavourites(); });
$('[data-workspace-reset]').addEventListener('click', () => { if (originals.length) void begin(Array.from(originals)); });
$('[data-workspace-clear]').addEventListener('click', clearSession);
document.querySelectorAll('[data-workspace-source]').forEach(button => button.addEventListener('click', () => {
  if (busy || loading) return;
  sourceMode = button.dataset.workspaceSource; renderActions();
}));
renameField.addEventListener('input', () => {
  if (!output || busy || loading) return;
  output.name = downloadName(renameField.value, output.defaultName);
  $('[data-workspace-download]').download = output.name; $('[data-workspace-result-name]').textContent = output.name;
  renderNext(); renderActions();
});
document.addEventListener('fileforge:request-workspace-state', publishWorkspaceState);
document.addEventListener('fileforge:choose-tool', event => {
  if (session.hidden) return;
  const item = workspaceTools.find(item => item.id === event.detail?.id);
  if (item) openTool(item);
});
document.addEventListener('paste', event => {
  if (isTextEditingTarget(event.target) || busy || loading) return;
  const pasted = [...(event.clipboardData?.files || [])];
  if (pasted.length) { event.preventDefault(); void begin(pasted); }
});
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.protocol !== protocol) return;
  if (event.source === window.parent && window.parent !== window && event.data.type === 'workspace-files' && Array.isArray(event.data.files) && event.data.files.every(file => file instanceof File)) { void begin(event.data.files); return; }
  if (!frame || event.source !== frame.contentWindow) return;
  const data = event.data;
  if (data.type === 'find-tool') { document.dispatchEvent(new CustomEvent('fileforge:open-tool-finder')); }
  else if (data.type === 'ready') {
    frame.contentWindow.postMessage({ protocol, type: 'files', files }, location.origin);
    report('Ready. Adjust your settings and run the tool.');
  } else if (data.type === 'busy') updateBusy(Boolean(data.busy));
  else if (data.type === 'height' && Number.isFinite(data.height)) frame.style.height = `${Math.max(460, Math.min(6500, data.height))}px`;
  else if (data.type === 'error') report(String(data.message), true);
  else if (data.type === 'selection' && Array.isArray(data.files) && data.files.every(file => file instanceof File)) { files = data.files; sourceMode = 'current'; sourcePreview(); renderActions(); }
  else if (data.type === 'invalidated') { clearOutput(); renderActions(); }
  else if (data.type === 'result' && data.blob instanceof Blob && data.blob.size && data.blob.size <= 150e6 && typeof data.name === 'string') {
    clearOutput(); output = { blob: data.blob, name: data.name, defaultName: data.name, detail: String(data.detail || '') }; sourceMode = 'result';
    downloadURL = URL.createObjectURL(data.blob); const link = $('[data-workspace-download]'); link.href = downloadURL; link.download = data.name;
    $('[data-workspace-result-name]').textContent = data.name; $('[data-workspace-result-detail]').textContent = `${formatBytes(data.blob.size)} · ${output.detail}`;
    $('[data-workspace-result]').hidden = false;
    renameField.value = data.name.replace(/\.[^.]+$/, ''); renameSuffix.textContent = `.${data.name.split('.').pop()}`;
    const entry = { id: currentStep, title: tool.name, size: data.blob.size };
    if (steps.at(-1)?.id === currentStep) steps[steps.length - 1] = entry; else steps.push(entry);
    renderTrail(); renderNext(); renderActions(); report('Result ready. Your next tool will use this result. Choose Current file or Original to start another branch.');
  }
});
window.addEventListener('pagehide', () => { frame?.remove(); frame = null; files = []; originals = []; clearOutput(); if (thumbURL) URL.revokeObjectURL(thumbURL); thumbURL = null; });
window.addEventListener('pageshow', event => { if (event.persisted) { busy = false; loading = false; clearSession(); updateBusy(false); } });
if (new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window) {
  document.body.classList.add('embedded-workspace'); window.parent.postMessage({ protocol, type: 'workspace-ready' }, location.origin);
}
renderActions(); persistFavourites();
const params = new URLSearchParams(location.search);
if (['photo', 'text', 'pdf'].includes(params.get('demo'))) void sample(params.get('demo'));
