// NFC Card Builder page: form -> worker -> SVG preview, downloads, and Web NFC tag writing.
import '@fontsource/jetbrains-mono/700.css';
import { DEFAULTS, ICON_LABELS, MASK_COLOURS, FINISHES } from './options.js';

const root = document.querySelector('[data-nfc-builder]');
const form = root.querySelector('form');
const $ = s => root.querySelector(s);
const statusEl = $('#nfc-status');
const warningsEl = $('#nfc-warnings');
const downloadButtons = [$('#nfc-download'), $('#nfc-bom'), $('#nfc-cpl'), $('[data-download-mini]')];
const STORE = 'nfc-card-builder:v1';

// ------------------------------------------------------------ form setup
const rowsEl = $('[data-rows]');
for (let i = 0; i < 3; i++) {
  const def = DEFAULTS.rows[i] || { icon: 'globe', text: '' };
  const row = document.createElement('div');
  row.className = 'nfc-row';
  const select = document.createElement('select');
  select.name = `icon${i}`;
  select.setAttribute('aria-label', `Icon for contact line ${i + 1}`);
  for (const [id, label] of Object.entries(ICON_LABELS)) select.add(new Option(label, id, false, id === def.icon));
  const input = document.createElement('input');
  input.name = `row${i}`;
  input.maxLength = 40;
  input.value = def.text;
  input.setAttribute('aria-label', `Contact line ${i + 1}`);
  input.placeholder = ['you@example.com', 'example.com', 'github.com/you'][i];
  row.append(select, input);
  rowsEl.append(row);
}

function radio(name, value, cls, content, label, checked) {
  const el = document.createElement('label');
  el.className = cls;
  el.title = label;
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.setAttribute('aria-label', label);
  el.append(input, ...content);
  return el;
}
for (const [id, m] of Object.entries(MASK_COLOURS)) {
  const dot = document.createElement('span');
  dot.className = 'pcb-swatch';
  dot.style.setProperty('--swatch', m.cu);
  dot.style.setProperty('--swatch-dark', m.mask);
  $('[data-swatches]').append(radio('colour', id, 'pcb-swatch-option', [dot], `${m.label} solder mask`, id === 'blue'));
}
for (const [id, f] of Object.entries(FINISHES)) {
  const dot = document.createElement('span');
  dot.className = 'pcb-metal-dot';
  dot.style.background = `linear-gradient(135deg,${f.stops[0]},${f.stops[1]},${f.stops[4]})`;
  $('[data-metals]').append(radio('finish', id, 'pcb-metal-option', [dot, document.createTextNode(f.label)], `${f.label} (${f.fab})`, id === 'silver'));
}

// remembered form (only in this browser)
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved) for (const [k, v] of Object.entries(saved)) {
    const els = form.elements[k];
    if (!els) continue;
    if (els instanceof RadioNodeList) { for (const r of els) r.checked = r.value === v; }
    else if (els.type === 'checkbox') els.checked = !!v;
    else els.value = v;
  }
} catch { /* storage unavailable */ }

function readForm() {
  const f = form.elements;
  return {
    first: f.first.value, last: f.last.value, monogram: f.monogram.value, dot: f.dot.checked,
    rows: [0, 1, 2].map(i => ({ icon: f[`icon${i}`].value, text: f[`row${i}`].value })),
    tagline: f.tagline.value, footer: f.footer.value, backTitle: f.backTitle.value, url: f.url.value.trim(),
    ripples: f.ripples.checked,
  };
}
const readLook = () => ({ colour: form.elements.colour.value, finish: form.elements.finish.value, view: form.elements.view.value });

function save() {
  try {
    const data = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
      else data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    localStorage.setItem(STORE, JSON.stringify(data));
  } catch { /* storage unavailable */ }
}

// ------------------------------------------------------------ worker
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let seq = 0;
const pending = new Map();
let latestBuild = 0;
worker.onmessage = ({ data }) => {
  const resolve = pending.get(data.id);
  pending.delete(data.id);
  if (resolve) resolve(data);
};
const ask = msg => new Promise(resolve => { const id = ++seq; pending.set(id, resolve); worker.postMessage({ ...msg, id }); });

function show(result) {
  if (result.type === 'error') { statusEl.textContent = `Could not draw the card: ${result.message}`; return; }
  $('[data-svg="front"]').innerHTML = result.front;
  $('[data-svg="back"]').innerHTML = result.back;
  warningsEl.replaceChildren(...result.notes.map(n => {
    const li = document.createElement('li');
    li.textContent = n.text;
    return li;
  }));
}

let busy = false, queued = false;
async function build() {
  if (busy) { queued = true; return; }
  busy = true;
  const id = ++latestBuild;
  const result = await ask({ type: 'build', options: readForm(), look: readLook() });
  busy = false;
  if (queued) { queued = false; build(); return; }
  if (id !== latestBuild) return;
  show(result);
  if (result.type !== 'error') {
    statusEl.textContent = result.notes.length ? 'Some text was shortened to fit. See the notes below.' : 'Ready to download. The preview shows the card as it will be made.';
    downloadButtons.forEach(b => { if (b) b.disabled = false; });
  }
}

let timer = 0;
form.addEventListener('input', e => {
  save();
  if (e.target.name === 'url') syncWriteUrl();
  if (['colour', 'finish', 'view'].includes(e.target.name)) { ask({ type: 'look', look: readLook() }).then(show); return; }
  clearTimeout(timer);
  timer = setTimeout(build, 120);
});
form.addEventListener('submit', e => e.preventDefault());

// side switch
for (const button of root.querySelectorAll('[data-show]')) {
  if (button.tagName !== 'BUTTON') continue;
  button.addEventListener('click', () => {
    root.querySelectorAll('button[data-show]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    $('.nfc-stage').dataset.show = button.dataset.show;
  });
}
$('[data-goto-preview]')?.addEventListener('click', () => $('.pcb-output').scrollIntoView({ behavior: 'smooth', block: 'start' }));

// ------------------------------------------------------------ downloads
const slug = () => (readForm().first + '-' + readForm().last).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nfc';
function saveFile(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
let lastFiles = null;
async function files() {
  statusEl.textContent = 'Running the manufacturing check…';
  const name = `${slug()}-nfc-card`;
  const result = await ask({ type: 'files', name });
  if (result.type === 'error') { statusEl.textContent = `Could not make the files: ${result.message}`; return null; }
  statusEl.textContent = result.check.ok ? 'Manufacturing check passed. Files saved.' : `Check found ${result.check.issues.length} thing${result.check.issues.length > 1 ? 's' : ''} to look at: ${result.check.issues.join('; ')}.`;
  lastFiles = { ...result, name };
  return lastFiles;
}
async function downloadZip() {
  const r = await files();
  if (r) saveFile(`${r.name}-gerbers.zip`, r.zip, 'application/zip');
}
$('#nfc-download').addEventListener('click', downloadZip);
$('[data-download-mini]')?.addEventListener('click', downloadZip);
$('#nfc-bom').addEventListener('click', async () => { const r = lastFiles || await files(); if (r) saveFile(`${r.name}-BOM.csv`, r.bom, 'text/csv'); });
$('#nfc-cpl').addEventListener('click', async () => { const r = lastFiles || await files(); if (r) saveFile(`${r.name}-CPL.csv`, r.cpl, 'text/csv'); });
form.addEventListener('input', () => { lastFiles = null; });

// ------------------------------------------------------------ Web NFC
const writeUrl = document.getElementById('nfc-write-url');
const writeStatus = document.getElementById('nfc-write-status');
const writeBtn = document.getElementById('nfc-write');
const readBtn = document.getElementById('nfc-read');
const cancelBtn = document.getElementById('nfc-cancel');
const supportEl = document.getElementById('nfc-support');
let writeTouched = false;
function syncWriteUrl() { if (!writeTouched) writeUrl.value = form.elements.url.value.trim(); }
writeUrl.addEventListener('input', () => { writeTouched = true; });
syncWriteUrl();

const hasNfc = 'NDEFReader' in window;
if (!hasNfc) {
  supportEl.textContent = 'This browser cannot write NFC tags. Open this page in Chrome on an Android phone, or use the free NXP TagWriter app (Android and iPhone) and write the link above as a URL record.';
  writeBtn.disabled = true;
  readBtn.disabled = true;
} else {
  supportEl.textContent = 'Turn on NFC in your phone settings first. The tag stays rewritable, so you can change the link any time.';
}

let abort = null;
function busyNfc(on) {
  writeBtn.disabled = on;
  readBtn.disabled = on;
  cancelBtn.hidden = !on;
}
cancelBtn.addEventListener('click', () => { abort?.abort(); });

writeBtn.addEventListener('click', async () => {
  const url = writeUrl.value.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) { writeStatus.textContent = 'Enter a full link that starts with https://'; writeUrl.focus(); return; }
  abort = new AbortController();
  busyNfc(true);
  writeStatus.textContent = 'Hold the back of the card flat against the back of your phone…';
  try {
    const ndef = new window.NDEFReader();
    await ndef.write({ records: [{ recordType: 'url', data: url }] }, { signal: abort.signal });
    writeStatus.textContent = `Done. The card now opens ${url}. Tap it again to try it.`;
  } catch (error) {
    writeStatus.textContent = error.name === 'AbortError' ? 'Stopped.' : error.name === 'NotAllowedError' ? 'NFC permission was not given. Allow NFC for this site and try again.' : `Could not write the tag: ${error.message}`;
  } finally {
    busyNfc(false);
  }
});

readBtn.addEventListener('click', async () => {
  abort = new AbortController();
  busyNfc(true);
  writeStatus.textContent = 'Hold a card against your phone to read it…';
  try {
    const ndef = new window.NDEFReader();
    await ndef.scan({ signal: abort.signal });
    ndef.onreadingerror = () => { writeStatus.textContent = 'The tag could not be read. It may be blank: write a link to it first.'; };
    ndef.onreading = ({ message, serialNumber }) => {
      const decoder = new TextDecoder();
      const found = message.records.map(r => r.recordType === 'url' || r.recordType === 'absolute-url' ? decoder.decode(r.data) : r.recordType === 'text' ? decoder.decode(r.data) : `${r.recordType} record`);
      writeStatus.textContent = found.length ? `Tag ${serialNumber || ''} holds: ${found.join(', ')}` : 'The tag is empty. Write a link to it.';
      abort.abort();
      busyNfc(false);
    };
  } catch (error) {
    writeStatus.textContent = error.name === 'AbortError' ? 'Stopped.' : `Could not read tags: ${error.message}`;
    busyNfc(false);
  }
});

build();
