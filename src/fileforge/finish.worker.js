import { PDFDocument, PDFName, PDFRawStream, PDFNumber, PDFDict } from 'pdf-lib';
import { pageSelection } from './advanced-shared.js';
import { stripMetadata, jpegOrientation } from './metadata.js';

const name = PDFName.of;
const fail = message => { throw new Error(message); };
const report = message => self.postMessage({ type: 'progress', message });
async function loadPDF(file) {
  let doc;
  try { doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false }); }
  catch (error) { if (/encrypt/i.test(error.message)) fail('Choose an unlocked PDF. This tool does not remove passwords.'); throw new Error('This PDF could not be read. Try another unlocked copy.'); }
  if (doc.getPageCount() > 200) fail('Choose a PDF with up to 200 pages.');
  // These operations cannot preserve interactive fields or validate signatures.
  if (doc.catalog.has(name('AcroForm')) && doc.getForm().getFields().length) fail('This PDF contains form fields or signatures. Use a plain, unsigned copy.');
  if (doc.catalog.has(name('Perms'))) fail('Use an unsigned PDF without certification permissions.');
  for (const [, object] of doc.context.enumerateIndirectObjects()) if (object instanceof PDFDict && (String(object.get(name('Type'))) === '/Sig' || String(object.get(name('FT'))) === '/Sig')) fail('Use an unsigned PDF. Signatures cannot be preserved by this tool.');
  return doc;
}
function heicDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let found = false;
  for (let at = 4; at + 16 <= bytes.length; at++) {
    if (bytes[at] === 105 && bytes[at+1] === 115 && bytes[at+2] === 112 && bytes[at+3] === 101 && view.getUint32(at-4) === 20) {
      const w = view.getUint32(at+8), h = view.getUint32(at+12);
      if (!w || !h || w * h > 24e6) fail('HEIC conversion supports up to 24 megapixels. Choose a smaller photo.');
      found = true;
    }
  }
  if (!found) fail('This HEIC has no supported image dimensions. Try exporting a JPG from your phone.');
}
async function convertHEIC(file, options) {
  const bytes = new Uint8Array(await file.arrayBuffer()); heicDimensions(bytes);
  report('Loading the local HEIC decoder…');
  const { heicTo } = await import(/* @vite-ignore */ '/vendor/heic/heic-to.js');
  report('Converting the first photo to JPG…');
  let blob;
  try { blob = await heicTo({ blob: file, type: 'image/jpeg', quality: Number(options.quality) }); }
  catch { fail('This HEIC variant could not be decoded. Export a JPG from Photos, then open it here.'); }
  return { blob, extension: 'jpg', detail: 'First photo only · JPG export · location and camera metadata removed. HDR/depth and Live Photo video aren’t retained.' };
}
async function split(file, options) {
  const source = await loadPDF(file), pages = pageSelection(options.pages || '', source.getPageCount(), 200);
  report(`Extracting ${pages.length} pages…`);
  const output = await PDFDocument.create();
  for (const page of await output.copyPages(source, pages.map(n => n - 1))) output.addPage(page);
  return { blob: new Blob([await output.save()], { type: 'application/pdf' }), extension: 'pdf', detail: `${pages.length} selected pages in a separate PDF · original kept unchanged. Bookmarks and interactive features may not be retained.` };
}
async function compress(file, options) {
  const doc = await loadPDF(file); let changed = 0, skipped = 0, processed = 0;
  const quality = Number(options.quality), edge = Number(options.edge);
  if (![0.5,0.7,0.85].includes(quality) || ![1200,1800,2400].includes(edge)) fail('Choose a supported quality and image size.');
  const entries = [...doc.context.enumerateIndirectObjects()];
  // JPEG streams referenced as masks must never be resized independently.
  const masks = new Set();
  for (const [, object] of entries) if (object instanceof PDFRawStream) {
    for (const key of ['SMask','Mask']) { const mask = object.dict.get(name(key)); if (mask) masks.add(String(mask)); }
  }
  let totalPixels = 0;
  for (const [ref, object] of entries) {
    if (!(object instanceof PDFRawStream) || String(object.dict.get(name('Subtype'))) !== '/Image') continue;
    const d = object.dict, color = String(d.get(name('ColorSpace'))), w = d.get(name('Width')), h = d.get(name('Height'));
    // PDF image placement controls rotation, whereas browser JPEG decoding may
    // also apply EXIF rotation. Leave those images untouched to avoid rotating twice.
    if (jpegOrientation(object.contents) !== 1) { skipped++; continue; }
    if (String(d.get(name('Filter'))) !== '/DCTDecode' || color !== '/DeviceRGB' || String(d.get(name('BitsPerComponent'))) !== '8' || ['SMask','Mask','Decode','DecodeParms','ImageMask','Alternates'].some(key => d.has(name(key))) || masks.has(String(ref)) || !(w instanceof PDFNumber) || !(h instanceof PDFNumber) || w.asNumber()*h.asNumber() > 24e6) { skipped++; continue; }
    totalPixels += w.asNumber()*h.asNumber();
    if (++processed > 100 || totalPixels > 120e6) { skipped++; continue; }
    report(`Optimizing JPEG image ${processed}…`);
    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([object.contents], { type: 'image/jpeg' }), { colorSpaceConversion: 'none' });
      if (bitmap.width !== w.asNumber() || bitmap.height !== h.asNumber()) { skipped++; continue; }
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width*scale)), Math.max(1, Math.round(bitmap.height*scale)));
      try {
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
        if (bytes.length >= object.contents.length) continue;
        const replacement = new PDFDict(new Map(), doc.context);
        for (const [key, value] of d.entries()) replacement.set(key, value);
        replacement.set(name('Width'), PDFNumber.of(canvas.width)); replacement.set(name('Height'), PDFNumber.of(canvas.height));
        replacement.set(name('Length'), PDFNumber.of(bytes.length));
        doc.context.assign(ref, PDFRawStream.of(replacement, bytes)); changed++;
      } finally { canvas.width = canvas.height = 1; }
    } catch { skipped++; } finally { bitmap?.close(); }
  }
  const bytes = await doc.save({ useObjectStreams: true });
  const smaller = bytes.length < file.size;
  return { suffix: smaller ? 'compressed' : 'original', blob: smaller ? new Blob([bytes], { type: 'application/pdf' }) : file, extension: 'pdf', detail: smaller ? `${Math.round((1-bytes.length/file.size)*100)}% smaller · ${changed} JPEG images optimized${skipped ? ` · ${skipped} unsupported images kept` : ''}. Selectable text retained. Review image quality before sharing.` : 'No smaller result with these settings. Download contains the original PDF. Text-only PDFs and already optimized or unsupported images may barely shrink.' };
}
self.onmessage = async ({ data: { kind, file, options } }) => {
  try {
    if (!file?.size || file.size > (['split','compress'].includes(kind) ? 25e6 : 20e6)) fail('This file is empty or exceeds the tool’s size limit.');
    let result;
    if (kind === 'heic') result = await convertHEIC(file, options);
    else if (kind === 'split') result = await split(file, options);
    else if (kind === 'compress') result = await compress(file, options);
    else if (kind === 'metadata') {
      const clean = stripMetadata(new Uint8Array(await file.arrayBuffer()));
      result = { blob: new Blob([clean.bytes], { type: clean.type }), extension: clean.extension, detail: 'Location, camera tags, comments and descriptive metadata removed. Image pixels, colour profiles and display orientation kept. Faces and visible details are unchanged.' };
    } else fail('Unsupported task.');
    self.postMessage({ type: 'result', ...result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'The file could not be processed.' }); }
};
