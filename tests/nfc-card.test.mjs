import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';
import { Face } from '../src/nfc-card/text.js';
import { buildCard, DEFAULTS, R0, CX, CY, W } from '../src/nfc-card/card.js';
import { fabricationFiles, checkCard } from '../src/nfc-card/fab.js';
import { area, inter, disc, union } from '../src/nfc-card/geom.js';

const load = (pkg, name) => { const b = readFileSync(`node_modules/@fontsource/${pkg}/files/${name}.woff`); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const face = (pkg, w) => new Face([load(pkg, `${pkg}-latin-${w}-normal`), load(pkg, `${pkg}-latin-ext-${w}-normal`)]);
export const faces = { black: face('inter', 900), bold: face('inter', 700), medium: face('inter', 500), mono: face('jetbrains-mono', 800) };

test('default card builds, passes the manufacturing check and writes every file', () => {
  const t0 = performance.now();
  const card = buildCard(faces, DEFAULTS);
  const t1 = performance.now();
  const check = checkCard(card);
  const t2 = performance.now();
  console.log(`build ${(t1 - t0).toFixed(0)} ms, check ${(t2 - t1).toFixed(0)} ms`, check.issues);
  assert.deepEqual(card.notes, []);
  assert.ok(check.ok, check.issues.join('\n'));
  const files = fabricationFiles(card, { check });
  for (const ext of ['GTL', 'GBL', 'GTS', 'GBS', 'GTO', 'GBO', 'GTP', 'GKO', 'DRL']) assert.ok(files[`nfc-card.${ext}`].length > 50, ext);
  assert.ok(!files['nfc-card.GTL'].includes('%LPC'));
  assert.match(files['nfc-card-CPL.csv'], /U1,\d+\.\d+mm,\d+\.\d+mm,Top,180/);
  globalThis.__card = card;
});

test('no copper inside the antenna apart from the coil circuit', () => {
  const card = buildCard(faces, { ...DEFAULTS, first: 'Wolfgang', last: 'Mustermann-Lüdenscheid' });
  const zoneFront = disc(CX, CY, R0 + 2), zoneBack = disc(W - CX, CY, R0 + 2);
  assert.equal(area(inter(card.top.field, zoneFront)), 0);
  assert.equal(area(inter(card.top.cuParts, zoneFront)), 0);
  assert.equal(area(inter(card.botView.field, zoneBack)), 0);
  assert.equal(area(inter(card.botView.cuParts, zoneBack)), 0);
});

test('Gerber regions describe exactly the layer geometry', () => {
  const card = buildCard(faces, DEFAULTS);
  const files = fabricationFiles(card, { check: { ok: true, issues: [] } });
  // Every region is a closed, hole-free outline; their areas add up to the layer area.
  const regionArea = text => {
    let total = 0;
    for (const block of text.split('G36*').slice(1)) {
      const pts = [...block.split('G37*')[0].matchAll(/X(-?\d+)Y(-?\d+)D0[12]/g)].map(m => [m[1] / 1e6, m[2] / 1e6]);
      assert.deepEqual(pts[0], pts[pts.length - 1], 'region is closed');
      let a = 0;
      for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
      assert.ok(a > 0, 'region winds counter-clockwise (no holes)');
      total += a / 2;
    }
    return total;
  };
  for (const [ext, geom] of [['GTL', card.top.cu], ['GBL', card.bot.cu], ['GTS', card.top.mask], ['GTO', card.top.silk], ['GBO', card.bot.silk]]) {
    const expected = area(union(geom));
    const got = regionArea(files[`nfc-card.${ext}`]);
    assert.ok(Math.abs(got - expected) < expected * 0.002 + 0.01, `${ext}: ${got} vs ${expected}`);
  }
  assert.match(files['nfc-card.DRL'], /T1C0\.300[\s\S]*X\d+\.\d+Y\d+\.\d+[\s\S]*M30/);
});

test('long text shrinks and reports what does not fit', () => {
  const card = buildCard(faces, { ...DEFAULTS, last: 'Alisoğlu-Schwarzenberger', rows: [{ icon: 'mail', text: 'a.very.long.address.that.never.ends@example-domain.com' }] });
  assert.ok(card.notes.some(n => n.field === 'row0'));
  const ok = buildCard(faces, { ...DEFAULTS, first: 'Ayşe', last: 'Yılmaz', monogram: 'AY', rows: [{ icon: 'phone', text: '+49 151 2345678' }, { icon: 'pin', text: 'Berlin' }] });
  assert.deepEqual(ok.notes, []);
  assert.ok(checkCard(ok).ok, checkCard(ok).issues.join('\n'));
});
