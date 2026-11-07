import { zipSync, strToU8 } from 'fflate';
// Bundled fonts: text and the samples come out the same on every computer, so the Gerber files
// match the preview whatever fonts the visitor has installed.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/lora/600.css';
import '@fontsource/jetbrains-mono/700.css';
import { finishes, finishIds, defaultLevelFinishes, boardGeometry, luminance, adjustTone, quantize, removeSlivers, despeckle, buildLayers, fabricationFiles, orderNotes, checkRules, RULES, COPPER_EDGE_CLEARANCE } from './core.js';

const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
const fontFamilies = {
  sans: { label: 'Sans bold', css: SANS, weight: 700 },
  heavy: { label: 'Sans black', css: SANS, weight: 800 },
  light: { label: 'Sans regular', css: SANS, weight: 400 },
  serif: { label: 'Serif', css: 'Lora, Georgia, serif', weight: 600 },
  mono: { label: 'Mono', css: '"JetBrains Mono", Consolas, monospace', weight: 700 },
};
const textFinishes = { silk: 'Print', gold: 'Metal', maskCopper: 'Copper under mask', bare: 'Bare board', maskSubstrate: 'Cut out (plain mask)' };
const textShapes = { straight: 'Straight', up: 'Turned 90°', arcTop: 'Arc along the top', arcBottom: 'Arc along the bottom' };
const textAligns = { left: 'Left', center: 'Centre', right: 'Right' };
const TEXT_MIN = 1.5; // mm font size: about 1 mm tall capitals, the smallest print makers keep readable
const fontsReady = () => Promise.race([
  Promise.all(['400', '600', '700', '800'].map(w => document.fonts.load(`${w} 20px Inter`)).concat(document.fonts.load('600 20px Lora'), document.fonts.load('700 20px "JetBrains Mono"'))),
  new Promise(resolve => setTimeout(resolve, 2500)),
]).catch(() => {});

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

// Icons for the sample card, drawn in a 24 × 24 box. The GitHub mark is GitHub's own logo
// (Octicons, MIT licence), used here only to point to a GitHub profile.
const GITHUB_MARK = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';
const sideIds = ['front', 'back'];
const sideLabels = { front: 'Front', back: 'Back' };
// Per-side settings that live in the form while that side is being edited.
const sideFields = ['fit', 'zoom', 'offsetX', 'offsetY', 'levels', 'brightness', 'contrast', 'invert', 'dither', 'cleanup'];
const hasArt = side => !!side.source || side.texts.some(item => item.value.trim());
let textId = 0;
const newText = (extra = {}) => ({ id: ++textId, value: 'Your text', size: 4, finish: 'silk', font: 'sans', shape: 'straight', align: 'center', x: 50, y: 50, ...extra });
const ZOOM_MIN = 0.2, ZOOM_MAX = 6, OFFSET_LIMIT = 300;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));


function start(root) {
  const $ = selector => root.querySelector(selector);
  const form = $('form'), fileInput = $('#pcb-file'), drop = $('.pcb-drop'), canvas = $('#pcb-preview'), stage = $('.pcb-stage'), levelList = $('.pcb-levels');
  const status = $('#pcb-status'), warnings = $('#pcb-warnings'), download = $('#pcb-download'), savePreview = $('#pcb-save-preview');
  const cropTools = $('.pcb-crop-tools'), subbar = $('.pcb-subbar'), panel = $('#pcb-side-panel');
  const work = document.createElement('canvas'), workContext = work.getContext('2d', { willReadFrequently: true });
  let version = 0;
  const makeSide = (source, name, extra = {}) => ({ source, name, version: ++version, fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0, levels: 4, brightness: 0, contrast: 0, invert: false, dither: false, cleanup: true, autoLevels: true, finishes: [...defaultLevelFinishes[4]], texts: [], ...extra });
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
    renderTexts();
    updateOutputs();
    $('.pcb-drop-name').textContent = side.name;
    $('[data-drop-title]').textContent = side.source && !side.sample ? 'Replace the image' : 'Choose or drop your image';
    $('[data-side-label]').textContent = sideLabels[editing].toLowerCase();
    $('#pcb-plain').hidden = !hasArt(side);
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
      const words = side.texts.filter(item => item.value.trim()).length;
      $(`[data-side-summary="${id}"]`).textContent = side.source ? `${side.template ? 'Template' : `${side.levels} tones`}${words ? ` · ${words} text${words > 1 ? 's' : ''}` : ''}` : words ? `${words} text${words > 1 ? 's' : ''}` : 'Plain';
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

  // ---- Text on the board ----
  const textList = $('[data-texts]');
  function control(tag, attrs, label) {
    const element = Object.assign(document.createElement(tag), attrs);
    if (!label) return element;
    const wrap = document.createElement('label'); wrap.className = 'pcb-field'; wrap.append(label, element); return wrap;
  }
  function choice(field, options, value, label) {
    const select = control('select', {}); select.dataset.textField = field;
    for (const [id, name] of Object.entries(options)) select.append(new Option(typeof name === 'string' ? name : name.label, id));
    select.value = value;
    const wrap = document.createElement('label'); wrap.className = 'pcb-field'; wrap.append(label, select); return wrap;
  }
  function slider(field, value, label, min, max, step) {
    const wrap = document.createElement('label'); wrap.className = 'pcb-slider';
    const output = document.createElement('output'); output.dataset.textOutput = field; output.textContent = field === 'size' ? `${Number(value).toFixed(1)} mm` : `${Math.round(value)} %`;
    const input = control('input', { type: 'range', min, max, step, value }); input.dataset.textField = field;
    wrap.append(label, ' ', output, input); return wrap;
  }
  /** One card per text item on the side being edited. */
  function renderTexts() {
    const side = current();
    textList.replaceChildren(...side.texts.map((item, index) => {
      const card = document.createElement('div'); card.className = 'pcb-text-card'; card.dataset.textIndex = index;
      const top = document.createElement('div'); top.className = 'pcb-text-top';
      const value = control('input', { type: 'text', value: item.value, maxLength: 80 }); value.dataset.textField = 'value'; value.setAttribute('aria-label', `Text ${index + 1}`);
      const remove = control('button', { type: 'button', className: 'pcb-text-remove', textContent: '×' }); remove.dataset.textRemove = index; remove.setAttribute('aria-label', `Remove text ${index + 1}`);
      top.append(value, remove);
      const row1 = document.createElement('div'); row1.className = 'pcb-row';
      row1.append(choice('finish', textFinishes, item.finish, 'Made of'), choice('font', fontFamilies, item.font, 'Font'));
      const row2 = document.createElement('div'); row2.className = 'pcb-row';
      row2.append(choice('shape', textShapes, item.shape, 'Shape'), choice('align', textAligns, item.align, 'Anchor'));
      row2.lastChild.hidden = item.shape === 'arcTop' || item.shape === 'arcBottom';
      const row3 = document.createElement('div'); row3.className = 'pcb-row';
      row3.append(slider('x', item.x, 'Left / right', 0, 100, 0.5), slider('y', item.y, 'Up / down', 0, 100, 0.5));
      row3.firstChild.hidden = item.shape === 'arcTop' || item.shape === 'arcBottom';
      // Shape and exact position fold away: most people drag the text on the board instead.
      const more = document.createElement('details'); more.className = 'pcb-text-more';
      more.append(Object.assign(document.createElement('summary'), { textContent: 'Shape and position' }), row2, row3);
      card.append(top, slider('size', item.size, 'Size', TEXT_MIN, 20, 0.1), row1, more);
      return card;
    }));
    $('[data-add-text]').textContent = side.texts.length ? '+ Add another text' : '+ Add text';
  }
  function textInput(target) {
    const card = target.closest('[data-text-index]'), item = current().texts[card.dataset.textIndex], field = target.dataset.textField;
    item[field] = ['x', 'y', 'size'].includes(field) ? Number(target.value) : target.value;
    const output = card.querySelector(`[data-text-output="${field}"]`);
    if (output) output.textContent = field === 'size' ? `${item.size.toFixed(1)} mm` : `${Math.round(item[field])} %`;
    if (field === 'shape') {
      const arc = item.shape === 'arcTop' || item.shape === 'arcBottom';
      // Arcs keep their distance from the centre on the up / down slider.
      if (arc && ((item.shape === 'arcTop' && item.y > 40) || (item.shape === 'arcBottom' && item.y < 60))) { item.y = item.shape === 'arcTop' ? 18 : 82; renderTexts(); }
      else { card.querySelector('[data-text-field="align"]').closest('label').hidden = arc; card.querySelector('[data-text-field="x"]').closest('label').hidden = arc; }
    }
    updateSummaries(); schedule();
  }
  function addText() {
    const side = current(), count = side.texts.length;
    side.texts.push(newText({ y: clamp(50 + (count % 5) * 12 - 24, 10, 90), finish: 'silk' }));
    renderTexts(); updateSummaries();
    textList.lastElementChild?.querySelector('input')?.select();
    if (mode === 'crop') setMode('preview'); else schedule();
  }
  textList.addEventListener('click', event => {
    const index = event.target.closest('[data-text-remove]')?.dataset.textRemove; if (index === undefined) return;
    current().texts.splice(Number(index), 1); renderTexts(); updateSummaries(); schedule();
  });
  $('[data-add-text]').addEventListener('click', addText);
  /** The text item under a point of the shown side (mm from the top-left), or null. */
  const scratch = document.createElement('canvas').getContext('2d');
  function textAt(id, x, y) {
    const items = sides[id].texts;
    for (let i = items.length - 1; i >= 0; i--) if (items[i].value.trim() && drawTextItem(scratch, items[i], geometryNow, 1)(x, y)) return i;
    return -1;
  }

  // ---- Templates ----
  function applyTemplate(id, { focus = true } = {}) {
    const template = templates[id]; if (!template) return;
    applyPreset(template.preset); form.mask.value = template.mask; form.surface.value = template.surface; form.detail.value = '0.15'; detailTouched = false;
    const build = (spec, side) => spec ? makeSide(spec.art(), `${template.label} template`, { template: id, autoLevels: false, cleanup: true, texts: spec.texts.map(item => newText(item)) }) : makeSide(null, side === 'back' ? 'Plain, no artwork' : '', {});
    sides = { front: build(template.front, 'front'), back: build(template.back, 'back') };
    syncBoardFields(); editing = 'front'; writeForm(); setShow('front'); setMode('preview');
    status.textContent = `${template.label} template loaded. Change the texts on the left.`;
    if (focus) textList.querySelector('input')?.focus({ preventScroll: true });
  }
  for (const [id, template] of Object.entries(templates)) {
    const button = control('button', { type: 'button', className: 'pcb-template' }); button.dataset.template = id;
    button.append(svgIcon(presetIcons[template.preset]), textSpan(template.label, 'strong'), textSpan(template.hint, 'small'));
    button.addEventListener('click', () => applyTemplate(id));
    $('.pcb-templates').append(button);
  }

  // ---- Image processing ----
  function schedule() { clearTimeout(timer); timer = setTimeout(process, mode === 'crop' ? 350 : 60); }
  /** Turns one side into tone levels on a grid of `pixel` mm; cleanup sizes stay in millimetres. */
  function rasterize(side, geometry, pixel, cleanupPixel = pixel) {
    const gw = Math.ceil(geometry.width / pixel), gh = Math.ceil(geometry.height / pixel);
    work.width = gw; work.height = gh;
    workContext.fillStyle = '#fff'; workContext.fillRect(0, 0, gw, gh);
    const rect = imageRect(side, gw, gh);
    workContext.imageSmoothingQuality = 'high';
    workContext.drawImage(side.source, rect.x, rect.y, rect.w, rect.h);
    const gray = adjustTone(luminance(workContext.getImageData(0, 0, gw, gh).data, gw * gh), { brightness: side.brightness, contrast: side.contrast, invert: side.invert, autoLevels: side.autoLevels });
    const levels = quantize(gray, gw, gh, side.levels, { dither: side.dither });
    if (side.cleanup && !side.dither) { removeSlivers(levels, gw, gh, Math.max(2, Math.round(2 * cleanupPixel / pixel))); despeckle(levels, gw, gh, Math.ceil((0.3 / pixel) ** 2)); }
    return { levels, gw, gh };
  }
  function computeSide(id, geometry, shared) {
    const side = sides[id], pixel = pixelFor(side, shared), texts = side.texts.filter(item => item.value.trim());
    const key = JSON.stringify([geometry, pixel, side.version, side.source ? sideFields.map(name => side[name]) : 0, side.source ? [side.finishes, side.autoLevels] : 0, texts]);
    if (results[id]?.key === key) return;
    // One grid of tone levels plus the text on top, at a given pixel size.
    const grid = (size, cleanupPixel) => {
      const fab = side.source ? rasterize(side, geometry, size, cleanupPixel) : { gw: Math.ceil(geometry.width / size), gh: Math.ceil(geometry.height / size) };
      const levels = fab.levels || new Uint8Array(fab.gw * fab.gh);
      const overrides = textLayer(texts, geometry, size, fab.gw, fab.gh);
      return buildLayers(levels, fab.gw, fab.gh, side.source ? side.finishes : ['maskSubstrate'], geometry, size, { overrides });
    };
    const layers = grid(pixel, pixel);
    let preview = { layers, pixel };
    if (hasArt(side)) {
      // The board photo is drawn from a finer grid (about 1800 px across) so curves and small
      // text look smooth; the Gerber files keep the chosen detail size. Dithered dots stay 1:1.
      const finePixel = side.dither && side.source ? pixel : Math.max(pixel / 3, Math.max(geometry.width, geometry.height) / 1800);
      if (finePixel < pixel * 0.9) preview = { layers: grid(finePixel, pixel), pixel: finePixel };
    }
    results[id] = { key, pixel, geometry, plain: !hasArt(side), layers, preview, rules: hasArt(side) ? checkRules(layers, pixel) : null };
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
    const { geometry } = result, mask = maskColors[s.mask];
    const layerView = { copper: result.layers.copper, mask: result.layers.opening, silk: result.layers.silk }[s.view];
    // Layer views show the fabrication grid as it is; the board photo uses the finer preview grid.
    const { layers, pixel } = layerView ? result : result.preview, { width: gw, height: gh, finish } = layers;
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
      // The glass weave of the board shows faintly through the lacquer.
      ctx.save(); ctx.globalAlpha = 0.07; ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = ctx.createPattern(weaveTile(k), 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
      const grain = ctx.createPattern(noiseTile(), 'repeat');
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
        // Plated metal has a fine satin grain and a bright rim where it catches the light.
        ctx.save(); ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(paint(metal, grain), 0, 0); ctx.restore();
      }
      const silk = maskFor(i => finish[i] === id('silk'));
      if (silk) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 0.9 * px; ctx.shadowOffsetY = 0.45 * px; ctx.drawImage(paint(silk, rgb(mask.silk)), 0, 0); ctx.restore(); ctx.save(); ctx.globalAlpha = 0.18; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(paint(silk, grain), 0, 0); ctx.restore(); }
      // Studio light: a broad reflection across the glossy lacquer and a soft vignette.
      const sheen = ctx.createLinearGradient(0, 0, W * 0.75, H);
      sheen.addColorStop(0, 'rgba(255,255,255,.20)'); sheen.addColorStop(0.28, 'rgba(255,255,255,.06)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,.12)');
      ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * 0.28, H * 0.12, 0, W * 0.28, H * 0.12, Math.max(W, H) * 0.45);
      glow.addColorStop(0, 'rgba(255,255,255,.14)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = grain; ctx.fillRect(0, 0, W, H); ctx.restore();
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
      // Text sits on top of the image; show where it lands.
      ctx.setLineDash([]); ctx.fillStyle = accent; ctx.shadowColor = '#fff'; ctx.shadowBlur = 3;
      for (const item of side.texts) if (item.value.trim()) drawTextItem(ctx, item, geometry, scale);
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
    if (sideIds.some(id => sides[id].texts.some(item => item.value.trim() && item.finish === 'gold'))) anyGold = true;
    if (anyGold) notes.push({ info: true, text: `Order with ${surfaces[shared.surface].label} as surface finish to get the metal look.` });
    // Manufacturing check on the files that will be downloaded.
    const checked = sideIds.filter(id => results[id].rules);
    const broken = checked.reduce((sum, id) => sum + Object.values(results[id].rules).reduce((a, b) => a + b, 0), 0);
    const widened = checked.reduce((sum, id) => sum + results[id].layers.fixed, 0);
    if (checked.length && !broken) notes.push({ ok: true, text: `Manufacturing check passed: copper lines and gaps at least ${RULES.copperWidth} mm, print lines at least ${RULES.silkWidth} mm, copper ${COPPER_EDGE_CLEARANCE} mm from the edge. Fits JLCPCB and PCBWay.${widened ? ' Details that were too thin were widened automatically.' : ''}` });
    else if (broken) notes.push(`Manufacturing check: ${broken} pixels are still finer than the makers’ minimum. Choose a coarser detail setting.`);
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
      if (note.ok) item.className = 'is-ok';
      if (!note.action) { item.textContent = note.text; return item; }
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'pcb-link', textContent: note.action });
      button.addEventListener('click', note.run);
      item.append(note.text, ' ', button); return item;
    }));
    updateStageHint();
    if (swapped) { process(); return; }
    const shapeText = geometry.shape === 'circle' ? `⌀ ${geometry.width} mm` : `${geometry.width} × ${geometry.height} mm`;
    const sideText = id => sides[id].source ? `${sides[id].levels} tones` : hasArt(sides[id]) ? 'text' : 'plain';
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
    const passed = [front, back].every(result => !result || !result.rules || Object.values(result.rules).every(v => !v));
    const notes = orderNotes({ geometry, pixel: front.pixel, maskColor: maskColors[shared.mask].label, surface: surfaces[shared.surface].label, usesGold: used.has('gold'), usesBare: used.has('bare'), backPixel: back ? back.pixel : null, frontArt: !front.plain, checked: passed });
    const { files, stats } = fabricationFiles(front.layers, geometry, front.pixel, { name: 'pcb-art', notes, back: back && { layers: back.layers, pixel: back.pixel } });
    const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 9 });
    return { zipped, stats };
  }
  function save(blob, name) {
    const url = URL.createObjectURL(blob), link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function baseName() {
    const named = hasArt(sides.front) ? sides.front : sides.back;
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
      Object.assign(current(), { source: copy, name: file.name, sample: false, template: null, autoLevels: true, autoCheck: true, autoSwapped: false, invert: false, version: ++version, fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0 });
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
    if (target.dataset.textField) { textInput(target); return; }
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
    Object.assign(current(), { source: null, name: 'Plain, no artwork', sample: false, template: null, texts: [], version: ++version });
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
  /** A print-quality picture of the board (about 2400 px per side), independent of the screen size. */
  function exportPreview() {
    const shared = settings(), ids = show === 'both' ? sideIds : [show], geometry = results.front.geometry;
    const k = Math.min(40, 2400 / Math.max(geometry.width, geometry.height)), gap = ids.length > 1 ? Math.round(6 * k) : 0;
    const boards = ids.map(id => renderBoard(results[id], shared, k));
    const out = document.createElement('canvas');
    out.width = boards.reduce((sum, board) => sum + board.width, 0) + gap * (boards.length - 1); out.height = boards[0].height;
    const ctx = out.getContext('2d');
    boards.forEach((board, index) => ctx.drawImage(board, index * (boards[0].width + gap), 0));
    return out;
  }
  savePreview.addEventListener('click', () => {
    if (mode === 'crop' || !results.front) { canvas.toBlob(blob => blob && save(blob, `${baseName()}-crop.png`), 'image/png'); return; }
    status.textContent = 'Rendering a high-resolution picture…';
    setTimeout(() => exportPreview().toBlob(blob => { if (blob) save(blob, `${baseName()}-${show}.png`); report(); }, 'image/png'), 30);
  });

  // Pointer input: crop (drag, pinch, wheel) or a gentle 3D tilt in the preview.
  const pointers = new Map();
  let tilt = null, pinch = null, textDrag = null;
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
    const point = boardMm(event);
    if (point) {
      const index = textAt(show, point.x, point.y);
      if (index >= 0) {
        event.preventDefault(); stage.setPointerCapture(event.pointerId);
        if (editing !== show) setEditing(show);
        const item = sides[show].texts[index];
        textDrag = { item, index, start: point, x: item.x, y: item.y };
        stage.classList.add('is-moving-text');
        return;
      }
    }
    if (!form.tilt.checked) return;
    tilt = { x: event.clientX, y: event.clientY }; stage.setPointerCapture(event.pointerId);
  });
  /** Pointer position in mm on the single board shown in the preview, or null. */
  function boardMm(event) {
    if (mode !== 'preview' || show === 'both' || form.tilt.checked || !geometryNow) return null;
    const rect = canvas.getBoundingClientRect(); if (!rect.width) return null;
    const x = (event.clientX - rect.left) / rect.width * geometryNow.width, y = (event.clientY - rect.top) / rect.height * geometryNow.height;
    return x >= 0 && y >= 0 && x <= geometryNow.width && y <= geometryNow.height ? { x, y } : null;
  }
  stage.addEventListener('pointermove', event => {
    if (textDrag) {
      const point = boardMm(event) || textDrag.last; if (!point) return;
      textDrag.last = point;
      const { item } = textDrag;
      item.x = clamp(textDrag.x + (point.x - textDrag.start.x) / geometryNow.width * 100, 0, 100);
      item.y = clamp(textDrag.y + (point.y - textDrag.start.y) / geometryNow.height * 100, 0, 100);
      const card = textList.querySelector(`[data-text-index="${textDrag.index}"]`);
      for (const field of ['x', 'y']) { const input = card?.querySelector(`[data-text-field="${field}"]`); if (input) { input.value = item[field]; card.querySelector(`[data-text-output="${field}"]`).textContent = `${Math.round(item[field])} %`; } }
      schedule();
      return;
    }
    if (mode === 'preview' && !tilt) { const point = boardMm(event); stage.classList.toggle('can-move-text', !!point && textAt(show, point.x, point.y) >= 0); }
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
    if (textDrag) { textDrag = null; stage.classList.remove('is-moving-text'); return; }
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
  // A link like /projects/pcb-art-studio/?template=badge opens straight on that template.
  const linked = new URLSearchParams(location.search).get('template');
  if (linked && Object.hasOwn(templates, linked)) applyTemplate(linked, { focus: false });
  else { syncBoardFields(); writeForm(); }
  root.classList.add('is-ready');
  process();
}

let noiseCanvas = null;
/** A tile of soft random grain, shared by all renders. */
function noiseTile() {
  if (noiseCanvas) return noiseCanvas;
  noiseCanvas = document.createElement('canvas'); noiseCanvas.width = noiseCanvas.height = 160;
  const ctx = noiseCanvas.getContext('2d'), image = ctx.createImageData(160, 160);
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < image.data.length; i += 4) { const v = 96 + random() * 64; image.data[i] = image.data[i + 1] = image.data[i + 2] = v; image.data[i + 3] = 255; }
  ctx.putImageData(image, 0, 0);
  return noiseCanvas;
}
const weaveTiles = new Map();
/** Woven glass fibre: bundles about 0.45 mm wide, alternating over and under. */
function weaveTile(k) {
  const size = Math.max(4, Math.round(0.9 * k)), key = size;
  if (weaveTiles.has(key)) return weaveTiles.get(key);
  const tile = document.createElement('canvas'); tile.width = tile.height = size;
  const ctx = tile.getContext('2d'), half = size / 2;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  const bundle = (x, y, horizontal) => {
    const g = horizontal ? ctx.createLinearGradient(0, y, 0, y + half) : ctx.createLinearGradient(x, 0, x + half, 0);
    g.addColorStop(0, '#555'); g.addColorStop(0.5, '#fff'); g.addColorStop(1, '#555');
    ctx.fillStyle = g; ctx.fillRect(x + 0.5, y + 0.5, half - 1, half - 1);
  };
  bundle(0, 0, true); bundle(half, half, true); bundle(half, 0, false); bundle(0, half, false);
  weaveTiles.set(key, tile);
  return tile;
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

/**
 * Draws one text item on a canvas whose origin is the board's top-left corner, at `k` canvas
 * pixels per mm, in the current fill style. Returns a hit test that takes a point in mm.
 */
function drawTextItem(ctx, item, geometry, k) {
  const font = fontFamilies[item.font] || fontFamilies.sans, size = Math.max(TEXT_MIN, Number(item.size) || TEXT_MIN) * k;
  const W = geometry.width * k, H = geometry.height * k, value = item.value;
  ctx.save();
  ctx.font = `${font.weight} ${size}px ${font.css}`; ctx.textBaseline = 'middle';
  let hit = () => false;
  const arc = item.shape === 'arcTop' || item.shape === 'arcBottom', top = item.shape === 'arcTop';
  const radius = arc ? Math.abs((top ? 0.5 - item.y / 100 : item.y / 100 - 0.5) * H) : 0;
  if (arc && radius > size * 0.7) {
    // Each letter stands on the circle: reading left to right over the top or under the bottom.
    const chars = [...value], widths = chars.map(ch => ctx.measureText(ch).width + size * 0.04), total = widths.reduce((a, b) => a + b, 0), span = total / radius;
    let run = 0;
    ctx.textAlign = 'center';
    chars.forEach((ch, i) => {
      const a = top ? -Math.PI / 2 - span / 2 + (run + widths[i] / 2) / radius : Math.PI / 2 + span / 2 - (run + widths[i] / 2) / radius;
      ctx.save(); ctx.translate(W / 2 + radius * Math.cos(a), H / 2 + radius * Math.sin(a)); ctx.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore();
      run += widths[i];
    });
    hit = (x, y) => {
      const dx = x * k - W / 2, dy = y * k - H / 2, distance = Math.hypot(dx, dy);
      let a = Math.atan2(dy, dx) - (top ? -Math.PI / 2 : Math.PI / 2); a = Math.atan2(Math.sin(a), Math.cos(a));
      return Math.abs(distance - radius) < size * 0.7 && Math.abs(a) < span / 2 + 0.05;
    };
  } else {
    const x = item.x / 100 * W, y = item.y / 100 * H, turn = item.shape === 'up' ? -Math.PI / 2 : 0;
    ctx.textAlign = item.align || 'center';
    ctx.translate(x, y); ctx.rotate(turn); ctx.fillText(value, 0, 0);
    const width = ctx.measureText(value).width, left = ctx.textAlign === 'left' ? 0 : ctx.textAlign === 'right' ? -width : -width / 2;
    hit = (px, py) => {
      const dx = px * k - x, dy = py * k - y, lx = dx * Math.cos(-turn) - dy * Math.sin(-turn), ly = dx * Math.sin(-turn) + dy * Math.cos(-turn);
      return lx >= left - size * 0.2 && lx <= left + width + size * 0.2 && Math.abs(ly) < size * 0.65;
    };
  }
  ctx.restore();
  return hit;
}

/** Text rasterised on the fabrication grid: a finish index per pixel, 255 where there is no text. */
function textLayer(items, geometry, pixel, gw, gh) {
  if (!items.length) return null;
  const canvas = document.createElement('canvas'); canvas.width = gw; canvas.height = gh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }), out = new Uint8Array(gw * gh).fill(255);
  for (const item of items) {
    ctx.clearRect(0, 0, gw, gh); ctx.fillStyle = '#000';
    drawTextItem(ctx, item, geometry, 1 / pixel);
    const data = ctx.getImageData(0, 0, gw, gh).data, id = finishIds.indexOf(item.finish);
    for (let i = 0; i < out.length; i++) if (data[i * 4 + 3] >= 128) out[i] = id;
  }
  return out;
}

function formatValue(name, value) {
  const number = Number(value);
  if (name === 'zoom') return `${Math.round(number * 100)} %`;
  if (name === 'offsetX' || name === 'offsetY') { const rounded = Math.round(number); return `${rounded > 0 ? '+' : ''}${rounded} %`; }
  if (name === 'brightness' || name === 'contrast') return `${number > 0 ? '+' : ''}${Math.round(number * 100)}`;
  return value;
}

/** Text helper for the samples: shrinks the font until the text fits `maxWidth` mm. */
function makeText(ctx) {
  return (value, x, y, font, color, spacing = 0, align = 'left', maxWidth = Infinity) => {
    let size = Number(/([\d.]+)px/.exec(font)[1]);
    const setFont = () => { ctx.font = font.replace(/[\d.]+px/, `${size}px`); ctx.letterSpacing = `${spacing * size / Number(/([\d.]+)px/.exec(font)[1])}px`; };
    setFont();
    while (ctx.measureText(value).width > maxWidth && size > 0.5) { size *= 0.97; setFont(); }
    ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y);
    const width = ctx.measureText(value).width;
    ctx.letterSpacing = '0px'; ctx.textAlign = 'left';
    return width;
  };
}
function drawIcon(ctx, name, x, y, size, color) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (name === 'github') { ctx.scale(size / 16, size / 16); ctx.fill(new Path2D(GITHUB_MARK)); ctx.restore(); return; }
  const u = size / 24; ctx.scale(u, u); ctx.lineWidth = 0.46 / u;
  if (name === 'mail') {
    ctx.beginPath(); ctx.roundRect(1.5, 4.5, 21, 15, 2.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2.5, 6); ctx.lineTo(12, 13); ctx.lineTo(21.5, 6); ctx.stroke();
  } else if (name === 'web') {
    ctx.beginPath(); ctx.arc(12, 12, 10.2, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(12, 12, 4.4, 10.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 12); ctx.lineTo(22, 12); ctx.stroke();
  }
  ctx.restore();
}

/**
 * Original sample: a business card in the alisoglu.com style, drawn on the fly at 20 px per mm.
 * Grey values pick the finish: 0 mask over board, 80 mask over copper, 175 exposed metal, 255 silkscreen.
 * It is laid out like a real board: a QFN chip on a hatched copper pour, routed traces with vias,
 * gold edge fingers, fiducials, passives with reference designators and contact rows with icons.
 */
function sampleArtwork() {
  const mm = 20, canvas = document.createElement('canvas'); canvas.width = 85 * mm; canvas.height = 55 * mm;
  const ctx = canvas.getContext('2d');
  const BOARD = '#000', COPPER = '#505050', METAL = '#afafaf', SILK = '#fff';
  const sans = SANS;
  ctx.scale(mm, mm); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = BOARD; ctx.fillRect(0, 0, 85, 55);
  const line = (points, width, color) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(...points[0]); for (const point of points.slice(1)) ctx.lineTo(...point); ctx.stroke(); };
  const rect = (x, y, w, h, color, r = 0) => { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
  const dot = (x, y, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const text = makeText(ctx);
  const via = (x, y) => { dot(x, y, 0.62, METAL); dot(x, y, 0.26, BOARD); };
  // A trace on the pour gets a clearance gap first, like a real copper pour would.
  const trace = points => { line(points, 1.25, BOARD); line(points, 0.4, COPPER); };

  // Hatched copper pour behind the circuit, with a solid rim.
  const pour = { x: 49.5, y: 19.5, w: 33, h: 26.5 };
  ctx.save(); ctx.beginPath(); ctx.roundRect(pour.x, pour.y, pour.w, pour.h, 2.2); ctx.clip();
  ctx.strokeStyle = COPPER; ctx.lineWidth = 0.28;
  for (let d = -40; d < 80; d += 1.05) { ctx.beginPath(); ctx.moveTo(pour.x + d, pour.y); ctx.lineTo(pour.x + d + 40, pour.y + 40); ctx.moveTo(pour.x + d, pour.y + 40); ctx.lineTo(pour.x + d + 40, pour.y); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = COPPER; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.roundRect(pour.x, pour.y, pour.w, pour.h, 2.2); ctx.stroke();

  // QFN chip: 6 pads per side, an exposed centre pad with the monogram.
  const cx = 66, cy = 30, body = 9.2, pitch = 1.05, offsets = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map(v => v * pitch);
  ctx.fillStyle = BOARD; ctx.beginPath(); ctx.roundRect(cx - body / 2 - 1.6, cy - body / 2 - 1.6, body + 3.2, body + 3.2, 1); ctx.fill();
  // Traces: bottom pads fan out at 45° to the edge fingers, the others end in staggered vias.
  const fingers = offsets.map((_, i) => 56.5 + i * 4.3);
  offsets.forEach((o, i) => {
    const px = cx + o, fx = fingers[i], startY = cy + body / 2 + 1.6;
    trace([[px, cy + body / 2], [px, startY], [px + (fx - px) * 1, startY + Math.abs(fx - px)], [fx, 48.6]]);
    const far = i % 2 === 0;
    trace([[cx + body / 2, cy + o], [far ? 80.4 : 78.4, cy + o]]); via(far ? 80.4 : 78.4, cy + o);
    trace([[cx - body / 2, cy + o], [far ? 51.6 : 53.6, cy + o]]); via(far ? 51.6 : 53.6, cy + o);
    trace([[px, cy - body / 2], [px, far ? 21.4 : 23.2]]); via(px, far ? 21.4 : 23.2);
  });
  ctx.fillStyle = METAL;
  for (const o of offsets) {
    rect(cx + body / 2 - 0.9, cy + o - 0.25, 1.3, 0.5, METAL, 0.2); rect(cx - body / 2 - 0.4, cy + o - 0.25, 1.3, 0.5, METAL, 0.2);
    rect(cx + o - 0.25, cy - body / 2 - 0.4, 0.5, 1.3, METAL, 0.2); rect(cx + o - 0.25, cy + body / 2 - 0.9, 0.5, 1.3, METAL, 0.2);
  }
  rect(cx - 2.9, cy - 2.9, 5.8, 5.8, METAL, 0.7);
  text('u.', cx, cy + 1.45, `800 4.2px ${sans}`, BOARD, 0, 'center');
  // Silkscreen corner marks, pin-one dot and designator.
  ctx.strokeStyle = SILK; ctx.lineWidth = 0.2;
  const half = body / 2 + 0.9;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) line([[cx + sx * half, cy + sy * (half - 1.2)], [cx + sx * half, cy + sy * half], [cx + sx * (half - 1.2), cy + sy * half]], 0.2, SILK);
  dot(cx - half - 0.6, cy - half - 0.6, 0.35, SILK);
  text('U1', cx + half + 0.5, cy - half + 0.4, `700 1.6px ${sans}`, SILK, 0.1, 'left');

  // Gold edge fingers along the bottom edge, with a silkscreen bracket.
  for (const fx of fingers) rect(fx - 1.1, 48.6, 2.2, 6.4, METAL, 0.4);
  line([[fingers[0] - 2.2, 47.3], [fingers[0] - 2.2, 46.6], [fingers.at(-1) + 2.2, 46.6], [fingers.at(-1) + 2.2, 47.3]], 0.2, SILK);

  // Passives with reference designators, a test point and fiducials.
  const resistor = (x, y, label) => { rect(x - 1.25, y - 0.5, 0.9, 1, METAL, 0.15); rect(x + 0.35, y - 0.5, 0.9, 1, METAL, 0.15); ctx.strokeStyle = SILK; ctx.lineWidth = 0.16; ctx.beginPath(); ctx.roundRect(x - 1.75, y - 0.95, 3.5, 1.9, 0.3); ctx.stroke(); text(label, x, y - 1.4, `700 1.55px ${sans}`, SILK, 0.1, 'center'); };
  resistor(65.5, 13.4, 'R1'); resistor(70.6, 13.4, 'C1');
  dot(76.4, 13.4, 0.95, METAL); text('TP1', 76.4, 11.0, `700 1.55px ${sans}`, SILK, 0.1, 'center');
  line([[65.5 - 1.25 + 0.45, 13.4], [65.5 - 1.25 + 0.45, 16.6], [58.4, 16.6], [56, 19]], 0.3, COPPER);
  line([[70.6 + 0.8, 13.4], [70.6 + 0.8, 15.6], [74.6, 15.6], [76.4, 13.8]], 0.3, COPPER);
  for (const [x, y] of [[80.6, 5.4], [4.6, 50.4]]) { dot(x, y, 1.15, BOARD); dot(x, y, 0.5, METAL); ctx.strokeStyle = SILK; ctx.lineWidth = 0.16; ctx.beginPath(); ctx.arc(x, y, 1.45, 0, Math.PI * 2); ctx.stroke(); }

  // Monogram pad with castellated edges, wordmark and tagline.
  rect(5.6, 5.6, 11.6, 11.6, METAL, 2.6);
  for (let i = 0; i < 3; i++) for (const [x, y] of [[8.6 + i * 2.8, 5.6], [8.6 + i * 2.8, 17.2], [5.6, 8.6 + i * 2.8], [17.2, 8.6 + i * 2.8]]) dot(x, y, 0.45, BOARD);
  text('u.', 11.5, 14.6, `800 9px ${sans}`, BOARD, 0, 'center');
  const name = text('umut alisoglu', 20.6, 12.4, `700 5.9px ${sans}`, SILK, -0.05, 'left', 32.5);
  text('.', 20.6 + name + 0.1, 12.4, `700 5.9px ${sans}`, METAL);
  text('SOFTWARE  •  TOOLS  •  HARDWARE', 20.8, 16.6, `700 1.95px ${sans}`, SILK, 0.3, 'left', 33);

  // Contact rows: an icon on a small metal plate, then the address.
  const rows = [['mail', 'umut@alisoglu.com'], ['web', 'alisoglu.com'], ['github', 'github.com/UmutAlisoglu']];
  rows.forEach(([icon, value], i) => {
    const y = 25.6 + i * 6;
    rect(5.6, y - 2.3, 4.6, 4.6, METAL, 1.2);
    drawIcon(ctx, icon, 5.6 + 0.6, y - 2.3 + 0.6, 3.4, BOARD);
    text(value, 12.4, y + 1.05, `600 3px ${sans}`, SILK, 0.02, 'left', 34);
  });

  // Footer: a thin copper rule, revision and project names.
  line([[5.6, 44.6], [40, 44.6], [43.4, 41.2], [48.6, 41.2]], 0.3, COPPER); via(48.6, 41.2);
  text('FILEFORGE  •  REPODOCK  •  PCB ART STUDIO', 7.6, 50.9, `700 1.75px ${sans}`, SILK, 0.22, 'left', 36);
  text('REV A', 47.6, 50.9, `700 1.6px ${sans}`, SILK, 0.15, 'left', 6);
  return canvas;
}

/** Original sample back: a gold monogram inside topographic copper contours. */
function sampleBack() {
  const mm = 20, canvas = document.createElement('canvas'); canvas.width = 85 * mm; canvas.height = 55 * mm;
  const ctx = canvas.getContext('2d');
  const BOARD = '#000', COPPER = '#505050', METAL = '#afafaf', SILK = '#fff';
  const sans = SANS;
  ctx.scale(mm, mm); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = BOARD; ctx.fillRect(0, 0, 85, 55);
  const cx = 42.5, cy = 22.5;
  // Contour lines that wobble a little, like a terrain map, kept clear of the lettering below.
  ctx.save(); ctx.beginPath(); ctx.roundRect(2.6, 2.6, 79.8, 36.4, 2); ctx.clip();
  ctx.strokeStyle = COPPER; ctx.lineWidth = 0.32;
  for (let ring = 0; ring < 16; ring++) {
    const rx = 13.5 + ring * 2.25, ry = 12 + ring * 1.55;
    ctx.beginPath();
    for (let step = 0; step <= 240; step++) {
      const a = step / 240 * Math.PI * 2;
      const wobble = 1 + 0.045 * Math.sin(3 * a + ring * 0.55) + 0.03 * Math.sin(5 * a - ring * 0.8);
      const x = cx + Math.cos(a) * rx * wobble, y = cy + Math.sin(a) * ry * wobble;
      if (step) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  // Clearance around the plate, the plate, and a ring of small vias.
  ctx.fillStyle = BOARD; ctx.beginPath(); ctx.roundRect(cx - 12.6, cy - 12.6, 25.2, 25.2, 6.4); ctx.fill();
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, r = 11.2; ctx.fillStyle = METAL; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.42, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = BOARD; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.16, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = METAL; ctx.beginPath(); ctx.roundRect(cx - 9, cy - 9, 18, 18, 4.4); ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = BOARD; ctx.font = `800 13.5px ${sans}`; ctx.fillText('u.', cx + 0.3, cy + 4.6);
  const text = makeText(ctx);
  text('alisoglu.com', cx, 45.4, `700 4.2px ${sans}`, SILK, 0.1, 'center', 40);
  text('MADE WITH PCB ART STUDIO  •  STAYS ON YOUR DEVICE', cx, 49.8, `700 1.7px ${sans}`, SILK, 0.35, 'center', 60);
  return canvas;
}

/**
 * Ready-made designs. The artwork is drawn on the fly at 20 px per mm with the same grey code as
 * the sample (black mask over board, dark grey copper under mask, light grey metal, white print);
 * every word is an editable text item, so people only type their own details.
 */
function templateCanvas(width, height, draw) {
  const mm = 20, canvas = document.createElement('canvas'); canvas.width = width * mm; canvas.height = height * mm;
  const ctx = canvas.getContext('2d');
  ctx.scale(mm, mm); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = INK.board; ctx.fillRect(0, 0, width, height);
  const tools = {
    line: (points, w, color = INK.copper) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...points[0]); for (const point of points.slice(1)) ctx.lineTo(...point); ctx.stroke(); },
    rect: (x, y, w, h, color, r = 0) => { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); },
    dot: (x, y, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); },
    ring: (x, y, r, w, color) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); },
    via: (x, y) => { tools.dot(x, y, 0.6, INK.metal); tools.dot(x, y, 0.25, INK.board); },
  };
  draw(ctx, tools);
  return canvas;
}
const INK = { board: '#000', copper: '#505050', metal: '#afafaf', silk: '#fff' };
const templates = {
  card: {
    label: 'Business card', hint: 'Name, title, contacts', preset: 'card', mask: 'black', surface: 'enig',
    front: {
      art: () => templateCanvas(85, 55, (ctx, t) => {
        // Monogram plate with castellated edges.
        t.rect(6, 6, 13, 13, INK.metal, 2.8);
        for (let i = 0; i < 3; i++) for (const [x, y] of [[9.2 + i * 3.3, 6], [9.2 + i * 3.3, 19], [6, 9.2 + i * 3.3], [19, 9.2 + i * 3.3]]) t.dot(x, y, 0.5, INK.board);
        // A small circuit on the right: a chip, fanned-out traces, vias and edge fingers.
        const cx = 70, cy = 22;
        t.rect(cx - 6, cy - 6, 12, 12, INK.board);
        for (let i = 0; i < 5; i++) {
          const o = (i - 2) * 1.6;
          t.line([[cx + 4, cy + o], [cx + 8 + (i % 2) * 2, cy + o]], 0.4); t.via(cx + 8 + (i % 2) * 2, cy + o);
          t.line([[cx + o, cy - 4], [cx + o, cy - 8 - (i % 2) * 2]], 0.4); t.via(cx + o, cy - 8 - (i % 2) * 2);
          t.line([[cx + o, cy + 4], [cx + o, cy + 7 + Math.abs(o)], [62 + i * 4.2, 42 + Math.abs(o) * 0.2], [62 + i * 4.2, 47]], 0.4);
          t.rect(61 + i * 4.2, 47, 2, 8, INK.metal, 0.4);
          t.line([[cx - 4, cy + o], [cx - 8 - (i % 2) * 2, cy + o]], 0.4); t.via(cx - 8 - (i % 2) * 2, cy + o);
        }
        t.rect(cx - 4, cy - 4, 8, 8, INK.copper, 0.6);
        for (let i = 0; i < 5; i++) { const o = (i - 2) * 1.6; t.rect(cx + 3.2, cy + o - 0.3, 1.2, 0.6, INK.metal, 0.15); t.rect(cx - 4.4, cy + o - 0.3, 1.2, 0.6, INK.metal, 0.15); t.rect(cx + o - 0.3, cy - 4.4, 0.6, 1.2, INK.metal, 0.15); t.rect(cx + o - 0.3, cy + 3.2, 0.6, 1.2, INK.metal, 0.15); }
        t.rect(cx - 2, cy - 2, 4, 4, INK.metal, 0.5);
        // Silkscreen frame around the chip, a thin copper rule under the contacts.
        ctx.strokeStyle = INK.silk; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.roundRect(cx - 5.4, cy - 5.4, 10.8, 10.8, 0.6); ctx.stroke();
        t.line([[6, 46.5], [44, 46.5], [47.5, 43], [52, 43]], 0.35); t.via(52, 43);
      }),
      texts: [
        { value: 'AB', x: 12.5 / 85 * 100, y: 12.7 / 55 * 100, size: 6.4, font: 'heavy', finish: 'maskSubstrate', align: 'center' },
        { value: 'Your Name', x: 22.5 / 85 * 100, y: 11 / 55 * 100, size: 5.6, font: 'sans', finish: 'silk', align: 'left' },
        { value: 'MAKER  ·  DESIGNER', x: 22.7 / 85 * 100, y: 16.3 / 55 * 100, size: 2, font: 'sans', finish: 'gold', align: 'left' },
        { value: 'hello@example.com', x: 6 / 85 * 100, y: 29 / 55 * 100, size: 3, font: 'light', finish: 'silk', align: 'left' },
        { value: 'example.com', x: 6 / 85 * 100, y: 34.5 / 55 * 100, size: 3, font: 'light', finish: 'silk', align: 'left' },
        { value: '+49 123 456789', x: 6 / 85 * 100, y: 40 / 55 * 100, size: 3, font: 'light', finish: 'silk', align: 'left' },
      ],
    },
    back: {
      art: () => templateCanvas(85, 55, (ctx, t) => {
        for (let ring = 0; ring < 9; ring++) t.ring(42.5, 23, 13 + ring * 2.2, 0.35, INK.copper);
        t.rect(28.5, 9, 28, 28, INK.board, 7);
        t.rect(31, 11.5, 23, 23, INK.metal, 5.5);
        ctx.fillStyle = INK.board; ctx.fillRect(0, 40, 85, 15);
      }),
      texts: [
        { value: 'AB', x: 50, y: 23 / 55 * 100, size: 11, font: 'heavy', finish: 'maskSubstrate' },
        { value: 'example.com', x: 50, y: 46.5 / 55 * 100, size: 3.6, font: 'sans', finish: 'silk' },
      ],
    },
  },
  badge: {
    label: 'Round badge', hint: 'Text around the edge', preset: 'badge', mask: 'blue', surface: 'enig',
    front: {
      art: () => templateCanvas(50, 50, (ctx, t) => {
        t.ring(25, 25, 22.4, 1.6, INK.metal);
        for (const r of [10.8, 12, 18.6, 19.8]) t.ring(25, 25, r, 0.35, INK.copper);
        for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; t.line([[25 + Math.cos(a) * 12.6, 25 + Math.sin(a) * 12.6], [25 + Math.cos(a) * (i % 3 ? 13.6 : 14.4), 25 + Math.sin(a) * (i % 3 ? 13.6 : 14.4)]], 0.35); }
        t.dot(25, 25, 9.2, INK.metal);
        for (const a of [0, Math.PI]) t.via(25 + Math.cos(a) * 15.3, 25 + Math.sin(a) * 15.3);
      }),
      texts: [
        { value: 'YOUR NAME', y: 19.4, size: 3.4, font: 'sans', finish: 'silk', shape: 'arcTop' },
        { value: 'MAKER  ·  2026', y: 80.6, size: 2.8, font: 'sans', finish: 'silk', shape: 'arcBottom' },
        { value: 'AB', x: 50, y: 51, size: 9, font: 'heavy', finish: 'maskSubstrate' },
      ],
    },
    back: null,
  },
  coaster: {
    label: 'Coaster', hint: 'Sunburst and gold rim', preset: 'coaster', mask: 'black', surface: 'enig',
    front: {
      art: () => templateCanvas(90, 90, (ctx, t) => {
        t.ring(45, 45, 43, 1.8, INK.metal);
        for (let i = 0; i < 40; i++) {
          const a = i / 40 * Math.PI * 2, inner = 16.5, outer = i % 2 ? 31 : 34;
          t.line([[45 + Math.cos(a) * inner, 45 + Math.sin(a) * inner], [45 + Math.cos(a) * outer, 45 + Math.sin(a) * outer]], 0.45);
          t.via(45 + Math.cos(a) * (outer + 0.4), 45 + Math.sin(a) * (outer + 0.4));
        }
        t.ring(45, 45, 15.6, 0.5, INK.copper);
        t.dot(45, 45, 13.6, INK.metal);
      }),
      texts: [
        { value: 'TAKE A BREAK', y: 7.8, size: 4.2, font: 'sans', finish: 'silk', shape: 'arcTop' },
        { value: 'MADE BY YOUR NAME', y: 92.2, size: 3.2, font: 'sans', finish: 'silk', shape: 'arcBottom' },
        { value: 'AB', x: 50, y: 50.6, size: 12, font: 'heavy', finish: 'maskSubstrate' },
      ],
    },
    back: null,
  },
  bookmark: {
    label: 'Bookmark', hint: 'A quote along the length', preset: 'bookmark', mask: 'green', surface: 'enig',
    front: {
      art: () => templateCanvas(40, 150, (ctx, t) => {
        t.dot(20, 13, 6, INK.metal); t.dot(20, 13, 3.2, INK.board); t.ring(20, 13, 7.6, 0.4, INK.copper);
        for (const [x, jog] of [[6, 1], [34, -1]]) {
          t.line([[x, 24], [x, 60], [x + jog * 2.5, 63.5], [x + jog * 2.5, 100], [x, 103.5], [x, 136]], 0.4); t.via(x, 24); t.via(x, 136);
        }
        for (const x of [8.8, 31.2]) { t.line([[x, 30], [x, 128]], 0.3); t.via(x, 30); t.via(x, 128); }
      }),
      texts: [
        { value: 'KEEP READING', x: 50, y: 54, size: 8.5, font: 'heavy', finish: 'silk', shape: 'up' },
        { value: 'YOUR NAME', x: 50, y: 95, size: 2.6, font: 'sans', finish: 'gold' },
      ],
    },
    back: null,
  },
};

// Start last, so every helper and constant above is initialised.
const root = document.querySelector('[data-pcb-studio]');
if (root) fontsReady().then(() => start(root));
