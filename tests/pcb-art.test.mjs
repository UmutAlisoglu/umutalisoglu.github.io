import test from 'node:test';
import assert from 'node:assert/strict';
import { bitmapRectangles, bitmapGerber, boardGeometry, buildLayers, despeckle, quantize, outlineGerber, drillFile, fabricationFiles, orderNotes, insideDistance } from '../src/pcb-art/core.js';

// Reads rectangle flashes back from a Gerber layer and paints them onto a grid.
function rasterize(text, width, height, pixel, boardHeight) {
  const apertures = new Map();
  for (const [, code, w, h] of text.matchAll(/%ADD(\d+)R,([\d.]+)X([\d.]+)\*%/g)) apertures.set(code, [Number(w), Number(h)]);
  const grid = new Uint8Array(width * height);
  let current;
  for (const line of text.split('\n')) {
    const select = line.match(/^D(\d+)\*$/); if (select) { current = apertures.get(select[1]); continue; }
    const flash = line.match(/^X(-?\d+)Y(-?\d+)D03\*$/); if (!flash) continue;
    const [w, h] = current, cx = flash[1] / 1e6, cy = flash[2] / 1e6;
    const x0 = Math.round((cx - w / 2) / pixel), y0 = Math.round((boardHeight - cy - h / 2) / pixel);
    for (let y = y0; y < y0 + Math.round(h / pixel); y++) for (let x = x0; x < x0 + Math.round(w / pixel); x++) grid[y * width + x]++;
  }
  return grid;
}

test('rectangle cover reproduces every pixel exactly once', () => {
  const width = 37, height = 23, bitmap = new Uint8Array(width * height);
  let seed = 7; for (let i = 0; i < bitmap.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; bitmap[i] = seed % 3 === 0 ? 1 : 0; }
  for (let y = 4; y < 15; y++) for (let x = 3; x < 20; x++) bitmap[y * width + x] = 1;
  const covered = new Uint8Array(bitmap.length);
  for (const r of bitmapRectangles(bitmap, width, height)) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) covered[y * width + x]++;
  assert.deepEqual([...covered], [...bitmap]);
  const pixel = 0.2, gerber = bitmapGerber(bitmap, width, height, pixel, height * pixel, 'Copper,L1,Top', 'Positive');
  assert.deepEqual([...rasterize(gerber.text, width, height, pixel, height * pixel)], [...bitmap]);
  assert.match(gerber.text, /^G04 /); assert.match(gerber.text, /%FSLAX46Y46\*%\n%MOMM\*%/); assert.match(gerber.text, /M02\*\n$/);
});

test('quantize spreads brightness over levels and dithering keeps the average tone', () => {
  const gray = Float32Array.from({ length: 100 }, (_, i) => i / 99);
  assert.deepEqual([...new Set(quantize(gray, 100, 1, 3))], [0, 1, 2]);
  const mid = new Float32Array(400).fill(0.5), dithered = quantize(mid, 20, 20, 2, { dither: true });
  const ones = dithered.reduce((a, b) => a + b, 0);
  assert.ok(ones > 180 && ones < 220, `about half the pixels should be on, got ${ones}`);
});

test('despeckle removes islands below the minimum area', () => {
  const labels = new Uint8Array(100); labels[55] = 1; labels[11] = 1; labels[12] = 1; labels[21] = 1; labels[22] = 1;
  despeckle(labels, 10, 10, 3);
  assert.equal(labels[55], 0); assert.equal(labels[11], 1);
});

test('layers keep copper away from the edge and clear the outside of round boards', () => {
  const geometry = boardGeometry({ width: 20, height: 20, shape: 'circle' }), pixel = 0.1, size = 200;
  const levels = new Uint8Array(size * size).fill(1);
  const layers = buildLayers(levels, size, size, ['maskSubstrate', 'gold'], geometry, pixel);
  assert.equal(layers.copper[0], 0); assert.equal(layers.finish[0], 255);
  const centre = 100 * size + 100; assert.equal(layers.copper[centre], 1); assert.equal(layers.opening[centre], 1);
  for (let i = 0; i < layers.copper.length; i++) if (layers.copper[i]) {
    const x = (i % size + 0.5) * pixel, y = 20 - (Math.floor(i / size) + 0.5) * pixel;
    assert.ok(insideDistance(geometry, x, y) >= 0.3, 'copper is at least 0.3 mm inside the outline');
  }
});

test('outline is one closed contour and holes produce an Excellon file', () => {
  for (const shape of ['rectangle', 'rounded', 'circle']) {
    const text = outlineGerber(boardGeometry({ width: 85, height: 55, shape, radius: 3 }));
    const points = [...text.matchAll(/X(-?\d+)Y(-?\d+)[^D]*D0([12])\*/g)];
    assert.equal(points[0][3], '2'); assert.ok(points.slice(1).every(p => p[3] === '1'));
    assert.equal(points.at(-1)[1] + ',' + points.at(-1)[2], points[0][1] + ',' + points[0][2], `${shape} outline closes`);
  }
  const geometry = boardGeometry({ width: 85, height: 55, holes: true });
  assert.equal(geometry.holes.length, 4);
  assert.match(drillFile(geometry.holes), /^M48\n[\s\S]*METRIC\nT1C3\.200[\s\S]*X81\.000Y51\.000[\s\S]*M30\n$/);
  assert.equal(drillFile([]), null);
});

test('fabrication set contains every layer a fab expects', () => {
  const geometry = boardGeometry({ width: 10, height: 10 }), pixel = 0.5;
  const levels = new Uint8Array(400).map((_, i) => i % 3);
  const layers = buildLayers(levels, 20, 20, ['maskSubstrate', 'gold', 'silk'], geometry, pixel);
  const notes = orderNotes({ geometry, pixel, maskColor: 'Green', surface: 'ENIG', usesGold: true, usesBare: false });
  const { files } = fabricationFiles(layers, geometry, pixel, { notes });
  assert.deepEqual(Object.keys(files).sort(), ['README.txt', 'pcb-art.GBL', 'pcb-art.GBS', 'pcb-art.GKO', 'pcb-art.GTL', 'pcb-art.GTO', 'pcb-art.GTS']);
  assert.match(files['pcb-art.GTS'], /%TF.FilePolarity,Negative\*%/);
  assert.match(files['README.txt'], /10 x 10 mm rectangle/);
});

test('sliver removal turns a one-pixel outline into its surroundings but keeps solid shapes', async () => {
  const { removeSlivers } = await import('../src/pcb-art/core.js');
  const width = 12, height = 12, labels = new Uint8Array(width * height);
  for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) labels[y * width + x] = 2;
  for (let x = 2; x < 10; x++) labels[2 * width + x] = 1; // anti-aliased fringe between background and square
  for (let y = 1; y < 11; y++) labels[y * width + 11] = 2; // a real one-pixel stroke of the lightest tone
  removeSlivers(labels, width, height, 2);
  assert.ok([...labels].every(v => v !== 1), 'the fringe is gone');
  assert.equal(labels[5 * width + 5], 2);
  for (let y = 1; y < 11; y++) assert.equal(labels[y * width + 11], 2, 'thin strokes of real artwork stay');
});

test('back artwork goes to mirrored bottom layers', () => {
  const geometry = boardGeometry({ width: 10, height: 6 }), pixel = 0.5, width = 20, height = 12;
  const front = buildLayers(new Uint8Array(width * height), width, height, ['maskSubstrate'], geometry, pixel);
  // A silkscreen block near the left edge of the back, as seen when the board is turned over.
  const levels = new Uint8Array(width * height);
  for (let y = 4; y < 8; y++) for (let x = 2; x < 5; x++) levels[y * width + x] = 1;
  const back = buildLayers(levels, width, height, ['maskSubstrate', 'silk'], geometry, pixel);
  const notes = orderNotes({ geometry, pixel, maskColor: 'Blue', surface: 'HASL', usesGold: false, usesBare: false, backPixel: pixel });
  const { files, stats } = fabricationFiles(front, geometry, pixel, { notes, back: { layers: back, pixel } });
  assert.deepEqual(Object.keys(files).sort(), ['README.txt', 'pcb-art.GBL', 'pcb-art.GBO', 'pcb-art.GBS', 'pcb-art.GKO', 'pcb-art.GTL', 'pcb-art.GTO', 'pcb-art.GTS']);
  assert.match(files['pcb-art.GBO'], /%TF.FileFunction,Legend,Bot\*%/);
  assert.match(files['pcb-art.GBS'], /%TF.FileFunction,Soldermask,Bot\*%/);
  assert.equal(stats.bottomSilk, 1);
  // Seen from the top the block sits near the right edge: x from 10 - 2.5 to 10 - 1 mm.
  const mirrored = new Uint8Array(width * height);
  for (let y = 4; y < 8; y++) for (let x = width - 5; x < width - 2; x++) mirrored[y * width + x] = 1;
  assert.deepEqual([...rasterize(files['pcb-art.GBO'], width, height, pixel, geometry.height)], [...mirrored]);
  assert.match(files['README.txt'], /artwork on the front and on the back/);
  assert.match(files['README.txt'], /bottom files are mirrored/);
});

test('fine detail is made manufacturable: thin lines grow, narrow gaps close, rules pass', async () => {
  const { checkRules, rulePixels, RULES } = await import('../src/pcb-art/core.js');
  const geometry = boardGeometry({ width: 10, height: 10 }), pixel = 0.1, size = 100;
  const levels = new Uint8Array(size * size);
  for (let x = 10; x < 90; x++) levels[50 * size + x] = 1; // a 0.1 mm copper line
  for (let y = 20; y < 40; y++) for (let x = 10; x < 40; x++) levels[y * size + x] = 1;
  for (let y = 20; y < 40; y++) for (let x = 41; x < 70; x++) levels[y * size + x] = 1; // 0.1 mm gap
  for (let y = 60; y < 80; y++) levels[y * size + 30] = 2; // a 0.1 mm silkscreen line
  const raw = buildLayers(levels, size, size, ['maskSubstrate', 'maskCopper', 'silk'], geometry, pixel, { rules: false });
  const before = checkRules(raw, pixel);
  assert.ok(before.copperWidth > 0 && before.copperSpace > 0 && before.silkWidth > 0);
  const layers = buildLayers(levels, size, size, ['maskSubstrate', 'maskCopper', 'silk'], geometry, pixel);
  assert.deepEqual(Object.values(checkRules(layers, pixel)), [0, 0, 0, 0, 0, 0]);
  assert.equal(layers.copper[50 * size + 50], 1, 'the thin line is kept, not deleted');
  assert.equal(layers.silk[70 * size + 30], 1);
  assert.equal(layers.copper[30 * size + 40], 1, 'the narrow gap is closed');
  assert.ok(layers.fixed > 0);
  assert.equal(rulePixels(RULES.copperWidth, 0.15), 1, 'at 0.15 mm detail every pixel already meets the rules');
});

test('text overrides win over the image', () => {
  const geometry = boardGeometry({ width: 10, height: 10 }), pixel = 0.5, size = 20;
  const overrides = new Uint8Array(size * size).fill(255);
  for (let x = 4; x < 16; x++) overrides[10 * size + x] = 4; // silk
  const layers = buildLayers(new Uint8Array(size * size), size, size, ['maskSubstrate'], geometry, pixel, { overrides });
  assert.equal(layers.silk[10 * size + 8], 1); assert.equal(layers.silk[5 * size + 8], 0);
});
