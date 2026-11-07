"""Umut Alisoglu NFC business card, 85 x 55 mm, vector Gerbers + JLCPCB assembly files + preview."""
import math, os, sys, json
import qrcode
from shapely.geometry import Polygon, LineString, Point, box
from shapely import affinity
from pcblib import *

W, H, R = 85.0, 55.0, 3.0
BOARD = rrect(0, 0, W, H, R)
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT, exist_ok=True)

FD = '/usr/share/fonts/opentype/inter/'
F_BLACK = Font(FD + 'Inter-Black.otf')
F_BOLD = Font(FD + 'Inter-Bold.otf')
F_SEMI = Font(FD + 'Inter-SemiBold.otf')
F_MED = Font(FD + 'Inter-Medium.otf')
F_MONO = Font('/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-ExtraBold.ttf')
TEXT_IDS = set()
def _wrap(font, grow=0.0):
    orig = font.text
    def t(*a, **k):
        g, w = orig(*a, **k)
        if grow:
            g = g.buffer(grow, quad_segs=4)
        TEXT_IDS.add(id(g))
        return g, w
    font.text = t
for _f in (F_BLACK, F_BOLD, F_SEMI, F_MED):
    _wrap(_f)
_wrap(F_MONO, 0.018)   # small silkscreen text: thickens the thinnest strokes to >= 0.15 mm

# Each side collects: cu (copper), gold (exposed metal art, mask-defined), pads (copper-defined openings),
# bare (mask openings over bare board), silk.
def side():
    return {k: [] for k in ('cu', 'gold', 'pads', 'bare', 'silk', 'silk_cut', 'label')}

TOP, BOT = side(), side()   # BOT is drawn in back-view coordinates and mirrored on export
VIAS = []                    # (x, y) in top-view coordinates
VIA_DRILL, VIA_PAD = 0.3, 0.6

# ============================================================ NFC antenna (top): round coil
CX, CY, R0 = 62.0, 27.5, 21.6
TURNS, TW, TS = 6, 0.5, 0.4
PITCH = TW + TS
JOG = 2.6
XS = CX + JOG / 2


def circ_path(r, x_start, x_end, seg=0.35):
    """CCW circle centreline from the bottom point at x=x_start round to the bottom point at x=x_end."""
    a0 = math.atan2(-math.sqrt(r * r - (x_start - CX) ** 2), x_start - CX)
    a1 = math.atan2(-math.sqrt(r * r - (x_end - CX) ** 2), x_end - CX) + 2 * math.pi
    n = int((a1 - a0) * r / seg)
    return [(CX + r * math.cos(a0 + (a1 - a0) * t / n), CY + r * math.sin(a0 + (a1 - a0) * t / n)) for t in range(n + 1)]


coil_pts = []
for i in range(TURNS):
    coil_pts += circ_path(R0 - TW / 2 - i * PITCH, XS, XS - JOG)
outer_end, inner_end = coil_pts[0], coil_pts[-1]
y_in = inner_end[1]
R_IN = R0 - TURNS * PITCH + TS                        # inner copper edge radius
coil = stroke(coil_pts, TW)
TOP['pads'].append(coil)
coil_zone = disc(CX, CY, R0)
coil_inner = disc(CX, CY, R_IN)

V1 = (XS, outer_end[1] - 1.7)
V2 = (XS, y_in + 2.4)
VIAS += [V1, V2]
TOP['cu'].append(stroke([outer_end, V1], 0.4))
for v in (V1, V2):
    TOP['cu'].append(disc(*v, VIA_PAD / 2))

U1 = (XS - JOG / 2, y_in + 5.25)
PADX, PADW, PADH = 2.8625, 1.475, 0.45
def tssop_pin(n):
    if n <= 4:
        x, y = -PADX, 0.975 - (n - 1) * 0.65
    else:
        x, y = PADX, -0.975 + (n - 5) * 0.65
    return (U1[0] - x, U1[1] - y)                      # rotated 180 deg
u1_pads = {n: box(tssop_pin(n)[0] - PADW / 2, tssop_pin(n)[1] - PADH / 2, tssop_pin(n)[0] + PADW / 2, tssop_pin(n)[1] + PADH / 2) for n in range(1, 9)}
for p in u1_pads.values():
    TOP['pads'].append(p)
LB, LA = tssop_pin(8), tssop_pin(1)
TOP['pads'].append(stroke([inner_end, (inner_end[0], LB[1] - (inner_end[0] - LB[0])), LB], 0.4))
TOP['cu'].append(stroke([V2, (XS, LA[1] - (LA[0] - XS)), LA], 0.4))
C1 = (U1[0], y_in + 1.45)
c1_pads = [box(C1[0] + sx - 0.28, C1[1] - 0.31, C1[0] + sx + 0.28, C1[1] + 0.31) for sx in (-0.48, 0.48)]
for p in c1_pads:
    TOP['pads'].append(p)
TOP['pads'].append(stroke([(inner_end[0], C1[1]), (C1[0] - 0.48, C1[1])], 0.3))
TOP['cu'].append(stroke([(XS, C1[1]), (C1[0] + 0.48, C1[1])], 0.3))
BOT['cu'].append(stroke([(W - V1[0], V1[1]), (W - V2[0], V2[1])], 0.4))
for v in (V1, V2):
    BOT['cu'].append(disc(W - v[0], v[1], VIA_PAD / 2))

bx0, bx1, by0, by1 = U1[0] - 1.65, U1[0] + 1.65, U1[1] - 1.65, U1[1] + 1.65
TOP['silk'] += [stroke([(bx0 + 1.2, by1 + 0.25), (bx1 - 1.2, by1 + 0.25)], 0.15), stroke([(bx0 + 1.2, by0 - 0.25), (bx1 - 1.2, by0 - 0.25)], 0.15)]
TOP['silk'].append(disc(LA[0] + 0.25, LA[1] - 0.95, 0.22))
TOP['silk'].append(F_MONO.text('U1', 1.25, U1[0], by1 + 0.75, anchor='center')[0])
TOP['silk'].append(F_MONO.text('C1', 1.0, C1[0] + 2.65, C1[1] - 0.36, anchor='left')[0])


def waves(cx, cy, s=1.0):
    g = []
    ox = cx - 2.0 * s
    for rr in (0.9, 1.65, 2.4, 3.15):
        a = ring(ox, cy, rr * s, 0.34 * s)
        g.append(a.intersection(Polygon([(ox, cy), (ox + 8 * s, cy + 6.2 * s), (ox + 8 * s, cy - 6.2 * s)])))
    return U(*g)


def arc_text(font, txt, size, cx, cy, r, center_deg=90, tracking=0.0):
    """Text along a circle, reading left to right over the top. Baseline on radius r."""
    g, width = font.text(txt, size, 0, 0, tracking=tracking)
    # place each glyph by slicing the laid-out text into columns is overkill: map x -> angle per vertex
    span = width / r
    a_start = math.radians(center_deg) + span / 2
    def tf(x, y, z=None):
        a = a_start - x / r
        rr = r + y
        return (cx + rr * math.cos(a), cy + rr * math.sin(a))
    import shapely
    out = shapely.transform(g.segmentize(0.08), lambda pts: [tf(x, y) for x, y in pts])
    TEXT_IDS.add(id(out))
    return out


def dashed_ring(c, r, w, dash, gap):
    n = max(8, int(2 * math.pi * r / (dash + gap)))
    g = ring(*c, r, w)
    cut_w = gap / 2
    cuts = U(*[affinity.rotate(box(c[0] - cut_w, c[1], c[0] + cut_w, c[1] + r + 1), 360 * j / n, origin=c) for j in range(n)])
    return g.difference(cuts)


def tap_target(S, c, r_in, keepout, label=None):
    """Concentric target used on both sides: white centre with the contactless symbol, rings, dial ticks."""
    S['silk'].append(disc(*c, 4.0).difference(waves(c[0], c[1] + 0.0, 0.95)))
    rings = [ring(*c, 5.6, 0.3), ring(*c, 7.0, 0.18), dashed_ring(c, 8.4, 0.18, 1.2, 0.5), dashed_ring(c, 9.7, 0.16, 0.6, 0.55)]
    ticks = []
    for j in range(120):
        a = 2 * math.pi * j / 120
        l = 1.1 if j % 10 == 0 else (0.75 if j % 5 == 0 else 0.45)
        r1 = r_in - 1.0
        ticks.append(stroke([(c[0] + (r1 - l) * math.cos(a), c[1] + (r1 - l) * math.sin(a)), (c[0] + r1 * math.cos(a), c[1] + r1 * math.sin(a))], 0.17, cap='flat'))
    S['silk'].append(U(*rings, *ticks).difference(keepout))


# ---------------------------------------------------- front, inside the coil
TC = (CX, CY + 1.6)
keep = box(U1[0] - 4.8, 0, U1[0] + 4.8, by1 + 2.2).union(box(C1[0] - 3, 0, C1[0] + 4.4, C1[1] + 0.9))
tap_target(TOP, TC, R_IN - (TC[1] - CY), keep.buffer(0.5))
# tagline on an arc over the top
TOP['silk'].append(arc_text(F_MONO, 'SOFTWARE · TOOLS · HARDWARE', 1.3, TC[0], TC[1], 11.0, 90, tracking=0.32))

# ============================================================ front: identity (left)
LX = 4.6
tile = rrect(LX, 40.4, LX + 10.4, 50.8, 2.3)
mono, _ = F_BLACK.text('u.', 8.6, LX + 5.2, 42.25, tracking=-0.15, anchor='center')
TOP['gold'].append(tile.difference(mono.buffer(0.02)))
TOP['cu'].append(tile)
n1, w1 = F_BOLD.text('umut', 5.9, 17.6, 45.6, tracking=-0.12)
n2, w2 = F_BOLD.text('alisoglu', 5.9, 17.6, 40.5, tracking=-0.12)
TOP['silk'] += [n1, n2]
TOP['gold'].append(disc(17.6 + w2 + 1.17, 41.12, 0.66))


def icon_mail(cx, cy):
    r = rrect(cx - 1.2, cy - 0.85, cx + 1.2, cy + 0.85, 0.25)
    return U(r.difference(r.buffer(-0.24)), stroke([(cx - 1.05, cy + 0.7), (cx, cy - 0.12), (cx + 1.05, cy + 0.7)], 0.24))


def icon_globe(cx, cy):
    g = ring(cx, cy, 1.05, 0.24)
    e = affinity.scale(ring(cx, cy, 1.05, 0.24 / 0.42), 0.42, 1, origin=(cx, cy))
    return U(g, e, stroke([(cx - 1.05, cy), (cx + 1.05, cy)], 0.22)).intersection(disc(cx, cy, 1.18))


def icon_code(cx, cy):
    a = stroke([(cx - 0.45, cy + 0.75), (cx - 1.15, cy), (cx - 0.45, cy - 0.75)], 0.26)
    b = stroke([(cx + 0.45, cy + 0.75), (cx + 1.15, cy), (cx + 0.45, cy - 0.75)], 0.26)
    return U(a, b, stroke([(cx + 0.22, cy + 0.95), (cx - 0.22, cy - 0.95)], 0.24))


rows = [('umut@alisoglu.com', icon_mail), ('alisoglu.com', icon_globe), ('github.com/UmutAlisoglu', icon_code)]
row_y = [28.4, 22.4, 16.4]
for (txt, ic), yb in zip(rows, row_y):
    t = rrect(LX, yb - 0.75, LX + 3.7, yb + 2.95, 0.8)
    TOP['gold'].append(t.difference(ic(LX + 1.85, yb + 1.1)))
    TOP['cu'].append(t)
    TOP['silk'].append(F_MED.text(txt, 2.4, LX + 5.4, yb + 0.15)[0])
# a silver bus links the three icons, like pins on a header
TOP['gold'].append(stroke([(LX + 1.85, row_y[0] - 0.75), (LX + 1.85, row_y[-1] + 2.95)], 0.3))
TOP['gold'].append(stroke([(LX + 1.85, row_y[-1] - 0.75), (LX + 1.85, 9.6)], 0.3))
TOP['gold'].append(disc(LX + 1.85, 8.9, 0.85).difference(disc(LX + 1.85, 8.9, 0.36)))
TOP['bare'].append(disc(LX + 1.85, 8.9, 0.36))
TOP['silk'].append(F_MONO.text('FILEFORGE · REPODOCK · PCB ART STUDIO', 1.25, LX + 5.4, 8.4, tracking=0.2)[0])


def wave_field(S, c, r_from, clip, avoid, step=1.05, w=0.2):
    """Tone-on-tone copper ripples spreading from the antenna across the card."""
    rings = []
    r = r_from
    k = 0
    while r < 95:
        rings.append(ring(*c, r, w))
        r += step + k * 0.012
        k += 1
    f = U(*rings).intersection(clip).difference(avoid)
    f = f.buffer(-0.08, quad_segs=6).buffer(0.08, quad_segs=6)
    S['cu'].append(U(*[p for p in polys(f) if p.area > 0.15]))


FIELD_CLIP = BOARD.buffer(-1.2)
avoid_top = U(U(*TOP['silk']).difference(coil_zone.buffer(1)).buffer(0.9, quad_segs=6), U(*TOP['gold']).buffer(0.9, quad_segs=6), U(*TOP['bare']).buffer(0.9))
wave_field(TOP, (CX, CY), R0 + 3.0, FIELD_CLIP, avoid_top)

# ============================================================ back (back-view coordinates)
BCX = W - CX
bzone = disc(BCX, CY, R0)
BTC = (BCX, CY + 1.6)
# outline of the antenna as a dashed circle
BOT['silk'].append(dashed_ring((BCX, CY), R0 - 0.6, 0.16, 0.9, 0.55))
bkeep = box(BCX - 1.0, 0, BCX + 1.0, V2[1] + 1.0)
tap_target(BOT, BTC, R_IN - 1.6, bkeep)
BOT['silk'].append(U(dashed_ring((BCX, CY), 16.4, 0.16, 0.5, 0.6), dashed_ring((BCX, CY), 18.4, 0.16, 0.35, 0.75)).difference(bkeep))

# right: monogram with dotted ring, name, QR
MGC = (66.6, 40.2)
MG = rrect(MGC[0] - 6.0, MGC[1] - 6.0, MGC[0] + 6.0, MGC[1] + 6.0, 2.7)
mg_txt, _ = F_BLACK.text('u.', 9.8, MGC[0], MGC[1] - 4.05, tracking=-0.2, anchor='center')
BOT['gold'].append(MG.difference(mg_txt.buffer(0.02)))
BOT['cu'].append(MG)
for j_ in range(36):
    a_ = 2 * math.pi * j_ / 36
    BOT['silk'].append(disc(MGC[0] + 9.0 * math.cos(a_), MGC[1] + 9.0 * math.sin(a_), 0.34 if j_ % 3 else 0.48))
big, bw = F_BOLD.text('alisoglu.com', 3.9, MGC[0], 24.6, tracking=-0.08, anchor='center')
BOT['silk'].append(big)

qr = qrcode.QRCode(version=2, error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
qr.add_data('https://alisoglu.com'); qr.make(fit=False)
mods = qr.get_matrix()
NM = len(mods)
MOD = 0.52
quiet = 1.5
qsize = NM * MOD
QX, QY = W - 3.2 - quiet - qsize, 3.2 + quiet
qr_bg = rrect(QX - quiet, QY - quiet, QX + qsize + quiet, QY + qsize + quiet, 1.0)
dark = U(*[box(QX + c * MOD, QY + (NM - 1 - r) * MOD, QX + (c + 1) * MOD, QY + (NM - r) * MOD) for r in range(NM) for c in range(NM) if mods[r][c]])
BOT['silk'].append(qr_bg.difference(dark))

avoid_bot = U(MG.buffer(1.0), qr_bg.buffer(1.1), U(*BOT['silk']).difference(bzone.buffer(1)).buffer(0.9, quad_segs=6))
wave_field(BOT, (BCX, CY), R0 + 3.0, FIELD_CLIP, avoid_bot)
QX = QX; QY = QY
# ============================================================ compose layers
EDGE = BOARD.buffer(-0.35)


def finish(S, mirror=False):
    cu_art = U(*S['cu'])
    gold = U(*S['gold'])
    pads = U(*S['pads'])
    bare = U(*S['bare'])
    cu = U(cu_art, gold.buffer(0.08), pads).intersection(EDGE)
    opening = U(gold, pads.buffer(0.05), bare)
    art = U(*[g for g in S['silk'] if id(g) not in TEXT_IDS]).difference(U(*S['silk_cut']))
    art = art.difference(opening.buffer(0.1)).intersection(BOARD.buffer(-0.25))
    art = art.buffer(0.08, quad_segs=6).buffer(-0.08, quad_segs=6)         # no gaps < 0.16 mm in line art
    art = art.buffer(-0.078, quad_segs=6).buffer(0.078, quad_segs=6)       # no line art thinner than 0.156 mm
    text = U(*[g for g in S['silk'] if id(g) in TEXT_IDS], *S['label'])
    silk = U(art, text).difference(opening.buffer(0.1)).intersection(BOARD.buffer(-0.25))
    out = {'cu': cu, 'mask': opening.intersection(BOARD.buffer(-0.05)), 'silk': silk}
    if mirror:
        out = {k: affinity.scale(v, -1, 1, origin=(W / 2, 0)) for k, v in out.items()}
    return out


top = finish(TOP)
bot_view = finish(BOT)
bot = {k: affinity.scale(v, -1, 1, origin=(W / 2, 0)) for k, v in bot_view.items()}

# keep-out check: no copper inside the antenna area other than the coil itself and the chip circuit
circuit = U(coil.buffer(0.1), *[p.buffer(0.1) for p in u1_pads.values()], *[p.buffer(0.1) for p in c1_pads], *[disc(*v, 0.5) for v in VIAS])
foreign_top = top['cu'].difference(circuit).intersection(coil_zone.buffer(2.5)).difference(stroke([inner_end, LB], 0.6)).difference(stroke([V2, LA], 0.6))
foreign_top = foreign_top.difference(stroke([outer_end, V1], 0.6)).difference(box(inner_end[0] - 0.4, C1[1] - 0.3, XS + 0.4, C1[1] + 0.3))
foreign_top = foreign_top.difference(stroke([inner_end, (inner_end[0], LB[1] - (inner_end[0] - LB[0])), LB], 0.6)).difference(stroke([V2, (XS, LA[1] - (LA[0] - XS)), LA], 0.6))
foreign_bot = bot['cu'].difference(stroke([V1, V2], 0.8)).intersection(coil_zone.buffer(2.5))

json.dump({'coil_pts': len(coil_pts), 'U1': U1, 'C1': C1, 'V1': V1, 'V2': V2}, open(f'{OUT}/meta.json', 'w'))

import pickle
pickle.dump({'top': top, 'bot': bot, 'bot_view': bot_view, 'board': BOARD, 'vias': VIAS, 'U1': U1, 'C1': C1,
             'foreign_top': foreign_top.area, 'foreign_bot': foreign_bot.area, 'coil': coil, 'W': W, 'H': H,
             'qr': (QX, QY, qsize)}, open(f'{OUT}/layers.pkl', 'wb'))

# ============================================================ write fabrication files
name = 'alisoglu-nfc-card'
gerber(f'{OUT}/{name}.GTL', top['cu'], 'Copper,L1', 'Top')
gerber(f'{OUT}/{name}.GBL', bot['cu'], 'Copper,L2', 'Bot')
gerber(f'{OUT}/{name}.GTS', top['mask'], 'Soldermask', 'Top', 'Negative')
gerber(f'{OUT}/{name}.GBS', bot['mask'], 'Soldermask', 'Bot', 'Negative')
gerber(f'{OUT}/{name}.GTO', top['silk'], 'Legend', 'Top')
gerber(f'{OUT}/{name}.GBO', bot['silk'], 'Legend', 'Bot')
# paste only for the real parts (U1; C1 is not fitted but gets paste so it can be added later)
paste = U(*[p.buffer(-0.03) for p in u1_pads.values()])
gerber(f'{OUT}/{name}.GTP', paste, 'Paste', 'Top')
gerber_outline(f'{OUT}/{name}.GKO', BOARD)
excellon(f'{OUT}/{name}.DRL', [(x, y, VIA_DRILL) for x, y in VIAS])

with open(f'{OUT}/{name}-BOM.csv', 'w') as f:
    f.write('Comment,Designator,Footprint,LCSC Part #\n')
    f.write('NT3H2111W0FTTJ (NTAG I2C plus 1k NFC tag),U1,TSSOP-8_3x3mm_P0.65mm,C2654884\n')
with open(f'{OUT}/{name}-CPL.csv', 'w') as f:
    f.write('Designator,Mid X,Mid Y,Layer,Rotation\n')
    f.write(f'U1,{U1[0]:.3f}mm,{U1[1]:.3f}mm,Top,180\n')
print('ok', 'foreign copper near antenna: top %.3f mm2, bottom %.3f mm2' % (foreign_top.area, foreign_bot.area))
