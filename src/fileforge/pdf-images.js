import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { zip } from 'fflate';
import { pageSelection } from './advanced-shared.js';
import { resultName } from './shared.js';

GlobalWorkerOptions.workerSrc = workerURL;
const encode = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This browser could not export the page.')), type, quality));

export async function exportPDFImages(file, options, signal, report) {
  const data = new Uint8Array(await file.arrayBuffer()); signal.throwIfAborted();
  const task = getDocument({ data, isEvalSupported: false, enableXfa: false, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/', iccUrl: '/vendor/pdfjs/iccs/' });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  let canvas;
  try {
    const pdf = await task.promise;
    const pages = pageSelection(options.pages || '', pdf.numPages);
    const edge = Number(options.edge);
    if (![1200, 2400, 3600].includes(edge) || !['png', 'jpg'].includes(options.format)) throw new Error('Choose a supported export size and format.');
    const type = options.format === 'jpg' ? 'image/jpeg' : 'image/png';
    const entries = {}; let total = 0, first, single;
    const base = resultName(file.name, options.format).replace(/\.[^.]+$/, '');
    for (let index = 0; index < pages.length; index++) {
      signal.throwIfAborted(); report(`Rendering page ${pages[index]} · ${index + 1} of ${pages.length}…`);
      const page = await pdf.getPage(pages[index]);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: edge / Math.max(natural.width, natural.height) });
      canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport, annotationMode: 0, background: 'rgb(255,255,255)' }).promise;
        signal.throwIfAborted();
        const blob = await encode(canvas, type, 0.92); signal.throwIfAborted();
        total += blob.size;
        if (total > 150_000_000) throw new Error('The exported images exceed 150 MB. Choose fewer pages or a smaller image size.');
        const name = `${base}-page-${String(pages[index]).padStart(3, '0')}.${options.format}`;
        entries[name] = new Uint8Array(await blob.arrayBuffer());
        if (!first) first = blob;
        single = { blob, name };
      } finally { canvas.width = 1; canvas.height = 1; page.cleanup(); }
    }
    signal.throwIfAborted();
    if (pages.length === 1) return { ...single, preview: first, detail: `Page ${pages[0]} · ${edge}px longest edge` };
    report(`Packing ${pages.length} page images into a ZIP…`);
    const bytes = await new Promise((resolve, reject) => {
      const terminate = zip(entries, { level: 0 }, (error, bytes) => { signal.removeEventListener('abort', cancel); error ? reject(error) : resolve(bytes); });
      const cancel = () => { terminate(); reject(new DOMException('Cancelled', 'AbortError')); };
      signal.addEventListener('abort', cancel, { once: true });
    });
    signal.throwIfAborted();
    return { blob: new Blob([bytes], { type: 'application/zip' }), preview: first, name: resultName(file.name, 'zip'), detail: `${pages.length} page images · ${edge}px longest edge · preview shows the first exported page` };
  } catch (error) {
    signal.throwIfAborted();
    if (error.name === 'PasswordException') throw new Error('This PDF is password-protected. Choose an unlocked copy.');
    if (error.name === 'InvalidPDFException') throw new Error('This file could not be read as a PDF.');
    throw error;
  } finally { signal.removeEventListener('abort', abort); await task.destroy(); if (canvas) { canvas.width = 1; canvas.height = 1; } }
}
