// NFC business card, 85 x 55 mm: a round 6-turn antenna coil with an NXP NT3H2111 tag chip,
// personal text and icons on the front, tap target, monogram and QR code on the back.
// Browser port of scripts/pcb-cards/nfc-card/card.py. The antenna and chip circuit are fixed
// (they are tuned and checked); everything a person types is fitted around them.
import qrcode from 'qrcode-generator';
import {
  union, diff, inter, offset, polygon, disc, ring, box, rrect, stroke, rotate, scale, translate,
  bounds, outers, blob, S, EMPTY,
} from './geom.js';
import { arcText, centredText } from './text.js';
import { flattenSvgPath } from './svgpath.js';
import { DEFAULTS } from './options.js';

export { DEFAULTS, ICON_LABELS } from './options.js';

export const W = 85, H = 55, R = 3;
export const BOARD = rrect(0, 0, W, H, R);

// ------------------------------------------------------------ antenna (fixed, tuned)
export const CX = 62.0, CY = 27.5, R0 = 21.6;
const TURNS = 6, TW = 0.5, TS = 0.4, PITCH = TW + TS, JOG = 2.6;
const XS = CX + JOG / 2;
export const VIA_DRILL = 0.3, VIA_PAD = 0.6;
export const R_IN = R0 - TURNS * PITCH + TS;
const QR_GROW = 0.056;
const MONO_GROW = 0.03; // thickens the thinnest strokes of small silkscreen text to at least 0.15 mm

function circPath(r, xStart, xEnd, seg = 0.35) {
  const a0 = Math.atan2(-Math.sqrt(r * r - (xStart - CX) ** 2), xStart - CX);
  const a1 = Math.atan2(-Math.sqrt(r * r - (xEnd - CX) ** 2), xEnd - CX) + 2 * Math.PI;
  const n = Math.floor((a1 - a0) * r / seg);
  const out = [];
  for (let t = 0; t <= n; t++) out.push([CX + r * Math.cos(a0 + (a1 - a0) * t / n), CY + r * Math.sin(a0 + (a1 - a0) * t / n)]);
  return out;
}

const coilPts = [];
for (let i = 0; i < TURNS; i++) coilPts.push(...circPath(R0 - TW / 2 - i * PITCH, XS, XS - JOG));
const outerEnd = coilPts[0], innerEnd = coilPts[coilPts.length - 1];
const yIn = innerEnd[1];
export const V1 = [XS, outerEnd[1] - 1.7];
export const V2 = [XS, yIn + 2.4];
export const U1 = [XS - JOG / 2, yIn + 5.25];
export const C1 = [U1[0], yIn + 1.45];
const PADX = 2.8625, PADW = 1.475, PADH = 0.45;
function tssopPin(n) {
  const [x, y] = n <= 4 ? [-PADX, 0.975 - (n - 1) * 0.65] : [PADX, -0.975 + (n - 5) * 0.65];
  return [U1[0] - x, U1[1] - y]; // chip rotated 180°
}

/** The antenna, chip and tuning pads. Same on every card. */
function antennaCircuit() {
  const top = { cu: [], pads: [], silk: [], text: [] };
  const bot = { cu: [] };
  const coil = stroke(coilPts, TW);
  top.pads.push(coil);
  top.cu.push(stroke([outerEnd, V1], 0.4));
  for (const v of [V1, V2]) top.cu.push(disc(v[0], v[1], VIA_PAD / 2));
  const u1Pads = [];
  for (let n = 1; n <= 8; n++) {
    const [x, y] = tssopPin(n);
    u1Pads.push(box(x - PADW / 2, y - PADH / 2, x + PADW / 2, y + PADH / 2));
  }
  top.pads.push(...u1Pads);
  const LB = tssopPin(8), LA = tssopPin(1);
  top.pads.push(stroke([innerEnd, [innerEnd[0], LB[1] - (innerEnd[0] - LB[0])], LB], 0.4));
  top.cu.push(stroke([V2, [XS, LA[1] - (LA[0] - XS)], LA], 0.4));
  const c1Pads = [-0.48, 0.48].map(sx => box(C1[0] + sx - 0.28, C1[1] - 0.31, C1[0] + sx + 0.28, C1[1] + 0.31));
  top.pads.push(...c1Pads);
  top.pads.push(stroke([[innerEnd[0], C1[1]], [C1[0] - 0.48, C1[1]]], 0.3));
  top.cu.push(stroke([[XS, C1[1]], [C1[0] + 0.48, C1[1]]], 0.3));
  bot.cu.push(stroke([[W - V1[0], V1[1]], [W - V2[0], V2[1]]], 0.4));
  for (const v of [V1, V2]) bot.cu.push(disc(W - v[0], v[1], VIA_PAD / 2));
  const bx0 = U1[0] - 1.65, bx1 = U1[0] + 1.65, by0 = U1[1] - 1.65, by1 = U1[1] + 1.65;
  top.silk.push(stroke([[bx0 + 1.2, by1 + 0.25], [bx1 - 1.2, by1 + 0.25]], 0.15), stroke([[bx0 + 1.2, by0 - 0.25], [bx1 - 1.2, by0 - 0.25]], 0.15));
  top.silk.push(disc(LA[0] + 0.25, LA[1] - 0.95, 0.22));
  return { top, bot, u1Pads, c1Pads, by1 };
}

// ------------------------------------------------------------ drawing helpers
function waves(cx, cy, s = 1) {
  const ox = cx - 2 * s;
  const wedge = polygon([[ox, cy], [ox + 8 * s, cy + 6.2 * s], [ox + 8 * s, cy - 6.2 * s]]);
  return union(...[0.9, 1.65, 2.4, 3.15].map(rr => inter(ring(ox, cy, rr * s, 0.34 * s), wedge)));
}

function dashedRing(c, r, w, dash, gap) {
  const n = Math.max(8, Math.floor(2 * Math.PI * r / (dash + gap)));
  const cw = gap / 2;
  const cut = box(c[0] - cw, c[1], c[0] + cw, c[1] + r + 1);
  const cuts = union(...Array.from({ length: n }, (_, j) => rotate(cut, 360 * j / n, c[0], c[1])));
  return diff(ring(c[0], c[1], r, w), cuts);
}

/** Concentric target used on both sides: white centre with the contactless symbol, rings, dial ticks. */
function tapTarget(side, c, rIn, keepout) {
  side.silk.push(diff(disc(c[0], c[1], 4.0), waves(c[0], c[1], 0.95)));
  const parts = [ring(c[0], c[1], 5.6, 0.3), ring(c[0], c[1], 7.0, 0.18), dashedRing(c, 8.4, 0.18, 1.2, 0.5), dashedRing(c, 9.7, 0.16, 0.6, 0.55)];
  const r1 = rIn - 1.0;
  for (let j = 0; j < 120; j++) {
    const a = 2 * Math.PI * j / 120;
    const l = j % 10 === 0 ? 1.1 : j % 5 === 0 ? 0.75 : 0.45;
    parts.push(stroke([[c[0] + (r1 - l) * Math.cos(a), c[1] + (r1 - l) * Math.sin(a)], [c[0] + r1 * Math.cos(a), c[1] + r1 * Math.sin(a)]], 0.17, 'flat'));
  }
  side.silk.push(diff(union(...parts), keepout));
}


// ------------------------------------------------------------ icons (cut out of a metal tile)
const GH_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';
let ghUnit = null;

export const ICONS = {
  mail(cx, cy) {
    const r = rrect(cx - 1.2, cy - 0.85, cx + 1.2, cy + 0.85, 0.25);
    return union(diff(r, offset(r, -0.24)), stroke([[cx - 1.05, cy + 0.7], [cx, cy - 0.12], [cx + 1.05, cy + 0.7]], 0.24));
  },
  globe(cx, cy) {
    const e = scale(ring(cx, cy, 1.05, 0.24 / 0.42), 0.42, 1, cx, cy);
    return inter(union(ring(cx, cy, 1.05, 0.24), e, stroke([[cx - 1.05, cy], [cx + 1.05, cy]], 0.22)), disc(cx, cy, 1.18));
  },
  github(cx, cy, d = 2.75) {
    if (!ghUnit) ghUnit = polygon(...flattenSvgPath(GH_PATH, 8));
    const k = d / 16;
    return translate(scale(ghUnit, k, -k), cx - 8 * k, cy + 8 * k);
  },
  phone(cx, cy) {
    const r = rrect(cx - 0.72, cy - 1.15, cx + 0.72, cy + 1.15, 0.3);
    return union(diff(r, offset(r, -0.22)), stroke([[cx - 0.22, cy - 0.8], [cx + 0.22, cy - 0.8]], 0.2));
  },
  code(cx, cy) {
    return union(
      stroke([[cx - 0.45, cy + 0.75], [cx - 1.15, cy], [cx - 0.45, cy - 0.75]], 0.26),
      stroke([[cx + 0.45, cy + 0.75], [cx + 1.15, cy], [cx + 0.45, cy - 0.75]], 0.26),
      stroke([[cx + 0.22, cy + 0.95], [cx - 0.22, cy - 0.95]], 0.24));
  },
  pin(cx, cy) {
    const c = [cx, cy + 0.3];
    const r = 0.72;
    const a = Math.asin(r / 1.3);
    const tip = [cx, cy - 1.0];
    const shell = union(disc(c[0], c[1], r), polygon([tip, [c[0] + r * Math.cos(a), c[1] - r * Math.sin(a)], [c[0] - r * Math.cos(a), c[1] - r * Math.sin(a)]]));
    return union(diff(shell, offset(shell, -0.24)), ring(c[0], c[1], 0.2, 0.2));
  },
};

// ------------------------------------------------------------ the card

/** Cut off anything right of x (text that is too long even at its smallest size). */
const clipRight = (g, x) => inter(g, box(0, 0, x, H));

/** Left edge of the antenna keep-out between heights y0 and y1, minus a margin. */
function coilLimit(y0, y1, margin = 2.2) {
  const dy = y0 <= CY && CY <= y1 ? 0 : Math.min(Math.abs(y0 - CY), Math.abs(y1 - CY));
  if (dy >= R0) return W - 2.5;
  return Math.min(W - 2.5, CX - Math.sqrt(R0 * R0 - dy * dy) - margin);
}

/**
 * Lay out text with font size `size`, shrinking down to `min` until it fits `maxWidth`.
 * Returns { size, width, fits }.
 */
function fit(face, txt, size, min, maxWidth, tracking = 0, extra = 0) {
  let s = size;
  let w = face.measure(txt, s, tracking * s / size) + extra * s / size;
  while (w > maxWidth && s > min) {
    s = Math.max(min, s - 0.05);
    w = face.measure(txt, s, tracking * s / size) + extra * s / size;
  }
  return { size: s, width: w, fits: w <= maxWidth + 1e-6, tracking: tracking * s / size };
}

/**
 * Build both sides of the card.
 * faces: { black, bold, medium, mono } (text.js Face objects)
 * Returns layers in board coordinates (looking at the front; the back is mirrored like a maker expects)
 * plus `botView` (the back as seen after turning the card over) and notes about fitted text.
 */
export function buildCard(faces, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const notes = [];
  const side = () => ({ cu: [], gold: [], pads: [], bare: [], silk: [], text: [] });
  const TOP = side(), BOT = side();
  const mono = (txt, size, x, y, opts) => { const t = faces.mono.text(txt, size, x, y, opts); return { ...t, geom: offset(t.geom, MONO_GROW) }; };

  const fixed = staticParts();
  const circuit = fixed.circuit;
  TOP.text.push(mono('U1', 1.25, U1[0], circuit.by1 + 0.75, { anchor: 'center', tracking: 0.12 }).geom);
  TOP.text.push(mono('C1', 1.0, C1[0] + 2.65, C1[1] - 0.36, { tracking: 0.12 }).geom);

  // front, inside the coil
  const TC = [CX, CY + 1.6];
  const tagline = (o.tagline || '').trim().toUpperCase();
  if (tagline) {
    const f = fit(faces.mono, tagline, 1.3, 1.0, 26.5, 0.32);
    if (!f.fits) notes.push({ field: 'tagline', text: 'The tagline is too long for the arc. Shorten it to show all of it.' });
    const t = arcText(faces.mono, tagline, f.size, TC[0], TC[1], 11.0, { centerDeg: 90, tracking: f.tracking });
    TOP.text.push(offset(t.geom, MONO_GROW));
  }

  // front: identity (left)
  const LX = 4.6;
  const monogram = (o.monogram || '').trim();
  let nameX = LX;
  if (monogram) {
    const tile = rrect(LX, 40.4, LX + 10.4, 50.8, 2.3);
    let size = 8.6;
    let m = centredText(faces.black, monogram, size, LX + 5.2, 45.6, { tracking: -0.15 });
    while ((m.width > 7.8 || m.height > 7.4) && size > 3) { size -= 0.2; m = centredText(faces.black, monogram, size, LX + 5.2, 45.6, { tracking: -0.15 * size / 8.6 }); }
    TOP.gold.push(diff(tile, offset(m.geom, 0.02)));
    TOP.cu.push(tile);
    nameX = 17.6;
  }
  const first = (o.first || '').trim(), last = (o.last || '').trim();
  const lines = [first, last].filter(Boolean);
  const nameY = lines.length === 2 ? [45.6, 40.5] : [42.6];
  const dotExtra = o.dot ? 1.17 + 0.66 : 0;
  const limit = coilLimit(39.5, 51.5);
  let nameSize = 5.9;
  let nameFits = true;
  for (let i = 0; i < lines.length; i++) {
    const isLast = i === lines.length - 1;
    const f = fit(faces.bold, lines[i], 5.9, 3.0, limit - nameX, -0.12, isLast ? dotExtra : 0);
    nameSize = Math.min(nameSize, f.size);
    nameFits = nameFits && f.fits;
    if (!f.fits) notes.push({ field: i === 0 && lines.length === 2 ? 'first' : 'last', text: 'The name is too long for one line, even in the smallest size.' });
  }
  if (lines.length === 1) nameSize = Math.min(nameSize * 1.12, fit(faces.bold, lines[0], 6.6, 3.0, limit - nameX, -0.12, dotExtra).size);
  lines.forEach((line, i) => {
    const t = faces.bold.text(line, nameSize, nameX, nameY[i], { tracking: -0.12 * nameSize / 5.9 });
    TOP.text.push(clipRight(t.geom, limit));
    if (o.dot && nameFits && i === lines.length - 1) {
      const k = nameSize / 5.9;
      TOP.gold.push(disc(nameX + t.width + 1.17 * k, nameY[i] + 0.62 * k, 0.66 * k));
    }
  });

  const rows = (o.rows || []).filter(r => r && r.text && r.text.trim()).slice(0, 3);
  const rowY = [28.4, 22.4, 16.4];
  rows.forEach((row, i) => {
    const yb = rowY[i];
    const t = rrect(LX, yb - 0.75, LX + 3.7, yb + 2.95, 0.8);
    const icon = (ICONS[row.icon] || ICONS.globe)(LX + 1.85, yb + 1.1);
    TOP.gold.push(diff(t, icon));
    TOP.cu.push(t);
    const max = coilLimit(yb - 0.6, yb + 2.4) - (LX + 5.4);
    const f = fit(faces.medium, row.text.trim(), 2.4, 1.7, max, 0.04); // a hair of tracking keeps tight pairs such as "tA" 0.15 mm apart
    if (!f.fits) notes.push({ field: `row${i}`, text: `Contact line ${i + 1} is too long. Shorten it so it does not run into the antenna.` });
    TOP.text.push(clipRight(faces.medium.text(row.text.trim(), f.size, LX + 5.4, yb + 0.15, { tracking: f.tracking }).geom, LX + 5.4 + max));
  });
  const footer = (o.footer || '').trim().toUpperCase();
  const busX = LX + 1.85;
  if (rows.length > 1) TOP.gold.push(stroke([[busX, rowY[0] - 0.75], [busX, rowY[rows.length - 1] + 2.95]], 0.3));
  if (footer) {
    const footerMax = coilLimit(7.8, 10) - (LX + 5.4);
    const f = fit(faces.mono, footer, 1.25, 1.0, footerMax, 0.2);
    if (!f.fits) notes.push({ field: 'footer', text: 'The bottom line is too long. Shorten it so it fits next to the antenna.' });
    if (rows.length) TOP.gold.push(stroke([[busX, rowY[rows.length - 1] - 0.75], [busX, 9.6]], 0.3));
    TOP.gold.push(diff(disc(busX, 8.9, 0.85), disc(busX, 8.9, 0.36)));
    TOP.bare.push(disc(busX, 8.9, 0.36));
    TOP.text.push(clipRight(mono(footer, f.size, LX + 5.4, 8.4, { tracking: f.tracking }).geom, LX + 5.4 + footerMax));
  }

  if (o.ripples) {
    // text outside the antenna keeps the ripples away by a rounded box; metal by its own outline
    const outside = g => { const b = bounds(g); return b && (b.x1 < CX - R0 - 1 || b.y1 < CY - R0 - 1 || b.y0 > CY + R0 + 1 || b.x0 > CX + R0 + 1); };
    const avoidTop = [...TOP.text.filter(outside).map(g => blob(g, 0.9)), offset(outers(union(...TOP.gold, ...TOP.bare)), 0.9)];
    TOP.field = rippleArcs([CX, CY], avoidTop);
  }

  // back (drawn as seen after turning the card over, mirrored on export)
  const BCX = W - CX;

  const MGC = [66.6, 40.2];
  const avoidBot = [];
  if (monogram) {
    const MG = rrect(MGC[0] - 6, MGC[1] - 6, MGC[0] + 6, MGC[1] + 6, 2.7);
    let size = 9.8;
    let m = centredText(faces.black, monogram, size, MGC[0], MGC[1], { tracking: -0.2 });
    while ((m.width > 9.2 || m.height > 8.6) && size > 3) { size -= 0.2; m = centredText(faces.black, monogram, size, MGC[0], MGC[1], { tracking: -0.2 * size / 9.8 }); }
    BOT.gold.push(diff(MG, offset(m.geom, 0.02)));
    BOT.cu.push(MG);
    for (let j = 0; j < 36; j++) {
      const a = 2 * Math.PI * j / 36;
      BOT.silk.push(disc(MGC[0] + 9 * Math.cos(a), MGC[1] + 9 * Math.sin(a), j % 3 ? 0.34 : 0.48));
    }
    avoidBot.push(offset(MG, 1.0), disc(MGC[0], MGC[1], 9.48 + 0.9));
  }
  const backTitle = (o.backTitle || '').trim();
  if (backTitle) {
    const half = Math.min(MGC[0] - (BCX + R0 + 1.5), W - 2.6 - MGC[0]);
    const f = fit(faces.bold, backTitle, 3.9, 2.2, 2 * half, -0.08);
    if (!f.fits) notes.push({ field: 'backTitle', text: 'The big line on the back is too long. Shorten it to fit.' });
    BOT.text.push(inter(faces.bold.text(backTitle, f.size, MGC[0], 24.6, { tracking: f.tracking, anchor: 'center' }).geom, box(MGC[0] - half, 0, MGC[0] + half, H)));
  }

  const url = (o.url || '').trim();
  let qrInfo = null;
  if (url) {
    const qr = qrcode(0, 'M');
    qr.addData(unescape(encodeURIComponent(url)));
    qr.make();
    const NM = qr.getModuleCount();
    const quiet = 1.5;
    const MOD = Math.min(0.52, 16.3 / NM);
    if (MOD < 0.4) notes.push({ field: 'url', text: 'This link is too long for a QR code that phones can read at this size. Use a shorter link.' });
    const qsize = NM * MOD;
    const QX = MGC[0] - qsize / 2, QY = 3.0 + quiet;
    const bg = rrect(QX - quiet, QY - quiet, QX + qsize + quiet, QY + qsize + quiet, 1.0);
    const dark = [];
    for (let r = 0; r < NM; r++) for (let c = 0; c < NM; c++) {
      // dark modules grow a little so white modules that touch only at a corner end up 0.15 mm apart
      if (qr.isDark(r, c)) dark.push(box(QX + c * MOD - QR_GROW, QY + (NM - 1 - r) * MOD - QR_GROW, QX + (c + 1) * MOD + QR_GROW, QY + (NM - r) * MOD + QR_GROW));
    }
    BOT.silk.push(diff(bg, union(...dark)));
    avoidBot.push(offset(bg, 1.1));
    qrInfo = { modules: NM, module: MOD, x: QX, y: QY, size: qsize };
  }
  if (o.ripples) {
    avoidBot.push(...BOT.text.map(g => blob(g, 0.9)));
    BOT.field = rippleArcs([BCX, CY], avoidBot);
  }

  const top = finish(TOP, fixed.top);
  const botView = finish(BOT, fixed.bot);
  const mirror = g => scale(g, -1, 1, W / 2, 0);
  const bot = Object.fromEntries(Object.entries(botView).map(([k, v]) => [k, v && v.map ? mirror(v) : v]));
  const paste = union(...circuit.u1Pads.map(p => offset(p, -0.03, 'miter')));
  return { top, bot, botView, paste, board: BOARD, vias: [V1, V2], U1, C1, qr: qrInfo, notes, options: o };
}

const EDGE = offset(BOARD, -0.35);
const SILK_AREA = offset(BOARD, -0.25);
const MASK_AREA = offset(BOARD, -0.05);

/** Close gaps under 0.16 mm and remove strokes thinner than 0.156 mm in printed line art. */
function cleanArt(g) {
  const closed = offset(offset(g, 0.08), -0.08);
  return offset(offset(closed, -0.078), 0.078);
}

/**
 * Combine one side's parts into copper, mask and silkscreen layers.
 * The ripples and the fixed antenna art never touch anything else (they are kept apart by
 * construction), so they are added as they are instead of going through slow polygon booleans.
 * The parts that change with what a person types are returned separately for the quick check.
 */
function finish(S, fixed) {
  const gold = union(...S.gold);
  const bare = union(...S.bare);
  const cuParts = inter(union(...S.cu, offset(gold, 0.08)), EDGE);
  const opening = union(gold, bare);
  const keepOff = union(offset(outers(opening), 0.1), fixed.keep);
  const silkParts = inter(diff(union(...S.silk, ...S.text), keepOff), SILK_AREA);
  const field = S.field || EMPTY;
  return {
    cu: [...fixed.cu, ...cuParts, ...field],
    mask: [...fixed.opening, ...inter(opening, MASK_AREA)],
    silk: [...fixed.art, ...silkParts],
    cuParts, silkParts, field, fixedArt: fixed.art, fixedCu: fixed.cu,
  };
}

// Parts that are the same on every card are built once.
let STATIC = null;
function staticParts() {
  if (STATIC) return STATIC;
  const circuit = antennaCircuit();
  const front = { silk: [...circuit.top.silk] };
  const TC = [CX, CY + 1.6];
  const keep = union(box(U1[0] - 4.8, 0, U1[0] + 4.8, circuit.by1 + 2.2), box(C1[0] - 3, 0, C1[0] + 4.4, C1[1] + 0.9));
  tapTarget(front, TC, R_IN - (TC[1] - CY), offset(keep, 0.5));
  const back = { silk: [] };
  const BCX = W - CX;
  back.silk.push(dashedRing([BCX, CY], R0 - 0.6, 0.16, 0.9, 0.55));
  const bkeep = box(BCX - 1.0, 0, BCX + 1.0, V2[1] + 1.0);
  tapTarget(back, [BCX, CY + 1.6], R_IN - 1.6, bkeep);
  back.silk.push(diff(union(dashedRing([BCX, CY], 16.4, 0.16, 0.5, 0.6), dashedRing([BCX, CY], 18.4, 0.16, 0.35, 0.75)), bkeep));
  const pads = union(...circuit.top.pads);
  const padsOff = offset(pads, 0.15);
  STATIC = {
    circuit,
    top: {
      art: inter(cleanArt(diff(union(...front.silk), padsOff)), SILK_AREA),
      cu: inter(union(...circuit.top.cu, pads), EDGE),
      opening: inter(offset(pads, 0.05), MASK_AREA),
      keep: offset(union(...circuit.u1Pads, ...circuit.c1Pads), 0.15), // labels stay clear of the chip pads
    },
    bot: { art: inter(cleanArt(union(...back.silk)), SILK_AREA), cu: inter(union(...circuit.bot.cu), EDGE), opening: EMPTY, keep: EMPTY },
  };
  return STATIC;
}

// ------------------------------------------------------------ copper ripples
const RIPPLE_W = 0.2;
const RIPPLE_MIN = 0.75; // mm: shorter pieces are left out
const CLIP_IN = 1.2, CLIP_R = R - CLIP_IN;

function inClip(x, y) {
  const x0 = CLIP_IN + CLIP_R, x1 = W - CLIP_IN - CLIP_R, y0 = CLIP_IN + CLIP_R, y1 = H - CLIP_IN - CLIP_R;
  if (x < CLIP_IN || x > W - CLIP_IN || y < CLIP_IN || y > H - CLIP_IN) return false;
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  return dx * dx + dy * dy <= CLIP_R * CLIP_R;
}

/** Fast point test against a set of outlines without holes. */
function avoidTester(geoms) {
  const polys = geoms.flatMap(g => outers(g)).map(path => {
    const pts = path.map(p => [p.X / S, p.Y / S]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { pts, x0, y0, x1, y1 };
  });
  return (x, y) => {
    for (const p of polys) {
      if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
      let inside = false;
      const pts = p.pts;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  };
}

/** One ripple piece: an arc band with round ends, as a counter-clockwise integer path. */
function arcBand(c, r, a0, a1, w) {
  const h = w / 2, pts = [];
  const seg = (rad, from, to) => {
    const n = Math.max(2, Math.ceil(Math.abs(to - from) * rad / 0.3));
    for (let i = 0; i <= n; i++) { const a = from + (to - from) * i / n; pts.push([c[0] + rad * Math.cos(a), c[1] + rad * Math.sin(a)]); }
  };
  const cap = (a, from, to) => {
    const ex = c[0] + r * Math.cos(a), ey = c[1] + r * Math.sin(a);
    for (let i = 1; i < 8; i++) { const p = from + (to - from) * i / 8; pts.push([ex + h * Math.cos(p), ey + h * Math.sin(p)]); }
  };
  seg(r + h, a0, a1);
  cap(a1, a1, a1 + Math.PI);
  seg(r - h, a1, a0);
  cap(a0, a0 + Math.PI, a0 + 2 * Math.PI);
  return pts.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
}

/**
 * Tone-on-tone copper ripples spreading from the antenna across the card, stopping
 * around text and metal. Each piece is an arc with round ends, so cut ends never get thin.
 */
function rippleArcs(c, avoidGeoms, step = 1.05) {
  const avoid = avoidTester(avoidGeoms);
  const out = [];
  let r = R0 + 3.0;
  for (let k = 0; r < 95; k++) {
    const da = 0.06 / r;
    const n = Math.ceil(2 * Math.PI / da);
    const ok = new Uint8Array(n);
    let start = -1;
    for (let i = 0; i < n; i++) {
      const a = i * da;
      const x = c[0] + r * Math.cos(a), y = c[1] + r * Math.sin(a);
      ok[i] = inClip(x, y) && !avoid(x, y) ? 1 : 0;
      if (!ok[i] && start < 0) start = i;
    }
    if (start >= 0) {
      const trim = (RIPPLE_W / 2 + 0.05) / r;
      let run = -1;
      for (let m = 1; m <= n; m++) {
        const i = (start + m) % n;
        if (ok[i] && run < 0) run = start + m;
        if ((!ok[i] || m === n) && run >= 0) {
          const a0 = run * da + trim, a1 = (start + m - 1) * da - trim;
          if ((a1 - a0) * r >= RIPPLE_MIN) out.push(arcBand(c, r, a0, a1, RIPPLE_W));
          run = -1;
        }
      }
    }
    r += step + k * 0.012;
  }
  return out;
}

export { EMPTY, bounds };
