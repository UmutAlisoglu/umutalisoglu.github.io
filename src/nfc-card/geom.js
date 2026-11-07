// Small vector toolkit for board geometry, built on Clipper (polygon booleans and offsets).
// A geometry is an array of closed integer paths ({X, Y}), outer rings counter-clockwise,
// holes clockwise, in units of 0.1 µm. Every helper takes and returns millimetres.
import ClipperLib from 'clipper-lib';

export const S = 10000;
const NZ = ClipperLib.PolyFillType.pftNonZero;
const { ptSubject, ptClip } = ClipperLib.PolyType;
const { ctUnion, ctDifference, ctIntersection } = ClipperLib.ClipType;
const ARC_TOLERANCE = 0.01; // mm: maximum distance between a true arc and its polygon

export const EMPTY = [];
const pt = (x, y) => ({ X: Math.round(x * S), Y: Math.round(y * S) });

function run(type, a, b) {
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(a, ptSubject, true);
  if (b) clipper.AddPaths(b, ptClip, true);
  const out = [];
  clipper.Execute(type, out, NZ, NZ);
  return out;
}

export const union = (...geoms) => run(ctUnion, geoms.flat(1));
export const diff = (a, ...b) => (a.length ? run(ctDifference, a, b.flat(1)) : EMPTY);
export const inter = (a, b) => (a.length && b.length ? run(ctIntersection, a, b) : EMPTY);

/** Grow (d > 0) or shrink (d < 0) by d mm. */
export function offset(geom, d, join = 'round') {
  if (!d || !geom.length) return geom;
  const co = new ClipperLib.ClipperOffset(10, ARC_TOLERANCE * S);
  co.AddPaths(geom, join === 'miter' ? ClipperLib.JoinType.jtMiter : ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out = [];
  co.Execute(out, d * S);
  return out;
}

/** Fill a set of loose contours with the non-zero rule (font outlines, self-touching shapes). */
export function polygon(...contours) {
  const paths = contours.filter(c => c.length >= 3).map(c => c.map(([x, y]) => pt(x, y)));
  return ClipperLib.Clipper.SimplifyPolygons(paths, NZ);
}

export function circlePoints(cx, cy, r, from = 0, to = 2 * Math.PI) {
  const step = 2 * Math.acos(Math.max(-1, 1 - ARC_TOLERANCE / Math.max(r, ARC_TOLERANCE)));
  const n = Math.max(12, Math.ceil(Math.abs(to - from) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = from + (to - from) * i / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export const disc = (cx, cy, r) => polygon(circlePoints(cx, cy, r).slice(0, -1));
export const ring = (cx, cy, r, w) => diff(disc(cx, cy, r + w / 2), disc(cx, cy, r - w / 2));
export const box = (x0, y0, x1, y1) => polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
export function rrect(x0, y0, x1, y1, r) {
  return r > 0 ? offset(box(x0 + r, y0 + r, x1 - r, y1 - r), r) : box(x0, y0, x1, y1);
}

/** A polyline drawn with a pen w mm wide. */
export function stroke(points, w, cap = 'round') {
  const co = new ClipperLib.ClipperOffset(10, ARC_TOLERANCE * S);
  const end = cap === 'flat' ? ClipperLib.EndType.etOpenButt : cap === 'square' ? ClipperLib.EndType.etOpenSquare : ClipperLib.EndType.etOpenRound;
  co.AddPath(points.map(([x, y]) => pt(x, y)), ClipperLib.JoinType.jtRound, end);
  const out = [];
  co.Execute(out, (w / 2) * S);
  return out;
}

/** Apply a point function (mm -> mm) to every vertex. Mirroring transforms flip winding, so it is restored. */
export function transform(geom, fn) {
  const out = geom.map(path => path.map(p => { const [x, y] = fn(p.X / S, p.Y / S); return pt(x, y); }));
  const before = geom.reduce((a, p) => a + ClipperLib.Clipper.Area(p), 0);
  const after = out.reduce((a, p) => a + ClipperLib.Clipper.Area(p), 0);
  if (Math.sign(before) !== Math.sign(after)) out.forEach(p => p.reverse());
  return out;
}
export const translate = (g, dx, dy) => transform(g, (x, y) => [x + dx, y + dy]);
export const scale = (g, sx, sy = sx, ox = 0, oy = 0) => transform(g, (x, y) => [ox + (x - ox) * sx, oy + (y - oy) * sy]);
export function rotate(g, deg, ox = 0, oy = 0) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return transform(g, (x, y) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]);
}

/** Insert vertices so no edge is longer than maxLen mm (before bending a shape along an arc). */
export function segmentize(geom, maxLen) {
  const lim = maxLen * S;
  return geom.map(path => {
    const out = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b.X - a.X, b.Y - a.Y) / lim));
      for (let k = 0; k < n; k++) out.push({ X: a.X + (b.X - a.X) * k / n, Y: a.Y + (b.Y - a.Y) * k / n });
    }
    return out;
  });
}

export const area = geom => geom.reduce((a, p) => a + ClipperLib.Clipper.Area(p), 0) / (S * S);

export function bounds(geom) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const path of geom) for (const p of path) {
    if (p.X < x0) x0 = p.X; if (p.X > x1) x1 = p.X;
    if (p.Y < y0) y0 = p.Y; if (p.Y > y1) y1 = p.Y;
  }
  return x0 === Infinity ? null : { x0: x0 / S, y0: y0 / S, x1: x1 / S, y1: y1 / S };
}

/** Split a geometry into separate pieces, each an outer ring with its own holes. */
export function pieces(geom) {
  if (!geom.length) return [];
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(geom, ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  clipper.Execute(ctUnion, tree, NZ, NZ);
  const out = [];
  const walk = node => {
    for (const child of node.Childs()) {
      if (!child.IsHole()) out.push([child.Contour(), ...child.Childs().map(h => h.Contour())]);
      walk(child);
    }
  };
  walk(tree);
  return out;
}

/** Outer rings only (holes filled). */
export const outers = geom => pieces(geom).map(p => p[0]);

/** A rounded box around the ink of g, grown by m mm. */
export function blob(g, m) {
  const b = bounds(g);
  return b ? rrect(b.x0 - m, b.y0 - m, b.x1 + m, b.y1 + m, m) : EMPTY;
}

/** Drop pieces smaller than minArea mm² (slivers left over by clipping). */
export const dropSmall = (geom, minArea) => pieces(geom).filter(p => area(p) > minArea).flat(1);

/** Cut a piece with holes into hole-free strips, which every CAM tool reads the same way. */
export function fracture(piece, depth = 0) {
  if (piece.length === 1 || depth > 8) return [piece];
  const b = bounds([piece[0]]);
  const cuts = [...new Set(piece.slice(1).map(h => { const hb = bounds([h]); return Math.round((hb.x0 + hb.x1) / 2 * 1e4) / 1e4; }))].sort((x, y) => x - y);
  const xs = [b.x0 - 1, ...cuts, b.x1 + 1];
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (const q of pieces(inter(piece, box(xs[i], b.y0 - 1, xs[i + 1], b.y1 + 1)))) out.push(...fracture(q, depth + 1));
  }
  return out;
}

// ------------------------------------------------------------ manufacturing checks
/** Parts of g narrower than minW (they vanish under a morphological opening). */
export function thinParts(g, minW, tol = 0.02) {
  const d = (minW - tol) / 2;
  const opened = offset(offset(g, -d, 'miter'), d, 'miter');
  return diff(g, offset(opened, 0.01));
}

/** Places where two pieces of g come closer than minGap. */
export function narrowGaps(g, minGap, tol = 0.02) {
  const d = (minGap - tol) / 2;
  const closed = offset(offset(g, d, 'miter'), -d, 'miter');
  return diff(closed, offset(g, 0.01));
}

export const significant = (g, minArea) => pieces(g).filter(p => area(p) > minArea);

// ------------------------------------------------------------ output
/** SVG path data, y flipped so +y points up on the board. */
export function svgPath(geom, height) {
  let d = '';
  for (const path of geom) {
    if (path.length < 3) continue;
    d += 'M' + path.map(p => `${(p.X / S).toFixed(3)} ${(height - p.Y / S).toFixed(3)}`).join('L') + 'Z';
  }
  return d;
}
