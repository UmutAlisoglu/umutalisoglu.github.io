import './pdf-editor.css';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { EDIT_LIMIT, PAGE_LIMIT, buildEditedPdf, coverQuad, fromHex, groupTextItems, needsUnicode, sampleColors, toHex } from './pdf-edit.js';
import { formatBytes } from './shared.js';

GlobalWorkerOptions.workerSrc = workerURL;

const $ = selector => document.querySelector(selector);
const input = $('#pe-input'), drop = $('#pe-drop'), status = $('#pe-status'), canvas = $('#pe-canvas'), overlay = $('#pe-overlay'), stage = $('#pe-stage');
const fields = { text: $('#pe-text'), font: $('#pe-font'), size: $('#pe-size'), bold: $('#pe-bold'), italic: $('#pe-italic'), color: $('#pe-color'), bg: $('#pe-bg') };
const STACKS = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace', unicode: '"Noto Sans", "Segoe UI", Arial, sans-serif' };
const PDFJS = { fontExtraProperties: true, isEvalSupported: false, enableXfa: false, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/', iccUrl: '/vendor/pdfjs/iccs/' };

let file = null, bytes = null, pdf = null, pageNo = 1, zoom = 1, edits = new Map(), addCount = 0, selected = null, addMode = false;
let docTask = null, view = null, ratio = 1, pixels = null, renderToken = 0, busy = false, segmentsByPage = new Map(), editorInput = null, measure = null, loadToken = 0;

const report = (text, error = false) => { status.textContent = text; status.classList.toggle('is-error', error); };
const isActive = e => e.kind === 'add' ? e.text.trim() !== '' : (e.removed || e.text !== e.original || e.touched);
const activeEdits = () => [...edits.values()].filter(isActive);

function setBusy(value) {
  busy = value;
  $('#advanced-workspace').setAttribute('aria-busy', String(value));
  input.disabled = value; $('#pe-sample').disabled = value;
  updateSummary();
}

function updateSummary() {
  const list = activeEdits(), pages = new Set(list.map(e => e.page)).size;
  $('#pe-summary').textContent = list.length ? `${list.length} change${list.length === 1 ? '' : 's'} on ${pages} page${pages === 1 ? '' : 's'}.` : 'No changes yet.';
  $('#pe-download').disabled = busy || !pdf || !list.length;
}

function resetState() {
  loadToken++; renderToken++;
  docTask?.destroy().catch(() => {}); docTask = null; pdf = null; file = null; bytes = null;
  edits = new Map(); segmentsByPage = new Map(); selected = null; addMode = false; view = null; pixels = null;
  pageNo = 1; zoom = 1; addCount = 0;
  overlay.replaceChildren(); editorInput = null;
  canvas.width = 1; canvas.height = 1;
  $('#pe-editor').hidden = true; $('#pe-clear').hidden = true; $('#pe-file').textContent = 'No file selected';
  input.value = '';
}

function clearAll(announce = true) {
  resetState(); setBusy(false);
  setAddMode(false);
  if (announce) report('Cleared. The file and all edits have been released.');
}

async function choose(selectedFile) {
  if (!selectedFile || busy) return;
  resetState();
  if (selectedFile.size > EDIT_LIMIT) { report(`${selectedFile.name} is ${formatBytes(selectedFile.size)}. This tool opens PDFs up to 25 MB.`, true); return; }
  await open(selectedFile, new Uint8Array(await selectedFile.arrayBuffer()));
}

async function open(source, data) {
  const token = ++loadToken;
  setBusy(true); report(`Opening ${source.name}…`);
  try {
    if (!new TextDecoder('latin1').decode(data.subarray(0, 1024)).includes('%PDF-')) throw Object.assign(new Error('bad'), { name: 'InvalidPDFException' });
    const task = getDocument({ data: data.slice(), ...PDFJS });
    const doc = await task.promise;
    if (token !== loadToken) { void task.destroy().catch(() => {}); return; }
    if (doc.numPages > PAGE_LIMIT) { void task.destroy().catch(() => {}); throw new Error(`This PDF has ${doc.numPages} pages. The editor opens up to ${PAGE_LIMIT}; split it first with Split PDF.`); }
    file = source; bytes = data; pdf = doc; docTask = task; pageNo = 1;
    $('#pe-file').textContent = `${source.name} · ${formatBytes(source.size ?? data.length)} · ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
    $('#pe-clear').hidden = false; $('#pe-editor').hidden = false;
    $('#pe-page').max = String(doc.numPages); $('#pe-pages').textContent = `of ${doc.numPages}`;
    await showPage();
    if (token !== loadToken) return;
    const count = segmentsByPage.get(1)?.length ?? 0;
    report(count ? 'Click a line on the page to change it, or choose Add text.' : 'No selectable text found on page 1. If this is a scan, use Extract text instead; you can still add new text.');
  } catch (error) {
    if (token !== loadToken) return;
    resetState(); setBusy(false);
    if (error.name === 'PasswordException') report('That PDF is password-protected. Choose an unlocked copy.', true);
    else if (error.name === 'InvalidPDFException') report('That file could not be opened as a PDF.', true);
    else report(error.message || 'The PDF could not be opened.', true);
  } finally { if (token === loadToken) setBusy(false); }
}

// ---- page rendering and overlay -------------------------------------------------------------

async function segmentsFor(page, number) {
  if (!segmentsByPage.has(number)) {
    const content = await page.getTextContent(), styles = {};
    for (const [name, css] of Object.entries(content.styles)) {
      styles[name] = { ...css };
      try { // the real font name and weight, available once the page has been rendered
        const font = page.commonObjs.get(name);
        styles[name].fontFamily = `${font.fallbackName || ''} ${font.name || ''} ${css.fontFamily || ''}`;
        styles[name].bold = Boolean(font.bold || font.black); styles[name].italic = Boolean(font.italic);
      } catch { /* keep pdf.js' CSS family */ }
    }
    segmentsByPage.set(number, groupTextItems(content.items, styles));
  }
  return segmentsByPage.get(number);
}

async function showPage(keep = false) {
  const token = ++renderToken;
  const keepKey = keep ? selected?.key : null;
  select(null);
  const page = await pdf.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const available = Math.max(260, stage.getBoundingClientRect().width - 26);
  const scale = Math.min(available / base.width, 1.8) * zoom;
  ratio = Math.min(window.devicePixelRatio || 1, 2);
  const css = page.getViewport({ scale }), fine = page.getViewport({ scale: scale * ratio });
  canvas.width = Math.ceil(fine.width); canvas.height = Math.ceil(fine.height);
  canvas.style.width = `${css.width}px`; canvas.style.height = `${css.height}px`;
  overlay.style.width = `${css.width}px`; overlay.style.height = `${css.height}px`;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: fine }).promise;
  const segments = await segmentsFor(page, pageNo);
  page.cleanup();
  if (token !== renderToken) return;
  view = css; pixels = null;
  $('#pe-page').value = String(pageNo); $('#pe-zoom').textContent = `${Math.round(zoom * 100)}%`;
  $('#pe-prev').disabled = pageNo <= 1; $('#pe-next').disabled = pageNo >= pdf.numPages;
  buildOverlay(segments);
  if (keepKey && edits.has(keepKey)) select(keepKey);
}

function measureWidth(text, edit, px) {
  measure ||= document.createElement('canvas').getContext('2d');
  measure.font = `${edit.italic ? 'italic ' : ''}${edit.bold ? 'bold ' : ''}${px}px ${STACKS[edit.family] || STACKS.sans}`;
  return measure.measureText(text).width;
}

// Position an element on the page: its left edge sits on the text baseline origin and it follows rotation.
function place(el, edit) {
  const [a, b, c, d, e, f] = view.transform, co = Math.cos(edit.angle || 0), si = Math.sin(edit.angle || 0);
  const px = (edit.size || edit.fontSize) * view.scale;
  el.style.left = `${a * edit.x + c * edit.y + e}px`; el.style.top = `${b * edit.x + d * edit.y + f}px`;
  el.style.fontSize = `${px}px`;
  el.style.transform = `rotate(${Math.atan2(b * co + d * si, a * co + c * si)}rad) translateY(-0.87em)`;
}

function paint(el, edit, editing = false) {
  const px = (edit.size || edit.fontSize) * view.scale, original = edit.kind === 'replace' ? edit.width * view.scale : 0;
  el.style.fontFamily = STACKS[edit.family] || STACKS.sans;
  el.style.fontWeight = edit.bold ? '700' : '400'; el.style.fontStyle = edit.italic ? 'italic' : 'normal';
  el.style.color = toHex(edit.color);
  if (edit.kind === 'replace') el.style.backgroundColor = toHex(edit.bg);
  el.style.width = `${Math.max(original, measureWidth(edit.text, edit, px) + (editing ? 10 : 2))}px`;
}

function label(edit) { return edit.kind === 'add' ? `Added text: ${edit.text || 'empty'}` : edit.removed ? `Removed text: ${edit.original}` : `Edit text: ${edit.text}`; }

function buildOverlay(segments) {
  overlay.replaceChildren(); editorInput = null;
  const fragment = document.createDocumentFragment();
  for (const seg of segments) {
    const key = `${pageNo - 1}:${seg.id}`, edit = edits.get(key);
    const el = document.createElement('button'); el.type = 'button'; el.className = 'pe-seg'; el.dataset.key = key;
    if (edit && isActive(edit)) decorate(el, edit);
    else {
      const geometry = { x: seg.x, y: seg.y, angle: seg.angle, fontSize: seg.fontSize, size: seg.fontSize, width: seg.width, kind: 'replace', family: seg.family, bold: seg.bold, italic: seg.italic, text: seg.str, color: [0, 0, 0], bg: [255, 255, 255] };
      place(el, geometry); el.style.width = `${seg.width * view.scale}px`; el.textContent = seg.str; el.setAttribute('aria-label', `Edit text: ${seg.str}`);
    }
    el.addEventListener('click', () => select(key, seg));
    fragment.append(el);
  }
  for (const edit of edits.values()) if (edit.kind === 'add' && edit.page === pageNo - 1) fragment.append(addButton(edit));
  overlay.append(fragment);
}

function decorate(el, edit) {
  place(el, edit); paint(el, edit);
  el.textContent = edit.removed ? '' : edit.text; el.classList.add('is-edited'); el.classList.toggle('is-removed', Boolean(edit.removed));
  el.setAttribute('aria-label', label(edit));
}

function addButton(edit) {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'pe-seg pe-added is-edited'; el.dataset.key = edit.key;
  decorate(el, edit);
  let start = null;
  el.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    start = { cx: event.clientX, cy: event.clientY, x: edit.x, y: edit.y, moved: false }; el.setPointerCapture(event.pointerId);
  });
  el.addEventListener('pointermove', event => {
    if (!start) return;
    const dx = event.clientX - start.cx, dy = event.clientY - start.cy;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    start.moved = true;
    const rect = overlay.getBoundingClientRect(), sx = start.cx - rect.left, sy = start.cy - rect.top;
    const [x0, y0] = view.convertToPdfPoint(sx, sy), [x1, y1] = view.convertToPdfPoint(sx + dx, sy + dy);
    edit.x = start.x + (x1 - x0); edit.y = start.y + (y1 - y0); place(el, edit);
  });
  el.addEventListener('pointerup', event => { if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId); });
  el.addEventListener('click', event => { if (start?.moved) { event.preventDefault(); start = null; return; } start = null; select(edit.key); });
  el.addEventListener('keydown', event => nudge(event, edit, el));
  return el;
}

function nudge(event, edit, el) {
  if (edit.kind !== 'add' || !event.altKey || !event.key.startsWith('Arrow')) return;
  event.preventDefault();
  const step = event.shiftKey ? 10 : 1;
  if (event.key === 'ArrowLeft') edit.x -= step; if (event.key === 'ArrowRight') edit.x += step;
  if (event.key === 'ArrowUp') edit.y += step; if (event.key === 'ArrowDown') edit.y -= step;
  place(el, edit); if (editorInput) place(editorInput, edit);
}

// ---- selection and the property panel -------------------------------------------------------

function sampleFor(seg) {
  if (!pixels) { const context = canvas.getContext('2d'); pixels = context.getImageData(0, 0, canvas.width, canvas.height); }
  const [a, b, c, d, e, f] = view.transform;
  const points = coverQuad(seg).map(([x, y]) => [(a * x + c * y + e) * ratio, (b * x + d * y + f) * ratio]);
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return sampleColors(pixels, { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
}

function ensureEdit(seg) {
  const key = `${pageNo - 1}:${seg.id}`;
  let edit = edits.get(key);
  if (!edit) {
    const { bg, fg } = sampleFor(seg);
    edit = { key, kind: 'replace', page: pageNo - 1, x: seg.x, y: seg.y, angle: seg.angle, width: seg.width, fontSize: seg.fontSize, original: seg.str, text: seg.str, removed: false, touched: false, family: seg.family, bold: seg.bold, italic: seg.italic, size: Math.round(seg.fontSize * 10) / 10, color: fg, bg };
    edits.set(key, edit);
  }
  return edit;
}

function select(key, seg) {
  if (editorInput) { editorInput.remove(); editorInput = null; }
  overlay.querySelectorAll('.pe-seg.is-selected').forEach(el => el.classList.remove('is-selected'));
  if (!key) { selected = null; showProps(null); return; }
  const edit = edits.get(key) || ensureEdit(seg || segmentsByPage.get(pageNo).find(item => `${pageNo - 1}:${item.id}` === key));
  selected = edit;
  const button = overlay.querySelector(`[data-key="${CSS.escape(key)}"]`);
  button?.classList.add('is-selected');
  const el = document.createElement('input'); el.type = 'text'; el.className = 'pe-input'; el.value = edit.text; el.autocomplete = 'off';
  el.setAttribute('aria-label', 'Text for the selected line');
  place(el, edit); paint(el, edit, true);
  el.addEventListener('input', () => { edit.text = el.value; edit.removed = false; changed(edit, el, { fromInput: true }); });
  el.addEventListener('keydown', event => {
    nudge(event, edit, button || el);
    if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); const key2 = edit.key; select(null); overlay.querySelector(`[data-key="${CSS.escape(key2)}"]`)?.focus(); }
  });
  overlay.append(el); editorInput = el; el.focus(); el.select();
  showProps(edit);
}

function showProps(edit) {
  const panel = $('#pe-fields');
  $('#pe-hint').hidden = Boolean(edit); panel.hidden = !edit;
  if (!edit) return;
  fields.text.value = edit.text; fields.font.value = edit.family; fields.size.value = String(edit.size);
  fields.bold.checked = edit.bold; fields.italic.checked = edit.italic; fields.color.value = toHex(edit.color); fields.bg.value = toHex(edit.bg || [255, 255, 255]);
  $('#pe-bg-label').hidden = edit.kind === 'add'; $('#pe-revert').hidden = edit.kind === 'add';
  $('#pe-remove').textContent = edit.kind === 'add' ? 'Delete this text' : 'Remove text';
  fontNote(edit);
}

function fontNote(edit) {
  const note = $('#pe-font-note'), uni = needsUnicode(edit.text);
  note.hidden = !(uni || edit.family === 'unicode');
  note.textContent = uni ? 'These characters need Noto Sans, so this line is saved in that font in regular weight.' : 'Noto Sans is saved in regular weight.';
}

// Re-style everything that shows this edit after any change.
function changed(edit, source, { fromInput = false } = {}) {
  edit.touched = true;
  const button = overlay.querySelector(`[data-key="${CSS.escape(edit.key)}"]`);
  if (button) { if (isActive(edit)) decorate(button, edit); else { button.classList.remove('is-edited', 'is-removed'); } button.classList.add('is-selected'); }
  if (editorInput) { paint(editorInput, edit, true); place(editorInput, edit); if (!fromInput && editorInput.value !== edit.text) editorInput.value = edit.text; }
  if (fromInput) fields.text.value = edit.text; else if (source !== fields.text) fields.text.value = edit.text;
  fontNote(edit); updateSummary();
}

fields.text.addEventListener('input', () => { if (!selected) return; selected.text = fields.text.value; selected.removed = false; changed(selected, fields.text); if (editorInput) editorInput.value = selected.text; });
fields.font.addEventListener('change', () => { if (!selected) return; selected.family = fields.font.value; changed(selected, fields.font); });
fields.size.addEventListener('input', () => { const value = Number(fields.size.value); if (!selected || !(value >= 4 && value <= 200)) return; selected.size = value; changed(selected, fields.size); });
fields.bold.addEventListener('change', () => { if (!selected) return; selected.bold = fields.bold.checked; changed(selected, fields.bold); });
fields.italic.addEventListener('change', () => { if (!selected) return; selected.italic = fields.italic.checked; changed(selected, fields.italic); });
fields.color.addEventListener('input', () => { if (!selected) return; selected.color = fromHex(fields.color.value); changed(selected, fields.color); });
fields.bg.addEventListener('input', () => { if (!selected) return; selected.bg = fromHex(fields.bg.value, [255, 255, 255]); changed(selected, fields.bg); });

$('#pe-revert').addEventListener('click', () => {
  if (!selected || selected.kind !== 'replace') return;
  edits.delete(selected.key); const key = selected.key; selected = null;
  select(null); buildOverlay(segmentsByPage.get(pageNo)); updateSummary(); report('Line restored to the original.');
  overlay.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
});
$('#pe-remove').addEventListener('click', () => {
  if (!selected) return;
  if (selected.kind === 'add') { edits.delete(selected.key); select(null); buildOverlay(segmentsByPage.get(pageNo)); updateSummary(); report('Added text deleted.'); return; }
  selected.removed = true; selected.text = ''; selected.touched = true;
  const key = selected.key; select(null); buildOverlay(segmentsByPage.get(pageNo)); updateSummary(); report('Line will be removed from the page.');
  overlay.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
});

// ---- adding text ----------------------------------------------------------------------------

function setAddMode(value) {
  addMode = value; $('#pe-add').setAttribute('aria-pressed', String(value)); overlay.classList.toggle('is-adding', value);
}
$('#pe-add').addEventListener('click', () => {
  if (!pdf) return;
  setAddMode(!addMode); report(addMode ? 'Click the page where the new text should start. Esc cancels.' : 'Add text cancelled.');
});
overlay.addEventListener('click', event => {
  if (!addMode || event.target !== overlay || !view) return;
  const rect = overlay.getBoundingClientRect(), size = 14;
  const [x, y] = view.convertToPdfPoint(event.clientX - rect.left, event.clientY - rect.top);
  const edit = { key: `a${++addCount}`, kind: 'add', page: pageNo - 1, x, y: y - size * 0.3, angle: 0, original: '', text: 'New text', removed: false, touched: true, family: 'sans', bold: false, italic: false, size, color: [0, 0, 0] };
  edits.set(edit.key, edit); setAddMode(false);
  overlay.append(addButton(edit)); select(edit.key); updateSummary(); report('Type the new text. Drag the box to move it, or use Alt + arrow keys.');
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && addMode) { setAddMode(false); report('Add text cancelled.'); } });

// ---- navigation -----------------------------------------------------------------------------

async function go(number) {
  if (!pdf || busy) return;
  const target = Math.min(Math.max(1, Math.round(number) || 1), pdf.numPages);
  if (target === pageNo) { $('#pe-page').value = String(pageNo); return; }
  pageNo = target; setBusy(true);
  try { await showPage(); } finally { setBusy(false); }
  stage.scrollTop = 0;
}
$('#pe-prev').addEventListener('click', () => go(pageNo - 1));
$('#pe-next').addEventListener('click', () => go(pageNo + 1));
$('#pe-page').addEventListener('change', event => go(Number(event.target.value)));
async function setZoom(value) {
  if (!pdf || busy) return;
  zoom = Math.min(3, Math.max(0.5, value)); setBusy(true);
  try { await showPage(true); } finally { setBusy(false); }
}
$('#pe-zoom-in').addEventListener('click', () => setZoom(zoom + 0.25));
$('#pe-zoom-out').addEventListener('click', () => setZoom(zoom - 0.25));
let resizeTimer = 0, lastWidth = stage.getBoundingClientRect().width;
new ResizeObserver(() => {
  const width = stage.getBoundingClientRect().width;
  if (!pdf || Math.abs(width - lastWidth) < 24) return;
  lastWidth = width; clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!busy) showPage(true).catch(() => {}); }, 200);
}).observe(stage);

// ---- export ---------------------------------------------------------------------------------

async function rasterize(index, list) {
  const page = await pdf.getPage(index + 1), base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, 3200 / Math.max(base.width, base.height)), vp = page.getViewport({ scale });
  const raster = document.createElement('canvas'); raster.width = Math.ceil(vp.width); raster.height = Math.ceil(vp.height);
  const context = raster.getContext('2d');
  await page.render({ canvasContext: context, viewport: vp }).promise;
  const [a, b, c, d, e, f] = vp.transform;
  for (const edit of list) {
    if (edit.kind !== 'replace') continue;
    context.fillStyle = toHex(edit.bg); context.beginPath();
    coverQuad(edit).forEach(([x, y], i) => context[i ? 'lineTo' : 'moveTo'](a * x + c * y + e, b * x + d * y + f));
    context.closePath(); context.fill();
  }
  const blob = await new Promise(resolve => raster.toBlob(resolve, 'image/jpeg', 0.9));
  raster.width = 1; raster.height = 1; page.cleanup();
  if (!blob) throw new Error('This browser could not flatten the page. Untick “Remove the original text completely” and try again.');
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: base.width, height: base.height, transform: base.transform };
}

async function download() {
  if (!pdf || busy) return;
  const list = activeEdits();
  if (!list.length) { report('Nothing to save yet. Change a line or add text first.'); return; }
  select(null); setBusy(true);
  try {
    const flat = new Map();
    if ($('#pe-flatten').checked) {
      for (const index of [...new Set(list.map(e => e.page))].sort((x, y) => x - y)) {
        report(`Flattening page ${index + 1}…`);
        flat.set(index, await rasterize(index, list.filter(e => e.page === index)));
      }
    }
    report('Writing the edited PDF…');
    const plain = list.map(({ page, kind, x, y, angle, width, fontSize, text, removed, family, bold, italic, size, color, bg }) => ({ page, kind, x, y, angle, width, fontSize, text, removed, family, bold, italic, size, color, bg }));
    const result = await buildEditedPdf(bytes, plain, {
      flat,
      loadUnicodeFont: async () => { const response = await fetch('/fonts/NotoSans-Regular.ttf'); if (!response.ok) throw new Error('The fallback font could not be loaded.'); return new Uint8Array(await response.arrayBuffer()); },
    });
    const name = `${(file?.name || 'document').replace(/\.pdf$/i, '').replace(/[^\w.\- ]+/g, '_') || 'document'}-edited.pdf`;
    const url = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    report(`Saved ${name} (${formatBytes(result.bytes.length)}), ${result.changed} change${result.changed === 1 ? '' : 's'}. ${flat.size ? 'Edited pages are now pictures, the original text is gone.' : 'The original text is only covered; tick “Remove the original text completely” to delete it.'}${result.warnings.length ? ' ' + result.warnings.join(' ') : ''}`);
  } catch (error) {
    report(error.name === 'EncryptedPDFError' ? 'This PDF is encrypted and cannot be saved after editing. Choose an unlocked copy.' : (error.message || 'The edited PDF could not be written.'), true);
  } finally { setBusy(false); }
}
$('#pe-download').addEventListener('click', download);

// ---- sample ---------------------------------------------------------------------------------

async function buildSample() {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create(), regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold), serif = await doc.embedFont(StandardFonts.TimesRoman);
  doc.setTitle('Sample invoice'); doc.setAuthor('FileForge sample');
  const page = doc.addPage([595, 420]);
  page.drawRectangle({ x: 0, y: 340, width: 595, height: 80, color: rgb(0.89, 0.93, 0.99) });
  page.drawText('Invoice 2026-0042', { x: 40, y: 372, size: 24, font: bold, color: rgb(0.12, 0.25, 0.68) });
  page.drawText('Due in 14 days', { x: 430, y: 376, size: 11, font: regular, color: rgb(0.25, 0.3, 0.4) });
  const rows = [['Billed to: Alice Smith', 300], ['Date: 12 March 2026', 280], ['Design work, 4 hours at 80.00 EUR', 240], ['Hosting for one year', 220]];
  for (const [text, y] of rows) page.drawText(text, { x: 40, y, size: 13, font: regular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('320.00 EUR', { x: 440, y: 240, size: 13, font: regular }); page.drawText('120.00 EUR', { x: 440, y: 220, size: 13, font: regular });
  page.drawText('Total due: 440.00 EUR', { x: 40, y: 170, size: 16, font: bold });
  page.drawText('Thank you for your business.', { x: 40, y: 110, size: 14, font: serif, color: rgb(0.2, 0.2, 0.2) });
  const second = doc.addPage([595, 420]);
  second.drawText('Payment terms', { x: 40, y: 360, size: 20, font: bold });
  second.drawText('Please pay within 14 days to the account on the first page.', { x: 40, y: 320, size: 13, font: regular });
  return doc.save();
}

$('#pe-sample').addEventListener('click', async () => {
  if (busy) return;
  resetState(); setBusy(true); report('Building the sample…');
  try {
    const data = await buildSample();
    setBusy(false);
    await open(Object.assign(new Blob([data], { type: 'application/pdf' }), { name: 'sample-invoice.pdf' }), data);
  } catch (error) { setBusy(false); report(error.message || 'The sample could not be built.', true); }
});

input.addEventListener('change', () => choose(input.files[0]));
$('#pe-clear').addEventListener('click', () => clearAll());
for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('dragging'); });
for (const type of ['dragleave', 'drop']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('dragging'); });
drop.addEventListener('drop', event => { if (!input.disabled) choose(event.dataTransfer.files[0]); });
window.addEventListener('beforeunload', event => { if (activeEdits().length) { event.preventDefault(); event.returnValue = ''; } });
