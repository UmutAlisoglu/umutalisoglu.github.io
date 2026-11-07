"""Photo-style preview of both card sides from layers.pkl."""
import sys, pickle, math, random
import cairo
from shapely import affinity
from pcblib import polys

d = pickle.load(open(sys.argv[1], 'rb'))
out = sys.argv[2]
scheme = sys.argv[3] if len(sys.argv) > 3 else 'blue'
S = float(sys.argv[4]) if len(sys.argv) > 4 else 22.0
W, H = d['W'], d['H']
M = 6.0

SCHEMES = {
    'blue': dict(sub=(0.10, 0.22, 0.53), cu=(0.17, 0.35, 0.74), fr4=(0.80, 0.74, 0.55), silk=(0.96, 0.97, 0.98), bg=(0.06, 0.07, 0.09)),
    'black': dict(sub=(0.07, 0.075, 0.085), cu=(0.15, 0.16, 0.18), fr4=(0.78, 0.72, 0.53), silk=(0.95, 0.95, 0.95), bg=(0.12, 0.13, 0.15)),
    'white': dict(sub=(0.93, 0.94, 0.95), cu=(0.86, 0.88, 0.90), fr4=(0.80, 0.74, 0.55), silk=(0.10, 0.11, 0.13), bg=(0.10, 0.12, 0.16)),
}
C = SCHEMES[scheme]


def path(ctx, g):
    for p in polys(g):
        for ring in [p.exterior, *p.interiors]:
            pts = list(ring.coords)
            ctx.move_to(pts[0][0], H - pts[0][1])
            for x, y in pts[1:]:
                ctx.line_to(x, H - y)
            ctx.close_path()


def side(ctx, L, ox, components=False, vias=()):
    ctx.save()
    ctx.translate(ox, M)
    # drop shadow
    for i in range(14, 0, -1):
        ctx.save(); ctx.translate(0.5, 0.9)
        path(ctx, d['board'].buffer(i * 0.12)); ctx.set_source_rgba(0, 0, 0, 0.028); ctx.fill(); ctx.restore()
    ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
    path(ctx, d['board']); ctx.clip()
    # base: mask over bare laminate
    ctx.set_source_rgb(*C['sub']); ctx.paint()
    cu, mask, silk = L['cu'], L['mask'], L['silk']
    # copper under mask: lighter, with a faint emboss edge
    ctx.save(); ctx.translate(-0.035, 0.035); path(ctx, cu.difference(mask)); ctx.set_source_rgba(1, 1, 1, 0.10); ctx.fill(); ctx.restore()
    path(ctx, cu.difference(mask)); ctx.set_source_rgb(*C['cu']); ctx.fill()
    # bare laminate where the mask is open and there is no copper
    path(ctx, mask.difference(cu)); ctx.set_source_rgb(*C['fr4']); ctx.fill()
    # exposed metal: ENIG gold with a soft sweep
    g = cairo.LinearGradient(0, 0, W, H)
    for t, c in [(0, (0.80, 0.63, 0.30)), (0.35, (0.98, 0.86, 0.56)), (0.55, (0.86, 0.69, 0.36)), (0.8, (0.97, 0.84, 0.52)), (1, (0.78, 0.60, 0.28))]:
        g.add_color_stop_rgb(t, *c)
    metal = mask.intersection(cu)
    path(ctx, metal); ctx.set_source(g); ctx.fill()
    ctx.save(); ctx.translate(0.03, -0.03); path(ctx, metal.difference(affinity.translate(metal, -0.06, 0.06))); ctx.set_source_rgba(1, 1, 1, 0.35); ctx.fill(); ctx.restore()
    # mask edge shadow around openings
    path(ctx, mask.buffer(0.06).difference(mask)); ctx.set_source_rgba(0, 0, 0, 0.18); ctx.fill()
    # silkscreen
    ctx.save(); ctx.translate(0.025, -0.025); path(ctx, silk); ctx.set_source_rgba(0, 0, 0, 0.25); ctx.fill(); ctx.restore()
    path(ctx, silk); ctx.set_source_rgb(*C['silk']); ctx.fill()
    # tented vias
    for x, y in vias:
        ctx.arc(x, H - y, 0.18, 0, 2 * math.pi); ctx.set_source_rgba(0, 0, 0, 0.45); ctx.fill()
    if components:
        ux, uy = d['U1']
        ctx.save()
        for n in range(8):
            side_ = -1 if n < 4 else 1
            yy = uy + (-0.975 + (n % 4) * 0.65)
            ctx.rectangle(ux + side_ * 1.5 - (0.0 if side_ > 0 else 1.0), H - yy - 0.15, 1.0, 0.3)
            ctx.set_source_rgb(0.78, 0.79, 0.80); ctx.fill()
        ctx.rectangle(ux - 1.5, H - uy - 1.5, 3.0, 3.0)
        lg = cairo.LinearGradient(ux - 1.5, H - uy - 1.5, ux + 1.5, H - uy + 1.5)
        lg.add_color_stop_rgb(0, 0.20, 0.20, 0.22); lg.add_color_stop_rgb(1, 0.07, 0.07, 0.08)
        ctx.set_source(lg); ctx.fill()
        ctx.arc(ux + 1.0, H - uy + 1.0, 0.2, 0, 2 * math.pi); ctx.set_source_rgb(0.04, 0.04, 0.05); ctx.fill()
        ctx.select_font_face('JetBrains Mono', cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(0.62); ctx.set_source_rgba(0.75, 0.75, 0.78, 0.8)
        for i, t in enumerate(['NXP', 'NT3H']):
            ext = ctx.text_extents(t); ctx.move_to(ux - ext.width / 2, H - uy - 0.15 + i * 0.85); ctx.show_text(t)
        ctx.restore()
    # lighting: soft key light top-left, falloff bottom-right
    lg = cairo.LinearGradient(0, 0, W, H)
    lg.add_color_stop_rgba(0, 1, 1, 1, 0.13); lg.add_color_stop_rgba(0.45, 1, 1, 1, 0.0); lg.add_color_stop_rgba(1, 0, 0, 0, 0.16)
    ctx.set_source(lg); ctx.paint()
    rg = cairo.RadialGradient(W * 0.28, H * 0.2, 2, W * 0.28, H * 0.2, W * 0.75)
    rg.add_color_stop_rgba(0, 1, 1, 1, 0.07); rg.add_color_stop_rgba(1, 1, 1, 1, 0)
    ctx.set_source(rg); ctx.paint()
    ctx.reset_clip()
    # board edge
    path(ctx, d['board']); ctx.set_line_width(0.12); ctx.set_source_rgba(1, 1, 1, 0.18); ctx.stroke()
    ctx.restore()


TW = 2 * W + 3 * M
TH = H + 2 * M
surf = cairo.ImageSurface(cairo.FORMAT_RGB24, int(TW * S), int(TH * S))
ctx = cairo.Context(surf)
ctx.scale(S, S)
bg = cairo.LinearGradient(0, 0, 0, TH)
bg.add_color_stop_rgb(0, *[min(1, c * 1.5) for c in C['bg']]); bg.add_color_stop_rgb(1, *C['bg'])
ctx.set_source(bg); ctx.paint()
side(ctx, d['top'], M, components=True, vias=d['vias'])
side(ctx, d['bot_view'], 2 * M + W, vias=[(W - x, y) for x, y in d['vias']])
surf.write_to_png(out)
print('wrote', out)
