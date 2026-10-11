import { PDFDocument, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as XLSX from 'xlsx';
import { columnGroups, resultName } from './shared.js';

const ink = rgb(0.14, 0.14, 0.18), muted = rgb(0.40, 0.39, 0.46);
const purple = rgb(0.38, 0.27, 0.91), wash = rgb(0.95, 0.94, 0.98);
const MAX_PAGES = 1500;
const status = (message, progress) => postMessage({ type: 'progress', message, progress });

async function merge(files) {
  const output = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    status(`Reading PDF ${i + 1} of ${files.length}…`, 5 + i / files.length * 80);
    let input;
    try { input = await PDFDocument.load(files[i].bytes); }
    catch { throw new Error(`“${files[i].name}” could not be opened. Use an unlocked, valid PDF.`); }
    if (output.getPageCount() + input.getPageCount() > MAX_PAGES) throw new Error(`Keep the merged document under ${MAX_PAGES} pages. Use the desktop app for larger jobs.`);
    for (const page of await output.copyPages(input, input.getPageIndices())) output.addPage(page);
  }
  if (!output.getPageCount()) throw new Error('These PDFs have no pages to merge.');
  status('Preparing your merged PDF…', 95);
  return { bytes: await output.save(), name: 'merged-fileforge.pdf', type: 'application/pdf', detail: `${output.getPageCount()} pages, in your selected order.` };
}

async function organize(files, options) {
  const plan = options.pages;
  if (!Array.isArray(plan) || !plan.length || plan.length > 200) throw new Error('Select between 1 and 200 pages to export.');
  const output = await PDFDocument.create(), sources = new Map();
  for (let index = 0; index < plan.length; index++) {
    const { fileIndex, pageIndex, rotation } = plan[index];
    if (!Number.isInteger(fileIndex) || !files[fileIndex] || !Number.isInteger(pageIndex) || ![0, 90, 180, 270].includes(rotation)) throw new Error('The page selection is invalid. Reload your PDFs and try again.');
    if (!sources.has(fileIndex)) {
      try { sources.set(fileIndex, await PDFDocument.load(files[fileIndex].bytes)); }
      catch { throw new Error(`“${files[fileIndex].name}” could not be opened. Use an unlocked, valid PDF.`); }
    }
    const source = sources.get(fileIndex);
    if (pageIndex < 0 || pageIndex >= source.getPageCount()) throw new Error('A selected page is missing. Reload your PDFs.');
    const [page] = await output.copyPages(source, [pageIndex]);
    page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
    output.addPage(page);
    status(`Preparing page ${index + 1} of ${plan.length}…`, 10 + (index + 1) / plan.length * 80);
  }
  return { bytes: await output.save(), name: 'organized-fileforge.pdf', type: 'application/pdf', detail: `${plan.length} page(s), in your chosen order and rotation. Check the exported copy before sharing.` };
}

function wrap(text, font, size, width, maxLines = 24) {
  const lines = [];
  let current = '';
  // Break long words and preserve explicit line breaks without cutting cell content.
  for (const character of String(text).replace(/\r/g, '')) {
    if (character === '\n' || (current && font.widthOfTextAtSize(current + character, size) > width)) {
      lines.push(current); current = character === '\n' ? '' : character;
    } else current += character;
  }
  lines.push(current);
  if (lines.length > maxLines) throw new Error('A spreadsheet cell is too long to fit on a PDF page. Shorten it or use the desktop app.');
  return lines;
}

async function spreadsheet(files, options) {
  status('Reading your spreadsheet…', 8);
  let workbook;
  try { workbook = XLSX.read(new Uint8Array(files[0].bytes), { type: 'array', cellFormula: true, cellText: true, codepage: 65001 }); }
  catch { throw new Error('This spreadsheet could not be opened. Choose a valid XLSX or UTF-8 CSV file.'); }
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontResponse = await fetch(new URL('/fonts/NotoSans-Regular.ttf', self.location.origin));
  if (!fontResponse.ok) throw new Error('The PDF font could not be loaded. Check your connection and try again.');
  const font = await document.embedFont(await fontResponse.arrayBuffer(), { subset: true });
  const unsupported = new Set();
  const supported = new Set(font.getCharacterSet());
  const clean = value => Array.from(String(value)).map(character => {
    if ('\n\r\t'.includes(character)) return character === '\t' ? ' ' : character;
    if (supported.has(character.codePointAt(0))) return character;
    unsupported.add(character); return '□';
  }).join('');
  const landscape = options.orientation !== 'portrait';
  const [width, height] = landscape ? [841.89, 595.28] : [595.28, 841.89];
  let formulaWarning = false, sheetCount = 0, rowsTotal = 0;
  const sheets = workbook.SheetNames.filter((name, index) => !workbook.Workbook?.Sheets?.[index]?.Hidden);
  if (!sheets.length) throw new Error('This workbook has no visible worksheets.');
  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
    const name = sheets[sheetIndex], sheet = workbook.Sheets[name];
    if (!sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const rowCount = range.e.r - range.s.r + 1, colCount = range.e.c - range.s.c + 1;
    if (rowCount > 10_000 || colCount > 80 || rowsTotal + rowCount > 20_000) throw new Error('This sheet is too large for browser export. Limits: 10,000 rows and 80 columns per sheet, 20,000 rows total.');
    rowsTotal += rowCount;
    const rows = [];
    for (let row = range.s.r; row <= range.e.r; row++) {
      const cells = [];
      for (let column = range.s.c; column <= range.e.c; column++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (cell?.f && cell.v == null) { formulaWarning = true; cells.push(clean(`=${cell.f}`)); }
        else cells.push(clean(cell ? XLSX.utils.format_cell(cell) : ''));
      }
      rows.push(cells);
    }
    sheetCount++;
    const groups = columnGroups(colCount, landscape ? 7 : 5);
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const [start, end] = groups[groupIndex], columns = end - start;
      const margin = 32, cellWidth = (width - margin * 2) / columns, textSize = 8;
      const wrapRow = row => row.slice(start, end).map(cell => wrap(cell, font, textSize, cellWidth - 12));
      const header = wrapRow(rows[0]);
      let page, y;
      const drawRow = (cells, isHeader, alternating) => {
        const rowHeight = Math.max(...cells.map(lines => lines.length), 1) * 11 + 12;
        if (y - rowHeight < 36) return false;
        if (isHeader || alternating) page.drawRectangle({ x: margin, y: y - rowHeight, width: width - margin * 2, height: rowHeight, color: isHeader ? purple : wash });
        cells.forEach((lines, index) => lines.forEach((line, lineIndex) => page.drawText(line, { x: margin + index * cellWidth + 6, y: y - 14 - lineIndex * 11, size: textSize, font, color: isHeader ? rgb(1, 1, 1) : ink })));
        y -= rowHeight; return true;
      };
      const newPage = () => {
        if (document.getPageCount() >= MAX_PAGES) throw new Error(`This export exceeds ${MAX_PAGES} PDF pages. Export fewer sheets or use the desktop app.`);
        page = document.addPage([width, height]); y = height - 70;
        page.drawText(clean(name).slice(0, 50), { x: margin, y: height - 37, size: 16, font, color: ink });
        page.drawText(`Columns ${start + 1}–${end} • Part ${groupIndex + 1}/${groups.length}`, { x: margin, y: height - 54, size: 8, font, color: muted });
        page.drawText(`FileForge • ${document.getPageCount()}`, { x: margin, y: 20, size: 8, font, color: muted });
        if (!drawRow(header, true, false)) throw new Error('The header row cannot fit on a PDF page.');
      };
      newPage();
      for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        const cells = wrapRow(rows[rowIndex]);
        if (!drawRow(cells, false, rowIndex % 2 === 0)) {
          newPage();
          if (!drawRow(cells, false, rowIndex % 2 === 0)) throw new Error('A spreadsheet row cannot fit on a PDF page. Shorten its cells.');
        }
      }
    }
    status(`Exported ${name}…`, 10 + (sheetIndex + 1) / sheets.length * 80);
  }
  if (!sheetCount) throw new Error('This spreadsheet has no data to export.');
  const warnings = [];
  if (formulaWarning) warnings.push('Some formulas had no saved result and are shown as formula text.');
  if (unsupported.size) warnings.push('Characters outside the PDF font’s coverage are shown as □.');
  return { bytes: await document.save(), name: resultName(files[0].name, 'pdf'), type: 'application/pdf', detail: `${sheetCount} visible sheet(s), ${document.getPageCount()} PDF pages. ${warnings.join(' ')}` };
}

self.onmessage = async ({ data }) => {
  try {
    const result = data.tool === 'merge' ? await merge(data.files) : data.tool === 'organize' ? await organize(data.files, data.options) : await spreadsheet(data.files, data.options);
    const bytes = new Uint8Array(result.bytes);
    postMessage({ type: 'result', result: { ...result, bytes: bytes.buffer } }, [bytes.buffer]);
  } catch (error) { postMessage({ type: 'error', message: error.message || 'This file could not be converted.' }); }
};
