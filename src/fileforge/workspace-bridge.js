import './workspace-embed.css';
import { compatibleTools } from '../site/workspace-tools.js';
import { isTextEditingTarget } from './shared.js';

// Structured-cloned Files travel between same-origin documents in memory only.
// No localStorage, IndexedDB, network request or cross-origin window receives them.
const protocol = 'fileforge-workspace-v1';
const embedded = window.parent !== window && new URLSearchParams(location.search).get('workspace') === '1';
let hooks, result = null, continueButton, dialog, frame, resizeObserver;
const notify = (type, payload = {}) => {
  if (embedded) window.parent.postMessage({ protocol, type, ...payload }, location.origin);
};

export function publishToolBusy(busy) { notify('busy', { busy: Boolean(busy) }); }
export function publishToolSelection(files) { notify('selection', { files: Array.from(files) }); }
export function invalidateToolResult() {
  result = null; if (continueButton) continueButton.hidden = true;
  notify('invalidated');
}
export function publishToolResult(output) {
  if (!(output?.blob instanceof Blob) || !output.blob.size || typeof output.name !== 'string') return;
  result = { blob: output.blob, name: output.name, detail: String(output.detail || '') };
  notify('result', result);
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
  if (!embedded) return;
  document.body.classList.add('embedded-tool');
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.protocol !== protocol) return;
    if (event.data.type === 'files' && Array.isArray(event.data.files) && event.data.files.every(file => file instanceof File)) {
      if (hooks.busy?.()) { notify('error', { message: 'Finish or cancel the current job first.' }); return; }
      await hooks.clear?.(); await hooks.selectFiles(event.data.files);
    }
    if (event.data.type === 'clear' && !hooks.busy?.()) await hooks.clear?.();
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
