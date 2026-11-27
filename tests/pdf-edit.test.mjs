import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { groupTextItems, coverQuad, sampleColors, viewPlacement, describeFont, standardFontName, buildEditedPdf, needsUnicode, fromHex, toHex } from '../src/fileforge/pdf-edit.js';

const item = (str, x, y, width, fs = 12, fontName = 'f1', extra = {}) => ({ str, transform: [fs, 0, 0, fs, x, y], width, fontName, ...extra });

test('items on one baseline merge into a line, columns and other lines stay separate', () => {
  const lines = groupTextItems([
    item('Invoice', 50, 700, 40), item('2026', 94, 700, 24), item('-0042', 118, 700, 30, 12, 'f1', { hasEOL: true }),
    item('Total', 50, 680, 28), item('42,00', 400, 680, 30),
    item('Big', 50, 650, 40, 24), item('small', 94, 650, 28, 12),
    item('', 0, 0, 0, 12, 'f1', { hasEOL: true }),
  ]);
  assert.deepEqual(lines.map(l => l.str), ['Invoice 2026-0042', 'Total', '42,00', 'Big', 'small']);
  assert.equal(lines[0].x, 50); assert.equal(Math.round(lines[0].width), 98); assert.equal(lines[0].fontSize, 12);
});

test('vertical text and broken items are ignored, rotated lines keep their angle', () => {
  const rotated = { str: 'Up', transform: [0, 12, -12, 0, 30, 100], width: 20, fontName: 'f1' };
  const [line] = groupTextItems([rotated, { str: 'skip', transform: [12, 0, 0, 12, 1, 1], width: 5, fontName: 'v' }, { str: 'nan', transform: [NaN, 0, 0, 1, 0, 0], width: 1, fontName: 'f1' }], { v: { vertical: true } });
  assert.equal(line.str, 'Up'); assert.ok(Math.abs(line.angle - Math.PI / 2) < 1e-9);
});

test('font guesses and standard names', () => {
  assert.deepEqual(describeFont('ABCDEF+TimesNewRomanPS-BoldItalicMT', 'serif'), { family: 'serif', bold: true, italic: true });
  assert.equal(describeFont('g_d0_f1', 'sans-serif').family, 'sans');
  assert.equal(describeFont('Consolas', 'monospace').family, 'mono');
  assert.equal(standardFontName('serif', true, false), 'TimesRomanBold');
  assert.equal(standardFontName('mono', true, true), 'CourierBoldOblique');
  assert.deepEqual(fromHex('#3159d9'), [49, 89, 217]); assert.equal(toHex([49, 89, 217]), '#3159d9'); assert.deepEqual(fromHex('nope', [1, 2, 3]), [1, 2, 3]);
});

test('cover quad surrounds the line and follows rotation', () => {
  const [a, b, c] = coverQuad({ x: 100, y: 200, angle: 0, width: 50, fontSize: 10 });
  assert.ok(a[0] < 100 && a[1] < 200 && b[0] > 150 && c[1] > 208);
  const up = coverQuad({ x: 0, y: 0, angle: Math.PI / 2, width: 50, fontSize: 10 });
  assert.ok(up[1][1] > 50 && Math.abs(up[1][0]) < 5);
});

test('colours are sampled from the page, not assumed', () => {
  const w = 60, h = 30, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([250, 240, 200, 255], i * 4);
  for (let y = 12; y < 18; y++) for (let x = 15; x < 45; x++) data.set([20, 40, 160, 255], (y * w + x) * 4);
  const { bg, fg } = sampleColors({ data, width: w, height: h }, { x0: 12, y0: 8, x1: 48, y1: 22 });
  assert.deepEqual(bg, [250, 240, 200]); assert.deepEqual(fg, [20, 40, 160]);
  const blank = sampleColors({ data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h }, { x0: 5, y0: 5, x1: 30, y1: 20 });
  assert.deepEqual(blank, { bg: [255, 255, 255], fg: [0, 0, 0] });
});

test('flattened placement flips y and keeps the angle direction', () => {
  const p = viewPlacement([1, 0, 0, -1, 0, 800], 800, 50, 700, 0);
  assert.deepEqual([p.x, p.y, Math.abs(p.angle)], [50, 700, 0]);
  const r = viewPlacement([0, 1, 1, 0, 0, 0], 600, 10, 20, 0); // page rotated: user x runs down the view
  assert.equal(r.x, 20); assert.equal(r.y, 590); assert.ok(Math.abs(r.angle + Math.PI / 2) < 1e-9);
});

async function samplePdf() {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  page.drawText('Pay to Alice Smith', { x: 40, y: 220, size: 14, font });
  page.drawText('Keep this line', { x: 40, y: 180, size: 12, font });
  doc.setTitle('Sample'); doc.setAuthor('Tester');
  return doc.save();
}
async function textOf(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href + '' }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) { const content = await (await pdf.getPage(n)).getTextContent(); pages.push(content.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()); }
  return { pages, pdf };
}

test('an edited PDF keeps untouched text, adds new text and keeps document info', async () => {
  const original = await samplePdf();
  const { pages: before } = await textOf(original);
  assert.match(before[0], /Pay to Alice Smith/);
  const edits = [
    { page: 0, kind: 'replace', x: 40, y: 220, angle: 0, width: 110, fontSize: 14, text: 'Pay to Bob Jones', family: 'sans', bold: false, italic: false, size: 14, color: [0, 0, 0], bg: [255, 255, 255] },
    { page: 0, kind: 'add', x: 40, y: 100, angle: 0, text: 'Added note', family: 'serif', bold: true, italic: false, size: 16, color: [49, 89, 217] },
  ];
  const result = await buildEditedPdf(original, edits);
  assert.equal(result.changed, 2); assert.deepEqual(result.warnings, []);
  const { pages } = await textOf(result.bytes);
  assert.match(pages[0], /Pay to Bob Jones/); assert.match(pages[0], /Added note/); assert.match(pages[0], /Keep this line/);
  const doc = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert.equal(doc.getTitle(), 'Sample'); assert.equal(doc.getAuthor(), 'Tester');
});

test('characters outside Latin-1 switch to Noto Sans, and missing glyphs are reported', async () => {
  const original = await samplePdf();
  const font = await readFile(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url));
  const edit = text => ({ page: 0, kind: 'add', x: 40, y: 100, text, family: 'sans', bold: false, italic: false, size: 14, color: [0, 0, 0] });
  const ok = await buildEditedPdf(original, [edit('Şirket İstanbul — Привет')], { loadUnicodeFont: async () => font });
  assert.deepEqual(ok.warnings, []);
  assert.match((await textOf(ok.bytes)).pages[0], /Şirket/);
  const missing = await buildEditedPdf(original, [edit('Hello 你好')], { loadUnicodeFont: async () => font });
  assert.equal(missing.warnings.length, 1); assert.match(missing.warnings[0], /你/);
  await assert.rejects(buildEditedPdf(original, [edit('Şirket')]), /Noto Sans/);
});

test('removing a line only covers it, and an empty replacement draws nothing', async () => {
  const original = await samplePdf();
  const result = await buildEditedPdf(original, [{ page: 0, kind: 'replace', x: 40, y: 180, angle: 0, width: 80, fontSize: 12, text: '', removed: true, family: 'sans', size: 12, bg: [255, 255, 255] }]);
  assert.equal(result.changed, 1);
  assert.match((await textOf(result.bytes)).pages[0], /Pay to Alice Smith/);
});

test('a flattened page drops the original text for good', async () => {
  const original = await samplePdf();
  // A real browser renders the page; here any JPEG of the right size stands in for it.
  const jpeg = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z', 'base64'));
  const flat = new Map([[0, { jpeg, width: 400, height: 300, transform: [1, 0, 0, -1, 0, 300] }]]);
  const result = await buildEditedPdf(original, [{ page: 0, kind: 'add', x: 40, y: 100, angle: 0, text: 'Only this', family: 'sans', size: 14, color: [0, 0, 0] }], { flat });
  const { pages, pdf } = await textOf(result.bytes);
  assert.equal(pages[0], 'Only this'); assert.equal(pdf.numPages, 1);
});

test('the editor can tell when Latin fonts are not enough', () => {
  for (const text of ['Café déjà vu', 'Price: 5 € – “quoted” …', 'Ä Ö Ü ß ñ']) assert.equal(needsUnicode(text), false, text);
  for (const text of ['Şirket', 'İstanbul', 'Привет', '你好']) assert.equal(needsUnicode(text), true, text);
});

test('weight and slant reported by pdf.js are kept', () => {
  const [line] = groupTextItems([item('Heading', 10, 10, 50)], { f1: { fontFamily: 'sans-serif', bold: true, italic: true } });
  assert.deepEqual([line.family, line.bold, line.italic], ['sans', true, true]);
});
