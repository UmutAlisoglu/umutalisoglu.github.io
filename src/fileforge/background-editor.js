import { scaledSize } from './advanced-shared.js';
import './background-editor.css';

const HISTORY_BYTES = 32 * 1024 * 1024;
const TILE = 128;

export function brushBounds(x, y, diameter, width, height) {
  const radius = diameter / 2 + 2;
  const left = Math.max(0, Math.floor(x - radius)), top = Math.max(0, Math.floor(y - radius));
  return { x: left, y: top, width: Math.max(0, Math.min(width, Math.ceil(x + radius)) - left), height: Math.max(0, Math.min(height, Math.ceil(y + radius)) - top) };
}

export function backgroundColour(mode, colour) {
  if (mode === 'transparent') return null;
  if (mode === 'white') return '#ffffff';
  if (mode !== 'custom' || !/^#[0-9a-f]{6}$/i.test(colour)) throw new Error('Choose a valid background colour.');
  return colour.toLowerCase();
}

// Store only changed alpha tiles, rather than an entire RGBA image per stroke.
// The source bitmap and its alpha are never edited. Oldest strokes are evicted.
export class MaskHistory {
  constructor(limit = HISTORY_BYTES, steps = 20) { this.limit = limit; this.steps = steps; this.entries = []; this.bytes = 0; }
  push(patches) {
    const bytes = patches.reduce((total, patch) => total + patch.alpha.byteLength, 0);
    if (!bytes) return;
    while (this.entries.length && (this.bytes + bytes > this.limit || this.entries.length >= this.steps)) {
      this.bytes -= this.entries.shift().bytes;
    }
    if (bytes > this.limit) { this.clear(); return; }
    this.entries.push({ patches, bytes }); this.bytes += bytes;
  }
  pop() { const entry = this.entries.pop(); if (entry) this.bytes -= entry.bytes; return entry?.patches; }
  clear() { this.entries = []; this.bytes = 0; }
  get length() { return this.entries.length; }
}

function canvasOf(width, height, read = false) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: read });
  if (!context) throw new Error('The cutout editor could not start. Try a smaller image or another browser.');
  return { canvas, context };
}

export function createBackgroundEditor({ bitmap, mask, root = document, onDirty = () => {}, report = () => {} }) {
  const $ = selector => root.querySelector(selector);
  const shell = $('#background-editor'), stage = $('#background-stage'), view = $('#background-canvas');
  const viewport = $('#background-viewport'), cursor = $('#background-cursor');
  const context = view.getContext('2d');
  const width = bitmap.width, height = bitmap.height;
  const automatic = canvasOf(320, 320), working = canvasOf(width, height, true);
  automatic.context.putImageData(new ImageData(new Uint8ClampedArray(mask), 320, 320), 0, 0);
  const size = scaledSize(width, height, 1600); view.width = size.width; view.height = size.height;
  const history = new MaskHistory();
  const listeners = [], cleanups = [];
  let mode = 'erase', stroke = null, disposed = false, busy = false;
  let position = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const listen = (node, name, handler, options) => { node.addEventListener(name, handler, options); listeners.push(() => node.removeEventListener(name, handler, options)); };
  const brushSize = () => Math.max(1, Math.min(500, Number($('#background-brush-size').value) || 40));
  const hardness = () => Math.max(0.2, Math.min(1, Number($('#background-hardness').value) / 100 || 1));
  const backdrop = () => backgroundColour($('#background-fill').value, $('#background-colour').value);
  const comparing = () => $('#background-view').value === 'compare';
  const editing = () => $('#background-view').value === 'edit';

  function markDirty(message = 'Edits ready. Export PNG to update your download.') { onDirty(); report(message); }
  function syncButtons() {
    $('#background-undo').disabled = busy || !history.length;
    $('#background-erase').setAttribute('aria-pressed', String(mode === 'erase'));
    $('#background-restore').setAttribute('aria-pressed', String(mode === 'restore'));
    $('#background-history-note').textContent = `${history.length} undo ${history.length === 1 ? 'step' : 'steps'} available · up to 20 steps / 32 MB`;
    $('#background-compare-control').hidden = !comparing();
    $('#background-colour-control').hidden = $('#background-fill').value !== 'custom';
    $('#background-apply').disabled = busy || !editing();
    stage.setAttribute('aria-label', editing() ? 'Cutout brush canvas. Arrow keys move the brush; Enter or Space applies it. E erases, R restores, Control or Command Z undoes.' : comparing() ? 'Before and after comparison. Use the comparison slider below.' : 'Cutout preview. Scroll or swipe to inspect a zoomed image.');
    cursor.hidden = !editing();
  }

  function paintCursor() {
    $('#background-x').value = position.x; $('#background-y').value = position.y;
    cursor.style.left = `${(position.x + .5) / width * 100}%`; cursor.style.top = `${(position.y + .5) / height * 100}%`;
    cursor.style.width = `${brushSize() / width * 100}%`; cursor.style.height = `${brushSize() / height * 100}%`;
    cursor.dataset.mode = mode;
  }

  function resizeStage() {
    if (disposed) return;
    const fit = Math.max(1, Math.min(width, viewport.clientWidth - 24, 440 * width / height));
    stage.style.width = `${Math.round(fit * Number($('#background-zoom').value) / 100)}px`;
    paintCursor();
  }

  function render() {
    if (disposed) return;
    context.clearRect(0, 0, view.width, view.height);
    context.globalCompositeOperation = 'source-over'; context.drawImage(bitmap, 0, 0, view.width, view.height);
    context.globalCompositeOperation = 'destination-in'; context.drawImage(working.canvas, 0, 0, view.width, view.height);
    const colour = backdrop();
    if (colour) { context.globalCompositeOperation = 'destination-over'; context.fillStyle = colour; context.fillRect(0, 0, view.width, view.height); }
    context.globalCompositeOperation = 'source-over';
    if (comparing()) {
      const split = Math.round(Number($('#background-compare').value) / 100 * view.width);
      context.save(); context.beginPath(); context.rect(0, 0, split, view.height); context.clip();
      context.clearRect(0, 0, view.width, view.height); context.drawImage(bitmap, 0, 0, view.width, view.height);
      if (colour) { context.globalCompositeOperation = 'destination-over'; context.fillStyle = colour; context.fillRect(0, 0, view.width, view.height); }
      context.restore(); context.globalCompositeOperation = 'source-over';
      context.strokeStyle = '#ffffff'; context.lineWidth = 3; context.beginPath(); context.moveTo(split, 0); context.lineTo(split, view.height); context.stroke();
      stage.style.setProperty('--comparison', `${$('#background-compare').value}%`);
    }
    stage.classList.toggle('is-comparing', comparing());
    stage.classList.toggle('is-inspecting', !editing());
    $('#background-compare-value').textContent = `${$('#background-compare').value}% original`;
    paintCursor();
  }

  function restoreAutomatic() {
    working.context.globalCompositeOperation = 'source-over'; working.context.clearRect(0, 0, width, height);
    working.context.imageSmoothingEnabled = true; working.context.imageSmoothingQuality = 'high';
    working.context.drawImage(automatic.canvas, 0, 0, width, height); history.clear(); stroke = null;
    render(); syncButtons();
  }

  function remember(bounds) {
    if (!stroke || !bounds.width || !bounds.height) return;
    const firstX = Math.floor(bounds.x / TILE), firstY = Math.floor(bounds.y / TILE);
    const lastX = Math.floor((bounds.x + bounds.width - 1) / TILE), lastY = Math.floor((bounds.y + bounds.height - 1) / TILE);
    for (let ty = firstY; ty <= lastY; ty++) for (let tx = firstX; tx <= lastX; tx++) {
      const key = `${tx},${ty}`; if (stroke.patches.has(key)) continue;
      const x = tx * TILE, y = ty * TILE, w = Math.min(TILE, width - x), h = Math.min(TILE, height - y);
      const data = working.context.getImageData(x, y, w, h).data, alpha = new Uint8Array(w * h);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
      stroke.patches.set(key, { x, y, width: w, height: h, alpha });
    }
  }

  function dab(point) {
    const diameter = brushSize(), radius = diameter / 2, ctx = working.context;
    remember(brushBounds(point.x + .5, point.y + .5, diameter, width, height));
    ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
    const softness = hardness();
    if (softness === 1) ctx.fillStyle = '#ffffff';
    else {
      const gradient = ctx.createRadialGradient(point.x + .5, point.y + .5, radius * softness, point.x + .5, point.y + .5, radius);
      gradient.addColorStop(0, '#ffffffff'); gradient.addColorStop(1, '#ffffff00'); ctx.fillStyle = gradient;
    }
    ctx.beginPath(); ctx.arc(point.x + .5, point.y + .5, radius, 0, 2 * Math.PI); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  function begin(point) {
    if (busy || !editing()) return;
    stroke = { patches: new Map(), last: point }; dab(point); position = point;
    markDirty(); render();
  }

  function move(point) {
    if (!stroke) return;
    const dx = point.x - stroke.last.x, dy = point.y - stroke.last.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(1, brushSize() / 5)));
    for (let i = 1; i <= steps; i++) dab({ x: stroke.last.x + dx * i / steps, y: stroke.last.y + dy * i / steps });
    stroke.last = point; position = point; render();
  }

  function end() { if (!stroke) return; history.push([...stroke.patches.values()]); stroke = null; syncButtons(); }
  function stamp() { if (busy || !editing()) return; begin(position); end(); }
  function undo() {
    if (busy) return; end(); const patches = history.pop(); if (!patches) return;
    for (const patch of patches) {
      const image = working.context.createImageData(patch.width, patch.height);
      for (let i = 0; i < patch.alpha.length; i++) {
        image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255; image.data[i * 4 + 3] = patch.alpha[i];
      }
      working.context.putImageData(image, patch.x, patch.y);
    }
    markDirty('Last brush stroke undone. Export PNG to update your download.'); render(); syncButtons();
  }

  function pointerPoint(event) {
    const bounds = view.getBoundingClientRect();
    return { x: Math.max(0, Math.min(width - 1, Math.floor((event.clientX - bounds.left) / bounds.width * width))), y: Math.max(0, Math.min(height - 1, Math.floor((event.clientY - bounds.top) / bounds.height * height))) };
  }

  shell.hidden = false;
  $('#background-dimensions').textContent = `${width} × ${height}px · full-resolution export`;
  $('#background-brush-size').value = Math.max(1, Math.min(128, Math.round(Math.min(width, height) / 12)));
  $('#background-x').max = width - 1; $('#background-y').max = height - 1;
  $('#background-zoom').value = '100'; $('#background-view').value = 'edit';
  restoreAutomatic(); resizeStage();
  const observer = new ResizeObserver(resizeStage); observer.observe(viewport); cleanups.push(() => observer.disconnect());
  listen($('#background-erase'), 'click', () => { mode = 'erase'; paintCursor(); syncButtons(); });
  listen($('#background-restore'), 'click', () => { mode = 'restore'; paintCursor(); syncButtons(); });
  listen($('#background-undo'), 'click', undo);
  listen($('#background-reset'), 'click', () => { if (busy) return; restoreAutomatic(); markDirty('Automatic cutout restored. Export PNG to update your download.'); });
  listen($('#background-apply'), 'click', stamp);
  for (const key of ['x', 'y']) listen($(`#background-${key}`), 'change', () => {
    position[key] = Math.max(0, Math.min((key === 'x' ? width : height) - 1, Math.round(Number($(`#background-${key}`).value) || 0))); paintCursor();
  });
  listen($('#background-brush-size'), 'change', () => { $('#background-brush-size').value = brushSize(); paintCursor(); });
  listen($('#background-zoom'), 'change', resizeStage);
  listen($('#background-view'), 'change', () => { end(); render(); syncButtons(); });
  listen($('#background-compare'), 'input', render);
  for (const selector of ['#background-fill', '#background-colour']) listen($(selector), 'change', () => {
    if (busy) return; markDirty(); render(); syncButtons();
  });
  listen(stage, 'pointerdown', event => {
    if (busy || !editing() || stroke || event.button !== 0) return;
    event.preventDefault(); stage.focus({ preventScroll: true }); stage.setPointerCapture(event.pointerId); begin(pointerPoint(event));
    if (stroke) stroke.pointerId = event.pointerId;
  });
  listen(stage, 'pointermove', event => {
    if (busy || !editing()) return;
    const point = pointerPoint(event); if (stroke) { if (stroke.pointerId === event.pointerId) move(point); } else { position = point; paintCursor(); }
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(stage, name, event => { if (stroke?.pointerId === event.pointerId) end(); });
  listen(stage, 'keydown', event => {
    if (busy) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
    if (!editing()) return;
    const delta = event.shiftKey ? 10 : 1;
    const offsets = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
    if (offsets[event.key]) {
      event.preventDefault(); position = { x: Math.max(0, Math.min(width - 1, position.x + offsets[event.key][0])), y: Math.max(0, Math.min(height - 1, position.y + offsets[event.key][1])) }; paintCursor();
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); stamp(); }
    else if (['e', 'r'].includes(event.key.toLowerCase())) { mode = event.key.toLowerCase() === 'e' ? 'erase' : 'restore'; paintCursor(); syncButtons(); }
    else if (['[', ']'].includes(event.key)) { event.preventDefault(); $('#background-brush-size').value = Math.max(1, Math.min(500, brushSize() + (event.key === '[' ? -5 : 5))); paintCursor(); }
  });

  return {
    get dimensions() { return { width, height }; },
    get background() { return backdrop(); },
    setBusy(value) {
      busy = value; end(); stage.setAttribute('aria-disabled', String(value));
      $('#background-editor-controls').disabled = value; syncButtons();
    },
    async exportPNG(signal) {
      end(); signal?.throwIfAborted();
      const output = canvasOf(width, height);
      try {
        output.context.drawImage(bitmap, 0, 0); output.context.globalCompositeOperation = 'destination-in'; output.context.drawImage(working.canvas, 0, 0);
        const colour = backdrop();
        if (colour) { output.context.globalCompositeOperation = 'destination-over'; output.context.fillStyle = colour; output.context.fillRect(0, 0, width, height); }
        const blob = await new Promise((resolve, reject) => output.canvas.toBlob(value => value ? resolve(value) : reject(new Error('This PNG could not be exported. Try a smaller image.')), 'image/png'));
        signal?.throwIfAborted();
        if (blob.size > 150_000_000) throw new Error('The result exceeds 150 MB. Try a smaller image.');
        return blob;
      } finally { output.canvas.width = output.canvas.height = 1; }
    },
    dispose() {
      if (disposed) return; disposed = true; listeners.forEach(cleanup => cleanup()); cleanups.forEach(cleanup => cleanup());
      history.clear(); stroke = null; shell.hidden = true;
      for (const canvas of [working.canvas, automatic.canvas, view]) canvas.width = canvas.height = 1;
    }
  };
}
