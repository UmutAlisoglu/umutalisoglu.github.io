// Photo-style SVG preview of one card side, drawn straight from the board layers.
import { svgPath } from './geom.js';
import { W, H, BOARD } from './card.js';
import { MASK_COLOURS, FINISHES } from './fab.js';

const FR4 = '#ccbd8c';

/**
 * side: 'front' | 'back'. The back is shown as you see it after turning the card over.
 * Returns an SVG string with a width/height ratio of the card plus a small margin.
 */
export function cardSvg(card, side, { colour = 'blue', finish = 'silver', id = side, title = '' } = {}) {
  const c = MASK_COLOURS[colour] || MASK_COLOURS.blue;
  const f = FINISHES[finish] || FINISHES.silver;
  const L = side === 'front' ? card.top : card.botView;
  const vias = side === 'front' ? card.vias : card.vias.map(([x, y]) => [W - x, y]);
  const M = 2.4;
  const board = svgPath(BOARD, H), cu = svgPath(L.cu, H), mask = svgPath(L.mask, H), silk = svgPath(L.silk, H);
  const p = s => `${id}-${s}`;
  const dark = colour === 'white';
  const stops = f.stops.map((s, i) => `<stop offset="${[0, 0.32, 0.55, 0.8, 1][i]}" stop-color="${s}"/>`).join('');
  const chip = side === 'front' ? chipSvg(card.U1) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M} ${W + 2 * M} ${H + 2 * M}" role="img" aria-label="${title || `${side === 'front' ? 'Front' : 'Back'} of the card`}">
<defs>
<clipPath id="${p('board')}"><path d="${board}"/></clipPath>
<clipPath id="${p('cu')}"><path d="${cu}"/></clipPath>
<linearGradient id="${p('metal')}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${H}">${stops}</linearGradient>
<linearGradient id="${p('light')}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${H}"><stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.25 : 0.13}"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${dark ? 0.08 : 0.16}"/></linearGradient>
<radialGradient id="${p('glow')}" gradientUnits="userSpaceOnUse" cx="${W * 0.28}" cy="${H * 0.2}" r="${W * 0.75}"><stop offset="0" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="${p('shadow')}" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0.4" dy="0.9" stdDeviation="0.9" flood-color="#000" flood-opacity="0.35"/></filter>
</defs>
<path d="${board}" fill="${c.mask}" filter="url(#${p('shadow')})"/>
<g clip-path="url(#${p('board')})">
<path d="${cu}" fill="#fff" fill-opacity="0.1" transform="translate(-0.035 -0.035)"/>
<path d="${cu}" fill="${c.cu}"/>
<path d="${mask}" fill="${FR4}"/>
<path d="${mask}" fill="url(#${p('metal')})" clip-path="url(#${p('cu')})"/>
<path d="${mask}" fill="none" stroke="#000" stroke-opacity="0.2" stroke-width="0.07"/>
<path d="${silk}" fill="#000" fill-opacity="0.25" transform="translate(0.025 0.025)"/>
<path d="${silk}" fill="${c.silk}"/>
${vias.map(([x, y]) => `<circle cx="${x}" cy="${H - y}" r="0.18" fill="#000" fill-opacity="0.45"/>`).join('')}
${chip}
<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${p('light')})"/>
<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${p('glow')})"/>
</g>
<path d="${board}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="0.12"/>
</svg>`;
}

function chipSvg([ux, uy]) {
  const y = H - uy;
  let pins = '';
  for (let n = 0; n < 8; n++) {
    const s = n < 4 ? -1 : 1;
    const py = y - (-0.975 + (n % 4) * 0.65);
    pins += `<rect x="${ux + s * 1.5 - (s > 0 ? 0 : 1)}" y="${py - 0.15}" width="1" height="0.3" fill="#c7c9cc"/>`;
  }
  return `<g>${pins}<defs><linearGradient id="chip-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#333338"/><stop offset="1" stop-color="#121214"/></linearGradient></defs>
<rect x="${ux - 1.5}" y="${y - 1.5}" width="3" height="3" rx="0.12" fill="url(#chip-body)"/>
<circle cx="${ux + 1.0}" cy="${y + 1.0}" r="0.2" fill="#0a0a0c"/>
<text x="${ux}" y="${y - 0.15}" font-family="JetBrains Mono, monospace" font-weight="700" font-size="0.62" fill="#c0c0c7" fill-opacity="0.8" text-anchor="middle">NXP</text>
<text x="${ux}" y="${y + 0.7}" font-family="JetBrains Mono, monospace" font-weight="700" font-size="0.62" fill="#c0c0c7" fill-opacity="0.8" text-anchor="middle">NT3H</text></g>`;
}

/** Plain layer view for checking: copper, mask openings or silkscreen in one colour. */
export function layerSvg(card, side, layer) {
  const L = side === 'front' ? card.top : card.botView;
  const colours = { cu: '#d98a3d', mask: '#2f9e5b', silk: '#1b1f27' };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2.4 -2.4 ${W + 4.8} ${H + 4.8}"><path d="${svgPath(BOARD, H)}" fill="#f4f6f9" stroke="#9aa3b0" stroke-width="0.12"/><path d="${svgPath(L[layer], H)}" fill="${colours[layer]}"/></svg>`;
}
