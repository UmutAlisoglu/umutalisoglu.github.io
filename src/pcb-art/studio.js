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

/** One-click looks: how many tones the image is split into and what each tone becomes. */
const looks = {
  accents: { label: 'Metal accents', hint: 'Mask, copper, metal and print', levels: 4, finishes: ['maskSubstrate', 'maskCopper', 'gold', 'silk'] },
  print: { label: 'White print', hint: 'Crisp print on the mask', levels: 2, finishes: ['maskSubstrate', 'silk'] },
  metal: { label: 'Metal only', hint: 'Shiny metal on the mask', levels: 2, finishes: ['maskSubstrate', 'gold'] },
  shaded: { label: 'Shaded', hint: 'Three soft mask tones', levels: 3, finishes: ['maskSubstrate', 'maskCopper', 'silk'] },
  raw: { label: 'Raw board', hint: 'Mask, bare board, metal', levels: 3, finishes: ['maskSubstrate', 'bare', 'gold'] },
  photo: { label: 'Photo', hint: 'Dotted for photos', levels: 2, finishes: ['maskSubstrate', 'silk'], dither: true },
};
const presetIcons = { card: 'M2 5h20v14H2z', badge: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', coaster: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', bookmark: 'M8 1h8v22H8z', square: 'M3 3h18v18H3z', custom: 'M3 3h18v18H3zM3 9h18M9 3v18' };

const sideIds = ['front', 'back'];
const sideLabels = { front: 'Front', back: 'Back' };
// Per-side settings that live in the form while that side is being edited.
const sideFields = ['fit', 'zoom', 'offsetX', 'offsetY', 'levels', 'brightness', 'contrast', 'invert', 'dither', 'cleanup'];
const ZOOM_MIN = 0.2, ZOOM_MAX = 6, OFFSET_LIMIT = 300;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const root = document.querySelector('[data-pcb-studio]');
if (root) start(root);

function start(root) {
  const $ = selector => root.querySelector(selector);
  const form = $('form'), fileInput = $('#pcb-file'), drop = $('.pcb-drop'), canvas = $('#pcb-preview'), stage = $('.pcb-stage'), levelList = $('.pcb-levels');
  const status = $('#pcb-status'), warnings = $('#pcb-warnings'), download = $('#pcb-download'), savePreview = $('#pcb-save-preview');
  const cropTools = $('.pcb-crop-tools'), subbar = $('.pcb-subbar'), panel = $('#pcb-side-panel');
  const work = document.createElement('canvas'), workContext = work.getContext('2d', { willReadFrequently: true });
  let version = 0;
  const makeSide = (source, name, extra = {}) => ({ source, name, version: ++version, fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0, levels: 4, brightness: 0, contrast: 0, invert: false, dither: false, cleanup: true, finishes: [...defaultLevelFinishes[4]], ...extra });
  const sampleSides = () => ({ front: makeSide(sampleArtwork(), 'Sample business card', { sample: true }), back: makeSide(sampleBack(), 'Sample back side', { sample: true }) });
  let sides = sampleSides(), editing = 'front', show = 'front', mode = 'preview';
  const results = { front: null, back: null };
  let geometryNow = null, timer = 0, cropView = null, cropFrame = 0, detailTouched = false;
  const stageHint = $('.pcb-stage-hint');

  const radio = (name, value, className, content, label) => {
    const wrap = document.createElement('label'); wrap.className = className; wrap.title = label;
    const input = Object.assign(document.createElement('input'), { type: 'radio', name, value });
    input.setAttribute('aria-label', label);
    wrap.append(input, ...content); return wrap;
  };
  const svgIcon = d => { const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); path.setAttribute('d', d); svg.append(path); return svg; };
  const textSpan = (text, tag = 'span') => Object.assign(document.createElement(tag), { textContent: text });
  for (const [id, preset] of [...Object.entries(presets), ['custom', { label: 'Custom' }]]) {
    const size = id === 'custom' ? 'Any size' : preset.shape === 'circle' ? `⌀ ${preset.width} mm` : `${preset.width} × ${preset.height} mm`;
    $('.pcb-presets').append(radio('preset', id, 'pcb-preset', [svgIcon(presetIcons[id]), textSpan(preset.label, 'strong'), textSpan(size, 'small')], `${preset.label}, ${size}`));
  }
  for (const [id, mask] of Object.entries(maskColors)) {
    const dot = textSpan(''); dot.className = 'pcb-swatch'; dot.style.setProperty('--swatch', `rgb(${mask.copper.join(',')})`); dot.style.setProperty('--swatch-dark', `rgb(${mask.substrate.join(',')})`);
    $('.pcb-swatches').append(radio('mask', id, 'pcb-swatch-option', [dot], `${mask.label} solder mask`));
  }
  for (const [id, surface] of Object.entries(surfaces)) {
    const dot = textSpan(''); dot.className = 'pcb-metal-dot'; dot.style.background = `rgb(${surface.color.join(',')})`;
    $('.pcb-metal').append(radio('surface', id, 'pcb-metal-option', [dot, textSpan(surface.label)], surface.label));
  }
  const styleList = $('.pcb-styles');
  for (const [id, look] of Object.entries(looks)) {
    const strip = textSpan(''); strip.className = 'pcb-style-strip'; strip.dataset.look = id;
    styleList.append(radio('look', id, 'pcb-style', [strip, textSpan(look.label, 'strong'), textSpan(look.hint, 'small')], look.label));
  }
  form.zoom.min = ZOOM_MIN; form.zoom.max = ZOOM_MAX;
  for (const name of ['offsetX', 'offsetY']) { form[name].min = -OFFSET_LIMIT; form[name].max = OFFSET_LIMIT; }
  applyPreset('card');
  form.mask.value = 'blue'; form.surface.value = 'hasl'; form.detail.value = '0.1';

  function syncBoardFields() {
    form.radius.closest('label').hidden = form.shape.value !== 'rounded';
    $('[data-custom]').hidden = form.preset.value !== 'custom';
  }
  function applyPreset(id) {
    const preset = presets[id]; if (!preset) { syncBoardFields(); return; }
    form.preset.value = id; form.width.value = preset.width; form.height.value = preset.height; form.shape.value = preset.shape; form.radius.value = preset.radius ?? 3;
  }
  /** Settings shared by both sides of the board. */
  function settings() {
    return {
      width: Number(form.width.value), height: Number(form.height.value), shape: form.shape.value, radius: Number(form.radius.value), holes: form.holes.checked,
      pixelChoice: Number(form.detail.value), mask: form.mask.value, surface: form.surface.value, view: form.view.value,
    };
  }
  const pixelFor = (side, shared) => side.dither ? Math.max(0.2, shared.pixelChoice) : shared.pixelChoice;
  const current = () => sides[editing];

  /** Where the image lands inside a box of the board's proportions (any unit). */
  function imageRect(side, boxW, boxH) {
    const sw = side.source.width, sh = side.source.height;
    const ratio = side.fit === 'cover' ? Math.max(boxW / sw, boxH / sh) : Math.min(boxW / sw, boxH / sh);
    const w = sw * ratio * side.zoom, h = sh * ratio * side.zoom;
    return { x: (boxW - w) / 2 + side.offsetX / 100 * boxW, y: (boxH - h) / 2 + side.offsetY / 100 * boxH, w, h };
  }

  // ---- Form <-> side state ----
  function writeForm() {
    const side = current();
    for (const name of sideFields) {
      const field = form[name]; if (!field) continue;
      if (field.type === 'checkbox') field.checked = side[name]; else field.value = side[name];
    }
    renderLevels();
    updateOutputs();
    $('.pcb-drop-name').textContent = side.name;
    $('[data-drop-title]').textContent = side.source && !side.sample ? 'Replace the image' : 'Choose or drop your image';
    $('[data-side-label]').textContent = sideLabels[editing].toLowerCase();
    $('#pcb-plain').hidden = !side.source;
    for (const control of root.querySelectorAll('[data-mode-switch="crop"], .pcb-crop-tools [data-crop]')) control.disabled = !side.source;
    for (const tab of root.querySelectorAll('[data-side]')) {
      const active = tab.dataset.side === editing;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', `pcb-tab-${editing}`);
    updateSummaries();
  }
  function readField(target) {
    const side = current(), name = target.name;
    if (target.type === 'checkbox') side[name] = target.checked;
    else if (name === 'fit') side[name] = target.value;
    else side[name] = Number(target.value);
    if (name === 'levels' && side.finishes.length !== side.levels) side.finishes = [...defaultLevelFinishes[side.levels]];
    if (name === 'fit') { side.zoom = 1; side.offsetX = 0; side.offsetY = 0; writePlacement(); }
  }
  function writePlacement() {
    const side = current();
    form.zoom.value = side.zoom; form.offsetX.value = side.offsetX; form.offsetY.value = side.offsetY;
    updateOutputs();
  }
  function updateOutputs() {
    for (const output of form.querySelectorAll('output[data-for]')) output.textContent = formatValue(output.dataset.for, current()[output.dataset.for] ?? form[output.dataset.for].value);
  }
  function updateSummaries() {
    for (const id of sideIds) {
      const side = sides[id];
      $(`[data-side-summary="${id}"]`).textContent = side.source ? `${side.levels} tones` : 'Plain';
    }
  }
  function renderLevels() {
    const side = current(), count = side.finishes.length;
    levelList.replaceChildren(...side.finishes.map((finish, index) => {
      const row = document.createElement('label'); row.className = 'pcb-level';
      const tone = Math.round(((index + 0.5) / count) * 255);
      const swatch = document.createElement('span'); swatch.className = 'pcb-level-tone'; swatch.style.background = `rgb(${tone},${tone},${tone})`; swatch.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span'); name.className = 'pcb-level-name'; name.textContent = index === 0 ? 'Darkest' : index === count - 1 ? 'Lightest' : `Tone ${index + 1}`;
      const select = document.createElement('select'); select.dataset.level = index; select.setAttribute('aria-label', `Finish for ${name.textContent.toLowerCase()} areas`);
      for (const id of finishIds) select.append(new Option(finishes[id].label, id));
      select.value = finish; select.disabled = !side.source;
      const chip = document.createElement('span'); chip.className = 'pcb-level-chip'; chip.dataset.finish = finish; chip.setAttribute('aria-hidden', 'true');
      row.append(swatch, name, chip, select);
      return row;
    }));
    paintChips();
  }
  function paintChips() {
    const { mask, surface } = settings();
    for (const chip of levelList.querySelectorAll('.pcb-level-chip')) chip.style.background = `rgb(${finishColor(chip.dataset.finish, mask, surface).join(',')})`;
    for (const strip of styleList.querySelectorAll('.pcb-style-strip')) {
      const colors = looks[strip.dataset.look].finishes.map(name => `rgb(${finishColor(name, mask, surface).join(',')})`);
      strip.style.background = `linear-gradient(90deg, ${colors.map((color, i) => `${color} ${i / colors.length * 100}% ${(i + 1) / colors.length * 100}%`).join(', ')})`;
      strip.classList.toggle('is-dotted', !!looks[strip.dataset.look].dither);
    }
    const side = current(), active = lookOf(side);
    for (const input of styleList.querySelectorAll('input')) { input.checked = input.value === active; input.disabled = !side.source; }
    styleList.dataset.note = active ? '' : 'Custom look: see “Fine-tune this side”';
  }
  /** The look a side currently matches, or '' when its tones were changed by hand. */
  function lookOf(side) {
    return Object.keys(looks).find(id => { const look = looks[id]; return look.levels === side.levels && !!look.dither === side.dither && look.finishes.every((f, i) => side.finishes[i] === f); }) || '';
  }
  function applyLook(id) {
    const look = looks[id], side = current(); if (!look || !side.source) return;
    Object.assign(side, { levels: look.levels, finishes: [...look.finishes], dither: !!look.dither });
    writeForm(); schedule();
  }

  // ---- Image processing ----
  function schedule() { clearTimeout(timer); timer = setTimeout(process, mode === 'crop' ? 350 : 60); }
  function computeSide(id, geometry, shared) {
    const side = sides[id], pixel = pixelFor(side, shared);
    const key = JSON.stringify([geometry, pixel, side.version, side.source ? sideFields.map(name => side[name]) : 0, side.source ? side.finishes : 0]);
    if (results[id]?.key === key) return;
    const gw = Math.ceil(geometry.width / pixel), gh = Math.ceil(geometry.height / pixel);
    let levels, levelFinishes;
    if (!side.source) { levels = new Uint8Array(gw * gh); levelFinishes = ['maskSubstrate']; }
    else {
      work.width = gw; work.height = gh;
      workContext.fillStyle = '#fff'; workContext.fillRect(0, 0, gw, gh);
      const rect = imageRect(side, gw, gh);
      workContext.imageSmoothingQuality = 'high';
      workContext.drawImage(side.source, rect.x, rect.y, rect.w, rect.h);
      const gray = adjustTone(luminance(workContext.getImageData(0, 0, gw, gh).data, gw * gh), { brightness: side.brightness, contrast: side.contrast, invert: side.invert });
      levels = quantize(gray, gw, gh, side.levels, { dither: side.dither });
      if (side.cleanup && !side.dither) { removeSlivers(levels, gw, gh, 2); despeckle(levels, gw, gh, Math.ceil((0.3 / pixel) ** 2)); }
      levelFinishes = side.finishes;
    }
    results[id] = { key, pixel, geometry, plain: !side.source, layers: buildLayers(levels, gw, gh, levelFinishes, geometry, pixel) };
  }
  function process() {
    const shared = settings();
    let geometry;
    try { geometry = boardGeometry(shared); } catch (error) { status.textContent = error.message; download.disabled = true; return; }
    geometryNow = geometry;
    for (const id of sideIds) computeSide(id, geometry, shared);
    draw(); report();
  }

  // ---- Drawing ----
  function draw() {
    if (mode === 'crop') { drawCrop(); return; }
    if (!results.front || !results.back) return;
    const shared = settings(), geometry = results.front.geometry, mask = maskColors[shared.mask];
    const ids = show === 'both' ? sideIds : [show];
    const box = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    // Leave room for the toolbars and the download button so everything fits on one screen.
    const headerTop = parseFloat(root.style.getPropertyValue('--pcb-top')) || 0;
    const maxW = Math.max(240, box.width - 48), maxH = Math.max(240, Math.min(window.innerHeight - headerTop - 430, 700));
    const { width: w, height: h } = geometry;
    const caption = ids.length > 1 ? 26 : 0, gap = ids.length > 1 ? 28 : 0;
    let layout = 'row', scale = Math.min(maxW / w, maxH / h);
    if (ids.length > 1) {
      const row = Math.min((maxW - gap) / (2 * w), (maxH - caption) / h), column = Math.min(maxW / w, (maxH - gap - 2 * caption) / (2 * h));
      layout = row >= column ? 'row' : 'column'; scale = Math.max(row, column);
    }
    const cssW = layout === 'row' ? ids.length * w * scale + gap * (ids.length - 1) : w * scale;
    const cssH = layout === 'row' ? h * scale + caption : 2 * (h * scale + caption) + gap;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d'), k = scale * dpr;
    stage.style.setProperty('--pcb-edge', `rgb(${mask.substrate.map(v => Math.max(0, v - 30)).join(',')})`);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ids.forEach((id, index) => {
      const board = renderBoard(results[id], shared, k);
      const x = layout === 'row' ? index * (w * scale + gap) * dpr : 0, y = layout === 'column' ? index * (h * scale + caption + gap) * dpr : 0;
      ctx.drawImage(board, x, y);
      if (caption) {
        ctx.fillStyle = '#4c5866'; ctx.font = `600 ${12 * dpr}px system-ui, -apple-system, "Segoe UI", Arial, sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(id === 'front' ? 'Front' : 'Back · turned over', x + board.width / 2, y + board.height + 19 * dpr);
      }
    });
    const sideText = ids.length > 1 ? 'front and back' : `${show} side`;
    canvas.setAttribute('aria-label', `Preview of the ${sideText} of a ${geometry.shape === 'circle' ? `${w} mm round` : `${w} by ${h} mm`} board with ${mask.label.toLowerCase()} solder mask`);
  }

  /** Draws one side of the board at `k` canvas pixels per millimetre, like a product photo. */
  function renderBoard(result, s, k) {
    const { geometry, layers, pixel } = result, { width: gw, height: gh, finish } = layers;
    const mask = maskColors[s.mask];
    const layerView = { copper: layers.copper, mask: layers.opening, silk: layers.silk }[s.view];
    const out = document.createElement('canvas'); out.width = Math.round(geometry.width * k); out.height = Math.round(geometry.height * k);
    const ctx = out.getContext('2d'), W = out.width, H = out.height;
    const drawW = gw * pixel * k, drawH = gh * pixel * k, px = k / 10; // px: one tenth of a millimetre on screen

    // Upscales one finish to screen resolution with smooth, crisp edges instead of square pixels.
    const maskFor = test => {
      const small = new ImageData(gw, gh), data = small.data;
      let any = false;
      for (let i = 0; i < finish.length; i++) if (finish[i] !== 255 && test(i)) { data[i * 4 + 3] = 255; any = true; }
      if (!any) return null;
      const tiny = document.createElement('canvas'); tiny.width = gw; tiny.height = gh; tiny.getContext('2d').putImageData(small, 0, 0);
      const big = document.createElement('canvas'); big.width = W; big.height = H;
      const b = big.getContext('2d', { willReadFrequently: true });
      b.imageSmoothingEnabled = true; b.imageSmoothingQuality = 'high'; b.drawImage(tiny, 0, 0, drawW, drawH);
      const image = b.getImageData(0, 0, W, H), alpha = image.data;
      for (let i = 3; i < alpha.length; i += 4) {
        const a = alpha[i]; if (!a || a === 255) continue;
        const t = Math.max(0, Math.min(1, (a - 50) / 155)); alpha[i] = Math.round(t * t * (3 - 2 * t) * 255);
      }
      b.putImageData(image, 0, 0);
      return big;
    };
    const paint = (maskCanvas, fill) => {
      const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
      const l = layer.getContext('2d'); l.drawImage(maskCanvas, 0, 0); l.globalCompositeOperation = 'source-in'; l.fillStyle = fill; l.fillRect(0, 0, W, H);
      return layer;
    };
    const rgb = color => `rgb(${color.map(Math.round).join(',')})`;
    const shade = (color, amount) => color.map(v => Math.max(0, Math.min(255, v + amount)));

    ctx.save(); outlinePath(ctx, geometry, k); ctx.clip();
    if (layerView) {
      ctx.fillStyle = 'rgb(250,250,247)'; ctx.fillRect(0, 0, W, H);
      const ink = maskFor(i => layerView[i]); if (ink) ctx.drawImage(paint(ink, 'rgb(24,32,44)'), 0, 0);
    } else {
      // Lacquer over bare board, with a gentle diagonal falloff.
      const base = ctx.createLinearGradient(0, 0, W, H);
      base.addColorStop(0, rgb(shade(mask.substrate, 14))); base.addColorStop(1, rgb(shade(mask.substrate, -10)));
      ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
      const id = name => finishIds.indexOf(name);
      const bare = maskFor(i => finish[i] === id('bare'));
      if (bare) { const fr4 = ctx.createLinearGradient(0, 0, W, H); fr4.addColorStop(0, '#d8c99a'); fr4.addColorStop(1, '#b9a675'); ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 1.5 * px; ctx.drawImage(paint(bare, fr4), 0, 0); ctx.restore(); }
      const copper = maskFor(i => finish[i] === id('maskCopper'));
      if (copper) {
        const fill = ctx.createLinearGradient(0, 0, W, H); fill.addColorStop(0, rgb(shade(mask.copper, 16))); fill.addColorStop(1, rgb(shade(mask.copper, -8)));
        // Copper under the mask is slightly raised: light from the top left, shadow to the bottom right.
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 1.2 * px; ctx.shadowOffsetX = 0.5 * px; ctx.shadowOffsetY = 0.7 * px; ctx.drawImage(paint(copper, fill), 0, 0); ctx.restore();
      }
      const metal = maskFor(i => finish[i] === id('gold'));
      if (metal) {
        const stops = s.surface === 'enig' ? ['#8f6d27', '#f3d98f', '#b98f3d', '#fbe8b0', '#a07a32', '#e7c773'] : ['#868c94', '#eef1f4', '#a3a9b1', '#ffffff', '#959ba3', '#d9dde2'];
        const sheenMetal = ctx.createLinearGradient(0, 0, W * 0.9, H);
        stops.forEach((color, index) => sheenMetal.addColorStop(index / (stops.length - 1), color));
        // Exposed metal sits in an opening of the lacquer, so the lacquer casts a thin dark lip.
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 1.6 * px; ctx.drawImage(paint(metal, sheenMetal), 0, 0); ctx.restore();
      }
      const silk = maskFor(i => finish[i] === id('silk'));
      if (silk) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 0.9 * px; ctx.shadowOffsetY = 0.45 * px; ctx.drawImage(paint(silk, rgb(mask.silk)), 0, 0); ctx.restore(); }
      // Studio light: a broad reflection across the glossy lacquer and a soft vignette.
      const sheen = ctx.createLinearGradient(0, 0, W * 0.75, H);
      sheen.addColorStop(0, 'rgba(255,255,255,.20)'); sheen.addColorStop(0.28, 'rgba(255,255,255,.06)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,.12)');
      ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * 0.28, H * 0.12, 0, W * 0.28, H * 0.12, Math.max(W, H) * 0.45);
      glow.addColorStop(0, 'rgba(255,255,255,.14)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'destination-out';
    for (const hole of geometry.holes) { ctx.beginPath(); ctx.arc(hole.x * k, (geometry.height - hole.y) * k, hole.d / 2 * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (!layerView) {
      // Milled edge: a bright rim on top and a darker one below.
      ctx.save(); ctx.lineWidth = Math.max(1, px); outlinePath(ctx, geometry, k);
      const rim = ctx.createLinearGradient(0, 0, 0, H); rim.addColorStop(0, 'rgba(255,255,255,.35)'); rim.addColorStop(1, 'rgba(0,0,0,.35)');
      ctx.strokeStyle = rim; ctx.stroke(); ctx.restore();
      for (const hole of geometry.holes) { ctx.save(); ctx.beginPath(); ctx.arc(hole.x * k, (geometry.height - hole.y) * k, hole.d / 2 * k, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = px * 2; ctx.stroke(); ctx.restore(); }
    }
    return out;
  }

  /** Crop view: the full image, the board cut-out on top, and everything outside dimmed. */
  function drawCrop() {
    const geometry = geometryNow; if (!geometry) return;
    const side = current(), shared = settings(), mask = maskColors[shared.mask];
    const box = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const { width: w, height: h } = geometry, accent = getComputedStyle(root).getPropertyValue('--pcb-accent').trim() || '#3159d9';
    const cssW = Math.max(260, box.width - 32), maxH = Math.max(280, Math.min(window.innerHeight * 0.7, 760) - 32);
    const scale = Math.min(cssW * 0.76 / w, (maxH - 40) * 0.82 / h);
    // Leave room around the board so the parts of the image outside it stay visible.
    const cssH = Math.min(maxH, Math.max(240, h * scale / 0.7 + 40));
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    const bw = w * scale, bh = h * scale, bx = (cssW - bw) / 2, by = (cssH - bh) / 2 + 10;
    cropView = { bx, by, bw, bh };
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#e9ecf1'; ctx.beginPath(); ctx.roundRect(0, 0, cssW, cssH, 14); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, cssW, cssH, 14); ctx.clip();
    if (side.source) {
      const r = imageRect(side, bw, bh);
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 0.32; ctx.drawImage(side.source, bx + r.x, by + r.y, r.w, r.h); ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(bx, by); outlinePath(ctx, geometry, scale); ctx.clip();
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, bw, bh);
      ctx.drawImage(side.source, r.x, r.y, r.w, r.h);
      // Rule-of-thirds guides help to place a logo or a face.
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      for (const f of [1 / 3, 2 / 3]) { ctx.beginPath(); ctx.moveTo(bw * f, 0); ctx.lineTo(bw * f, bh); ctx.moveTo(0, bh * f); ctx.lineTo(bw, bh * f); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(32,44,59,.35)'; ctx.lineDashOffset = 4;
      for (const f of [1 / 3, 2 / 3]) { ctx.beginPath(); ctx.moveTo(bw * f, 0); ctx.lineTo(bw * f, bh); ctx.moveTo(0, bh * f); ctx.lineTo(bw, bh * f); ctx.stroke(); }
      ctx.restore();
    } else {
      ctx.save(); ctx.translate(bx, by); outlinePath(ctx, geometry, scale); ctx.fillStyle = `rgb(${mask.substrate.join(',')})`; ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '600 14px system-ui, -apple-system, "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('This side is plain. Choose an image to crop it here.', bx + bw / 2, by + bh / 2 + 5);
    }
    ctx.restore();
    // Board edge, hole positions and the size label.
    ctx.save(); ctx.translate(bx, by); ctx.setLineDash([]);
    outlinePath(ctx, geometry, scale); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
    outlinePath(ctx, geometry, scale); ctx.lineWidth = 2; ctx.strokeStyle = accent; ctx.stroke();
    for (const hole of geometry.holes) { ctx.beginPath(); ctx.arc(hole.x * scale, (h - hole.y) * scale, hole.d / 2 * scale, 0, Math.PI * 2); ctx.fillStyle = 'rgba(233,236,241,.9)'; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
    const label = `${sideLabels[editing]} · ${geometry.shape === 'circle' ? `⌀ ${w} mm` : `${w} × ${h} mm`}`;
    ctx.font = '700 12px system-ui, -apple-system, "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
    const lw = ctx.measureText(label).width + 20, lx = bx + bw / 2 - lw / 2, ly = by - 30;
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(lx, ly, lw, 22, 11); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, bx + bw / 2, ly + 15);
    canvas.setAttribute('aria-label', `Crop view: ${side.source ? 'drag to move the image, scroll or pinch to zoom, or use the arrow keys and plus or minus' : 'this side is plain'}`);
  }
  const requestCrop = () => { if (cropFrame) return; cropFrame = requestAnimationFrame(() => { cropFrame = 0; drawCrop(); }); };
  function placementChanged() { writePlacement(); requestCrop(); schedule(); }
  function zoomAt(fx, fy, factor) {
    const side = current(); if (!side.source) return;
    const zoom = clamp(side.zoom * factor, ZOOM_MIN, ZOOM_MAX), f = zoom / side.zoom;
    const cx = 0.5 + side.offsetX / 100, cy = 0.5 + side.offsetY / 100;
    side.offsetX = clamp(((fx + (cx - fx) * f) - 0.5) * 100, -OFFSET_LIMIT, OFFSET_LIMIT);
    side.offsetY = clamp(((fy + (cy - fy) * f) - 0.5) * 100, -OFFSET_LIMIT, OFFSET_LIMIT);
    side.zoom = zoom;
  }
  /** Converts a pointer position to a fraction of the board (0..1 inside it). */
  function boardPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return [(clientX - rect.left - cropView.bx) / cropView.bw, (clientY - rect.top - cropView.by) / cropView.bh];
  }
  function moveBy(dxFraction, dyFraction) {
    const side = current();
    side.offsetX = clamp(side.offsetX + dxFraction * 100, -OFFSET_LIMIT, OFFSET_LIMIT);
    side.offsetY = clamp(side.offsetY + dyFraction * 100, -OFFSET_LIMIT, OFFSET_LIMIT);
  }

  // ---- Modes and sides ----
  function updateStageHint() { stageHint.hidden = mode !== 'preview' || !sides[show === 'both' ? 'front' : show].sample; }
  function setMode(next) {
    if (next === 'crop' && !current().source) return;
    mode = next;
    for (const button of root.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    cropTools.hidden = mode !== 'crop'; subbar.hidden = mode === 'crop';
    stage.classList.toggle('is-cropping', mode === 'crop');
    if (mode === 'crop') { canvas.style.transform = ''; stage.classList.remove('is-tilted'); canvas.tabIndex = 0; }
    else { canvas.removeAttribute('tabindex'); stage.classList.toggle('is-tilted', form.tilt.checked); canvas.style.transform = form.tilt.checked ? 'rotateX(18deg) rotateY(-14deg)' : ''; }
    updateStageHint();
    if (mode === 'preview') process(); else draw();
  }
  function setShow(next) {
    if (next === show) return;
    const previous = show; show = next;
    for (const button of root.querySelectorAll('[data-show]')) button.setAttribute('aria-pressed', String(button.dataset.show === show));
    updateStageHint();
    if (mode !== 'preview' || previous === 'both' || next === 'both' || reducedMotion() || !canvas.animate) { draw(); return; }
    // Turn the board over: rotate to edge-on, swap the side, rotate back.
    const base = canvas.style.transform || '';
    const out = canvas.animate([{ transform: `${base} rotateY(0deg)` }, { transform: `${base} rotateY(90deg)` }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
    out.finished.then(() => { draw(); canvas.animate([{ transform: `${base} rotateY(-90deg)` }, { transform: `${base} rotateY(0deg)` }], { duration: 190, easing: 'ease-out' }); out.cancel(); }).catch(() => draw());
  }
  function setEditing(id) {
    if (id !== editing) { editing = id; writeForm(); }
    if (show !== 'both') setShow(id);
    if (mode === 'crop') { if (current().source) draw(); else setMode('preview'); }
  }

  // ---- Report and files ----
  function report() {
    const geometry = geometryNow, shared = settings(), notes = [];
    const twoSided = !!sides.back.source && !!sides.front.source;
    const usedOn = id => new Set([...results[id].layers.finish].filter(v => v !== 255).map(v => finishIds[v]));
    let anyGold = false;
    for (const id of sideIds) {
      const side = sides[id], result = results[id]; if (!side.source) continue;
      const prefix = twoSided || id === 'back' ? `${sideLabels[id]}: ` : '';
      const used = usedOn(id);
      if (used.has('gold')) anyGold = true;
      if (side.dither && shared.pixelChoice < 0.2) notes.push(`${prefix}Dithering uses 0.2 mm dots, the smallest size most makers print reliably.`);
      if (!side.dither && result.pixel < 0.15 && !side.cleanup) notes.push(`${prefix}Turn on “Clean up specks” so tiny details are not lost in production.`);
      if (!used.has('silk') && side.finishes.includes('silk')) notes.push(`${prefix}No silkscreen areas left with the current tones.`);
      const rect = imageRect(side, geometry.width, geometry.height), perMm = side.source.width / rect.w;
      if (perMm < 0.5 / result.pixel) notes.push(`${prefix}The image is enlarged a lot (${perMm.toFixed(1)} pixels per mm), so edges may look soft. A larger image gives crisper lines.`);
    }
    if (anyGold) notes.push({ info: true, text: `Order with ${surfaces[shared.surface].label} as surface finish to get the metal look.` });
    if (shared.holes && !geometry.holes.length) notes.push(geometry.shape === 'circle' ? 'Mounting holes are only added to rectangular boards.' : 'Mounting holes need a board of at least 20 × 20 mm.');
    // A dark logo on white paper turns most of the board into print or metal; offer the one-click fix.
    let swapped = false;
    for (const id of sideIds) {
      const side = sides[id], result = results[id]; if (!side.source || side.sample) continue;
      const label = twoSided || id === 'back' ? `${sideLabels[id]}: ` : '';
      if (side.autoSwapped && side.invert) notes.push({ text: `${label}Light and dark were swapped so the board keeps its ${maskColors[shared.mask].label.toLowerCase()} colour.`, action: 'Undo', run: () => { Object.assign(sides[id], { invert: false, autoSwapped: false }); if (editing === id) form.invert.checked = false; schedule(); } });
      if (side.invert) continue;
      const finish = result.layers.finish, lightest = side.finishes.length - 1, name = side.finishes[lightest];
      if (name !== 'silk' && name !== 'gold') continue;
      // Light background = most pixels along the board edge are the lightest tone.
      const gw = result.layers.width, gh = result.layers.height, lightId = finishIds.indexOf(name);
      let inside = 0, light = 0, edge = 0, edgeLight = 0;
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const v = finish[y * gw + x]; if (v === 255) continue;
        inside++; if (v === lightId) light++;
        const onEdge = x === 0 || y === 0 || x === gw - 1 || y === gh - 1 || finish[y * gw + x - 1] === 255 || finish[y * gw + x + 1] === 255 || finish[(y - 1) * gw + x] === 255 || finish[(y + 1) * gw + x] === 255;
        if (onEdge) { edge++; if (v === lightId) edgeLight++; }
      }
      const mostlyLight = inside && light / inside > 0.4 && edge && edgeLight / edge > 0.7;
      // On a freshly loaded image, apply the fix straight away; after that only suggest it.
      if (mostlyLight && side.autoCheck) { Object.assign(side, { invert: true, autoSwapped: true, autoCheck: false }); if (editing === id) form.invert.checked = true; swapped = true; continue; }
      side.autoCheck = false;
      if (mostlyLight) notes.push({ text: `${label}The light background becomes ${name === 'silk' ? 'white print' : 'metal'}. Swapping light and dark keeps the board ${maskColors[shared.mask].label.toLowerCase()}.`, action: 'Swap light and dark', run: () => { sides[id].invert = true; if (editing === id) form.invert.checked = true; schedule(); } });
    }
    warnings.replaceChildren(...notes.map(note => {
      const item = document.createElement('li');
      if (typeof note === 'string') { item.textContent = note; return item; }
      if (note.info) item.className = 'is-info';
      if (!note.action) { item.textContent = note.text; return item; }
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'pcb-link', textContent: note.action });
      button.addEventListener('click', note.run);
      item.append(note.text, ' ', button); return item;
    }));
    updateStageHint();
    if (swapped) { process(); return; }
    const shapeText = geometry.shape === 'circle' ? `⌀ ${geometry.width} mm` : `${geometry.width} × ${geometry.height} mm`;
    const sideText = id => sides[id].source ? `${sides[id].levels} tones` : 'plain';
    status.textContent = mode === 'crop'
      ? 'Drag to move · scroll or pinch to zoom · arrow keys and + / − work too'
      : `${shapeText} · ${results.front.pixel} mm detail · front ${sideText('front')} · back ${sideText('back')}`;
    for (const label of root.querySelectorAll('[data-board-size]')) label.textContent = shapeText;
    updateSummaries();
    download.disabled = false;
  }

  function buildZip() {
    const geometry = geometryNow, shared = settings(), front = results.front, back = results.back.plain ? null : results.back;
    const used = new Set();
    for (const result of [front, back]) if (result) for (const v of result.layers.finish) if (v !== 255) used.add(finishIds[v]);
    const notes = orderNotes({ geometry, pixel: front.pixel, maskColor: maskColors[shared.mask].label, surface: surfaces[shared.surface].label, usesGold: used.has('gold'), usesBare: used.has('bare'), backPixel: back ? back.pixel : null, frontArt: !front.plain });
    const { files, stats } = fabricationFiles(front.layers, geometry, front.pixel, { name: 'pcb-art', notes, back: back && { layers: back.layers, pixel: back.pixel } });
    const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 9 });
    return { zipped, stats };
  }
  function save(blob, name) {
    const url = URL.createObjectURL(blob), link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function baseName() {
    const named = sides.front.source ? sides.front : sides.back;
    const safe = named.name.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'art';
    return `pcb-art-${safe}-${geometryNow.width}x${geometryNow.height}mm`;
  }

  async function loadFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml|bmp)$/.test(file.type)) { status.textContent = 'Please choose a PNG, JPG, WebP, GIF or SVG image.'; return; }
    const url = URL.createObjectURL(file), image = new Image();
    image.decoding = 'async'; image.src = url;
    try {
      await image.decode();
      const naturalW = image.naturalWidth || 1000, naturalH = image.naturalHeight || 1000;
      const copy = document.createElement('canvas'), fit = Math.min(1, 3000 / Math.max(naturalW, naturalH));
      copy.width = Math.max(1, Math.round(naturalW * fit)); copy.height = Math.max(1, Math.round(naturalH * fit));
      copy.getContext('2d').drawImage(image, 0, 0, copy.width, copy.height);
      // A new picture starts centred and filling the board; tone choices of this side are kept.
      Object.assign(current(), { source: copy, name: file.name, sample: false, autoCheck: true, autoSwapped: false, invert: false, version: ++version, fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0 });
      // A first own image usually needs less fine detail than the sample card.
      if (!detailTouched) form.detail.value = '0.15';
      if (editing === 'front' && sides.back.sample) Object.assign(sides.back, { source: null, name: 'Plain, no artwork', sample: false, version: ++version });
      writeForm();
      if (show !== 'both') setShow(editing);
      setMode('crop');
      schedule();
    } catch { status.textContent = 'This image could not be opened. Try another file.'; }
    finally { URL.revokeObjectURL(url); }
  }
  function rotateSource() {
    const side = current(); if (!side.source) return;
    const src = side.source, turned = document.createElement('canvas'); turned.width = src.height; turned.height = src.width;
    const t = turned.getContext('2d'); t.translate(turned.width, 0); t.rotate(Math.PI / 2); t.drawImage(src, 0, 0);
    // The image turns around its own centre, so its position on the board stays the same.
    Object.assign(side, { source: turned, version: ++version });
    placementChanged();
  }

  // ---- Events ----
  form.addEventListener('input', event => {
    const target = event.target;
    if (target.name === 'look') { applyLook(target.value); return; }
    if (target.name === 'preset') applyPreset(target.value);
    else if (['width', 'height', 'shape', 'radius'].includes(target.name)) form.preset.value = 'custom';
    if (target.name === 'detail') detailTouched = true;
    if (target.name === 'invert') Object.assign(current(), { autoSwapped: false, autoCheck: false });
    if (target.name === 'invert' || target.name === 'levels' || target.name === 'dither' || target.dataset.level) paintChips();
    if (target.dataset.level) { current().finishes[target.dataset.level] = target.value; target.parentElement.querySelector('.pcb-level-chip').dataset.finish = target.value; paintChips(); }
    if (sideFields.includes(target.name)) readField(target);
    if (target.name === 'levels') renderLevels();
    if (target.name === 'mask' || target.name === 'surface') paintChips();
    if (target.name === 'tilt') return;
    syncBoardFields();
    updateOutputs();
    if (['zoom', 'offsetX', 'offsetY', 'fit'].includes(target.name) && mode === 'crop') requestCrop();
    if (target.name === 'view' || target.name === 'mask' || target.name === 'surface') draw(); else schedule();
  });
  form.addEventListener('submit', event => event.preventDefault());
  fileInput.addEventListener('change', () => { loadFile(fileInput.files[0]); fileInput.value = ''; });
  $('#pcb-sample').addEventListener('click', () => {
    sides = sampleSides();
    applyPreset('card'); form.mask.value = 'blue'; form.surface.value = 'hasl'; form.detail.value = '0.1';
    detailTouched = false; syncBoardFields();
    writeForm(); setMode('preview');
  });
  $('#pcb-plain').addEventListener('click', () => {
    Object.assign(current(), { source: null, name: 'Plain, no artwork', sample: false, version: ++version });
    writeForm(); setMode('preview');
  });
  const tabs = [...root.querySelectorAll('[data-side]')];
  for (const tab of tabs) {
    tab.addEventListener('click', () => setEditing(tab.dataset.side));
    tab.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = tabs[(tabs.indexOf(tab) + 1) % tabs.length]; next.focus(); setEditing(next.dataset.side);
    });
  }
  for (const button of root.querySelectorAll('[data-show]')) button.addEventListener('click', () => {
    const next = button.dataset.show;
    if (next !== 'both') { editing = next; writeForm(); }
    if (mode === 'crop' && next !== 'both' && !current().source) setMode('preview');
    setShow(next);
    if (mode === 'crop') draw();
  });
  for (const button of root.querySelectorAll('[data-mode]')) button.addEventListener('click', () => setMode(button.dataset.mode));
  for (const button of root.querySelectorAll('[data-mode-switch]')) button.addEventListener('click', () => {
    setMode(button.dataset.modeSwitch);
    if (button.dataset.modeSwitch === 'crop') stage.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
  cropTools.addEventListener('click', event => {
    const action = event.target.closest('[data-crop]')?.dataset.crop; if (!action) return;
    const side = current(); if (!side.source) return;
    if (action === 'fill' || action === 'fit') Object.assign(side, { fit: action === 'fill' ? 'cover' : 'contain', zoom: 1, offsetX: 0, offsetY: 0 });
    else if (action === 'center') Object.assign(side, { offsetX: 0, offsetY: 0 });
    else if (action === 'rotate') { rotateSource(); return; }
    else zoomAt(0.5, 0.5, action === 'in' ? 1.2 : 1 / 1.2);
    placementChanged();
  });

  stageHint.addEventListener('click', () => { if (show !== 'both' && show !== editing) setEditing(show); fileInput.click(); });
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('is-over'); });
  for (const type of ['dragleave', 'drop']) drop.addEventListener(type, () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', event => { event.preventDefault(); loadFile(event.dataTransfer.files[0]); });
  // Dropping an image straight onto the board also works, for the side being edited.
  stage.addEventListener('dragover', event => { if ([...(event.dataTransfer?.types || [])].includes('Files')) { event.preventDefault(); stage.classList.add('is-over'); } });
  stage.addEventListener('dragleave', event => { if (!stage.contains(event.relatedTarget)) stage.classList.remove('is-over'); });
  stage.addEventListener('drop', event => { event.preventDefault(); stage.classList.remove('is-over'); loadFile(event.dataTransfer.files[0]); });
  window.addEventListener('paste', event => { const item = [...(event.clipboardData?.items || [])].find(entry => entry.type.startsWith('image/')); if (item) loadFile(item.getAsFile()); });
  download.addEventListener('click', () => {
    if (!results.front) return;
    const { zipped } = buildZip();
    save(new Blob([zipped], { type: 'application/zip' }), `${baseName()}-gerbers.zip`);
    status.textContent = `Gerber ZIP ready · ${(zipped.length / 1024).toFixed(zipped.length > 102400 ? 0 : 1)} KB. Upload it unchanged to your PCB maker.`;
  });
  const downloadMini = $('[data-download-mini]');
  downloadMini.addEventListener('click', () => download.click());
  $('[data-goto-preview]').addEventListener('click', () => stage.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }));
  new MutationObserver(() => { downloadMini.disabled = download.disabled; }).observe(download, { attributes: true, attributeFilter: ['disabled'] });
  savePreview.addEventListener('click', () => canvas.toBlob(blob => blob && save(blob, `${baseName()}-${mode === 'crop' ? 'crop' : show}.png`), 'image/png'));

  // Pointer input: crop (drag, pinch, wheel) or a gentle 3D tilt in the preview.
  const pointers = new Map();
  let tilt = null, pinch = null;
  const tiltBoard = (x, y) => { canvas.style.transform = `rotateX(${y}deg) rotateY(${x}deg)`; };
  stage.addEventListener('pointerdown', event => {
    if (mode === 'crop') {
      if (!current().source || !cropView) return;
      event.preventDefault(); stage.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.classList.add('is-dragging');
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      return;
    }
    if (!form.tilt.checked) return;
    tilt = { x: event.clientX, y: event.clientY }; stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (mode === 'crop') {
      const last = pointers.get(event.pointerId); if (!last) return;
      const point = { x: event.clientX, y: event.clientY };
      pointers.set(event.pointerId, point);
      if (pointers.size === 1) moveBy((point.x - last.x) / cropView.bw, (point.y - last.y) / cropView.bh);
      else if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        moveBy((mx - pinch.x) / cropView.bw, (my - pinch.y) / cropView.bh);
        const [fx, fy] = boardPoint(mx, my); zoomAt(fx, fy, distance / (pinch.distance || distance));
        pinch = { distance, x: mx, y: my };
      }
      placementChanged();
      return;
    }
    if (!tilt) return;
    tiltBoard(Math.max(-35, Math.min(35, (event.clientX - tilt.x) / 6)), Math.max(-35, Math.min(35, -(event.clientY - tilt.y) / 6)));
  });
  const release = event => {
    if (pointers.delete(event.pointerId)) { if (pointers.size < 2) pinch = null; if (!pointers.size) stage.classList.remove('is-dragging'); return; }
    if (!tilt) return; tilt = null; canvas.style.transform = form.tilt.checked ? 'rotateX(18deg) rotateY(-14deg)' : '';
  };
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
  stage.addEventListener('wheel', event => {
    if (mode !== 'crop' || !current().source || !cropView) return;
    event.preventDefault();
    const [fx, fy] = boardPoint(event.clientX, event.clientY);
    zoomAt(fx, fy, Math.exp(-clamp(event.deltaY, -120, 120) * 0.0018));
    placementChanged();
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    if (mode !== 'crop' || !current().source) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) moveBy(...moves[event.key]);
    else if (event.key === '+' || event.key === '=') zoomAt(0.5, 0.5, 1.1);
    else if (event.key === '-') zoomAt(0.5, 0.5, 1 / 1.1);
    else if (event.key === 'Enter' || event.key === 'Escape') { setMode('preview'); return; }
    else return;
    event.preventDefault(); placementChanged();
  });
  form.tilt.addEventListener('change', () => { stage.classList.toggle('is-tilted', form.tilt.checked); canvas.style.transform = form.tilt.checked ? 'rotateX(18deg) rotateY(-14deg)' : ''; });

  // Sticky parts of the studio sit just below the site's sticky header.
  const trackHeader = () => { const band = document.querySelector('.site-header-band'); if (!band) return false; new ResizeObserver(() => root.style.setProperty('--pcb-top', `${band.offsetHeight}px`)).observe(band); return true; };
  if (!trackHeader()) { const watch = new MutationObserver(() => { if (trackHeader()) watch.disconnect(); }); watch.observe(document.body, { childList: true, subtree: true }); }
  let resizeTimer = 0;
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 80); }).observe(stage);
  syncBoardFields();
  writeForm();
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
  if (name === 'offsetX' || name === 'offsetY') { const rounded = Math.round(number); return `${rounded > 0 ? '+' : ''}${rounded} %`; }
  if (name === 'brightness' || name === 'contrast') return `${number > 0 ? '+' : ''}${Math.round(number * 100)}`;
  return value;
}

/**
 * Original sample: a business card in the alisoglu.com style, drawn on the fly at 20 px per mm.
 * Grey values pick the finish: 0 mask over board, 80 mask over copper, 175 exposed metal, 255 silkscreen.
 */
function sampleArtwork() {
  const mm = 20, canvas = document.createElement('canvas'); canvas.width = 85 * mm; canvas.height = 55 * mm;
  const ctx = canvas.getContext('2d');
  const BOARD = '#000', COPPER = '#505050', METAL = '#afafaf', SILK = '#fff';
  const sans = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif', mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.scale(mm, mm); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = BOARD; ctx.fillRect(0, 0, 85, 55);
  const path = (points, width, color) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(...points[0]); for (const point of points.slice(1)) ctx.lineTo(...point); ctx.stroke(); };
  const via = (x, y) => { ctx.fillStyle = METAL; ctx.beginPath(); ctx.arc(x, y, 0.95, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = BOARD; ctx.beginPath(); ctx.arc(x, y, 0.42, 0, Math.PI * 2); ctx.fill(); };
  const text = (value, x, y, font, color, spacing = 0) => { ctx.font = font; ctx.fillStyle = color; ctx.letterSpacing = `${spacing}px`; ctx.fillText(value, x, y); ctx.letterSpacing = '0px'; return ctx.measureText(value).width; };

  // Circuit art under the mask: a chip with straight, staggered traces ending in exposed vias.
  const chip = { x: 61, y: 22, size: 8 }, pins = [-2.4, -0.8, 0.8, 2.4];
  const cx = chip.x + chip.size / 2, cy = chip.y + chip.size / 2;
  pins.forEach((offset, i) => {
    const near = i % 2 === 0;
    const ends = [
      [[chip.x + chip.size + 1.4, cy + offset], [near ? 74 : 77, cy + offset]],
      [[chip.x - 1.4, cy + offset], [near ? 53 : 50, cy + offset]],
      [[cx + offset, chip.y - 1.4], [cx + offset, near ? 17 : 14]],
      [[cx + offset, chip.y + chip.size + 1.4], [cx + offset, near ? 35 : 38]],
    ];
    for (const [start, end] of ends) { path([start, end], 0.45, COPPER); via(...end); }
  });
  // Two long buses that tie the chip to the wordmark and the contact block.
  path([[53, cy - 2.4], [50, cy - 5.4], [20.7, cy - 5.4]], 0.45, COPPER);
  path([[50, cy + 2.4], [50, 40], [47.5, 42.5], [6, 42.5]], 0.45, COPPER);
  ctx.fillStyle = METAL;
  for (const offset of pins) {
    ctx.fillRect(chip.x + chip.size + 0.3, cy + offset - 0.3, 1.4, 0.6); ctx.fillRect(chip.x - 1.7, cy + offset - 0.3, 1.4, 0.6);
    ctx.fillRect(cx + offset - 0.3, chip.y - 1.7, 0.6, 1.4); ctx.fillRect(cx + offset - 0.3, chip.y + chip.size + 0.3, 0.6, 1.4);
  }
  ctx.beginPath(); ctx.roundRect(chip.x, chip.y, chip.size, chip.size, 0.8); ctx.fill();
  ctx.fillStyle = BOARD; ctx.beginPath(); ctx.arc(chip.x + 1.4, chip.y + 1.4, 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.font = `700 3.6px ${sans}`; ctx.textAlign = 'center'; ctx.fillText('u.', cx, cy + 1.3); ctx.textAlign = 'left';

  // Frame, monogram and wordmark.
  ctx.strokeStyle = METAL; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.roundRect(2.4, 2.4, 80.2, 50.2, 1.6); ctx.stroke();
  ctx.fillStyle = METAL; ctx.beginPath(); ctx.roundRect(6, 6, 11, 11, 2.4); ctx.fill();
  ctx.fillStyle = BOARD; ctx.font = `700 9px ${sans}`; ctx.textAlign = 'center'; ctx.fillText('u.', 11.6, 14.2); ctx.textAlign = 'left';
  const name = text('umut alisoglu', 20.5, 12.8, `700 5.8px ${sans}`, SILK);
  text('.', 20.5 + name + 0.2, 12.8, `700 5.8px ${sans}`, METAL);
  text('SOFTWARE & PROJECTS', 20.7, 17, `700 2.2px ${sans}`, SILK, 0.3);

  // Contact block.
  const rows = [['E', 'umut@alisoglu.com'], ['W', 'alisoglu.com'], ['G', 'github.com/UmutAlisoglu']];
  rows.forEach(([label, value], i) => { text(label, 6.2, 27.5 + i * 4.4, `700 2.7px ${mono}`, METAL); text(value, 10.4, 27.5 + i * 4.4, `600 2.7px ${mono}`, SILK); });

  // Footer.
  text('FILEFORGE  •  REPODOCK  •  PCB ART STUDIO', 6, 49.4, `700 1.9px ${sans}`, SILK, 0.2);
  return canvas;
}

/** Original sample back: a centred monogram plate with traces fanning out to both ends. */
function sampleBack() {
  const mm = 20, canvas = document.createElement('canvas'); canvas.width = 85 * mm; canvas.height = 55 * mm;
  const ctx = canvas.getContext('2d');
  const BOARD = '#000', COPPER = '#505050', METAL = '#afafaf', SILK = '#fff';
  const sans = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
  ctx.scale(mm, mm); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = BOARD; ctx.fillRect(0, 0, 85, 55);
  const cx = 42.5, cy = 23;
  const via = (x, y) => { ctx.fillStyle = METAL; ctx.beginPath(); ctx.arc(x, y, 0.95, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = BOARD; ctx.beginPath(); ctx.arc(x, y, 0.42, 0, Math.PI * 2); ctx.fill(); };
  ctx.strokeStyle = COPPER; ctx.lineWidth = 0.45;
  for (let i = 0; i < 6; i++) {
    const y = cy - 7.5 + i * 3, out = i < 3 ? -(3 - i) * 1.6 : (i - 2) * 1.6, bend = 4 + Math.abs(i - 2.5) * 2.4, end = 9 + (i % 2) * 3;
    for (const dir of [-1, 1]) {
      const x0 = cx + dir * 12.6, x1 = x0 + dir * bend, x2 = x1 + dir * Math.abs(out), xe = dir < 0 ? end : 85 - end;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.lineTo(x2, y + out); ctx.lineTo(xe, y + out); ctx.stroke();
      via(xe, y + out);
    }
  }
  ctx.strokeStyle = METAL; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.roundRect(cx - 12.6, cy - 12.6, 25.2, 25.2, 5.6); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(2.4, 2.4, 80.2, 50.2, 1.6); ctx.stroke();
  ctx.fillStyle = METAL; ctx.beginPath(); ctx.roundRect(cx - 10, cy - 10, 20, 20, 4.2); ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = BOARD; ctx.font = `700 15px ${sans}`; ctx.fillText('u.', cx + 0.4, cy + 5);
  ctx.fillStyle = SILK; ctx.font = `700 4px ${sans}`; ctx.fillText('alisoglu.com', cx, 44);
  ctx.font = `700 1.8px ${sans}`; ctx.letterSpacing = '0.3px'; ctx.fillText('MADE WITH PCB ART STUDIO', cx, 49.2); ctx.letterSpacing = '0px';
  return canvas;
}
