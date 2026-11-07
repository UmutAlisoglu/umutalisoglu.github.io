// Fabrication files for the NFC card: Gerber X2 layers, Excellon drill, JLCPCB BOM and CPL,
// plus a manufacturing check of the finished layers.
import { S, pieces, fracture, offset, diff, inter, area, thinParts, narrowGaps, significant } from './geom.js';
import { W, H, BOARD, VIA_DRILL } from './card.js';
import { MASK_COLOURS, FINISHES } from './options.js';

export { MASK_COLOURS, FINISHES } from './options.js';

const c = v => Math.round(v * 1e6 / S); // internal units -> Gerber 4.6 integer (nm)

export function gerber(geom, fn, side, polarity = 'Positive') {
  const L = ['G04 alisoglu.com NFC Card Builder*', '%TF.GenerationSoftware,alisoglu.com,NFC Card Builder,1*%',
    side ? `%TF.FileFunction,${fn},${side}*%` : `%TF.FileFunction,${fn}*%`,
    `%TF.FilePolarity,${polarity}*%`, '%FSLAX46Y46*%', '%MOMM*%', '%LPD*%', 'G01*'];
  // Dark polarity only: polygons with holes are cut into hole-free strips.
  for (const piece of pieces(geom)) {
    for (const strip of fracture(piece)) {
      for (const path of strip) {
        if (path.length < 3) continue;
        L.push('G36*', `X${c(path[0].X)}Y${c(path[0].Y)}D02*`);
        for (let i = 1; i < path.length; i++) L.push(`X${c(path[i].X)}Y${c(path[i].Y)}D01*`);
        L.push(`X${c(path[0].X)}Y${c(path[0].Y)}D01*`, 'G37*');
      }
    }
  }
  L.push('M02*');
  return L.join('\n') + '\n';
}

export function outlineGerber() {
  const L = ['G04 board outline*', '%TF.GenerationSoftware,alisoglu.com,NFC Card Builder,1*%', '%TF.FileFunction,Profile,NP*%',
    '%FSLAX46Y46*%', '%MOMM*%', '%ADD10C,0.100*%', '%LPD*%', 'G01*', 'D10*'];
  const path = BOARD[0];
  L.push(`X${c(path[0].X)}Y${c(path[0].Y)}D02*`);
  for (let i = 1; i < path.length; i++) L.push(`X${c(path[i].X)}Y${c(path[i].Y)}D01*`);
  L.push(`X${c(path[0].X)}Y${c(path[0].Y)}D01*`, 'M02*');
  return L.join('\n') + '\n';
}

export function drillFile(vias) {
  return ['M48', '; alisoglu.com NFC Card Builder - plated vias', 'FMAT,2', 'METRIC,TZ', `T1C${VIA_DRILL.toFixed(3)}`, '%', 'G90', 'G05', 'T1',
    ...vias.map(([x, y]) => `X${x.toFixed(3)}Y${y.toFixed(3)}`), 'M30'].join('\n') + '\n';
}


export function orderNotes(card, colour, finish, check) {
  const m = MASK_COLOURS[colour], f = FINISHES[finish];
  return `NFC business card - order notes
Made with the NFC Card Builder on alisoglu.com/projects/pcb-art-studio/nfc-card/

Board
- Size: ${W} x ${H} mm, 2 layers, rounded corners (3 mm)
- Thickness: 0.8 mm is closest to a credit card (1.6 mm also works)
- Solder mask: ${m.fab}
- Silkscreen: ${colour === 'white' ? 'Black' : 'White'}
- Surface finish: ${f.fab}
- Remove order number / "Specify a location": choose the option that keeps the maker's number off the art
- Copper: 1 oz

Assembly (JLCPCB, top side)
- Upload the BOM and CPL files from this ZIP
- U1: NXP NT3H2111W0FTTJ, NTAG I2C plus 1k, TSSOP-8, LCSC C2654884
- C1 is an optional 0402 tuning capacitor and is not fitted

After the boards arrive
- The chip ships blank. Write your link on alisoglu.com/projects/pcb-art-studio/nfc-card/#write
  (Chrome on Android) or with the NXP TagWriter app.
- Link on the card: ${card.options.url || '(none)'}

Antenna
- Round, 43 mm outside, 6 turns, 0.5 mm track, 0.4 mm gap, about 2.4 uH
- Resonance about 14 MHz with the chip's 50 pF. Keep metal away from the back when testing.

Manufacturing check
${check.ok ? '- Passed: copper and silkscreen at least 0.15 mm wide and apart, mask dams at least 0.1 mm.' : check.issues.map(i => `- ${i}`).join('\n')}
`;
}

export function bomCsv() {
  return 'Comment,Designator,Footprint,LCSC Part #\nNT3H2111W0FTTJ (NTAG I2C plus 1k NFC tag),U1,TSSOP-8_3x3mm_P0.65mm,C2654884\n';
}
export function cplCsv(card) {
  return `Designator,Mid X,Mid Y,Layer,Rotation\nU1,${card.U1[0].toFixed(3)}mm,${card.U1[1].toFixed(3)}mm,Top,180\n`;
}

/** Gerber ZIP contents as { filename: text }. */
export function fabricationFiles(card, { name = 'nfc-card', colour = 'blue', finish = 'silver', check }) {
  return {
    [`${name}.GTL`]: gerber(card.top.cu, 'Copper,L1', 'Top'),
    [`${name}.GBL`]: gerber(card.bot.cu, 'Copper,L2', 'Bot'),
    [`${name}.GTS`]: gerber(card.top.mask, 'Soldermask', 'Top', 'Negative'),
    [`${name}.GBS`]: gerber(card.bot.mask, 'Soldermask', 'Bot', 'Negative'),
    [`${name}.GTO`]: gerber(card.top.silk, 'Legend', 'Top'),
    [`${name}.GBO`]: gerber(card.bot.silk, 'Legend', 'Bot'),
    [`${name}.GTP`]: gerber(card.paste, 'Paste', 'Top'),
    [`${name}.GKO`]: outlineGerber(),
    [`${name}.DRL`]: drillFile(card.vias),
    [`${name}-BOM.csv`]: bomCsv(),
    [`${name}-CPL.csv`]: cplCsv(card),
    'ORDER-NOTES.txt': orderNotes(card, colour, finish, check),
  };
}

/**
 * Manufacturing check: 0.15 mm copper and silkscreen width and gap, 0.1 mm mask dam, edge clearance.
 * The antenna art and the ripples are the same shapes on every card (checked by the tests),
 * so this checks what a person's text changes and how close it comes to them.
 */
export function checkCard(card) {
  const issues = [];
  const edge = offset(BOARD, -0.3);
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  for (const [L, label] of [[card.top, 'front'], [card.botView, 'back']]) {
    for (const [g, name] of [[L.cuParts, 'Copper'], [L.silkParts, 'Silkscreen']]) {
      const thin = significant(thinParts(g, 0.15), 0.003).length;
      // spacing between separate shapes: they merge when each grows by half the gap
      const gaps = Math.max(0, pieces(g).length - pieces(offset(g, 0.065)).length);
      if (thin) issues.push(`${name} on the ${label}: ${plural(thin, 'spot')} thinner than 0.15 mm`);
      if (gaps) issues.push(`${name} on the ${label}: ${plural(gaps, 'gap')} narrower than 0.15 mm`);
    }
    if (area(inter(L.field, offset(L.cuParts, 0.15))) > 0.001) issues.push(`Copper ripples on the ${label} come too close to other copper`);
    if (area(inter(L.fixedArt, offset(L.silkParts, 0.15))) > 0.001) issues.push(`Text on the ${label} comes too close to the antenna print`);
    const dams = significant(narrowGaps(L.mask, 0.1), 0.002).length;
    if (dams) issues.push(`Solder mask on the ${label}: ${plural(dams, 'dam')} narrower than 0.1 mm`);
    if (area(diff(L.cuParts, edge)) > 0.001) issues.push(`Copper on the ${label} is closer than 0.3 mm to the edge`);
  }
  return { ok: issues.length === 0, issues };
}
