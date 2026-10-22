import { parseCSV, jsonToCSV } from './document-data.js';

async function textPDF(text, options) {
  if (!text.trim() || text.length > 200000) throw new Error('Add between 1 and 200,000 characters.');
  const size = Number(options.size);
  if (!Number.isInteger(size) || size < 9 || size > 24) throw new Error('Choose a font size between 9 and 24.');
  const [{ PDFDocument, rgb }, { default: fontkit }] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')]);
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const response = await fetch('/fonts/NotoSans-Regular.ttf');
  if (!response.ok) throw new Error('The local PDF font could not load. Please try again.');
  const font = await pdf.embedFont(await response.arrayBuffer(), { subset: true });
  const supported = new Set(font.getCharacterSet()), missing = new Set();
  const clean = Array.from(text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')).map(character => {
    if (character === '\n' || supported.has(character.codePointAt(0))) return character;
    missing.add(character); return '□';
  }).join('');
  const dimensions = options.paper === 'letter' ? [612, 792] : [595.28, 841.89];
  const margin = 48, lineHeight = size * 1.55;
  let page, y;
  function nextPage() { if (pdf.getPageCount() >= 100) throw new Error('This text produces more than 100 pages. Try less text or a smaller font.'); page = pdf.addPage(dimensions); y = dimensions[1] - margin - size; }
  function draw(line) { if (y < margin) nextPage(); if (line) page.drawText(line, { x: margin, y, font, size, color: rgb(.15,.16,.14) }); y -= lineHeight; }
  nextPage();
  for (const paragraph of clean.split('\n')) {
    let line = '';
    for (const character of paragraph) {
      if (line && font.widthOfTextAtSize(line + character, size) > dimensions[0] - margin * 2) { draw(line); line = ''; }
      line += character;
    }
    draw(line);
  }
  return { blob: new Blob([await pdf.save()], { type: 'application/pdf' }), extension: 'pdf', detail: `${pdf.getPageCount()} page(s), selectable text.${missing.size ? ` ${missing.size} unsupported character(s) replaced with squares.` : ''}` };
}
self.onmessage = async ({ data }) => {
  try {
    const { kind, text, options } = data;
    if (typeof text !== 'string' || text.length > 2e6) throw new Error('The input is too large. Use a file under 2 MB.');
    let result;
    if (kind === 'text-pdf') result = await textPDF(text, options);
    else if (kind === 'data') {
      const json = options.format === 'json';
      const output = json ? JSON.stringify(parseCSV(text), null, 2) : jsonToCSV(text, options.protect === 'on');
      if (output.length > 8e6) throw new Error('The result is too large. Use fewer rows.');
      result = { text: output, blob: new Blob([output], { type: json ? 'application/json' : 'text/csv;charset=utf-8' }), extension: json ? 'json' : 'csv', detail: json ? 'CSV values are preserved as strings. No type guessing.' : `UTF-8 CSV with a header row.${options.protect === 'on' ? ' Formula-like text is prefixed with an apostrophe.' : ''}` };
    } else throw new Error('Unknown document tool.');
    self.postMessage({ type: 'result', ...result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'The conversion could not finish.' }); }
};
