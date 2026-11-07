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

# ============================================================ NFC antenna (top)
CX0, CX1, CY0, CY1, CR = 46.0, 82.0, 6.5, 48.5, 3.4
TURNS, TW, TS = 6, 0.5, 0.4
PITCH = TW + TS
XS, JOG = 64.0, 2.6


def rr_path(x0, y0, x1, y1, r, sx, ex, seg=10):
    """Counter-clockwise rounded-rectangle centreline from bottom edge x=sx round to bottom edge x=ex."""
    pts = [(sx, y0), (x1 - r, y0)]
    def arc(cx, cy, a0):
        return [(cx + r * math.cos(math.radians(a0 + 90 * t / seg)), cy + r * math.sin(math.radians(a0 + 90 * t / seg))) for t in range(1, seg + 1)]
    pts += arc(x1 - r, y0 + r, -90)
    pts.append((x1, y1 - r)); pts += arc(x1 - r, y1 - r, 0)
    pts.append((x0 + r, y1)); pts += arc(x0 + r, y1 - r, 90)
    pts.append((x0, y0 + r)); pts += arc(x0 + r, y0 + r, 180)
    pts.append((ex, y0))
    return pts


coil_pts = []
for i in range(TURNS):
    d = TW / 2 + i * PITCH
    r = max(CR - d, 0.9)
    coil_pts += rr_path(CX0 + d, CY0 + d, CX1 - d, CY1 - d, r, XS, XS - JOG)
outer_end = coil_pts[0]
inner_end = coil_pts[-1]
y_in = CY0 + TW / 2 + (TURNS - 1) * PITCH          # centreline of innermost turn
coil = stroke(coil_pts, TW)
TOP['pads'].append(coil)                              # exposed, copper-defined -> crisp gold coil
coil_zone = rrect(CX0, CY0, CX1, CY1, CR)
coil_inner = rrect(CX0 + TURNS * PITCH - TS, CY0 + TURNS * PITCH - TS, CX1 - TURNS * PITCH + TS, CY1 - TURNS * PITCH + TS, 1.2)

# vias + bottom bridge
V1 = (XS, CY0 - 1.7)
V2 = (XS, y_in + 2.4)
VIAS += [V1, V2]
TOP['cu'].append(stroke([outer_end, V1], 0.4))
for v in (V1, V2):
    TOP['cu'].append(disc(*v, VIA_PAD / 2))

# chip U1: NXP NT3H2111W0FTTJ (NTAG I2C plus 1k), TSSOP-8 3x3 mm, 0.65 mm pitch, rotated 180 deg
U1 = (XS - JOG / 2, y_in + 5.25)
PADX, PADW, PADH = 2.8625, 1.475, 0.45
def tssop_pin(n):
    # rotation 0: pins 1-4 on the left from top to bottom, 5-8 on the right from bottom to top
    if n <= 4:
        x, y = -PADX, 0.975 - (n - 1) * 0.65
    else:
        x, y = PADX, -0.975 + (n - 5) * 0.65
    return (U1[0] - x, U1[1] - y)                      # rotated 180 deg
u1_pads = {n: box(tssop_pin(n)[0] - PADW / 2, tssop_pin(n)[1] - PADH / 2, tssop_pin(n)[0] + PADW / 2, tssop_pin(n)[1] + PADH / 2) for n in range(1, 9)}
for p in u1_pads.values():
    TOP['pads'].append(p)
LB, LA = tssop_pin(8), tssop_pin(1)                    # pin 8 (LB) bottom-left, pin 1 (LA) bottom-right
k = LA[1] - (LA[0] - XS)                               # 45 deg entry
TOP['pads'].append(stroke([inner_end, (inner_end[0], LB[1] - (inner_end[0] - LB[0])), LB], 0.4))
TOP['cu'].append(stroke([V2, (XS, LA[1] - (LA[0] - XS)), LA], 0.4))
# optional tuning capacitor C1 (0402, not fitted)
C1 = (U1[0], y_in + 1.45)
c1_pads = [box(C1[0] + sx - 0.28, C1[1] - 0.31, C1[0] + sx + 0.28, C1[1] + 0.31) for sx in (-0.48, 0.48)]
for p in c1_pads:
    TOP['pads'].append(p)
TOP['pads'].append(stroke([(inner_end[0], C1[1]), (C1[0] - 0.48, C1[1])], 0.3))
TOP['cu'].append(stroke([(XS, C1[1]), (C1[0] + 0.48, C1[1])], 0.3))
BOT_BRIDGE = stroke([(W - V1[0], V1[1]), (W - V2[0], V2[1])], 0.4)   # back view coordinates
BOT['cu'].append(BOT_BRIDGE)
for v in (V1, V2):
    BOT['cu'].append(disc(W - v[0], v[1], VIA_PAD / 2))

# chip silkscreen
bx0, bx1, by0, by1 = U1[0] - 1.65, U1[0] + 1.65, U1[1] - 1.65, U1[1] + 1.65
TOP['silk'] += [stroke([(bx0 + 1.2, by1 + 0.25), (bx1 - 1.2, by1 + 0.25)], 0.15), stroke([(bx0 + 1.2, by0 - 0.25), (bx1 - 1.2, by0 - 0.25)], 0.15)]
TOP['silk'].append(disc(LA[0] + 0.25, LA[1] - 0.95, 0.22))       # pin-1 marker
TOP['silk'].append(F_MONO.text('U1', 1.25, U1[0], by1 + 0.75, anchor='center')[0])
TOP['silk'].append(F_MONO.text('C1', 1.0, C1[0] + 2.65, C1[1] - 0.36, anchor='left')[0])

# ---------------------------------------------------- inside the coil: tap ripples
TC = (XS, 30.6)
interior = coil_inner.buffer(-1.0)
keep = box(U1[0] - 4.6, CY0, U1[0] + 4.6, by1 + 2.4).union(box(C1[0] - 3, CY0, C1[0] + 4.2, C1[1] + 0.9))
tap_disc = disc(*TC, 3.9)
def waves(cx, cy, s=1.0):
    # contactless symbol: four arcs, drawn as knock-out lines
    g = []
    ox = cx - 2.0 * s
    for rr in (0.9, 1.65, 2.4, 3.15):
        a = ring(ox, cy, rr * s, 0.34 * s)
        g.append(a.intersection(Polygon([(ox, cy), (ox + 8 * s, cy + 6.2 * s), (ox + 8 * s, cy - 6.2 * s)])))
    return U(*g)
TOP['silk'].append(tap_disc.difference(waves(TC[0], TC[1], 0.95)))
rip = []
rr = 5.0
idx = 0
while rr < 22:
    w = 0.32 if idx == 0 else (0.22 if idx < 3 else 0.16)
    g = ring(*TC, rr, w)
    if idx >= 4:   # dash the outer ripples, dashes get shorter further out
        n = int(2 * math.pi * rr / (1.6 - min(idx, 9) * 0.08))
        cuts = U(*[affinity.rotate(box(TC[0] - 0.22, TC[1], TC[0] + 0.22, TC[1] + rr + 1), 360 * j / n, origin=TC) for j in range(n)])
        g = g.difference(cuts)
    rip.append(g)
    rr += 1.25 + idx * 0.06
    idx += 1
TOP['silk'].append(U(*rip).intersection(interior).difference(keep.buffer(0.4)))

# ============================================================ front: identity
LX = 4.6
tile = rrect(LX, 40.4, LX + 10.4, 50.8, 2.3)
mono, _ = F_BLACK.text('u.', 8.6, LX + 5.2, 42.25, tracking=-0.15, anchor='center')
TOP['gold'].append(tile.difference(mono.buffer(0.02)))
TOP['cu'].append(tile)  # copper below the knocked-out letters -> lighter blue letters
n1, w1 = F_BOLD.text('umut', 5.9, 17.6, 45.6, tracking=-0.12)
n2, w2 = F_BOLD.text('alisoglu', 5.9, 17.6, 40.5, tracking=-0.12)
TOP['silk'] += [n1, n2]
dot_x = 17.6 + w2 + 0.55
TOP['gold'].append(disc(dot_x + 0.62, 41.12, 0.66))
tag, tw = F_MONO.text('SOFTWARE · TOOLS · HARDWARE', 1.4, LX, 35.2, tracking=0.34)
TOP['silk'].append(tag)
# divider trace with end pad
TOP['gold'].append(stroke([(LX, 32.6), (39.2, 32.6)], 0.3))
TOP['gold'].append(disc(40.3, 32.6, 0.8).difference(disc(40.3, 32.6, 0.35)))
TOP['bare'].append(disc(40.3, 32.6, 0.35))


def icon_mail(cx, cy):
    r = rrect(cx - 1.2, cy - 0.85, cx + 1.2, cy + 0.85, 0.25)
    o = r.difference(r.buffer(-0.24))
    return U(o, stroke([(cx - 1.05, cy + 0.7), (cx, cy - 0.12), (cx + 1.05, cy + 0.7)], 0.24))


def icon_globe(cx, cy):
    g = ring(cx, cy, 1.05, 0.24)
    e = affinity.scale(ring(cx, cy, 1.05, 0.24 / 0.42), 0.42, 1, origin=(cx, cy))
    return U(g, e, stroke([(cx - 1.05, cy), (cx + 1.05, cy)], 0.22)).intersection(disc(cx, cy, 1.18))


def icon_code(cx, cy):
    a = stroke([(cx - 0.45, cy + 0.75), (cx - 1.15, cy), (cx - 0.45, cy - 0.75)], 0.26)
    b = stroke([(cx + 0.45, cy + 0.75), (cx + 1.15, cy), (cx + 0.45, cy - 0.75)], 0.26)
    c = stroke([(cx + 0.22, cy + 0.95), (cx - 0.22, cy - 0.95)], 0.24)
    return U(a, b, c)


rows = [('umut@alisoglu.com', icon_mail), ('alisoglu.com', icon_globe), ('github.com/UmutAlisoglu', icon_code)]
for i, (txt, ic) in enumerate(rows):
    yb = 25.6 - i * 5.6
    t = rrect(LX, yb - 0.75, LX + 3.7, yb + 2.95, 0.8)
    icx, icy = LX + 1.85, yb + 1.1
    TOP['gold'].append(t.difference(ic(icx, icy)))
    TOP['cu'].append(t)
    txtg, tw = F_MED.text(txt, 2.4, LX + 5.4, yb + 0.15, tracking=0.0)
    TOP['silk'].append(txtg)
    # tone-on-tone signal trace from the icon, under the solder mask
    print('row width', txt, LX + 5.4 + tw)
    TOP['cu'].append(stroke([(LX + 3.7, yb - 0.2), (LX + 4.6, yb - 1.1), (40.3, yb - 1.1)], 0.22))
    TOP['gold'].append(disc(40.6, yb - 1.1, 0.42))

foot, fw = F_MONO.text('FILEFORGE · REPODOCK · PCB ART STUDIO', 1.25, LX, 4.15, tracking=0.2)
TOP['silk'].append(foot)

# subtle copper texture in the top-left corner behind the logo: fine pin grid under mask
grid = []
for gx in range(0, 7):
    for gy in range(0, 4):
        x, y = 30.6 + gx * 1.6, 48.6 + gy * 1.6 - 0.0
        if y < 52.5 and x < 42.0:
            grid.append(disc(x, y, 0.32))
pass

# ============================================================ back (back-view coordinates)
BCX = W - XS                                   # coil centre on the back
bzone = affinity.scale(coil_zone, -1, 1, origin=(W / 2, 0))
# dashed outline of the antenna as a tap target
dash = []
outline = bzone.buffer(-0.6).exterior
L = outline.length
n = int(L / 1.4)
for j in range(n):
    s0, s1 = j * L / n, j * L / n + L / n * 0.55
    dash.append(LineString([outline.interpolate(t) for t in [s0 + (s1 - s0) * q / 6 for q in range(7)]]).buffer(0.08, cap_style='flat'))
BOT['silk'].append(U(*dash))
BTC = (BCX, 30.6)
brip = []
rr, idx = 5.2, 0
while rr < 22:
    w = 0.26 if idx == 0 else (0.2 if idx < 3 else 0.16)
    g = ring(*BTC, rr, w)
    if idx >= 4:
        n = int(2 * math.pi * rr / (1.6 - min(idx, 9) * 0.08))
        cuts = U(*[affinity.rotate(box(BTC[0] - 0.22, BTC[1], BTC[0] + 0.22, BTC[1] + rr + 1), 360 * j / n, origin=BTC) for j in range(n)])
        g = g.difference(cuts)
    brip.append(g)
    rr += 1.25 + idx * 0.06
    idx += 1
binterior = bzone.buffer(-1.8).difference(box(BCX - 0.9, 0, BCX + 0.9, V2[1] + 1.2))
BOT['silk'].append(U(*brip).intersection(binterior))
BOT['silk'].append(disc(*BTC, 3.9).difference(waves(BTC[0], BTC[1], 0.95)))

# right half: monogram, contour field, QR code
RX0 = 43.6                                     # nothing copper left of this (antenna keep-out)
MGC = (62.8, 40.4)
MG = rrect(MGC[0] - 6.4, MGC[1] - 6.4, MGC[0] + 6.4, MGC[1] + 6.4, 2.8)
mg_txt, _ = F_BLACK.text('u.', 10.4, MGC[0], MGC[1] - 4.3, tracking=-0.2, anchor='center')
BOT['gold'].append(MG.difference(mg_txt.buffer(0.02)))
BOT['cu'].append(MG)
for j_ in range(36):
    a_ = 2 * math.pi * j_ / 36
    BOT['silk'].append(disc(MGC[0] + 9.6 * math.cos(a_), MGC[1] + 9.6 * math.sin(a_), 0.36 if j_ % 3 else 0.5))
big, bw = F_BOLD.text('alisoglu.com', 4.3, MGC[0], 25.4, tracking=-0.08, anchor='center')
BOT['silk'].append(big)
print('big width', bw)

qr = qrcode.QRCode(version=2, error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
qr.add_data('https://alisoglu.com'); qr.make(fit=False)
mods = qr.get_matrix()
NM = len(mods)
MOD = 0.56
quiet = 1.7
qsize = NM * MOD
QX, QY = W - 3.4 - quiet - qsize, 3.4 + quiet
qr_bg = rrect(QX - quiet, QY - quiet, QX + qsize + quiet, QY + qsize + quiet, 1.0)
dark = U(*[box(QX + c * MOD, QY + (NM - 1 - r) * MOD, QX + (c + 1) * MOD, QY + (NM - r) * MOD) for r in range(NM) for c in range(NM) if mods[r][c]])
BOT['silk'].append(qr_bg.difference(dark))

# contour field around the monogram (copper under mask, tone on tone)
avoid = U(MG.buffer(1.0), qr_bg.buffer(1.2), U(*BOT['silk']).buffer(1.0, quad_segs=8).difference(bzone.buffer(1)))
field_clip = rrect(RX0, 1.0, W - 1.0, H - 1.0, 2.2)
lines = []
mc = MGC
for kk in range(1, 40):
    d0 = 1.2 + kk * 0.78
    base = MG.buffer(d0, quad_segs=16).exterior
    pts = []
    N = int(base.length / 0.5)
    for j in range(N):
        p = base.interpolate(j * base.length / N)
        a = math.atan2(p.y - mc[1], p.x - mc[0])
        amp = 0.012 * kk * kk ** 0.5
        off = amp * math.sin(3 * a + kk * 0.21) + 0.5 * amp * math.sin(5 * a - kk * 0.13)
        pts.append((p.x + off * math.cos(a), p.y + off * math.sin(a)))
    pts.append(pts[0])
    lines.append(LineString(pts).buffer(0.11, quad_segs=6))
field = U(*lines).intersection(field_clip).difference(avoid)
field = field.buffer(0.085, quad_segs=6).buffer(-0.085, quad_segs=6)     # close gaps < 0.17 mm
field = field.buffer(-0.08, quad_segs=6).buffer(0.08, quad_segs=6)       # drop slivers < 0.16 mm
field = U(*[p for p in polys(field) if p.area > 0.08])
BOT['cu'].append(field)
# gold accent: a few contour lines become exposed metal
for kk in (6, 13):
    pass

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
