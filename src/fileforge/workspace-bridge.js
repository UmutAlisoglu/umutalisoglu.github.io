import './workspace-embed.css';
import { compatibleTools } from '../site/workspace-tools.js';
import { isTextEditingTarget } from './shared.js';
import { fillOutputSummary } from './output-summary.js';
import './tool-experience.css';

// Structured-cloned Files travel between same-origin documents in memory only.
// No localStorage, IndexedDB, network request or cross-origin window receives them.
const protocol = 'fileforge-workspace-v1';
const embedded = window.parent !== window && new URLSearchParams(location.search).get('workspace') === '1';
let hooks, result = null, continueButton, dialog, frame, resizeObserver;
let selectedFiles = [];
const cancelButton = () => document.querySelector('#cancel-job, #advanced-cancel, #finish-cancel, #document-cancel, #scanner-cancel, #screenshot-cancel, #ocr-cancel');
const notify = (type, payload = {}) => {
  if (embedded) window.parent.postMessage({ protocol, type, ...payload }, location.origin);
};

export function publishToolBusy(busy) { const control = cancelButton(); notify('busy', { busy: Boolean(busy), canCancel: Boolean(control && !control.hidden && !control.disabled) }); }
export function publishToolSelection(files) {
  selectedFiles = Array.from(files);
  if (embedded) document.body.classList.toggle('has-workspace-files', Boolean(selectedFiles.length));
  notify('selection', { files: selectedFiles });
}
export function invalidateToolResult() {
  result = null; if (continueButton) continueButton.hidden = true;
  notify('invalidated');
}
export function publishToolResult(output) {
  if (!(output?.blob instanceof Blob) || !output.blob.size || typeof output.name !== 'string') return;
  const imageExport = /^image\/(?:png|jpeg|webp)$/.test(output.blob.type);
  const privacy = 'Location and camera metadata removed. Visible faces and text are unchanged.';
  result = { blob: output.blob, name: output.name, detail: String(output.detail || '') + (imageExport ? ' · ' + privacy : '') };
  let privacyNote = document.querySelector('.image-export-privacy');
  if (imageExport && !privacyNote) {
    privacyNote = document.createElement('p'); privacyNote.className = 'image-export-privacy option-note';
    document.querySelector('.advanced-result-heading, #result, #ocr-result, #screenshot-result, #scanner-result')?.append(privacyNote);
  }
  if (privacyNote) { privacyNote.textContent = privacy; privacyNote.hidden = !imageExport; }
  if (!document.querySelector('.result-save-note')) {
    const note = document.createElement('p'); note.className = 'result-save-note';
    note.textContent = 'Download your result before closing this tab. Results aren’t saved here.';
    const target = document.querySelector('.advanced-result-heading, #result, #ocr-result');
    target?.append(note);
  }
  notify('result', result);
  const target = document.querySelector('#result, #advanced-result, #finish-result, #document-result, #scanner-result, #screenshot-result, #ocr-result');
  if (target) {
    let summary = target.querySelector('.tool-output-summary');
    if (!summary) { summary = document.createElement('dl'); summary.className = 'tool-output-summary'; summary.setAttribute('aria-label', 'Output details'); target.append(summary); }
    fillOutputSummary(summary, selectedFiles, output.blob, output.name);
  }
  if (!embedded) {
    if (!compatibleTools([new File([output.blob], output.name, { type: output.blob.type })]).length) {
      if (continueButton) continueButton.hidden = true;
      return;
    }
    if (!continueButton) {
      continueButton = document.createElement('button'); continueButton.type = 'button';
      continueButton.className = 'button secondary continue-workspace';
      continueButton.textContent = 'Continue in workspace →';
      continueButton.addEventListener('click', openWorkspace);
      const target = document.querySelector('#advanced-result-heading, .advanced-result-heading, #result, #ocr-result');
      (target || document.querySelector('main')).append(continueButton);
    }
    continueButton.hidden = false;
  }
}

function openWorkspace() {
  if (!result || hooks?.busy?.()) return;
  const output = result;
  dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog';
  const bar = document.createElement('div'); bar.className = 'workspace-dialog-bar';
  const heading = document.createElement('strong'); heading.textContent = 'FileForge workspace';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close ✕';
  close.className = 'text-button'; close.addEventListener('click', () => dialog.close()); bar.append(heading, close);
  frame = document.createElement('iframe'); frame.title = 'Continue editing in FileForge';
  frame.src = '/tools/workspace/?embed=1'; dialog.append(bar, frame); document.body.append(dialog);
  const currentFrame = frame, currentDialog = dialog;
  const listener = event => {
    if (event.origin !== location.origin || event.source !== currentFrame.contentWindow || event.data?.protocol !== protocol) return;
    if (event.data.type === 'workspace-ready') currentFrame.contentWindow.postMessage({ protocol, type: 'workspace-files', files: [new File([output.blob], output.name, { type: output.blob.type })] }, location.origin);
  };
  window.addEventListener('message', listener);
  currentDialog.addEventListener('close', () => {
    window.removeEventListener('message', listener); currentFrame.remove(); currentDialog.remove();
    dialog = null; frame = null; continueButton?.focus();
  }, { once: true });
  dialog.showModal();
}

export function configureToolBridge(config) {
  hooks = config;
  document.addEventListener('click', event => {
    if (hooks.busy?.() || !event.target.closest('#clear-files, #advanced-clear, #finish-clear, #document-clear, #scanner-clear, #screenshot-clear, #ocr-clear')) return;
    publishToolSelection([]);
  }, { capture: true });
  if (!embedded) return;
  document.body.classList.add('embedded-tool');
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.protocol !== protocol) return;
    if (event.data.type === 'files' && Array.isArray(event.data.files) && event.data.files.every(file => file instanceof File)) {
      if (hooks.busy?.()) { notify('error', { message: 'Finish or cancel the current job first.' }); return; }
      selectedFiles = []; document.body.classList.remove('has-workspace-files');
      await hooks.clear?.(); await hooks.selectFiles(event.data.files);
      await hooks.applyPreset?.(event.data.preset);
    }
    if (event.data.type === 'clear' && !hooks.busy?.()) await hooks.clear?.();
    if (event.data.type === 'cancel' && hooks.busy?.()) cancelButton()?.click();
  });
  let previousBusy;
  const update = () => {
    const busy = Boolean(hooks.busy?.());
    if (busy !== previousBusy) { previousBusy = busy; publishToolBusy(busy); }
    notify('height', { height: Math.max(460, Math.ceil(document.body.getBoundingClientRect().height)) });
  };
  resizeObserver = new ResizeObserver(update); resizeObserver.observe(document.body);
  new MutationObserver(update).observe(document.querySelector('#tool-panel, #advanced-workspace, #ocr-workspace') || document.body, { attributes: true, attributeFilter: ['aria-busy'] });
  update(); notify('ready');
}

document.addEventListener('paste', async event => {
  if (!hooks || hooks.busy?.() || isTextEditingTarget(event.target)) return;
  const files = [...(event.clipboardData?.files || [])];
  if (!files.length) return;
  event.preventDefault(); await hooks.selectFiles(files);
});

window.addEventListener('pagehide', () => { resizeObserver?.disconnect(); dialog?.close(); result = null; });
