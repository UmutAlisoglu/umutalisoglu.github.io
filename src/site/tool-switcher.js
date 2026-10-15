import { findTools } from './tool-catalog.js';
import './tool-switcher.css';

// Navigation uses the local catalogue. Workspace state contains tool IDs only;
// selected files, results and filenames never pass through this dialog.
const dialog = document.createElement('dialog');
dialog.className = 'tool-switcher';
dialog.setAttribute('aria-labelledby', 'tool-switcher-title');
dialog.setAttribute('aria-describedby', 'tool-switcher-hint');
dialog.innerHTML = `<header class="tool-switcher-heading"><div><p>FILEFORGE / QUICK NAVIGATION</p><h2 id="tool-switcher-title">Find a tool</h2></div><button type="button" data-close-tools aria-label="Close tool finder">×</button></header>
  <div class="tool-switcher-search"><label for="tool-switcher-query">What would you like to do?</label><input id="tool-switcher-query" type="search" placeholder="Try “PNG to PDF” or “remove background”" maxlength="120" autocomplete="off" aria-controls="tool-switcher-results" aria-describedby="tool-switcher-hint"></div>
  <p class="tool-switcher-status" role="status" aria-live="polite" aria-atomic="true"></p>
  <ul id="tool-switcher-results" class="tool-switcher-results" aria-label="Matching tools"></ul>
  <div class="tool-switcher-empty" hidden><strong>No matching tools yet</strong><p>Try a task such as “crop” or a supported conversion such as “PDF to PNG”.</p><a href="/contact/">Suggest a tool ↗</a></div>
  <p id="tool-switcher-hint" class="tool-switcher-hint"><span>↑ ↓ to choose · Enter to open</span><span>Esc to close</span></p>`;
document.body.append(dialog);

const search = dialog.querySelector('input');
const results = dialog.querySelector('.tool-switcher-results');
const status = dialog.querySelector('.tool-switcher-status');
const empty = dialog.querySelector('.tool-switcher-empty');
let restoreFocus = null;
let chosenTool = null;
let workspace = { active: false, compatibleIDs: [], busy: false };

function inWorkspace() {
  const session = document.querySelector('[data-workspace-session]');
  return workspace.active && session && !session.hidden && session.getClientRects().length > 0;
}

function close() { if (dialog.open) dialog.close(); }

function render() {
  const active = inWorkspace();
  const compatible = new Set(workspace.compatibleIDs);
  const tools = findTools(search.value).filter(tool => !active || compatible.has(tool.id));
  results.replaceChildren();
  for (const tool of tools) {
    const item = document.createElement('li');
    const action = document.createElement(active ? 'button' : 'a');
    action.className = `tool-switcher-action tone-${tool.color}`;
    action.dataset.switcherTool = tool.id;
    if (active) {
      action.type = 'button';
      action.disabled = workspace.busy;
      action.addEventListener('click', () => {
        if (workspace.busy || !workspace.compatibleIDs.includes(tool.id)) return;
        chosenTool = tool.id; close();
      });
    } else {
      action.href = tool.href || `/tools/${tool.slug}/`;
      action.addEventListener('click', close);
    }
    const symbol = document.createElement('span');
    symbol.className = 'tool-switcher-symbol'; symbol.textContent = tool.symbol;
    symbol.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.className = 'tool-switcher-label';
    const name = document.createElement('strong'), description = document.createElement('span');
    name.textContent = tool.name; description.textContent = tool.short;
    label.append(name, description);
    const category = document.createElement('span'); category.className = 'tool-switcher-category'; category.textContent = tool.category;
    action.append(symbol, label, category); item.append(action); results.append(item);
  }
  empty.hidden = Boolean(tools.length);
  status.textContent = active && workspace.busy
    ? 'Finish or cancel your current task before changing tools.'
    : `${tools.length} ${tools.length === 1 ? 'task' : 'tasks'}${active ? ' for your current selection · files stay in this workspace' : ' · choose a tool to open'}`;
}

function open() {
  if (window.parent !== window && new URLSearchParams(location.search).get('workspace') === '1') {
    // The owning workspace validates this frame and opens its finder. Choosing
    // a task there retains the current files and the correct result tracking.
    window.parent.postMessage({ protocol: 'fileforge-workspace-v1', type: 'find-tool' }, location.origin);
    return;
  }
  if (dialog.open) { search.focus(); return; }
  restoreFocus = document.activeElement;
  chosenTool = null;
  search.value = '';
  // A synchronous reply gives a fresh selection even if this module was loaded
  // after the workspace's initial state event.
  document.dispatchEvent(new CustomEvent('fileforge:request-workspace-state'));
  render(); dialog.showModal(); search.focus();
}

search.addEventListener('input', render);
dialog.querySelector('[data-close-tools]').addEventListener('click', close);
dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
dialog.addEventListener('close', () => {
  if (restoreFocus?.isConnected && typeof restoreFocus.focus === 'function') restoreFocus.focus({ preventScroll: true });
  restoreFocus = null;
  // Native close events run after close() returns. Restore first, then let the
  // workspace place focus on its newly opened tool instead of stealing it back.
  if (chosenTool) {
    const id = chosenTool; chosenTool = null;
    document.dispatchEvent(new CustomEvent('fileforge:choose-tool', { detail: { id } }));
  }
});
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
});
dialog.addEventListener('keydown', event => {
  if (event.key === 'Tab') {
    const controls = [...dialog.querySelectorAll('button:not(:disabled),a[href],input')].filter(node => node.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  const actions = [...results.querySelectorAll('a,button:not(:disabled)')];
  if (event.key === 'Enter' && event.target === search) {
    event.preventDefault(); actions[0]?.click(); return;
  }
  if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !actions.length) return;
  if (event.target !== search && !actions.includes(event.target)) return;
  event.preventDefault();
  const current = actions.indexOf(document.activeElement);
  const index = current < 0 ? (event.key === 'ArrowDown' ? 0 : actions.length - 1)
    : (current + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length;
  actions[index].focus();
});
document.addEventListener('fileforge:workspace-state', event => {
  const state = event.detail;
  if (!state || typeof state.active !== 'boolean' || !Array.isArray(state.compatibleIDs)) return;
  workspace = { active: state.active, compatibleIDs: state.compatibleIDs.filter(id => typeof id === 'string'), busy: Boolean(state.busy) };
  if (dialog.open) render();
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-open-tools]')) open();
});
document.addEventListener('fileforge:open-tool-finder', open);
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
  event.preventDefault(); open();
});
for (const trigger of document.querySelectorAll('[data-open-tools]')) {
  trigger.hidden = false;
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-keyshortcuts', 'Control+k Meta+k');
}
