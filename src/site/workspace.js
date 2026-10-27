import { compatibleTools, validateWorkspaceFiles, workspaceTools } from './workspace-tools.js';
import { findTools } from './tool-catalog.js';
import { formatBytes, downloadName, isTextEditingTarget } from '../fileforge/shared.js';
import './workspace.css';
import './workspace-flow.css';
import '../fileforge/tool-experience.css';
import { quickJobs, resolveQuickJob, renderJobSteps } from './quick-jobs.js';
import { fillOutputSummary } from '../fileforge/output-summary.js';

const protocol = 'fileforge-workspace-v1';
const session = document.querySelector('[data-workspace-session]');
const $ = selector => session.querySelector(selector);
const launchers = [...document.querySelectorAll('[data-workspace-launcher]')];
const allFileTypes = launchers[0]?.querySelector('input').accept;
let files = [], originals = [], frame = null, tool = null, busy = false, loading = false, output = null;
let downloadURL, thumbURL, sourceMode = 'current', steps = [], favourites = new Set(), remembers = false, currentStep = 0;
let frameTimer;
let chosenJob = quickJobs.some(job => job.id === new URLSearchParams(location.search).get('job')) ? new URLSearchParams(location.search).get('job') : null;
let guidedJob = null, comparisonRevision = 0, comparisonURLs = [];
const resultDock = $('[data-workspace-result]');
resultDock.tabIndex = -1; resultDock.setAttribute('aria-label', 'Your prepared file');
$('[data-workspace-frame]').before(resultDock);
const editor = document.createElement('details'); editor.className = 'workspace-editor'; editor.open = true;
const editorSummary = document.createElement('summary'); editorSummary.textContent = 'Adjust or review this step';
const frameContainer = $('[data-workspace-frame]'); frameContainer.before(editor); editor.append(editorSummary, frameContainer);
const comparison = document.createElement('dl'); comparison.className = 'tool-output-summary'; comparison.dataset.workspaceComparison = '';
resultDock.querySelector('.result-save-note').before(comparison);
const preview = document.createElement('div'); preview.className = 'workspace-result-previews'; preview.hidden = true;
comparison.after(preview);
const nextStep = document.createElement('button'); nextStep.type = 'button'; nextStep.className = 'button primary'; nextStep.dataset.jobNext = ''; nextStep.hidden = true;
resultDock.querySelector('.forge-result-label').append(nextStep);
const cancelTask = document.createElement('button'); cancelTask.type = 'button'; cancelTask.className = 'button secondary'; cancelTask.textContent = 'Cancel task'; cancelTask.hidden = true;
cancelTask.dataset.workspaceCancel = ''; $('[data-workspace-frame-status]').after(cancelTask);
cancelTask.addEventListener('click', () => frame?.contentWindow.postMessage({ protocol, type: 'cancel' }, location.origin));

function selectJob(id) {
  chosenJob = id;
  const url = new URL(location.href);
  if (id) url.searchParams.set('job', id); else url.searchParams.delete('job');
  history.replaceState(null, '', url);
  document.querySelectorAll('[data-quick-job]').forEach(card => {
    if (card.dataset.quickJob === id) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
  });
  const definition = quickJobs.find(job => job.id === id);
  launchers.forEach(launcher => {
    const input = launcher.querySelector('input'); input.multiple = !id;
    input.accept = id === 'attachment' ? '.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.pdf,.mp4,.mov,.mkv,.webm,.avi,.m4v' : id ? '.jpg,.jpeg,.png,.webp,.gif,.bmp' : allFileTypes;
    launcher.querySelector('h2').textContent = definition ? definition.title : 'Open a file. Keep going.';
    launcher.querySelector('h2 + p').textContent = definition ? `${definition.accepts}. Choose your file to begin.` : 'Choose a file. The right tools will find you.';
  });
}
function renderGuidedJob() {
  $('[data-guided-job]').hidden = !guidedJob;
  document.body.classList.toggle('workspace-guided', Boolean(guidedJob));
  if (!guidedJob) { nextStep.hidden = true; return; }
  $('#guided-job-title').textContent = guidedJob.title;
  $('[data-job-steps]').innerHTML = renderJobSteps(guidedJob);
  $('[data-job-hint]').textContent = guidedJob.steps[guidedJob.index].hint;
}
function exitJob() { guidedJob = null; selectJob(null); renderGuidedJob(); if (output) renderNext(); }
$('[data-job-exit]').addEventListener('click', exitJob);
$('[data-guided-reset]').addEventListener('click', () => { if (!busy && !loading && originals.length) void begin(Array.from(originals)); });
document.querySelectorAll('[data-quick-job]').forEach(card => card.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || busy || loading) return;
  event.preventDefault(); selectJob(card.dataset.quickJob);
  if (!session.hidden && originals.length) void begin(Array.from(originals));
  else { launchers[0]?.scrollIntoView({ behavior: reducedScroll(), block: 'center' }); launchers[0]?.querySelector('input').focus({ preventScroll: true }); }
}));
function reducedScroll() { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'; }

async function renderComparison(blob) {
  const revision = ++comparisonRevision;
  const sources = files.length === 1 ? [['Input', files[0]], ['Result', blob]] : [];
  preview.replaceChildren(); preview.hidden = true;
  for (const [label, file] of sources) {
    if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type) || file.size > 25e6) continue;
    let bitmap, canvas;
    try {
      bitmap = await createImageBitmap(file);
      const width = bitmap.width, height = bitmap.height, scale = Math.min(1, 640 / Math.max(width, height));
      canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const thumbnail = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (revision !== comparisonRevision || !thumbnail) return;
      const figure = document.createElement('figure'), caption = document.createElement('figcaption'), image = document.createElement('img');
      caption.textContent = `${label} · ${width} × ${height} px`;
      const url = URL.createObjectURL(thumbnail); comparisonURLs.push(url); image.src = url; image.alt = `${label} image preview`;
      figure.append(caption, image); preview.append(figure); preview.hidden = false;
    } catch { /* A preview is optional. The real output remains downloadable. */ }
    finally { bitmap?.close(); if (canvas) canvas.width = canvas.height = 1; }
  }
}
const recovery = document.createElement('p');
recovery.className = 'forge-frame-recovery'; recovery.hidden = true;
const recoveryText = document.createElement('span');
recoveryText.textContent = 'This tool is taking longer to open. You can wait, choose another task, or ';
const recoveryLink = document.createElement('a'); recoveryLink.textContent = 'open the tool directly ↗';
recoveryLink.target = '_blank'; recoveryLink.rel = 'noopener';
recovery.append(recoveryText, recoveryLink);
$('[data-workspace-frame]').before(recovery);

function updateProgress() {
  document.body.classList.toggle('workspace-active', !session.hidden);
  const current = output ? 'download' : 'edit';
  session.querySelectorAll('[data-workspace-step]').forEach(step => {
    if (step.dataset.workspaceStep === current) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
  });
}
function clearFrameWait() {
  clearTimeout(frameTimer); recovery.hidden = true;
}
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
  document.querySelectorAll('[data-workspace-input],[data-workspace-demo],[data-workspace-reset],[data-workspace-clear],[data-guided-reset],[data-job-exit]').forEach(control => { control.disabled = busy || loading; });
  renameField.disabled = busy || loading; renderActions(); renderNext(); renderSourcePicker();
  nextStep.disabled = busy || loading;
  if (!busy) cancelTask.hidden = true;
}
function clearOutput() {
  document.body.classList.remove('workspace-result-ready');
  comparisonRevision++; comparisonURLs.forEach(url => URL.revokeObjectURL(url)); comparisonURLs = []; preview.replaceChildren(); preview.hidden = true;
  output = null; if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL = null;
  $('[data-workspace-result]').hidden = true; $('[data-workspace-download]').removeAttribute('href');
  if (sourceMode === 'result') sourceMode = 'current';
  renderSourcePicker(); updateProgress(); renderGuidedJob();
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
  nextStep.hidden = true;
  const download = $('[data-workspace-download]'); download.className = 'button primary';
  if (!output) return;
  const file = new File([output.blob], output.name, { type: output.blob.type });
  const options = compatibleTools([file]);
  if (guidedJob) {
    const next = guidedJob.steps[guidedJob.index + 1];
    if (next && options.some(item => item.id === next.tool)) {
      nextStep.textContent = `Next: ${next.label} →`; nextStep.hidden = false; nextStep.disabled = busy || loading;
      download.className = 'button secondary';
      $('[data-job-hint]').textContent = 'This step is ready. Review the output, then continue. You can also download this intermediate file.';
    } else if (next && !(guidedJob.id === 'document' && output.blob.type === 'application/pdf')) {
      $('[data-job-hint]').textContent = 'This output format cannot continue to the next step. Choose a raster image output, or use the full toolbox.';
    } else {
      $('[data-job-hint]').textContent = 'Your job is ready. Check the result and download it before leaving.';
      $('[data-job-steps]').querySelector('[aria-current]')?.classList.add('is-complete');
      if (next && guidedJob.id === 'document' && output.blob.type === 'application/pdf') {
        const indicators = [...$('[data-job-steps]').children];
        indicators.forEach(step => { step.classList.add('is-complete'); step.removeAttribute('aria-current'); });
        indicators.at(-1)?.setAttribute('aria-current', 'step');
      }
    }
    $('[data-workspace-result] .forge-next-row').hidden = true;
    return;
  }
  for (const item of options.filter(item => item.id !== tool?.id)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary'; button.textContent = item.name; button.disabled = busy || loading;
    button.dataset.workspaceContinue = item.id; button.addEventListener('click', () => {
      sourceMode = 'result'; openTool(item);
    }); target.append(button);
  }
  $('[data-workspace-result] .forge-next-row').hidden = !target.children.length;
}
nextStep.addEventListener('click', () => {
  if (!guidedJob || !output || busy || loading) return;
  const next = guidedJob.steps[guidedJob.index + 1];
  const item = workspaceTools.find(item => item.id === next?.tool);
  if (!item || !compatibleTools([new File([output.blob], output.name, { type: output.blob.type })]).some(candidate => candidate.id === item.id)) return;
  guidedJob.index++; sourceMode = 'result'; openTool(item, true); renderGuidedJob();
});
function renderTrail() {
  const list = $('[data-workspace-steps]'); list.replaceChildren();
  for (const step of steps.slice(-6)) {
    const item = document.createElement('li'); item.textContent = `${step.title} · ${formatBytes(step.size)}`; list.append(item);
  }
  $('[data-workspace-trail]').hidden = !steps.length;
}
function openTool(item, keepJob = false) {
  if (busy || loading) { report('Finish or cancel your current job before changing tools.'); return; }
  const nextFiles = routeFiles();
  if (nextFiles.length && !compatibleTools(nextFiles).some(candidate => candidate.id === item.id)) { report('Choose a tool that accepts the selected source.', true); return; }
  if (!keepJob && guidedJob) exitJob();
  editor.open = true;
  if (sourceMode === 'original') { steps = []; renderTrail(); }
  files = Array.from(nextFiles); sourceMode = 'current'; sourcePreview();
  clearFrameWait(); clearOutput(); tool = item; currentStep++;
  frame?.remove(); frame = document.createElement('iframe'); frame.title = `${item.name} — local FileForge tool`;
  frame.setAttribute('allow', 'clipboard-write');
  const url = new URL(item.url, location.origin); url.searchParams.set('workspace', '1'); frame.src = url.href;
  recoveryLink.href = item.url;
  frameTimer = setTimeout(() => { recovery.hidden = false; }, 20000);
  $('[data-workspace-frame]').replaceChildren(frame); $('[data-workspace-empty]').hidden = true;
  $('[data-workspace-tool-name]').textContent = item.name; $('[data-workspace-tool-icon]').textContent = item.symbol;
  const guide = $('[data-workspace-tool-guide]'); guide.href = item.url; guide.hidden = false;
  report(`Opening ${item.name.toLowerCase()}…`); renderActions(); revealStage();
}
async function begin(nextFiles, preferred) {
  if (busy || loading) return;
  let nextJob;
  try { validateWorkspaceFiles(nextFiles); nextJob = resolveQuickJob(chosenJob, nextFiles); }
  catch (error) { report(error.message, true); return; }
  clearFrameWait(); frame?.remove(); frame = null; tool = null; clearOutput(); steps = []; currentStep = 0;
  $('[data-workspace-search]').value = '';
  files = Array.from(nextFiles); originals = Array.from(nextFiles); sourceMode = 'current'; sourcePreview(); renderTrail();
  guidedJob = nextJob; renderGuidedJob();
  $('[data-workspace-empty]').hidden = false; session.hidden = false; updateProgress();
  $('[data-workspace-tool-name]').textContent = 'Choose a tool to begin'; $('[data-workspace-tool-guide]').hidden = true;
  const available = compatibleTools(files);
  const first = available.find(item => item.id === (guidedJob?.steps[0].tool || preferred)) || (available.length === 1 ? available[0] : null);
  if (first) openTool(first, Boolean(guidedJob)); else {
    report(`${files.length === 1 ? 'Your file is' : 'Your files are'} ready. Choose a task to begin.`); renderActions();
    session.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
}
function clearSession() {
  if (busy || loading) return;
  clearFrameWait(); frame?.remove(); frame = null; files = []; originals = []; tool = null; steps = []; clearOutput(); sourcePreview(); renderTrail();
  session.hidden = true; updateProgress(); document.querySelectorAll('[data-workspace-input]').forEach(input => { input.value = ''; });
  guidedJob = null; renderGuidedJob();
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
  if (guidedJob) exitJob();
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
    clearFrameWait();
    frame.contentWindow.postMessage({ protocol, type: 'files', files, preset: guidedJob?.steps[guidedJob.index].preset }, location.origin);
    report('Ready. Adjust your settings and run the tool.');
  } else if (data.type === 'busy') { updateBusy(Boolean(data.busy)); cancelTask.hidden = !busy || !data.canCancel; }
  else if (data.type === 'height' && Number.isFinite(data.height)) frame.style.height = `${Math.max(460, Math.min(6500, data.height))}px`;
  else if (data.type === 'error') report(String(data.message), true);
  else if (data.type === 'selection' && Array.isArray(data.files) && data.files.every(file => file instanceof File)) { files = data.files; sourceMode = 'current'; sourcePreview(); renderActions(); }
  else if (data.type === 'invalidated') { clearOutput(); renderActions(); }
  else if (data.type === 'result' && data.blob instanceof Blob && data.blob.size && data.blob.size <= 150e6 && typeof data.name === 'string') {
    clearOutput(); output = { blob: data.blob, name: data.name, defaultName: data.name, detail: String(data.detail || '') }; sourceMode = 'result';
    downloadURL = URL.createObjectURL(data.blob); const link = $('[data-workspace-download]'); link.href = downloadURL; link.download = data.name;
    $('[data-workspace-result-name]').textContent = data.name; $('[data-workspace-result-detail]').textContent = output.detail;
    $('[data-workspace-result]').hidden = false;
    document.body.classList.add('workspace-result-ready');
    fillOutputSummary(comparison, files, data.blob, data.name); void renderComparison(data.blob);
    renameField.value = data.name.replace(/\.[^.]+$/, ''); renameSuffix.textContent = `.${data.name.split('.').pop()}`;
    const entry = { id: currentStep, title: tool.name, size: data.blob.size };
    if (steps.at(-1)?.id === currentStep) steps[steps.length - 1] = entry; else steps.push(entry);
    updateProgress(); renderTrail(); renderNext(); renderActions(); report('Result ready. Download it below, or keep going with another tool.');
    if (guidedJob) editor.open = false;
    resultDock.focus({ preventScroll: true }); resultDock.scrollIntoView({ behavior: reducedScroll(), block: 'start' });
  }
});
window.addEventListener('pagehide', () => { clearFrameWait(); frame?.remove(); frame = null; files = []; originals = []; clearOutput(); if (thumbURL) URL.revokeObjectURL(thumbURL); thumbURL = null; });
window.addEventListener('pageshow', event => { if (event.persisted) { busy = false; loading = false; clearSession(); updateBusy(false); } });
if (new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window) {
  document.body.classList.add('embedded-workspace'); window.parent.postMessage({ protocol, type: 'workspace-ready' }, location.origin);
}
selectJob(chosenJob); renderActions(); persistFavourites();
const params = new URLSearchParams(location.search);
if (['photo', 'text', 'pdf'].includes(params.get('demo'))) void sample(params.get('demo'));
