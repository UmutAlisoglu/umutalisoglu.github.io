// PCB Art Studio core: turns a grayscale grid into PCB layers and fabrication files.
// Pure functions without DOM access, so the same code runs in the browser and in tests.

/** Every pixel ends up as one of these physical finishes. */
export const finishes = {
  maskSubstrate: { label: 'Mask over bare board', copper: false, opening: false, silk: false },
  maskCopper: { label: 'Mask over copper', copper: true, opening: false, silk: false },
  gold: { label: 'Exposed copper (gold / silver)', copper: true, opening: true, silk: false },
  bare: { label: 'Bare board, no mask', copper: false, opening: true, silk: false },
  silk: { label: 'Silkscreen print', copper: false, opening: false, silk: true },
};
export const finishIds = Object.keys(finishes);

export const defaultLevelFinishes = {
  2: ['maskSubstrate', 'silk'],
  3: ['maskSubstrate', 'maskCopper', 'silk'],
  4: ['maskSubstrate', 'maskCopper', 'gold', 'silk'],
  5: ['maskSubstrate', 'bare', 'maskCopper', 'gold', 'silk'],
};

export const shapes = ['rectangle', 'rounded', 'circle'];
export const COPPER_EDGE_CLEARANCE = 0.3; // mm, typical minimum for low-cost fabs
export const HOLE_DIAMETER = 3.2; // mm, fits M3 screws
export const HOLE_INSET = 4; // mm from each edge to the hole centre
export const HOLE_KEEPOUT = 0.6; // mm of empty ring around each hole
const OVERLAP = 0.002; // mm

/** Board geometry helpers. All units are millimetres, origin bottom-left. */
export function boardGeometry({ width, height, shape = 'rectangle', radius = 3, holes = false }) {
  const w = Number(width), h = Number(height);
  if (!(w >= 5 && h >= 5 && w <= 300 && h <= 300)) throw new Error('Board size must be between 5 and 300 mm.');
  const geometry = { width: w, height: h, shape, radius: 0, holes: [] };
  if (shape === 'circle') { geometry.width = geometry.height = Math.min(w, h); }
  if (shape === 'rounded') geometry.radius = Math.max(0.5, Math.min(Number(radius) || 3, w / 2 - 0.01, h / 2 - 0.01));
  if (holes && shape !== 'circle' && geometry.width >= 20 && geometry.height >= 20) {
    const { width: bw, height: bh } = geometry;
    geometry.holes = [[HOLE_INSET, HOLE_INSET], [bw - HOLE_INSET, HOLE_INSET], [bw - HOLE_INSET, bh - HOLE_INSET], [HOLE_INSET, bh - HOLE_INSET]].map(([x, y]) => ({ x, y, d: HOLE_DIAMETER }));
  }
  return geometry;
}

/** Signed distance from the board outline: positive inside, in mm. */
export function insideDistance(geometry, x, y) {
  const { width: w, height: h, shape, radius } = geometry;
  if (shape === 'circle') return w / 2 - Math.hypot(x - w / 2, y - h / 2);
  const r = shape === 'rounded' ? radius : 0;
  const qx = Math.abs(x - w / 2) - (w / 2 - r), qy = Math.abs(y - h / 2) - (h / 2 - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  return r - outside;
}

function holeDistance(geometry, x, y) {
  let nearest = Infinity;
  for (const hole of geometry.holes) nearest = Math.min(nearest, Math.hypot(x - hole.x, y - hole.y) - hole.d / 2);
  return nearest;
}

/**
 * Converts RGBA pixels (row 0 at the top) to a brightness grid from 0 (black) to 1 (white).
 * Transparent pixels count as white paper.
 */
export function luminance(rgba, length) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const value = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
    out[i] = value * a + (1 - a);
  }
  return out;
}

/** Brightness, contrast, gamma, auto levels and inversion, in place. */
export function adjustTone(gray, { brightness = 0, contrast = 0, invert = false, autoLevels = true } = {}) {
  let low = 0, high = 1;
  if (autoLevels && gray.length) {
    const histogram = new Uint32Array(256);
    for (const value of gray) histogram[Math.max(0, Math.min(255, Math.round(value * 255)))]++;
    const cut = gray.length * 0.005;
    let sum = 0, lowIndex = 0, highIndex = 255;
    for (let i = 0; i < 256; i++) { sum += histogram[i]; if (sum > cut) { lowIndex = i; break; } }
    sum = 0;
    for (let i = 255; i >= 0; i--) { sum += histogram[i]; if (sum > cut) { highIndex = i; break; } }
    if (highIndex - lowIndex > 8) { low = lowIndex / 255; high = highIndex / 255; }
  }
  const factor = (1 + contrast) / (1 - Math.min(contrast, 0.99));
  for (let i = 0; i < gray.length; i++) {
    let value = (gray[i] - low) / (high - low);
    value = (value - 0.5) * factor + 0.5 + brightness;
    value = Math.max(0, Math.min(1, value));
    gray[i] = invert ? 1 - value : value;
  }
  return gray;
}

/** Splits brightness into `levels` bands. Optional Floyd–Steinberg dithering for photos. */
export function quantize(gray, width, height, levels, { dither = false } = {}) {
  const out = new Uint8Array(width * height);
  const steps = levels - 1;
  if (!dither) {
    for (let i = 0; i < out.length; i++) out[i] = Math.min(steps, Math.floor(gray[i] * levels));
    return out;
  }
  const work = Float32Array.from(gray);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const level = Math.max(0, Math.min(steps, Math.round(work[i] * steps)));
      out[i] = level;
      const error = work[i] - level / steps;
      if (x + 1 < width) work[i + 1] += error * 7 / 16;
      if (y + 1 < height) {
        if (x > 0) work[i + width - 1] += error * 3 / 16;
        work[i + width] += error * 5 / 16;
        if (x + 1 < width) work[i + width + 1] += error / 16;
      }
    }
  }
  return out;
}

/**
 * Removes one-pixel-wide slivers, such as anti-aliased outlines that would otherwise
 * become a thin ring of another finish. A pixel with fewer than four same-tone pixels
 * in its 3×3 neighbourhood takes the most common tone around it.
 */
export function removeSlivers(labels, width, height, passes = 1) {
  let current = labels;
  for (let pass = 0; pass < passes; pass++) {
    const next = Uint8Array.from(current), counts = new Uint16Array(256);
    let changed = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, own = current[i];
      let same = 0;
      const touched = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const value = current[ny * width + nx];
        if (value === own) same++;
        else { if (!counts[value]) touched.push(value); counts[value]++; }
      }
      if (same < 4 && touched.length) {
        let best = own, count = 0;
        for (const value of touched) if (counts[value] > count) { best = value; count = counts[value]; }
        next[i] = best; changed++;
      }
      for (const value of touched) counts[value] = 0;
    }
    current = next;
    if (!changed) break;
  }
  labels.set(current);
  return labels;
}

/** Merges connected areas smaller than `minArea` pixels into their most common neighbour. */
export function despeckle(labels, width, height, minArea) {
  if (minArea <= 1) return labels;
  const seen = new Uint8Array(labels.length), stack = new Int32Array(labels.length), members = [];
  for (let start = 0; start < labels.length; start++) {
    if (seen[start]) continue;
    const value = labels[start];
    let top = 0; stack[top++] = start; seen[start] = 1; members.length = 0;
    const neighbours = new Map();
    while (top) {
      const i = stack[--top]; members.push(i);
      const x = i % width;
      for (const n of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, i - width, i + width]) {
        if (n < 0 || n >= labels.length) continue;
        if (labels[n] === value) { if (!seen[n]) { seen[n] = 1; stack[top++] = n; } }
        else neighbours.set(labels[n], (neighbours.get(labels[n]) || 0) + 1);
      }
    }
    if (members.length < minArea && neighbours.size) {
      let best = value, count = -1;
      for (const [label, n] of neighbours) if (n > count) { best = label; count = n; }
      for (const i of members) labels[i] = best;
    }
  }
  return labels;
}

/**
 * Builds the physical layers from per-pixel levels.
 * Returns bitmaps (1 = feature present) for copper, mask openings and silkscreen,
 * plus a `finish` grid for the preview (255 = outside the board or inside a hole keep-out).
 */
export function buildLayers(levels, width, height, levelFinishes, geometry, pixel) {
  const size = width * height;
  const copper = new Uint8Array(size), opening = new Uint8Array(size), silk = new Uint8Array(size), finish = new Uint8Array(size);
  const ids = levelFinishes.map(id => finishIds.indexOf(id));
  if (ids.some(id => id < 0)) throw new Error('Unknown finish.');
  for (let row = 0; row < height; row++) {
    const y = geometry.height - (row + 0.5) * pixel;
    for (let col = 0; col < width; col++) {
      const i = row * width + col, x = (col + 0.5) * pixel;
      const edge = insideDistance(geometry, x, y), hole = holeDistance(geometry, x, y);
      if (edge <= pixel / 2 || hole <= HOLE_KEEPOUT) { finish[i] = 255; continue; }
      let id = ids[levels[i]] ?? 0;
      const spec = finishes[finishIds[id]];
      // Copper keeps a safe distance from the cut edge; the area stays visually close.
      if (spec.copper && edge < COPPER_EDGE_CLEARANCE + pixel / 2) id = finishIds.indexOf(spec.opening ? 'bare' : 'maskSubstrate');
      const final = finishes[finishIds[id]];
      finish[i] = id; copper[i] = final.copper ? 1 : 0; opening[i] = final.opening ? 1 : 0; silk[i] = final.silk ? 1 : 0;
    }
  }
  return { copper, opening, silk, finish, width, height };
}

/** Greedy rectangle cover of a bitmap: horizontal runs merged downwards when identical. */
export function bitmapRectangles(bitmap, width, height) {
  const rectangles = [];
  let active = new Map();
  for (let y = 0; y <= height; y++) {
    const next = new Map();
    if (y < height) {
      let x = 0;
      while (x < width) {
        if (!bitmap[y * width + x]) { x++; continue; }
        const start = x;
        while (x < width && bitmap[y * width + x]) x++;
        const key = start * 65536 + x;
        const rect = active.get(key);
        if (rect) { rect.h++; next.set(key, rect); active.delete(key); }
        else next.set(key, { x: start, y, w: x - start, h: 1 });
      }
    }
    for (const rect of active.values()) rectangles.push(rect);
    active = next;
  }
  return rectangles;
}

const coordinate = mm => Math.round(mm * 1e6).toString();
const decimal = mm => (Math.round(mm * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, '') || '0';

function gerberHeader(fileFunction, polarity = 'Positive') {
  return [
    'G04 Made with PCB Art Studio - https://alisoglu.com/projects/pcb-art-studio/*',
    '%TF.GenerationSoftware,alisoglu.com,PCB Art Studio,1.0*%',
    `%TF.FileFunction,${fileFunction}*%`,
    `%TF.FilePolarity,${polarity}*%`,
    '%FSLAX46Y46*%',
    '%MOMM*%',
    '%LPD*%',
  ];
}

/** RS-274X layer made of rectangle flashes; one aperture per rectangle size. */
export function bitmapGerber(bitmap, width, height, pixel, boardHeight, fileFunction, polarity) {
  const rectangles = bitmapRectangles(bitmap, width, height);
  const apertures = new Map(), body = [];
  let current = null;
  for (const rect of rectangles) {
    const key = `${rect.w}x${rect.h}`;
    // A 2 µm overlap makes neighbouring rectangles fuse in every CAM tool, not just touch.
    if (!apertures.has(key)) apertures.set(key, { code: 10 + apertures.size, w: rect.w * pixel + OVERLAP, h: rect.h * pixel + OVERLAP });
    const { code } = apertures.get(key);
    if (code !== current) { body.push(`D${code}*`); current = code; }
    const cx = (rect.x + rect.w / 2) * pixel, cy = boardHeight - (rect.y + rect.h / 2) * pixel;
    body.push(`X${coordinate(cx)}Y${coordinate(cy)}D03*`);
  }
  const definitions = [...apertures.values()].map(a => `%ADD${a.code}R,${decimal(a.w)}X${decimal(a.h)}*%`);
  return { text: [...gerberHeader(fileFunction, polarity), ...definitions, ...body, 'M02*', ''].join('\n'), rectangles: rectangles.length };
}

export function emptyGerber(fileFunction, polarity) {
  return [...gerberHeader(fileFunction, polarity), 'M02*', ''].join('\n');
}

/** Board outline (profile) as a single closed contour drawn with a 0.1 mm line. */
export function outlineGerber(geometry) {
  const { width: w, height: h, shape, radius: r } = geometry;
  const c = coordinate, lines = [...gerberHeader('Profile,NP'), '%ADD10C,0.1*%', 'D10*', 'G01*'];
  if (shape === 'circle') {
    lines.push('G75*', `X${c(w)}Y${c(h / 2)}D02*`, 'G03*', `X${c(w)}Y${c(h / 2)}I${c(-w / 2)}J0D01*`, 'G01*');
  } else if (shape === 'rounded' && r > 0) {
    lines.push('G75*', `X${c(r)}Y0D02*`,
      `X${c(w - r)}Y0D01*`, 'G03*', `X${c(w)}Y${c(r)}I0J${c(r)}D01*`, 'G01*',
      `X${c(w)}Y${c(h - r)}D01*`, 'G03*', `X${c(w - r)}Y${c(h)}I${c(-r)}J0D01*`, 'G01*',
      `X${c(r)}Y${c(h)}D01*`, 'G03*', `X0Y${c(h - r)}I0J${c(-r)}D01*`, 'G01*',
      `X0Y${c(r)}D01*`, 'G03*', `X${c(r)}Y0I${c(r)}J0D01*`, 'G01*');
  } else {
    lines.push('X0Y0D02*', `X${c(w)}Y0D01*`, `X${c(w)}Y${c(h)}D01*`, `X0Y${c(h)}D01*`, 'X0Y0D01*');
  }
  lines.push('M02*', '');
  return lines.join('\n');
}

/** Excellon drill file for non-plated mounting holes. */
export function drillFile(holes) {
  if (!holes.length) return null;
  const lines = ['M48', '; Made with PCB Art Studio - non-plated mounting holes', 'FMAT,2', 'METRIC', `T1C${HOLE_DIAMETER.toFixed(3)}`, '%', 'G90', 'G05', 'T1'];
  for (const hole of holes) lines.push(`X${hole.x.toFixed(3)}Y${hole.y.toFixed(3)}`);
  lines.push('T0', 'M30', '');
  return lines.join('\n');
}

/** Every fabrication file, keyed by file name. Uses the widely recognised Protel extensions. */
export function fabricationFiles(layers, geometry, pixel, { name = 'pcb-art', notes = '' } = {}) {
  const { width, height } = layers;
  const copper = bitmapGerber(layers.copper, width, height, pixel, geometry.height, 'Copper,L1,Top', 'Positive');
  const mask = bitmapGerber(layers.opening, width, height, pixel, geometry.height, 'Soldermask,Top', 'Negative');
  const silk = bitmapGerber(layers.silk, width, height, pixel, geometry.height, 'Legend,Top', 'Positive');
  const files = {
    [`${name}.GTL`]: copper.text,
    [`${name}.GTS`]: mask.text,
    [`${name}.GTO`]: silk.text,
    [`${name}.GBL`]: emptyGerber('Copper,L2,Bot', 'Positive'),
    [`${name}.GBS`]: emptyGerber('Soldermask,Bot', 'Negative'),
    [`${name}.GKO`]: outlineGerber(geometry),
  };
  const drill = drillFile(geometry.holes);
  if (drill) files[`${name}-NPTH.DRL`] = drill;
  files['README.txt'] = notes;
  return { files, stats: { copper: copper.rectangles, mask: mask.rectangles, silk: silk.rectangles } };
}

/** Plain-language order notes placed in the ZIP. */
export function orderNotes({ geometry, pixel, maskColor, surface, usesGold, usesBare }) {
  const size = geometry.shape === 'circle' ? `${geometry.width} mm diameter circle` : `${geometry.width} x ${geometry.height} mm ${geometry.shape === 'rounded' ? `rectangle with ${geometry.radius} mm corners` : 'rectangle'}`;
  return [
    'PCB Art Studio - order notes',
    '============================',
    '',
    `Board: ${size}`,
    'Layers: 2 (all artwork is on the top side, the bottom stays plain)',
    `Solder mask colour you previewed: ${maskColor}`,
    `Surface finish you previewed: ${surface}${usesGold ? ', used on the exposed metal areas' : ''}`,
    `Detail size: ${pixel} mm per pixel`,
    geometry.holes.length ? `Mounting holes: ${geometry.holes.length} x ${HOLE_DIAMETER} mm, non-plated` : 'Mounting holes: none',
    '',
    'Files',
    '- .GTL top copper   - .GTS top solder mask openings   - .GTO top silkscreen',
    '- .GBL / .GBS empty bottom copper and mask   - .GKO board outline',
    geometry.holes.length ? '- -NPTH.DRL non-plated drill holes' : null,
    '',
    'Ordering',
    '1. Upload this ZIP unchanged to your PCB maker (for example JLCPCB or PCBWay).',
    '2. Check their online Gerber viewer before paying: it should look like the preview.',
    `3. Pick the same solder mask colour${usesGold ? ' and ENIG (gold) or HASL (silver) as surface finish' : ''}.`,
    usesBare ? '4. Areas with neither mask nor copper show the bare board material.' : null,
    '',
    'Copper keeps 0.3 mm away from the board edge. Details smaller than about 0.15 mm',
    'may be simplified by the manufacturer. This is art, not a tested electrical design.',
    '',
  ].filter(line => line !== null).join('\n');
}
