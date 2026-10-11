import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerURL;

export function releasePages(pages) {
  pages.forEach(page => { if (page.thumbnail) URL.revokeObjectURL(page.thumbnail); });
}

// Only render page content into canvases. No PDF scripts, links or embedded actions run.
export async function previewPages(files, signal, report) {
  const pages = [];
  try {
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      signal.throwIfAborted();
      const data = new Uint8Array(await files[fileIndex].arrayBuffer());
      signal.throwIfAborted();
      const task = getDocument({
        data,
        isEvalSupported: false,
        enableXfa: false,
        cMapUrl: '/vendor/pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
        wasmUrl: '/vendor/pdfjs/wasm/',
        iccUrl: '/vendor/pdfjs/iccs/',
      });
      const cancel = () => { void task.destroy().catch(() => {}); };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        const pdf = await task.promise;
        if (pages.length + pdf.numPages > 200) throw new Error('The visual organizer supports up to 200 pages in total. Choose fewer pages, or use Merge PDFs for larger documents.');
        for (let index = 0; index < pdf.numPages; index++) {
          signal.throwIfAborted();
          report(`Previewing ${files[fileIndex].name} · page ${index + 1} of ${pdf.numPages}…`, (fileIndex + (index + 1) / pdf.numPages) / files.length * 95);
          const page = await pdf.getPage(index + 1);
          let thumbnail = null;
          try {
            const natural = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: 260 / Math.max(natural.width, natural.height) });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
            await page.render({ canvasContext: canvas.getContext('2d'), viewport, annotationMode: 0 }).promise;
            signal.throwIfAborted();
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (blob) thumbnail = URL.createObjectURL(blob);
            canvas.width = 1; canvas.height = 1;
          } catch (error) {
            signal.throwIfAborted();
            // An uncommon rendering problem must not silently remove a page from the export.
            if (thumbnail) URL.revokeObjectURL(thumbnail);
            thumbnail = null;
          } finally { page.cleanup(); }
          pages.push({ id: `${fileIndex}-${index}`, fileIndex, pageIndex: index, name: files[fileIndex].name, rotation: 0, selected: true, thumbnail });
        }
      } catch (error) {
        signal.throwIfAborted();
        if (error.name === 'PasswordException') throw new Error(`“${files[fileIndex].name}” is password-protected. Choose an unlocked PDF.`);
        if (error.name === 'InvalidPDFException') throw new Error(`“${files[fileIndex].name}” could not be opened. Choose a valid PDF.`);
        throw error;
      } finally {
        signal.removeEventListener('abort', cancel);
        await task.destroy();
      }
    }
    signal.throwIfAborted();
    if (!pages.length) throw new Error('These PDFs have no pages.');
    return pages;
  } catch (error) { releasePages(pages); throw error; }
}
