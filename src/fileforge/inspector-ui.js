import './inspector.css';
import { zipSync } from 'fflate';
import { buildSample, detectFormat, formatSize, INSPECT_LIMIT } from './inspector.js';

const $ = selector => document.querySelector(selector);
const input = $('#inspector-input'), drop = $('#inspector-drop'), status = $('#inspector-status');
const HEX_ROWS = 32, ROW = 16;
let file = null, result = null, worker = null, job = 0, hexOffset = 0, highlight = null, stringLimit = 300, objectURLs = [];

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n, pad = 8) => n.toString(16).toUpperCase().padStart(pad, '0');
const report = text => { status.textContent = text; };
const icons = { image: '▧', video: '▷', audio: '♪', document: '¶', archive: '▦', executable: '⚙', data: '⛁', font: 'Aa', text: 'T', unknown: '?' };
const levels = { warn: ['Check', 'Worth checking'], notice: ['Note', 'Good to know'], info: ['Info', 'Information'] };

function revoke() { objectURLs.forEach(url => URL.revokeObjectURL(url)); objectURLs = []; }
function blobURL(blob) { const url = URL.createObjectURL(blob); objectURLs.push(url); return url; }

function setBusy(busy) {
  $('#advanced-workspace').setAttribute('aria-busy', String(busy));
  input.disabled = busy; $('#inspector-sample').disabled = busy;
}

function clear(announce = true) {
  job++; worker?.terminate(); worker = null; setBusy(false);
  file = null; result = null; highlight = null; hexOffset = 0; revoke();
  input.value = ''; $('#inspector-result').hidden = true; $('#inspector-clear').hidden = true;
  $('#inspector-file').textContent = 'No file selected';
  if (announce) report('Cleared. The file and its results have been released.');
}

async function choose(selected) {
  if (!selected) return;
  clear(false);
  if (selected.size > INSPECT_LIMIT) { report(`${selected.name} is ${formatSize(selected.size)}. The inspector reads files up to 100 MB.`); return; }
  file = selected;
  const current = ++job;
  $('#inspector-file').textContent = `${selected.name} · ${formatSize(selected.size)}`;
  $('#inspector-clear').hidden = false;
  setBusy(true);
  report(`Reading ${selected.name}…`);
  try {
    worker = new Worker(new URL('./inspector.worker.js', import.meta.url), { type: 'module' });
    const answer = await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data.result));
      worker.onerror = event => { event.preventDefault?.(); reject(new Error('The inspector could not start in this browser.')); };
      worker.postMessage({ id: current, file: selected });
    });
    if (current !== job) return;
    result = answer;
    render();
    const warnings = result.findings.filter(f => f.level === 'warn').length;
    report(`Done. ${result.format.name}${result.mismatch ? ', and the extension does not match' : ''}. ${result.findings.length ? `${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}${warnings ? `, ${warnings} worth checking` : ''}.` : 'Nothing unusual found.'}`);
  } catch (error) {
    if (current === job) { report(`Could not inspect this file: ${error.message}`); $('#inspector-result').hidden = true; }
  } finally {
    if (current === job) { worker?.terminate(); worker = null; setBusy(false); }
  }
}

function list(items) {
  return `<dl class="inspector-facts">${items.map(([k, v, flag]) => `<div${flag ? ` class="is-${flag}"` : ''}><dt>${escape(k)}</dt><dd>${escape(v)}${flag === 'gps' && result.gps ? ` <a href="https://www.openstreetmap.org/?mlat=${result.gps.lat}&amp;mlon=${result.gps.lon}#map=15/${result.gps.lat}/${result.gps.lon}" target="_blank" rel="noopener noreferrer">Show on map ↗</a>` : ''}</dd></div>`).join('')}</dl>`;
}

function render() {
  const r = result, f = r.format;
  revoke();
  $('#inspector-format-icon').textContent = icons[f.family] || '?';
  $('#inspector-format-name').textContent = f.name;
  $('#inspector-format-detail').textContent = f.description;
  const verdict = $('#inspector-verdict');
  const typical = f.extensions.filter(Boolean).slice(0, 3).map(e => `.${e}`).join(', ');
  verdict.className = `inspector-verdict ${r.mismatch ? 'is-mismatch' : 'is-match'}`;
  verdict.textContent = r.mismatch ? `⚠ The name ends in .${r.extension}, but the content is a ${f.name}.` : r.extension ? `✓ The .${r.extension} extension matches the content.` : `No extension in the name.${typical ? ` Typical: ${typical}.` : ''}`;
  if (!r.mismatch && f.id === 'unknown') verdict.textContent = 'No known signature. The extension cannot be confirmed.';
  $('#inspector-basics').innerHTML = [['Size', `${formatSize(r.size)} (${r.size.toLocaleString('en-US')} bytes)`], ['MIME type', f.mime], ['Typical extensions', typical || '–']].map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('');
  file.slice(0, 16).arrayBuffer().then(buffer => { const head = [...new Uint8Array(buffer)].map(b => hex(b, 2)).join(' '); const dd = document.createElement('div'); dd.innerHTML = `<dt>First bytes</dt><dd class="mono">${escape(head || '(empty)')}</dd>`; $('#inspector-basics').insertBefore(dd, $('#inspector-basics').children[2] || null); });

  const findings = $('#inspector-findings');
  findings.innerHTML = r.findings.length ? r.findings.map((x, i) => `<li class="finding is-${x.level}"><span class="finding-level" title="${levels[x.level][1]}">${levels[x.level][0]}</span><div><strong>${escape(x.title)}</strong><p>${escape(x.detail)}</p>${x.offset != null || x.save || x.action ? `<p class="finding-actions">${x.offset != null ? `<button type="button" class="text-button" data-hex="${x.offset}">Show in hex view</button>` : ''}${x.save ? `<button type="button" class="text-button" data-save="${i}">Save these bytes ↓</button>` : ''}${x.action === 'metadata' && ['jpeg', 'png'].includes(f.id) ? '<a href="/tools/remove-metadata/">Remove the metadata →</a>' : ''}</p>` : ''}</div></li>`).join('') : '<li class="finding is-clear"><span class="finding-level">OK</span><div><strong>Nothing unusual found</strong><p>No hidden data, mismatched extension or risky content was detected. This is not a guarantee that the file is safe.</p></div></li>';

  $('#inspector-facts').innerHTML = r.facts.length ? `<section class="inspector-block"><h4>File structure</h4>${list(r.facts)}</section>` : '';
  $('#inspector-metadata').innerHTML = r.metadata.length ? r.metadata.map(group => `<section class="inspector-block"><h4>${escape(group.group)}</h4>${list(group.items)}</section>`).join('') : '<section class="inspector-block"><h4>Metadata</h4><p class="inspector-note">No descriptive metadata found in this file.</p></section>';
  renderPreview();
  drawEntropy();
  const hashes = r.hashes;
  $('#inspector-hashes').innerHTML = hashes ? [['SHA-256', hashes.sha256], ['SHA-1', hashes.sha1]].map(([k, v]) => `<div><dt>${k}</dt><dd><code>${v}</code> <button type="button" class="text-button" data-copy="${v}" aria-label="Copy ${k}">Copy</button></dd></div>`).join('') : '<p class="inspector-note">Checksums need a secure (HTTPS) page.</p>';
  $('#inspector-virustotal').href = hashes ? `https://www.virustotal.com/gui/file/${hashes.sha256}` : 'https://www.virustotal.com/';
  $('#inspector-virustotal').hidden = !hashes;

  renderContents();
  stringLimit = 300; $('#inspector-filter').value = ''; renderStrings();
  $('#inspector-strings-count').textContent = r.strings.total ? `(${r.strings.total.toLocaleString('en-US')})` : '';
  highlight = null; hexOffset = 0; renderHex();
  selectTab('tab-overview', false);
  $('#inspector-result').hidden = false;
}

async function renderPreview() {
  const box = $('#inspector-preview'), r = result, current = job;
  const parts = [];
  if (r.format.family === 'image' && ['jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'ico'].includes(r.format.id)) parts.push(['The image', blobURL(file.slice(0, file.size, r.format.mime))]);
  if (r.thumbnail) parts.push(['Embedded thumbnail', blobURL(file.slice(r.thumbnail.offset, r.thumbnail.offset + r.thumbnail.length, 'image/jpeg'))]);
  if (current !== job) return;
  box.hidden = !parts.length;
  box.innerHTML = parts.map(([label, url]) => `<figure><img src="${url}" alt="${escape(label)} of ${escape(r.name)}" loading="lazy" decoding="async"><figcaption>${escape(label)}</figcaption></figure>`).join('') + (r.thumbnail ? '<p class="inspector-note">If the thumbnail shows something the photo no longer does, the original crop or edit is still in the file.</p>' : '');
}

function drawEntropy() {
  const canvas = $('#inspector-entropy'), { blocks, overall, blockSize } = result.entropy;
  const ratio = Math.min(2, window.devicePixelRatio || 1), width = canvas.clientWidth || 600, height = 70;
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  const x = canvas.getContext('2d');
  x.scale(ratio, ratio); x.clearRect(0, 0, width, height);
  x.fillStyle = '#f2f5fc'; x.fillRect(0, 0, width, height);
  x.strokeStyle = '#d5ddf0'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(0, height * (1 - 7.5 / 8)); x.lineTo(width, height * (1 - 7.5 / 8)); x.stroke(); x.setLineDash([]);
  const w = width / blocks.length;
  blocks.forEach((e, i) => { const h = Math.max(1, (e / 8) * (height - 4)); x.fillStyle = e > 7.5 ? '#1f3fae' : e > 5.5 ? '#3159d9' : '#8fa6e8'; x.fillRect(i * w, height - h, Math.max(1, w - (w > 3 ? 1 : 0)), h); });
  const high = blocks.filter(e => e > 7.5).length / blocks.length;
  $('#inspector-entropy-summary').textContent = `Average ${overall} bits per byte. ${Math.round(high * 100)}% of the file looks compressed or encrypted. Each bar covers about ${formatSize(blockSize)}.`;
}

function renderContents() {
  const r = result;
  const entries = r.entries || [];
  const flags = { path: 'Unsafe path', program: 'Program', locked: 'Encrypted' };
  $('#inspector-entries').innerHTML = entries.length ? `<section class="inspector-block"><h4>Archive contents</h4><p class="inspector-note">${r.entryTotal.toLocaleString('en-US')} entr${r.entryTotal === 1 ? 'y' : 'ies'}${r.entryTotal > entries.length ? `, showing the first ${entries.length}` : ''}. Read from the archive directory without unpacking.</p><div class="inspector-table-wrap"><table class="inspector-table"><thead><tr><th scope="col">Name</th><th scope="col">Size</th><th scope="col">Packed</th><th scope="col">Date</th></tr></thead><tbody>${entries.map(e => `<tr${e.flag ? ` class="is-flagged"` : ''}><td>${escape(e.name)}${e.flag ? ` <span class="entry-flag">${flags[e.flag]}</span>` : ''}</td><td>${e.directory ? '–' : formatSize(e.size)}</td><td>${e.directory ? '–' : formatSize(e.compressed)}</td><td>${escape(e.date)}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  const embedded = r.embedded || [];
  $('#inspector-embedded').innerHTML = `<section class="inspector-block"><h4>Embedded signatures</h4>${embedded.length ? `<p class="inspector-note">Known file signatures found after the start of the file. Some are part of the format itself, such as images inside a PDF. Lengths are measured where the format allows it.</p><div class="inspector-table-wrap"><table class="inspector-table"><thead><tr><th scope="col">Offset</th><th scope="col">Looks like</th><th scope="col">Length</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${embedded.map((e, i) => `<tr><td class="mono">0x${hex(e.offset)}</td><td>${escape(e.name)}${e.note ? ` <span class="entry-flag">${escape(e.note)}</span>` : ''}</td><td>${e.length ? formatSize(e.length) : 'to end'}</td><td class="table-actions"><button type="button" class="text-button" data-hex="${e.offset}">Hex</button><button type="button" class="text-button" data-embedded="${i}">Save ↓</button></td></tr>`).join('')}</tbody></table></div>${Object.values(r.embeddedCounts).reduce((a, b) => a + b, 0) > embedded.length ? `<p class="inspector-note">Showing the first ${embedded.length} of ${Object.values(r.embeddedCounts).reduce((a, b) => a + b, 0)} signatures.</p>` : ''}` : '<p class="inspector-note">No other file signatures found inside this file.</p>'}</section>`;
  const count = entries.length + embedded.length;
  $('#inspector-contents-count').textContent = count ? `(${(r.entryTotal || 0) + embedded.length})` : '';
}

function renderStrings() {
  const r = result, query = $('#inspector-filter').value.trim().toLowerCase();
  const interesting = r.strings.interesting;
  $('#inspector-interesting').innerHTML = interesting.length ? `<section class="inspector-block"><h4>Worth a look</h4><ul class="inspector-interesting">${interesting.slice(0, 80).map(item => `<li><span class="string-kind kind-${item.kind}">${escape(item.label)}</span><code>${escape(item.value)}</code><button type="button" class="text-button" data-hex="${item.offset}" aria-label="Show offset ${item.offset} in hex view">0x${hex(item.offset)}</button></li>`).join('')}</ul>${interesting.length > 80 ? `<p class="inspector-note">And ${interesting.length - 80} more.</p>` : ''}</section>` : '';
  const matches = query ? r.strings.list.filter(s => s.text.toLowerCase().includes(query)) : r.strings.list;
  $('#inspector-strings').innerHTML = matches.slice(0, stringLimit).map(s => `<li><button type="button" class="string-offset" data-hex="${s.offset}" aria-label="Show offset ${s.offset} in hex view">${hex(s.offset)}</button><span>${escape(s.text)}</span>${s.wide ? '<small>UTF-16</small>' : ''}</li>`).join('');
  $('#inspector-more').hidden = matches.length <= stringLimit;
  $('#inspector-strings-summary').textContent = r.strings.total ? `${matches.length.toLocaleString('en-US')} ${query ? 'matching ' : ''}string${matches.length === 1 ? '' : 's'}${r.strings.total > r.strings.list.length ? ` (the first ${r.strings.list.length.toLocaleString('en-US')} of ${r.strings.total.toLocaleString('en-US')} are searchable)` : ''}. Readable runs of at least 5 characters.` : 'No readable text runs in this file.';
}

async function renderHex() {
  if (!file) return;
  const start = Math.max(0, Math.min(hexOffset, Math.max(0, Math.floor((file.size - 1) / ROW) * ROW)));
  hexOffset = start;
  const bytes = new Uint8Array(await file.slice(start, start + HEX_ROWS * ROW).arrayBuffer());
  const lines = [];
  for (let row = 0; row < bytes.length; row += ROW) {
    let hexPart = '', text = '';
    for (let i = 0; i < ROW; i++) {
      const at = start + row + i, value = bytes[row + i];
      const mark = highlight && at >= highlight.start && at < highlight.end;
      const cell = value == null ? '  ' : hex(value, 2);
      const char = value == null ? ' ' : value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : '·';
      hexPart += `${mark ? '<mark>' : ''}${cell}${mark ? '</mark>' : ''}${i === 7 ? '  ' : ' '}`;
      text += mark ? `<mark>${escape(char)}</mark>` : escape(char);
    }
    lines.push(`<span class="hex-offset">${hex(start + row)}</span>  ${hexPart} <span class="hex-text">${text}</span>`);
  }
  $('#inspector-hex').innerHTML = lines.join('\n') || '(empty file)';
  $('#inspector-hex-range').textContent = file.size ? `Bytes ${start.toLocaleString('en-US')}–${(Math.min(file.size, start + HEX_ROWS * ROW) - 1).toLocaleString('en-US')} of ${file.size.toLocaleString('en-US')}` : '';
  $('#inspector-hex-prev').disabled = start === 0;
  $('#inspector-hex-next').disabled = start + HEX_ROWS * ROW >= file.size;
}

function showHex(offset, length = 16) {
  hexOffset = Math.floor(offset / ROW) * ROW - ROW * 2;
  highlight = { start: offset, end: offset + Math.max(1, length) };
  $('#inspector-offset').value = `0x${offset.toString(16).toUpperCase()}`;
  selectTab('tab-hex');
  renderHex();
}

function selectTab(id, focus = true) {
  for (const tab of document.querySelectorAll('.inspector-tabs [role=tab]')) {
    const active = tab.id === id;
    tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    $(`#${tab.getAttribute('aria-controls')}`).hidden = !active;
    if (active && focus) tab.focus();
  }
  if (id === 'tab-overview' && result) requestAnimationFrame(drawEntropy);
}

function save(offset, length, label) {
  const end = length ? offset + length : file.size;
  file.slice(offset, Math.min(4096 + offset, end)).arrayBuffer().then(head => {
    const format = detectFormat(new Uint8Array(head));
    const ext = format.extensions.find(Boolean) || 'bin';
    const base = file.name.replace(/\.[^.]+$/, '') || 'file';
    const link = document.createElement('a');
    link.href = blobURL(file.slice(offset, end, format.mime));
    link.download = `${base}-${label}-0x${offset.toString(16)}.${ext}`;
    document.body.append(link); link.click(); link.remove();
    report(`Saved ${formatSize(end - offset)} from offset ${offset.toLocaleString('en-US')} as ${link.download}.`);
  });
}

async function sample() {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 400;
  const x = canvas.getContext('2d');
  const gradient = x.createLinearGradient(0, 0, 640, 400); gradient.addColorStop(0, '#dfe7fb'); gradient.addColorStop(1, '#3159d9');
  x.fillStyle = gradient; x.fillRect(0, 0, 640, 400);
  x.fillStyle = '#ffffff'; x.globalAlpha = 0.9; x.beginPath(); x.arc(470, 150, 70, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
  x.fillStyle = '#1f2f5c'; x.font = '600 34px Georgia, serif'; x.fillText('What is this file,', 48, 270); x.font = 'italic 34px Georgia, serif'; x.fillStyle = '#ffffff'; x.fillText('really?', 48, 316);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const zip = zipSync({ 'notes/secret.txt': new TextEncoder().encode('This ZIP archive was appended after the end of the photo. Image viewers do not show it.\n') }, { mtime: new Date('2026-11-06T18:24:00') });
  await choose(new File([buildSample(jpeg, zip)], 'holiday-photo.png', { type: 'image/png' }));
}

input.addEventListener('change', () => choose(input.files[0]));
$('#inspector-clear').addEventListener('click', () => clear());
$('#inspector-sample').addEventListener('click', sample);
for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('dragging'); });
for (const type of ['dragleave', 'drop']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('dragging'); });
drop.addEventListener('drop', event => { if (!input.disabled) choose(event.dataTransfer.files[0]); });
$('#inspector-result').addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target || !result) return;
  if (target.dataset.hex != null) showHex(+target.dataset.hex, target.closest('.finding') ? 32 : 16);
  if (target.dataset.save != null) { const f = result.findings[+target.dataset.save]; save(f.save.offset, f.save.length, 'hidden'); }
  if (target.dataset.embedded != null) { const e = result.embedded[+target.dataset.embedded]; save(e.offset, e.length, 'embedded'); }
  if (target.dataset.copy) navigator.clipboard?.writeText(target.dataset.copy).then(() => { target.textContent = 'Copied'; setTimeout(() => { target.textContent = 'Copy'; }, 1500); }, () => report('Copying is blocked in this browser. Select the checksum to copy it.'));
});
const tabs = [...document.querySelectorAll('.inspector-tabs [role=tab]')];
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab.id));
  tab.addEventListener('keydown', event => {
    const move = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index }[event.key];
    if (move == null) return;
    event.preventDefault(); selectTab(tabs[(index + move + tabs.length) % tabs.length].id);
  });
});
$('#inspector-hex-form').addEventListener('submit', event => {
  event.preventDefault();
  const raw = $('#inspector-offset').value.trim();
  const value = /^0x/i.test(raw) || /[a-f]/i.test(raw) ? parseInt(raw.replace(/^0x/i, ''), 16) : parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0 || value >= (file?.size || 0)) { report('Enter an offset inside the file, for example 0x200 or 512.'); return; }
  showHex(value, 1);
});
$('#inspector-hex-prev').addEventListener('click', () => { hexOffset -= HEX_ROWS * ROW; renderHex(); });
$('#inspector-hex-next').addEventListener('click', () => { hexOffset += HEX_ROWS * ROW; renderHex(); });
$('#inspector-filter').addEventListener('input', () => { stringLimit = 300; renderStrings(); });
$('#inspector-more').addEventListener('click', () => { stringLimit += 500; renderStrings(); });
window.addEventListener('resize', () => { if (result && !$('#panel-overview').hidden) drawEntropy(); });
