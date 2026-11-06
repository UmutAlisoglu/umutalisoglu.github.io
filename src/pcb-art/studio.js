import { zipSync, strToU8 } from 'fflate';
import { finishes, finishIds, defaultLevelFinishes, boardGeometry, luminance, adjustTone, quantize, removeSlivers, despeckle, buildLayers, fabricationFiles, orderNotes } from './core.js';

const maskColors = {
  green: { label: 'Green', substrate: [29, 90, 50], copper: [47, 138, 74], silk: [246, 246, 240] },
  black: { label: 'Black', substrate: [20, 20, 20], copper: [40, 40, 40], silk: [246, 246, 240] },
  white: { label: 'White', substrate: [228, 228, 222], copper: [244, 244, 238], silk: [30, 30, 30] },
  blue: { label: 'Blue', substrate: [22, 58, 122], copper: [36, 87, 176], silk: [246, 246, 240] },
  red: { label: 'Red', substrate: [140, 28, 28], copper: [191, 46, 46], silk: [246, 246, 240] },
  purple: { label: 'Purple', substrate: [60, 31, 99], copper: [92, 51, 148], silk: [246, 246, 240] },
  yellow: { label: 'Yellow', substrate: [196, 156, 22], copper: [226, 191, 58], silk: [30, 30, 30] },
};
const surfaces = { enig: { label: 'ENIG (gold)', color: [217, 178, 90] }, hasl: { label: 'HASL (silver)', color: [200, 204, 209] } };
const bareBoard = [201, 185, 138];
const presets = {
  card: { label: 'Business card', width: 85, height: 55, shape: 'rounded', radius: 3 },
  badge: { label: 'Round badge', width: 50, height: 50, shape: 'circle' },
  coaster: { label: 'Coaster', width: 90, height: 90, shape: 'circle' },
  bookmark: { label: 'Bookmark', width: 40, height: 150, shape: 'rounded', radius: 4 },
  square: { label: 'Square tile', width: 80, height: 80, shape: 'rounded', radius: 2 },
};

const root = document.querySelector('[data-pcb-studio]');
if (root) start(root);

function start(root) {
  const $ = selector => root.querySelector(selector);
  const form = $('form'), fileInput = $('#pcb-file'), drop = $('.pcb-drop'), canvas = $('#pcb-preview'), stage = $('.pcb-stage'), levelList = $('.pcb-levels');
  const status = $('#pcb-status'), warnings = $('#pcb-warnings'), download = $('#pcb-download'), savePreview = $('#pcb-save-preview');
  const work = document.createElement('canvas'), workContext = work.getContext('2d', { willReadFrequently: true });
  let source = sampleArtwork(), sourceName = 'sample', levelFinishes = [...defaultLevelFinishes[4]], result = null, timer = 0;

  for (const [id, preset] of Object.entries(presets)) form.preset.append(new Option(`${preset.label} · ${preset.shape === 'circle' ? `⌀ ${preset.width}` : `${preset.width} × ${preset.height}`} mm`, id));
  form.preset.append(new Option('Custom size', 'custom'));
  for (const [id, mask] of Object.entries(maskColors)) form.mask.append(new Option(mask.label, id));
  for (const [id, surface] of Object.entries(surfaces)) form.surface.append(new Option(surface.label, id));
  applyPreset('card');

  function applyPreset(id) {
    const preset = presets[id]; if (!preset) return;
    form.preset.value = id; form.width.value = preset.width; form.height.value = preset.height; form.shape.value = preset.shape; form.radius.value = preset.radius ?? 3;
  }
  function settings() {
    const pixelChoice = Number(form.detail.value), dither = form.dither.checked;
    return {
      width: Number(form.width.value), height: Number(form.height.value), shape: form.shape.value, radius: Number(form.radius.value), holes: form.holes.checked,
      fit: form.fit.value, zoom: Number(form.zoom.value), offsetX: Number(form.offsetX.value), offsetY: Number(form.offsetY.value),
      levels: Number(form.levels.value), brightness: Number(form.brightness.value), contrast: Number(form.contrast.value), invert: form.invert.checked, dither, cleanup: form.cleanup.checked,
      pixel: dither ? Math.max(0.2, pixelChoice) : pixelChoice, pixelChoice, mask: form.mask.value, surface: form.surface.value, view: form.view.value,
    };
  }
  function renderLevels(count) {
    if (levelFinishes.length !== count) levelFinishes = [...defaultLevelFinishes[count]];
    levelList.replaceChildren(...levelFinishes.map((finish, index) => {
      const row = document.createElement('label'); row.className = 'pcb-level';
      const tone = Math.round(((index + 0.5) / count) * 255);
      const swatch = document.createElement('span'); swatch.className = 'pcb-level-tone'; swatch.style.background = `rgb(${tone},${tone},${tone})`; swatch.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span'); name.className = 'pcb-level-name'; name.textContent = index === 0 ? 'Darkest' : index === count - 1 ? 'Lightest' : `Tone ${index + 1}`;
      const select = document.createElement('select'); select.dataset.level = index; select.setAttribute('aria-label', `Finish for ${name.textContent.toLowerCase()} areas`);
      for (const id of finishIds) select.append(new Option(finishes[id].label, id));
      select.value = finish;
      const chip = document.createElement('span'); chip.className = 'pcb-level-chip'; chip.dataset.finish = finish; chip.setAttribute('aria-hidden', 'true');
      row.append(swatch, name, chip, select);
      return row;
    }));
    paintChips();
  }
  function paintChips() {
    const { mask, surface } = settings();
    for (const chip of levelList.querySelectorAll('.pcb-level-chip')) chip.style.background = `rgb(${finishColor(chip.dataset.finish, mask, surface).join(',')})`;
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(process, 60); }
  function process() {
    const s = settings();
    let geometry;
    try { geometry = boardGeometry(s); } catch (error) { status.textContent = error.message; download.disabled = true; return; }
    const gw = Math.ceil(geometry.width / s.pixel), gh = Math.ceil(geometry.height / s.pixel);
    work.width = gw; work.height = gh;
    workContext.fillStyle = '#fff'; workContext.fillRect(0, 0, gw, gh);
    const sw = source.width, sh = source.height, ratio = s.fit === 'cover' ? Math.max(gw / sw, gh / sh) : Math.min(gw / sw, gh / sh);
    const dw = sw * ratio * s.zoom, dh = sh * ratio * s.zoom;
    workContext.imageSmoothingQuality = 'high';
    workContext.drawImage(source, (gw - dw) / 2 + s.offsetX / 100 * gw, (gh - dh) / 2 + s.offsetY / 100 * gh, dw, dh);
    const gray = adjustTone(luminance(workContext.getImageData(0, 0, gw, gh).data, gw * gh), { brightness: s.brightness, contrast: s.contrast, invert: s.invert });
    const levels = quantize(gray, gw, gh, s.levels, { dither: s.dither });
    if (s.cleanup && !s.dither) { removeSlivers(levels, gw, gh, 2); despeckle(levels, gw, gh, Math.ceil((0.3 / s.pixel) ** 2)); }
    const layers = buildLayers(levels, gw, gh, levelFinishes, geometry, s.pixel);
    result = { s, geometry, layers };
    draw(); report();
  }

  function draw() {
    if (!result) return;
    const { s, geometry, layers } = result, { width: gw, height: gh, finish } = layers;
    const small = new ImageData(gw, gh), data = small.data;
    const mask = maskColors[s.mask], metal = surfaces[s.surface].color;
    const layerView = { copper: layers.copper, mask: layers.opening, silk: layers.silk }[s.view];
    for (let i = 0; i < finish.length; i++) {
      const id = finish[i];
      if (id === 255) continue;
      let color;
      if (layerView) color = layerView[i] ? [24, 32, 44] : [250, 250, 247];
      else {
        const name = finishIds[id];
        color = finishColor(name, s.mask, s.surface, mask, metal);
        if (name === 'maskCopper' || name === 'gold' || name === 'silk') {
          const x = i % gw, edgeA = (x > 0 && finish[i - 1] !== id) || (i >= gw && finish[i - gw] !== id), edgeB = (x + 1 < gw && finish[i + 1] !== id) || (i + gw < finish.length && finish[i + gw] !== id);
          if (edgeA && !edgeB) color = color.map(v => Math.min(255, v + 22)); else if (edgeB && !edgeA) color = color.map(v => v * 0.82);
        }
      }
      data[i * 4] = color[0]; data[i * 4 + 1] = color[1]; data[i * 4 + 2] = color[2]; data[i * 4 + 3] = 255;
    }
    const small2 = document.createElement('canvas'); small2.width = gw; small2.height = gh; small2.getContext('2d').putImageData(small, 0, 0);
    const box = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxW = Math.max(240, box.width - 48), maxH = Math.max(240, Math.min(window.innerHeight * 0.7, 760) - 48);
    const scale = Math.min(maxW / geometry.width, maxH / geometry.height);
    const cssW = geometry.width * scale, cssH = geometry.height * scale;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d'), k = canvas.width / geometry.width;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); outlinePath(ctx, geometry, k); ctx.clip();
    ctx.fillStyle = layerView ? 'rgb(250,250,247)' : `rgb(${mask.substrate.join(',')})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = s.pixel > 0.12 ? false : true;
    ctx.drawImage(small2, 0, 0, gw * s.pixel * k, gh * s.pixel * k);
    ctx.globalCompositeOperation = 'destination-out';
    for (const hole of geometry.holes) { ctx.beginPath(); ctx.arc(hole.x * k, (geometry.height - hole.y) * k, hole.d / 2 * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (!layerView) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = Math.max(1, dpr); outlinePath(ctx, geometry, k); ctx.stroke(); ctx.restore();
    }
    canvas.setAttribute('aria-label', `Preview of a ${geometry.shape === 'circle' ? `${geometry.width} mm round` : `${geometry.width} by ${geometry.height} mm`} board with ${maskColors[s.mask].label.toLowerCase()} solder mask`);
  }

  function report() {
    const { s, geometry, layers } = result, counts = new Map();
    for (const id of layers.finish) if (id !== 255) counts.set(id, (counts.get(id) || 0) + 1);
    const used = [...counts.keys()].map(id => finishIds[id]);
    const notes = [];
    if (s.dither && s.pixelChoice < 0.2) notes.push('Dithering uses 0.2 mm dots, the smallest size most makers print reliably.');
    if (!s.dither && s.pixel < 0.15 && !s.cleanup) notes.push('Turn on “Clean up specks” so tiny details are not lost in production.');
    if (used.includes('gold')) notes.push(`Order with ${surfaces[s.surface].label} as surface finish to get the metal look.`);
    if (!used.includes('silk') && levelFinishes.includes('silk')) notes.push('No silkscreen areas left with the current tones.');
    if (s.holes && !geometry.holes.length) notes.push(geometry.shape === 'circle' ? 'Mounting holes are only added to rectangular boards.' : 'Mounting holes need a board of at least 20 × 20 mm.');
    warnings.replaceChildren(...notes.map(text => Object.assign(document.createElement('li'), { textContent: text })));
    const shapeText = geometry.shape === 'circle' ? `⌀ ${geometry.width} mm` : `${geometry.width} × ${geometry.height} mm`;
    status.textContent = `${shapeText} · ${s.pixel} mm detail · ${s.levels} tones`;
    download.disabled = false;
  }

  function buildZip() {
    const { s, geometry, layers } = result;
    const used = new Set([...layers.finish].filter(id => id !== 255).map(id => finishIds[id]));
    const notes = orderNotes({ geometry, pixel: s.pixel, maskColor: maskColors[s.mask].label, surface: surfaces[s.surface].label, usesGold: used.has('gold'), usesBare: used.has('bare') });
    const { files, stats } = fabricationFiles(layers, geometry, s.pixel, { name: 'pcb-art', notes });
    const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 9 });
    return { zipped, stats };
  }
  function save(blob, name) {
    const url = URL.createObjectURL(blob), link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function baseName() {
    const { geometry } = result, safe = sourceName.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'art';
    return `pcb-art-${safe}-${geometry.width}x${geometry.height}mm`;
  }

  async function loadFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml|bmp)$/.test(file.type)) { status.textContent = 'Please choose a PNG, JPG, WebP, GIF or SVG image.'; return; }
    const url = URL.createObjectURL(file), image = new Image();
    image.decoding = 'async'; image.src = url;
    try {
      await image.decode();
      if (!image.naturalWidth) { image.width = 1000; image.height = 1000; }
      const canvasCopy = document.createElement('canvas'), longest = Math.max(image.naturalWidth || 1000, image.naturalHeight || 1000), fit = Math.min(1, 3000 / longest);
      canvasCopy.width = Math.max(1, Math.round((image.naturalWidth || 1000) * fit)); canvasCopy.height = Math.max(1, Math.round((image.naturalHeight || 1000) * fit));
      canvasCopy.getContext('2d').drawImage(image, 0, 0, canvasCopy.width, canvasCopy.height);
      source = canvasCopy; sourceName = file.name;
      $('.pcb-drop-name').textContent = file.name;
      schedule();
    } catch { status.textContent = 'This image could not be opened. Try another file.'; }
    finally { URL.revokeObjectURL(url); }
  }

  form.addEventListener('input', event => {
    const target = event.target;
    if (target.name === 'preset') applyPreset(target.value);
    else if (['width', 'height', 'shape', 'radius'].includes(target.name)) form.preset.value = 'custom';
    if (target.dataset.level) { levelFinishes[target.dataset.level] = target.value; target.parentElement.querySelector('.pcb-level-chip').dataset.finish = target.value; paintChips(); }
    if (target.name === 'levels') renderLevels(Number(target.value));
    if (target.name === 'mask' || target.name === 'surface') paintChips();
    form.radius.closest('label').hidden = form.shape.value !== 'rounded';
    for (const output of form.querySelectorAll('output[data-for]')) output.textContent = formatValue(output.dataset.for, form[output.dataset.for].value);
    if (target.name === 'view' || target.name === 'mask' || target.name === 'surface') draw(); else schedule();
  });
  form.addEventListener('submit', event => event.preventDefault());
  fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
  $('#pcb-sample').addEventListener('click', () => { source = sampleArtwork(); sourceName = 'sample'; $('.pcb-drop-name').textContent = 'Sample artwork'; schedule(); });
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('is-over'); });
  for (const type of ['dragleave', 'drop']) drop.addEventListener(type, () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', event => { event.preventDefault(); loadFile(event.dataTransfer.files[0]); });
  window.addEventListener('paste', event => { const item = [...(event.clipboardData?.items || [])].find(entry => entry.type.startsWith('image/')); if (item) loadFile(item.getAsFile()); });
  download.addEventListener('click', () => {
    if (!result) return;
    const { zipped } = buildZip();
    save(new Blob([zipped], { type: 'application/zip' }), `${baseName()}-gerbers.zip`);
    status.textContent = `Gerber ZIP ready · ${(zipped.length / 1024).toFixed(zipped.length > 102400 ? 0 : 1)} KB. Upload it unchanged to your PCB maker.`;
  });
  savePreview.addEventListener('click', () => canvas.toBlob(blob => blob && save(blob, `${baseName()}-preview.png`), 'image/png'));

  // Gentle 3D tilt while dragging over the board; resets on release.
  let tilt = null;
  const tiltBoard = (x, y) => { canvas.style.transform = `rotateX(${y}deg) rotateY(${x}deg)`; };
  stage.addEventListener('pointerdown', event => { if (!form.tilt.checked) return; tilt = { x: event.clientX, y: event.clientY }; stage.setPointerCapture(event.pointerId); });
  stage.addEventListener('pointermove', event => { if (!tilt) return; tiltBoard(Math.max(-35, Math.min(35, (event.clientX - tilt.x) / 6)), Math.max(-35, Math.min(35, -(event.clientY - tilt.y) / 6))); });
  const release = () => { if (!tilt) return; tilt = null; canvas.style.transform = form.tilt.checked ? 'rotateX(18deg) rotateY(-14deg)' : ''; };
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
  form.tilt.addEventListener('change', () => { stage.classList.toggle('is-tilted', form.tilt.checked); canvas.style.transform = form.tilt.checked ? 'rotateX(18deg) rotateY(-14deg)' : ''; });

  let resizeTimer = 0;
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 80); }).observe(stage);
  renderLevels(Number(form.levels.value));
  form.radius.closest('label').hidden = form.shape.value !== 'rounded';
  for (const output of form.querySelectorAll('output[data-for]')) output.textContent = formatValue(output.dataset.for, form[output.dataset.for].value);
  root.classList.add('is-ready');
  process();
}

function finishColor(name, maskId, surfaceId, mask = maskColors[maskId], metal = surfaces[surfaceId].color) {
  if (name === 'maskSubstrate') return mask.substrate;
  if (name === 'maskCopper') return mask.copper;
  if (name === 'gold') return metal;
  if (name === 'bare') return bareBoard;
  return mask.silk;
}

function outlinePath(ctx, geometry, k) {
  const { width: w, height: h, shape, radius: r } = geometry;
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(w / 2 * k, h / 2 * k, w / 2 * k, 0, Math.PI * 2);
  else if (shape === 'rounded') ctx.roundRect(0, 0, w * k, h * k, r * k);
  else ctx.rect(0, 0, w * k, h * k);
}

function formatValue(name, value) {
  const number = Number(value);
  if (name === 'zoom') return `${Math.round(number * 100)} %`;
  if (name === 'offsetX' || name === 'offsetY') return `${number > 0 ? '+' : ''}${number} %`;
  if (name === 'brightness' || name === 'contrast') return `${number > 0 ? '+' : ''}${Math.round(number * 100)}`;
  return value;
}

/** Original sample: a sunrise over circuit-like hills, drawn on the fly. */
function sampleArtwork() {
  const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 700;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1100, 700);
  const sun = ctx.createRadialGradient(780, 300, 20, 780, 300, 210);
  sun.addColorStop(0, '#ababab'); sun.addColorStop(0.62, '#a4a4a4'); sun.addColorStop(0.63, '#000'); sun.addColorStop(1, '#000');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, 1100, 700);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 9;
  for (let y = 250; y < 440; y += 26) { ctx.beginPath(); ctx.moveTo(620, y); ctx.lineTo(940, y); ctx.stroke(); }
  ctx.fillStyle = '#6a6a6a';
  ctx.beginPath(); ctx.moveTo(0, 700); ctx.lineTo(0, 470); ctx.lineTo(180, 380); ctx.lineTo(330, 470); ctx.lineTo(520, 330); ctx.lineTo(700, 470); ctx.lineTo(880, 400); ctx.lineTo(1100, 500); ctx.lineTo(1100, 700); ctx.fill();
  ctx.strokeStyle = '#a8a8a8'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const traces = [[60, 700, 60, 600, 140, 540, 260, 540], [200, 700, 200, 630, 380, 630, 440, 570], [560, 700, 560, 610, 640, 560, 760, 560], [900, 700, 900, 620, 1000, 580]];
  for (const t of traces) {
    ctx.beginPath(); ctx.moveTo(t[0], t[1]); for (let i = 2; i < t.length; i += 2) ctx.lineTo(t[i], t[i + 1]); ctx.stroke();
    ctx.fillStyle = '#a8a8a8'; ctx.beginPath(); ctx.arc(t.at(-2), t.at(-1), 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6a6a6a'; ctx.beginPath(); ctx.arc(t.at(-2), t.at(-1), 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#fff'; ctx.font = '700 92px system-ui, -apple-system, Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Hello, PCB.', 70, 170);
  ctx.font = '500 40px system-ui, -apple-system, Segoe UI, Arial, sans-serif'; ctx.fillText('made with PCB Art Studio', 74, 232);
  return canvas;
}
