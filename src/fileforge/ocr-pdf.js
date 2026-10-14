import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pageSelection } from './advanced-shared.js';

GlobalWorkerOptions.workerSrc = workerURL;

export async function recognizePDF(file, selection, signal, recognize, report) {
  const bytes = new Uint8Array(await file.arrayBuffer()); signal.throwIfAborted();
  const task = getDocument({ data: bytes, isEvalSupported: false, enableXfa: false, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/', iccUrl: '/vendor/pdfjs/iccs/' });
  let renderTask;
  const abort = () => { renderTask?.cancel(); void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    const pages = pageSelection(selection, pdf.numPages, 10);
    const pieces = [], confidences = [];
    for (let index = 0; index < pages.length; index++) {
      signal.throwIfAborted(); report(`Rendering page ${pages[index]} · ${index + 1} of ${pages.length}…`, index / pages.length);
      const page = await pdf.getPage(pages[index]);
      const natural = page.getViewport({ scale: 1 });
      // A sequential 2400px render keeps memory bounded even for long scans.
      const viewport = page.getViewport({ scale: 2400 / Math.max(natural.width, natural.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
      try {
        renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, annotationMode: 0, background: 'rgb(255,255,255)' });
        await renderTask.promise; renderTask = null; signal.throwIfAborted();
        const blob = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This browser could not prepare the PDF page.')), 'image/png'));
        signal.throwIfAborted();
        report(`Reading page ${pages[index]} · ${index + 1} of ${pages.length}…`, index / pages.length);
        const result = await recognize(blob, index, pages.length, pages[index]);
        pieces.push(pages.length === 1 ? result.text.trim() : `--- Page ${pages[index]} ---\n\n${result.text.trim()}`);
        confidences.push(Number(result.confidence));
        if (pieces.reduce((total, text) => total + text.length, 0) > 2_000_000) throw new Error('The extracted text is too large. Choose fewer pages.');
      } finally { renderTask = null; canvas.width = canvas.height = 1; page.cleanup(); }
    }
    signal.throwIfAborted();
    return { text: pieces.join('\n\n'), pages: pages.length, confidence: confidences.reduce((total, value) => total + value, 0) / confidences.length };
  } catch (error) {
    signal.throwIfAborted();
    if (error.name === 'PasswordException') throw new Error('This PDF is password-protected. Choose an unlocked copy.');
    if (error.name === 'InvalidPDFException') throw new Error('This file could not be read as a PDF.');
    throw error;
  } finally { signal.removeEventListener('abort', abort); await task.destroy(); }
}
