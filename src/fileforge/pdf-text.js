import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pageSelection } from './advanced-shared.js';
GlobalWorkerOptions.workerSrc = workerURL;

export async function extractPDFText(file, selection, signal, report) {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, enableXfa: false, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/', iccUrl: '/vendor/pdfjs/iccs/' });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted(); const pdf = await task.promise;
    const pages = pageSelection(selection, pdf.numPages, 100), output = [];
    let length = 0, words = 0;
    for (const number of pages) {
      signal.throwIfAborted(); report(`Reading page ${number}…`);
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent(); let text = '', lastY = null;
        for (const item of content.items) {
          if (typeof item.str !== 'string') continue;
          const y = item.transform?.[5];
          if (lastY !== null && Math.abs(y - lastY) > 2 && text && !text.endsWith('\n')) text += '\n';
          else if (text && !/\s$/.test(text) && item.str && !/^\s/.test(item.str)) text += ' ';
          text += item.str; if (item.hasEOL) text += '\n'; lastY = y;
        }
        words += text.trim().length; length += text.length;
        if (length > 2e6) throw new Error('The extracted text exceeds 2 million characters. Select fewer pages.');
        output.push(pages.length > 1 ? `--- Page ${number} ---\n\n${text.trim()}` : text.trim());
      } finally { page.cleanup(); }
    }
    if (!words) throw new Error('No selectable text was found. This may be a scan; use Extract text (OCR) instead.');
    return { text: output.join('\n\n'), detail: `${pages.length} page(s). Reading order may differ for columns and tables; scanned pages need OCR.` };
  } catch (error) {
    signal.throwIfAborted();
    if (error.name === 'PasswordException') throw new Error('Choose an unlocked PDF. Password-protected files are not supported.');
    throw error;
  } finally { signal.removeEventListener('abort', abort); await task.destroy(); }
}
