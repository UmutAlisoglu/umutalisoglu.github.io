// Draws the link preview card for every public page into assets/og/<page>.png.
// Run after changing page titles or src/site/social-cards.js: node scripts/render-og-images.mjs
// The PNGs are committed, so the website build does not need a browser.
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { socialCard, socialCardPaths, OG_WIDTH, OG_HEIGHT } from '../src/site/social-cards.js';
import { allToolPages } from '../src/site/tool-catalog.js';

const tones = {
  blue: ['#eaf0ff', '#3159d9'], pink: ['#fdeaf1', '#c2457a'], mint: ['#e5f3ec', '#2f8a63'],
  yellow: ['#fbf2d9', '#a1730d'], purple: ['#efeafd', '#6750c7'],
};
const escape = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const dataUrl = async path => `data:image/${path.endsWith('.png') ? 'png' : 'jpeg'};base64,${(await readFile(path)).toString('base64')}`;
const icons = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.2" fill="currentColor"/></svg>',
  half: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>',
};

function tile(tool, size = 96) {
  const [bg, fg] = tones[tool.color] || tones.blue;
  return `<div class="tile" style="width:${size}px;height:${size}px;background:${bg};color:${fg};font-size:${Math.round(size * .42)}px">${escape(tool.symbol)}</div>`;
}

async function visual(card) {
  const v = card.visual;
  if (v.kind === 'image') {
    const src = await dataUrl(v.src);
    if (v.frame === 'board') return `<div class="board"><img src="${src}" alt=""></div>`;
    return `<div class="window"><div class="window-bar"><i></i><i></i><i></i></div><div class="window-shot" style="background-image:url('${src}');background-position:${v.position || 'center'}${v.zoom ? `;background-size:${v.zoom}%` : ''}"></div></div>`;
  }
  if (v.kind === 'symbol') {
    const [bg, fg] = tones[v.color] || tones.blue;
    const glyph = card.visual.symbol === '🔒︎' ? icons.lock : card.visual.symbol === '✉︎' ? icons.mail : v.symbol === '◐' ? icons.half : escape(v.symbol);
    return `<div class="symbol-card"><div class="symbol" style="background:${bg};color:${fg}">${glyph}</div><div class="symbol-caption"><span class="dot" style="background:${fg}"></span>${escape(v.label || 'Processed in your browser')}</div></div>`;
  }
  if (v.kind === 'grid') {
    const tools = v.ids ? v.ids.map(id => allToolPages.find(tool => tool.id === id)) : allToolPages.slice(0, 12);
    return `<div class="grid grid-${tools.length}">${tools.map(tool => tile(tool, tools.length > 6 ? 92 : 120)).join('')}</div>`;
  }
  if (v.kind === 'flow') {
    const ids = ['image', 'background', 'merge'];
    return `<div class="flow">${ids.map((id, index) => { const tool = allToolPages.find(t => t.id === id); return `${index ? '<span class="arrow">→</span>' : ''}<div class="flow-step">${tile(tool, 104)}<span>${escape(tool.name)}</span></div>`; }).join('')}</div>`;
  }
  if (v.kind === 'monogram') return '<div class="monogram-big">u.</div>';
  if (v.kind === 'stack') {
    const items = [['FileForge', 'Local file tools', 'blue', '▧'], ['Repodock', 'Windows project launcher', 'mint', '▶'], ['PCB Art Studio', 'Image to Gerber', 'yellow', '◈']];
    return `<div class="stack">${items.map(([name, text, color, symbol]) => `<div class="stack-item">${tile({ color, symbol }, 64)}<div><strong>${name}</strong><span>${text}</span></div></div>`).join('')}</div>`;
  }
  if (v.kind === 'downloads') {
    const items = [['FileForge', 'FileForge-Windows.zip', 'blue', '▧'], ['Repodock', 'repodock-setup.exe', 'mint', '▶']];
    return `<div class="stack">${items.map(([name, text, color, symbol]) => `<div class="stack-item">${tile({ color, symbol }, 64)}<div><strong>${name}</strong><span>${text}</span></div><b class="get">↓</b></div>`).join('')}</div>`;
  }
  return '';
}

const css = `
*{box-sizing:border-box}html,body{margin:0}
body{width:${OG_WIDTH}px;height:${OG_HEIGHT}px;overflow:hidden;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#1d1d1f;background:#f5f5f7}
.card{position:relative;width:100%;height:100%;padding:52px 64px;background:radial-gradient(900px 520px at 100% 0,#e8eeff 0,#f5f5f7 62%)}
.brand{display:flex;align-items:center;gap:14px;font-size:23px;font-weight:600;letter-spacing:-.01em}
.mono{width:46px;height:46px;border-radius:50%;background:#3159d9;color:#fff;display:grid;place-items:center;font:italic 31px/1 Georgia,'Liberation Serif',serif;padding-bottom:4px}
.domain{position:absolute;top:66px;right:64px;font-size:17px;color:#616168}
.text{position:absolute;left:64px;top:150px;width:560px}
.eyebrow{font-size:14px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#3159d9;margin:0 0 20px}
h1{margin:0;font-weight:600;font-size:64px;line-height:1.02;letter-spacing:-.035em}
h1 em{display:block;font:italic 400 54px/1.12 Georgia,'Liberation Serif',serif;letter-spacing:-.02em;color:#3159d9;margin-top:6px}
.long h1{font-size:54px}.long h1 em{font-size:46px}
.subtitle{margin:22px 0 0;font-size:22px;line-height:1.42;color:#55555c;max-width:540px}
.chips{position:absolute;left:64px;bottom:50px;display:flex;gap:10px}
.chips span{display:inline-flex;align-items:center;gap:9px;padding:11px 18px;border-radius:999px;background:#fff;border:1px solid #e3e5ec;font-size:17px;font-weight:500;color:#2b2b31}
.chips span:first-child::before{content:'';width:8px;height:8px;border-radius:50%;background:#3159d9}
.visual{position:absolute;right:64px;top:132px;width:440px;height:400px;display:grid;place-items:center}
.window{width:470px;margin-right:-30px;border-radius:18px;background:#fff;border:1px solid #e1e3ea;box-shadow:0 30px 70px #1d2a5a26,0 6px 16px #1d2a5a14;overflow:hidden}
.window-bar{height:34px;display:flex;align-items:center;gap:7px;padding:0 14px;background:#f7f7f9;border-bottom:1px solid #ececf1}
.window-bar i{width:11px;height:11px;border-radius:50%;background:#d9dbe2}
.window-shot{height:300px;background-size:cover}
.board{width:500px;margin-right:-60px;transform:rotate(-4deg);filter:drop-shadow(0 34px 40px #0b1d5a40)}
.board img{width:100%;display:block;border-radius:22px}
.tile{display:grid;place-items:center;border-radius:26px;font-weight:600;line-height:1}
.symbol-card{display:flex;flex-direction:column;align-items:center;gap:26px}
.symbol{width:250px;height:250px;border-radius:64px;display:grid;place-items:center;font-size:120px;font-weight:600;box-shadow:0 30px 60px #1d2a5a1c;border:1px solid #ffffffaa}
.symbol svg{width:132px;height:132px}
.symbol-caption{display:flex;align-items:center;gap:10px;padding:11px 18px;border-radius:999px;background:#fff;border:1px solid #e3e5ec;font-size:17px;font-weight:500}
.dot{width:8px;height:8px;border-radius:50%}
.grid{display:grid;gap:18px;grid-template-columns:repeat(4,auto)}.grid-6{grid-template-columns:repeat(3,auto)}
.grid .tile{box-shadow:0 14px 30px #1d2a5a14;border:1px solid #ffffffaa}
.flow{display:flex;align-items:center;gap:14px}.flow-step{display:flex;flex-direction:column;align-items:center;gap:14px;font-size:16px;font-weight:500;color:#43434a;width:118px;text-align:center}
.arrow{font-size:30px;color:#9aa6c9;margin-bottom:34px}
.monogram-big{width:300px;height:300px;border-radius:50%;background:#3159d9;color:#fff;display:grid;place-items:center;font:italic 190px/1 Georgia,'Liberation Serif',serif;padding-bottom:30px;box-shadow:0 40px 80px #3159d940}
.stack{display:flex;flex-direction:column;gap:16px;width:430px}
.stack-item{display:flex;align-items:center;gap:18px;padding:18px 22px;border-radius:22px;background:#fff;border:1px solid #e3e5ec;box-shadow:0 14px 34px #1d2a5a12}
.stack-item .tile{border-radius:18px;flex:none}
.stack-item strong{display:block;font-size:22px;font-weight:600;letter-spacing:-.01em}.stack-item span{display:block;font-size:16px;color:#6a6a72;margin-top:4px}
.get{margin-left:auto;width:42px;height:42px;border-radius:50%;background:#3159d9;color:#fff;display:grid;place-items:center;font-size:20px}
/* Home */
.home .text{left:0;right:0;width:auto;top:168px;text-align:center}
.home .eyebrow{color:#616168;font-weight:500;font-size:13px;letter-spacing:.2em}
.home h1{font-size:104px;font-weight:500;letter-spacing:-.05em}
.home h1 em{display:inline;font-size:104px;margin:0}
.home .subtitle{margin:26px auto 0;font-size:29px;max-width:none}
.home .chips{left:0;right:0;justify-content:center;bottom:96px;gap:16px}
.home .chips span{padding:18px 34px;font-size:20px}
`;

async function html(card) {
  const home = card.home;
  const long = !home && (card.title.length + card.em.length > 34);
  const heading = home ? `${escape(card.title.split(' ')[0])} <em>${escape(card.title.split(' ').slice(1).join(' '))}.</em>` : `${escape(card.title)}<em>${escape(card.em)}</em>`;
  return `<!doctype html><meta charset="utf-8"><style>${css}</style><div class="card${home ? ' home' : ''}${long ? ' long' : ''}">
<div class="brand"><span class="mono">u.</span>umut alisoglu.</div><div class="domain">alisoglu.com</div>
<div class="text"><p class="eyebrow">${escape(card.eyebrow)}</p><h1>${heading}</h1><p class="subtitle">${escape(home ? card.em : card.subtitle)}</p></div>
${home ? '' : `<div class="visual">${await visual(card)}</div>`}
<div class="chips">${card.chips.map(chip => `<span>${escape(chip)}</span>`).join('')}</div></div>`;
}

await mkdir('assets/og', { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: OG_WIDTH, height: OG_HEIGHT }, deviceScaleFactor: 1 });
  const only = process.argv.slice(2);
  for (const path of socialCardPaths) {
    const card = socialCard(path);
    if (only.length && !only.includes(card.slug)) continue;
    await page.setContent(await html(card), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: card.file, clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT } });
  }
} finally { await browser.close(); }
console.log(`Rendered ${socialCardPaths.length} link preview cards into assets/og/.`);
