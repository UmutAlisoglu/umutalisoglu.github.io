// Text to board polygons. Each face is a list of opentype.js fonts tried in order
// (Latin, then Latin Extended), so names such as "Alisoğlu" or "Łukasz" work.
import { polygon, translate, segmentize, transform, bounds, EMPTY } from './geom.js';

export class Face {
  constructor(fonts) {
    this.fonts = fonts;
    this.cache = new Map();
  }

  glyph(char) {
    for (const font of this.fonts) {
      const g = font.charToGlyph(char);
      if (g && g.index !== 0) return { font, glyph: g };
    }
    return { font: this.fonts[0], glyph: this.fonts[0].charToGlyph(char) };
  }

  /** Contours of one glyph in em units (1 = font size), y up, flattened finely enough for `size` mm. */
  contours(font, glyph, size) {
    const tol = 0.004 / size; // 4 µm on the board
    const bucket = Math.round(Math.log2(size) * 4);
    const key = `${this.fonts.indexOf(font)}:${glyph.index}:${bucket}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const k = 1 / font.unitsPerEm;
    // number of segments so a curve stays within tol of its flattened version
    const steps = (dd) => Math.min(24, Math.max(1, Math.ceil(Math.sqrt(dd / (8 * tol)))));
    const out = [];
    let cur = [];
    let last = [0, 0];
    const close = () => { if (cur.length >= 3) out.push(cur); cur = []; };
    for (const c of glyph.path.commands) {
      if (c.type === 'M') { close(); last = [c.x * k, c.y * k]; cur.push(last); }
      else if (c.type === 'L') { last = [c.x * k, c.y * k]; cur.push(last); }
      else if (c.type === 'C') {
        const [x0, y0] = last;
        const dd = Math.max(Math.hypot(x0 - 2 * c.x1 * k + c.x2 * k, y0 - 2 * c.y1 * k + c.y2 * k), Math.hypot(c.x1 * k - 2 * c.x2 * k + c.x * k, c.y1 * k - 2 * c.y2 * k + c.y * k)) * 6;
        const n = steps(dd);
        for (let i = 1; i <= n; i++) {
          const t = i / n, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, d = 3 * (1 - t) * t * t, e = t ** 3;
          cur.push([a * x0 + b * c.x1 * k + d * c.x2 * k + e * c.x * k, a * y0 + b * c.y1 * k + d * c.y2 * k + e * c.y * k]);
        }
        last = [c.x * k, c.y * k];
      } else if (c.type === 'Q') {
        const [x0, y0] = last;
        const n = steps(Math.hypot(x0 - 2 * c.x1 * k + c.x * k, y0 - 2 * c.y1 * k + c.y * k) * 2);
        for (let i = 1; i <= n; i++) {
          const t = i / n, a = (1 - t) ** 2, b = 2 * (1 - t) * t, d = t * t;
          cur.push([a * x0 + b * c.x1 * k + d * c.x * k, a * y0 + b * c.y1 * k + d * c.y * k]);
        }
        last = [c.x * k, c.y * k];
      } else if (c.type === 'Z') close();
    }
    close();
    this.cache.set(key, out);
    return out;
  }

  /** Width in mm of txt at em size `size`, with `tracking` mm between letters. */
  measure(txt, size, tracking = 0) {
    return this.layout(txt, size, tracking).width;
  }

  layout(txt, size, tracking = 0) {
    const items = [];
    let pen = 0;
    let prev = null;
    for (const char of Array.from(txt)) {
      const { font, glyph } = this.glyph(char);
      if (prev && prev.font === font) pen += font.getKerningValue(prev.glyph, glyph) / font.unitsPerEm * size;
      items.push({ font, glyph, x: pen });
      pen += glyph.advanceWidth / font.unitsPerEm * size + tracking;
      prev = { font, glyph };
    }
    return { items, width: Math.max(0, pen - (items.length ? tracking : 0)) };
  }

  /** Text as a filled geometry. anchor: left | center | right on x; y is the baseline. */
  text(txt, size, x = 0, y = 0, { tracking = 0, anchor = 'left' } = {}) {
    const { items, width } = this.layout(txt, size, tracking);
    const dx = anchor === 'center' ? -width / 2 : anchor === 'right' ? -width : 0;
    const contours = [];
    for (const it of items) {
      for (const c of this.contours(it.font, it.glyph, size)) contours.push(c.map(([u, v]) => [x + dx + it.x + u * size, y + v * size]));
    }
    return { geom: contours.length ? polygon(...contours) : EMPTY, width };
  }
}

/** Text bent along a circle, reading left to right over the top; baseline on radius r. */
export function arcText(face, txt, size, cx, cy, r, { centerDeg = 90, tracking = 0 } = {}) {
  const { geom, width } = face.text(txt, size, 0, 0, { tracking });
  const start = centerDeg * Math.PI / 180 + width / r / 2;
  const bent = transform(segmentize(geom, 0.08), (x, y) => {
    const a = start - x / r;
    return [cx + (r + y) * Math.cos(a), cy + (r + y) * Math.sin(a)];
  });
  return { geom: bent, width };
}

/** Centre text inside a box by its ink bounds (for monograms). */
export function centredText(face, txt, size, cx, cy, opts = {}) {
  const { geom, width } = face.text(txt, size, 0, 0, opts);
  const b = bounds(geom);
  if (!b) return { geom, width, height: 0 };
  return { geom: translate(geom, cx - (b.x0 + b.x1) / 2, cy - (b.y0 + b.y1) / 2), width: b.x1 - b.x0, height: b.y1 - b.y0 };
}
