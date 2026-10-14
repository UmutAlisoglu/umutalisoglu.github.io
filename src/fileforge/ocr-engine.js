// Tesseract.js 7.0.0's pinned worker message protocol. A small adapter is used
// instead of createWorker: upstream exposes the worker only after initialization,
// while this tool must be able to terminate it during an engine/language download.
// See tesseract.js/src/createWorker.js; changing the pinned version requires the
// actual browser OCR/cancellation check in scripts/fileforge-ocr.mjs.
export function createOCREngine(signal, onProgress) {
  signal.throwIfAborted();
  const worker = new Worker('/tools/engines/tesseract/worker.min.js');
  const pending = new Map();
  let sequence = 0, ended = false;
  function close(error = new DOMException('Cancelled', 'AbortError')) {
    if (ended) return;
    ended = true;
    signal.removeEventListener('abort', abort);
    worker.terminate();
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  }
  const abort = () => close();
  signal.addEventListener('abort', abort, { once: true });
  worker.onerror = () => close(new Error('The text engine could not start. Download the offline text pack, reconnect, or try a smaller file.'));
  worker.onmessageerror = () => close(new Error('The text engine returned an unreadable result. Refresh this page and try again.'));
  worker.onmessage = ({ data }) => {
    if (ended) return;
    if (data.status === 'progress') { onProgress(data.data); return; }
    const item = pending.get(data.jobId);
    if (!item) return;
    pending.delete(data.jobId);
    if (data.status === 'resolve') item.resolve(data.data);
    else item.reject(new Error('The local text engine could not read this file. Check your language, try a clearer image, and make sure its engine pack is available.'));
  };
  function request(action, payload, transfer = []) {
    signal.throwIfAborted();
    if (ended) return Promise.reject(new Error('The text engine has stopped.'));
    const jobId = `fileforge-ocr-${++sequence}`;
    return new Promise((resolve, reject) => {
      pending.set(jobId, { resolve, reject });
      try { worker.postMessage({ workerId: 'fileforge-ocr', jobId, action, payload }, transfer); }
      catch (error) { pending.delete(jobId); reject(error); }
    });
  }
  return {
    async initialize(language, layout) {
      if (!['eng', 'deu', 'tur'].includes(language) || !['3', '6', '11'].includes(String(layout))) throw new Error('Choose a supported language and text layout.');
      await request('load', { options: { lstmOnly: true, corePath: new URL('/vendor/tesseract/core/', location.origin).href, logging: false } });
      // cacheMethod:none avoids a separate hidden IndexedDB language cache.
      // Ordinary HTTP/PWA caches can retain engines; your file stays in memory.
      await request('loadLanguage', { langs: [language], options: { langPath: new URL('/vendor/tesseract/lang/', location.origin).href, cacheMethod: 'none', gzip: true, lstmOnly: true } });
      await request('initialize', { langs: language, oem: 1, config: {} });
      await request('setParameters', { params: { tessedit_pageseg_mode: String(layout), preserve_interword_spaces: '1', user_defined_dpi: '300' } });
    },
    async recognize(blob) {
      const image = new Uint8Array(await blob.arrayBuffer());
      signal.throwIfAborted();
      return request('recognize', { image, options: {}, output: { text: true } }, [image.buffer]);
    },
    close,
  };
}
