"""Small vector PCB toolkit: fonts -> polygons, Gerber/Excellon writers, DRC, photo render."""
import math
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box, GeometryCollection
from shapely.ops import unary_union
from shapely import affinity


def polys(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    if hasattr(g, 'geoms'):
        out = []
        for x in g.geoms:
            out.extend(polys(x))
        return out
    return []


def U(*gs):
    gs = [g for g in gs if g is not None and not g.is_empty]
    return unary_union(gs) if gs else Polygon()


class FlatPen(BasePen):
    def __init__(self, gs):
        super().__init__(gs)
        self.contours, self.cur = [], []

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        n = 14
        for i in range(1, n + 1):
            t = i / n
            a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; d = t ** 3
            self.cur.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        n = 10
        for i in range(1, n + 1):
            t = i / n
            self.cur.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))

    def _closePath(self):
        if len(self.cur) >= 3:
            self.contours.append(self.cur)
        self.cur = []

    _endPath = _closePath


class Font:
    def __init__(self, path):
        self.tt = TTFont(path)
        self.gs = self.tt.getGlyphSet()
        self.upem = self.tt['head'].unitsPerEm
        self.order = self.tt.getGlyphOrder()
        self.hbfont = hb.Font(hb.Face(open(path, 'rb').read()))
        self.cache = {}

    def glyph(self, gid):
        name = self.order[gid]
        if name not in self.cache:
            pen = FlatPen(self.gs)
            self.gs[name].draw(pen)
            g = Polygon()
            for c in pen.contours:
                g = g.symmetric_difference(Polygon(c).buffer(0))
            self.cache[name] = g
        return self.cache[name]

    def text(self, txt, size, x=0, y=0, tracking=0.0, anchor='left'):
        """size = em size in mm; tracking in mm between glyphs. Returns (geometry, width)."""
        buf = hb.Buffer(); buf.add_str(txt); buf.guess_segment_properties()
        hb.shape(self.hbfont, buf, {'kern': True, 'liga': True})
        sc = size / self.upem
        parts, pen = [], 0.0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            g = self.glyph(info.codepoint)
            if not g.is_empty:
                parts.append(affinity.translate(g, pen + pos.x_offset, pos.y_offset))
            pen += pos.x_advance + tracking / sc
        geom = affinity.scale(U(*parts), sc, sc, origin=(0, 0))
        width = pen * sc - tracking
        dx = {'left': 0, 'center': -width / 2, 'right': -width}[anchor]
        return affinity.translate(geom, x + dx, y), width


def rrect(x0, y0, x1, y1, r):
    if r <= 0:
        return box(x0, y0, x1, y1)
    return box(x0 + r, y0 + r, x1 - r, y1 - r).buffer(r, quad_segs=24)


def stroke(points, w, cap='round'):
    cs = {'round': 'round', 'flat': 'flat', 'square': 'square'}[cap]
    return LineString(points).buffer(w / 2, quad_segs=12, cap_style=cs, join_style='round')


def ring(cx, cy, r, w):
    return Point(cx, cy).buffer(r + w / 2, quad_segs=48).difference(Point(cx, cy).buffer(r - w / 2, quad_segs=48))


def disc(cx, cy, r):
    return Point(cx, cy).buffer(r, quad_segs=32)


# ---------------------------------------------------------------- writers
def _c(v):
    return int(round(v * 1e6))


def fracture(p):
    if not p.interiors:
        return [p]
    x0, y0, x1, y1 = p.bounds
    cuts = sorted({round(r.centroid.x, 6) for r in p.interiors})
    xs = [x0 - 1] + cuts + [x1 + 1]
    out = []
    for a, b in zip(xs, xs[1:]):
        for q in polys(p.intersection(box(a, y0 - 1, b, y1 + 1))):
            out.extend(fracture(q) if q.interiors else [q])
    return out


def gerber(path, geom, function, side=None, polarity='Positive', simplify=0.002):
    L = ['G04 alisoglu.com PCB Art Studio - NFC business card*',
         '%TF.GenerationSoftware,alisoglu.com,PCB Art Studio,2*%',
         f'%TF.FileFunction,{function}*%' if not side else f'%TF.FileFunction,{function},{side}*%',
         f'%TF.FilePolarity,{polarity}*%', '%FSLAX46Y46*%', '%MOMM*%', '%LPD*%', 'G01*']

    def region(coords):
        out = ['G36*']
        pts = list(coords)
        out.append(f'X{_c(pts[0][0])}Y{_c(pts[0][1])}D02*')
        for p in pts[1:]:
            out.append(f'X{_c(p[0])}Y{_c(p[1])}D01*')
        out.append('G37*')
        return out

    # Dark polarity only: polygons with holes are cut into hole-free strips, which every CAM tool reads the same way.
    for p in polys(geom.simplify(simplify) if simplify else geom):
        for q in fracture(p):
            L += region(q.exterior.coords)
    L.append('M02*')
    open(path, 'w').write('\n'.join(L) + '\n')


def gerber_outline(path, outline_poly):
    L = ['G04 board outline*', '%TF.GenerationSoftware,alisoglu.com,PCB Art Studio,2*%', '%TF.FileFunction,Profile,NP*%',
         '%FSLAX46Y46*%', '%MOMM*%', '%ADD10C,0.100*%', '%LPD*%', 'G01*', 'D10*']
    pts = list(outline_poly.exterior.coords)
    L.append(f'X{_c(pts[0][0])}Y{_c(pts[0][1])}D02*')
    for p in pts[1:]:
        L.append(f'X{_c(p[0])}Y{_c(p[1])}D01*')
    L.append('M02*')
    open(path, 'w').write('\n'.join(L) + '\n')


def excellon(path, holes):
    """holes: list of (x, y, drill_mm) plated."""
    sizes = sorted({d for _, _, d in holes})
    L = ['M48', '; alisoglu.com PCB Art Studio - plated vias', 'FMAT,2', 'METRIC,TZ']
    for i, d in enumerate(sizes, 1):
        L.append(f'T{i}C{d:.3f}')
    L += ['%', 'G90', 'G05']
    for i, d in enumerate(sizes, 1):
        L.append(f'T{i}')
        for x, y, dd in holes:
            if dd == d:
                L.append(f'X{x:.3f}Y{y:.3f}')
    L.append('M30')
    open(path, 'w').write('\n'.join(L) + '\n')


# ---------------------------------------------------------------- checks
def thin_parts(g, minw, tol=0.02):
    """Area that would vanish under a morphological opening with diameter minw (minus tol)."""
    d = (minw - tol) / 2
    opened = g.buffer(-d, join_style='mitre', mitre_limit=10).buffer(d, join_style='mitre', mitre_limit=10)
    return g.difference(opened.buffer(0.01))


def narrow_gaps(g, mings, region=None, tol=0.02):
    """Areas where two pieces of g come closer than mings."""
    d = (mings - tol) / 2
    closed = g.buffer(d, join_style='mitre', mitre_limit=10).buffer(-d, join_style='mitre', mitre_limit=10)
    gaps = closed.difference(g.buffer(0.01))
    return gaps if region is None else gaps.intersection(region)


def significant(g, min_area=0.004):
    return [p for p in polys(g) if p.area > min_area]
