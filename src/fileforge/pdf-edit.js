// PDF text editing, without a server.
//
// A PDF does not store paragraphs, only glyphs placed at positions. So a "text edit" is an
// overlay: the original text is covered with a patch in the page colour and the new text is
// drawn on top in a standard font (or Noto Sans for characters outside Latin-1). This file
// holds the parts that do not need a browser: grouping pdf.js text items into editable lines,
// sampling colours, geometry and writing the edited file with pdf-lib.
export const EDIT_LIMIT = 25 * 1024 * 1024;
export const PAGE_LIMIT = 200;

// Vertical extent of a line, as fractions of the font size (above and below the baseline).
const ASCENT = 0.86, DESCENT = 0.24, PAD = 0.9;

const STANDARD = {
  sans: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'],
  serif: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
  mono: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'],
};
export const standardFontName = (family, bold, italic) => (STANDARD[family] || STANDARD.sans)[(bold ? 1 : 0) + (italic ? 2 : 0)];

// Guess the closest standard font from the embedded font's name and pdf.js' CSS family.
export function describeFont(fontName = '', cssFamily = '') {
  const name = `${fontName} ${cssFamily}`.toLowerCase();
  const family = /courier|mono|consol|typewriter|menlo|code/.test(name) ? 'mono'
    : /sans|arial|helvet|calibri|verdana|tahoma|segoe|roboto|open ?sans|noto|inter|futura|gothic|lato/.test(name) ? 'sans'
      : /times|serif|georgia|garamond|palatino|cambria|minion|book|roman|lora|charter/.test(name) ? 'serif' : 'sans';
  return { family, bold: /bold|black|heavy|semibold|demi/.test(name), italic: /italic|oblique/.test(name) };
}

export const toHex = ([r, g, b]) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export function fromHex(value, fallback = [0, 0, 0]) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value).trim());
  return match ? [0, 2, 4].map(i => parseInt(match[1].slice(i, i + 2), 16)) : fallback;
}

// pdf.js returns many small items, often one per word or even per glyph run. Merge the ones
// that sit on the same baseline with the same font and size into one editable line.
export function groupTextItems(items, styles = {}) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.str.trim()) {
      const along = (cur.endX - cur.x) * cur.dx + (cur.endY - cur.y) * cur.dy;
      const given = styles[cur.fontName] || {}, guess = describeFont(cur.fontName, given.fontFamily);
      const style = { family: guess.family, bold: guess.bold || Boolean(given.bold), italic: guess.italic || Boolean(given.italic) };
      out.push({ id: `s${out.length}`, str: cur.str.replace(/\s+$/, ''), x: cur.x, y: cur.y, width: Math.max(along, 0), fontSize: cur.fs, angle: cur.angle, fontName: cur.fontName, ...style });
    }
    cur = null;
  };
  for (const item of items) {
    if (typeof item?.str !== 'string' || !Array.isArray(item.transform)) continue;
    if (styles[item.fontName]?.vertical) { flush(); continue; }
    const [a, b, , , tx, ty] = item.transform;
    const fs = Math.hypot(a, b);
    if (!item.str) { if (item.hasEOL) flush(); continue; }
    if (!fs || !Number.isFinite(fs) || !Number.isFinite(tx) || !Number.isFinite(ty)) { flush(); continue; }
    const angle = Math.atan2(b, a), dx = Math.cos(angle), dy = Math.sin(angle), width = Number.isFinite(item.width) ? item.width : 0;
    if (cur) {
      const rx = tx - cur.endX, ry = ty - cur.endY;
      const along = rx * dx + ry * dy, across = -rx * dy + ry * dx;
      const same = item.fontName === cur.fontName && Math.abs(angle - cur.angle) < 0.02 && Math.abs(fs - cur.fs) < Math.max(0.5, fs * 0.08)
        && Math.abs(across) < fs * 0.25 && along > -fs * 0.4 && along < fs * 1.5;
      if (same) {
        if (along > fs * 0.12 && !/\s$/.test(cur.str) && !/^\s/.test(item.str)) cur.str += ' ';
        cur.str += item.str; cur.endX = tx + dx * width; cur.endY = ty + dy * width;
        if (item.hasEOL) flush();
        continue;
      }
      flush();
    }
    cur = { str: item.str, x: tx, y: ty, endX: tx + dx * width, endY: ty + dy * width, fs, angle, dx, dy, fontName: item.fontName };
    if (item.hasEOL) flush();
  }
  flush();
  return out;
}

// Four corners (PDF user space) of the patch that hides a line of original text.
export function coverQuad({ x, y, angle = 0, width, fontSize }) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const x0 = -PAD, x1 = width + PAD, y0 = -DESCENT * fontSize - PAD * 0.5, y1 = ASCENT * fontSize + PAD * 0.5;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([lx, ly]) => [x + lx * c - ly * s, y + lx * s + ly * c]);
}

// Page colour around a box and the colour of the text inside it, from rendered pixels.
// image: { data: Uint8ClampedArray (RGBA), width, height }; box in pixels.
export function sampleColors(image, box) {
  const { data, width, height } = image;
  const x0 = Math.max(0, Math.floor(box.x0)), x1 = Math.min(width - 1, Math.ceil(box.x1));
  const y0 = Math.max(0, Math.floor(box.y0)), y1 = Math.min(height - 1, Math.ceil(box.y1));
  if (x1 < x0 || y1 < y0) return { bg: [255, 255, 255], fg: [0, 0, 0] };
  const px = (x, y) => { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const bins = new Map();
  const count = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const [r, g, b] = px(x, y), key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    bin.n++; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin);
  };
  for (let x = x0 - 3; x <= x1 + 3; x++) { count(x, y0 - 3); count(x, y1 + 3); }
  for (let y = y0; y <= y1; y++) { count(x0 - 3, y); count(x1 + 3, y); }
  let best = null;
  for (const bin of bins.values()) if (!best || bin.n > best.n) best = bin;
  const bg = best ? [best.r / best.n, best.g / best.n, best.b / best.n].map(Math.round) : [255, 255, 255];
  const dist = ([r, g, b]) => (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0 + 1) * (y1 - y0 + 1)) / 30000)));
  let far = 0;
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) far = Math.max(far, dist(px(x, y)));
  const luma = (bg[0] * 299 + bg[1] * 587 + bg[2] * 114) / 1000;
  if (far < 60 * 60) return { bg, fg: luma > 140 ? [0, 0, 0] : [255, 255, 255] };
  let n = 0, r = 0, g = 0, b = 0;
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    const p = px(x, y);
    if (dist(p) >= far * 0.8) { n++; r += p[0]; g += p[1]; b += p[2]; }
  }
  return { bg, fg: n ? [r / n, g / n, b / n].map(Math.round) : [0, 0, 0] };
}

// Place (x, y, angle) from PDF user space on a flattened page. `transform` is the pdf.js
// viewport transform at scale 1, `height` the flattened page height in points.
export function viewPlacement(transform, height, x, y, angle) {
  const [a, b, c, d, e, f] = transform;
  const co = Math.cos(angle), si = Math.sin(angle);
  return { x: a * x + c * y + e, y: height - (b * x + d * y + f), angle: -Math.atan2(b * co + d * si, a * co + c * si) };
}

// Characters the standard PDF fonts can draw (Latin-1 plus the Windows-1252 extras).
const WIN_EXTRA = new Set('\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178');
export const needsUnicode = text => [...String(text)].some(ch => ch.codePointAt(0) > 255 && !WIN_EXTRA.has(ch));

const cleanLine = text => String(text).replace(/[\r\n\t\u2028\u2029]+/g, ' ');

// edits: [{ page, kind: 'replace'|'add', x, y, angle, width, fontSize, text, removed, family, bold, italic, size, color, bg }]
//   page is 0-based; replace covers the original line (x, y, angle, width, fontSize) and draws `text`.
// options.flat: Map(pageIndex -> { jpeg: Uint8Array, width, height, transform }) replaces the page
//   with an image that already has the patches painted in, so the original text is really gone.
// options.loadUnicodeFont: async () => bytes of a TrueType font for characters outside Latin-1.
export async function buildEditedPdf(bytes, edits, { flat = new Map(), loadUnicodeFont } = {}) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const warnings = [], fonts = new Map();
  let unicode = null, covered = null;
  const unicodeFont = async () => {
    if (unicode) return unicode;
    if (!loadUnicodeFont) throw new Error('Noto Sans is needed for these characters but could not be loaded.');
    const { default: fontkit } = await import('@pdf-lib/fontkit');
    doc.registerFontkit(fontkit);
    unicode = await doc.embedFont(await loadUnicodeFont(), { subset: true });
    covered = new Set(unicode.getCharacterSet());
    return unicode;
  };
  const standard = async (family, bold, italic) => {
    const name = standardFontName(family, bold, italic);
    if (!fonts.has(name)) fonts.set(name, await doc.embedFont(StandardFonts[name]));
    return fonts.get(name);
  };
  const encodable = (font, text) => { try { font.encodeText(text); return true; } catch { return false; } };
  const pick = async edit => {
    const text = cleanLine(edit.text);
    if (edit.family !== 'unicode') {
      const font = await standard(edit.family, edit.bold, edit.italic);
      if (encodable(font, text)) return { font, text };
    }
    const font = await unicodeFont();
    const missing = [...new Set([...text])].filter(ch => !covered.has(ch.codePointAt(0)));
    if (missing.length) warnings.push(`Some characters (${missing.slice(0, 6).join(' ')}) are not in the fallback font and will show as empty squares.`);
    return { font, text };
  };

  const byPage = new Map();
  for (const edit of edits) {
    if (!Number.isInteger(edit.page) || edit.page < 0 || edit.page >= doc.getPageCount()) continue;
    if (!byPage.has(edit.page)) byPage.set(edit.page, []);
    byPage.get(edit.page).push(edit);
  }
  let changed = 0;
  for (const [index, group] of [...byPage].sort((a, b) => a[0] - b[0])) {
    const raster = flat.get(index);
    let page = doc.getPage(index);
    if (raster) {
      const image = await doc.embedJpg(raster.jpeg);
      doc.insertPage(index, [raster.width, raster.height]);
      doc.removePage(index + 1);
      page = doc.getPage(index);
      page.drawImage(image, { x: 0, y: 0, width: raster.width, height: raster.height });
    } else {
      for (const edit of group) {
        if (edit.kind !== 'replace') continue;
        const [[cx, cy]] = coverQuad(edit), [r, g, b] = edit.bg || [255, 255, 255];
        const angle = edit.angle || 0, w = edit.width + 2 * PAD, h = (ASCENT + DESCENT) * edit.fontSize + PAD;
        page.drawRectangle({ x: cx, y: cy, width: w, height: h, rotate: degrees(angle * 180 / Math.PI), color: rgb(r / 255, g / 255, b / 255), borderWidth: 0 });
      }
    }
    for (const edit of group) {
      changed++;
      if (edit.removed || !cleanLine(edit.text).trim()) continue;
      const { font, text } = await pick(edit);
      const where = raster ? viewPlacement(raster.transform, raster.height, edit.x, edit.y, edit.angle || 0) : { x: edit.x, y: edit.y, angle: edit.angle || 0 };
      const [r, g, b] = edit.color || [0, 0, 0];
      page.drawText(text, { x: where.x, y: where.y, size: edit.size || edit.fontSize || 12, font, color: rgb(r / 255, g / 255, b / 255), rotate: degrees(where.angle * 180 / Math.PI) });
    }
  }
  return { bytes: await doc.save(), warnings: [...new Set(warnings)], changed };
}
