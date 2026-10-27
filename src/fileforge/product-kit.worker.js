import { zipSync, strToU8 } from 'fflate';
import { KIT_LIMITS, kitSettings, kitSlug, validateKitFiles, fitProduct } from './product-kit-shared.js';

const report = (index, stage, message) => self.postMessage({ type: 'progress', index, stage, message });
const surface = (width, height) => {
  const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Image processing is unavailable in this browser. Try a recent Chrome, Edge, Firefox or Safari.');
  return { canvas, context };
};
async function encode(canvas, type, quality = .88) {
  const blob = await canvas.convertToBlob({ type, quality });
  if (blob.type !== type) throw new Error('This browser cannot export WebP. Try a recent Chrome, Edge, Firefox or Safari.');
  return blob;
}
async function loadEngine() {
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = '/vendor/ort/'; ort.env.logLevel = 'error';
  const response = await fetch('/assets/models/u2netp.onnx');
  if (!response.ok) throw new Error('The background model could not load. Check your connection, or turn off background removal and try again.');
  const session = await ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  return { ort, session };
}
async function cutout(source, engine) {
  const small = surface(320, 320), size = 320 * 320;
  small.context.fillStyle = '#fff'; small.context.fillRect(0, 0, 320, 320); small.context.drawImage(source.canvas, 0, 0, 320, 320);
  const pixels = small.context.getImageData(0, 0, 320, 320).data, tensor = new Float32Array(size * 3);
  let maximum = 1;
  for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) maximum = Math.max(maximum, pixels[i * 4 + c]);
  const mean = [.485, .456, .406], deviation = [.229, .224, .225];
  for (let c = 0; c < 3; c++) for (let i = 0; i < size; i++) tensor[c * size + i] = (pixels[i * 4 + c] / maximum - mean[c]) / deviation[c];
  const input = new engine.ort.Tensor('float32', tensor, [1, 3, 320, 320]);
  let outputs;
  try {
    outputs = await engine.session.run({ [engine.session.inputNames[0]]: input });
    const values = outputs[engine.session.outputNames[0]].data;
    let min = Infinity, max = -Infinity;
    for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
    if (!Number.isFinite(max) || max - min < .00001) throw new Error('No clear subject was found. Try another photo, or turn off background removal.');
    const mask = small.context.createImageData(320, 320);
    for (let i = 0; i < size; i++) { mask.data[i * 4] = mask.data[i * 4 + 1] = mask.data[i * 4 + 2] = 255; mask.data[i * 4 + 3] = Math.round((values[i] - min) / (max - min) * 255); }
    small.context.putImageData(mask, 0, 0);
    source.context.globalCompositeOperation = 'destination-in'; source.context.drawImage(small.canvas, 0, 0, source.canvas.width, source.canvas.height); source.context.globalCompositeOperation = 'source-over';
  } finally { input.dispose(); if (outputs) for (const output of Object.values(outputs)) output.dispose(); small.canvas.width = small.canvas.height = 1; }
}
function subjectBounds(source) {
  const { width, height } = source.canvas, pixels = source.context.getImageData(0, 0, width, height).data;
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (pixels[(y * width + x) * 4 + 3] > 24) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('This photo has no visible subject. Choose another photo.');
  const margin = Math.ceil(Math.max(width, height) * .015);
  left = Math.max(0, left - margin); right = Math.min(width - 1, right + margin); top = Math.max(0, top - margin); bottom = Math.min(height - 1, bottom + margin);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
self.onmessage = async ({ data }) => {
  let engine;
  try {
    const { files } = data, settings = kitSettings(data.settings); validateKitFiles(files);
    const entries = {}, manifest = { version: 1, settings, products: [], skipped: [] }; let totalBytes = 0;
    const keepBackground = new Set(Array.isArray(data.keepBackground) ? data.keepBackground : []);
    if (settings.remove && files.some((_, index) => !keepBackground.has(index))) { report(0, 0, 'Preparing the local background engine. First use downloads the model and engine…'); engine = await loadEngine(); }
    for (let index = 0; index < files.length; index++) {
      const file = files[index]; let bitmap, source;
      try {
        report(index, 0, `Opening ${file.name}…`);
        try { bitmap = await createImageBitmap(file); } catch { throw new Error(`${file.name} could not be read. Remove it and try again.`); }
        if (bitmap.width * bitmap.height > KIT_LIMITS.pixels) throw new Error(`${file.name} is over 24 megapixels. Resize it in Image converter first.`);
        const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
        source = surface(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
        source.context.drawImage(bitmap, 0, 0, source.canvas.width, source.canvas.height); bitmap.close(); bitmap = null;
        const backgroundRemoved = Boolean(engine) && !keepBackground.has(index);
        if (backgroundRemoved) { report(index, 0, `Finding the subject in ${file.name}…`); await cutout(source, engine); }
        report(index, 1, `Matching the framing for ${file.name}…`);
        const bounds = subjectBounds(source), folder = `${String(index + 1).padStart(2, '0')}-${kitSlug(file.name.replace(/\.[^.]+$/, ''))}`;
        const variants = [{ id: 'listing', side: settings.size, type: settings.background === 'transparent' ? 'image/png' : 'image/jpeg', extension: settings.background === 'transparent' ? 'png' : 'jpg' }, { id: 'web', side: 1000, type: 'image/webp', extension: 'webp' }, { id: 'thumbnail', side: 480, type: 'image/webp', extension: 'webp' }];
        const product = { original: file.name, folder, backgroundRemoved, exports: [], warning: Math.max(bounds.width, bounds.height) < settings.size * (1 - settings.padding * 2 / 100) ? 'The listing image is enlarged from a smaller source; resizing does not add detail.' : null };
        const productEntries = {}, outputs = []; let productBytes = 0;
        for (const variant of variants) {
          const output = surface(variant.side, variant.side);
          try {
            if (settings.background !== 'transparent') { output.context.fillStyle = settings.background === 'white' ? '#ffffff' : '#f3f0e8'; output.context.fillRect(0, 0, variant.side, variant.side); }
            const fit = fitProduct(bounds, variant.side, settings.padding);
            output.context.drawImage(source.canvas, bounds.x, bounds.y, bounds.width, bounds.height, fit.x, fit.y, fit.width, fit.height);
            const blob = await encode(output.canvas, variant.type), path = `${folder}/${variant.id}-${variant.side}.${variant.extension}`;
            productEntries[path] = new Uint8Array(await blob.arrayBuffer()); productBytes += blob.size;
            product.exports.push({ path, width: variant.side, height: variant.side, bytes: blob.size });
            outputs.push({ ...variant, path, blob });
          } finally { output.canvas.width = output.canvas.height = 1; }
        }
        if (totalBytes + productBytes > 120_000_000) throw new Error('Adding this photo would exceed the 120 MB kit limit. Try a smaller listing size.');
        totalBytes += productBytes; Object.assign(entries, productEntries);
        manifest.products.push(product);
        self.postMessage({ type: 'item', index, outputs, product }); report(index, 2, `${file.name} is ready.`);
      } catch (error) {
        const message = error.message || 'This photo could not be prepared.';
        manifest.skipped.push({ original: file.name, error: message });
        self.postMessage({ type: 'item-error', index, message });
      } finally { bitmap?.close(); if (source) source.canvas.width = source.canvas.height = 1; }
    }
    if (!manifest.products.length) throw new Error(`No photos could be prepared. ${manifest.skipped[0]?.original || 'Photo'}: ${manifest.skipped[0]?.error || 'Try a different photo.'}`);
    entries['kit.json'] = strToU8(JSON.stringify(manifest, null, 2));
    entries['READ-ME.txt'] = strToU8(`PRODUCT KIT / FILEFORGE\n\n${settings.name}\n\nEach numbered folder contains a square listing image, a 1000px WebP web image, and a 480px WebP thumbnail.\nOriginal photos are unchanged and are not included. Review cutout edges before publishing. Small sources may be enlarged. Photo metadata is removed. WebP is not always smaller than the original.\n\n${manifest.skipped.length} skipped photo(s). Settings, exact file sizes, enlargement warnings and skipped-file reasons are in kit.json.\nBuilt on your device with https://alisoglu.com/tools/product-kit/\n`);
    report(files.length - 1, 2, 'Packing your finished kit…');
    const bytes = zipSync(entries, { level: 0 });
    self.postMessage({ type: 'result', bytes: bytes.buffer, count: manifest.products.length * 3, skipped: manifest.skipped.length, name: `${kitSlug(settings.name)}.zip` }, [bytes.buffer]);
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'The kit could not finish. Try fewer or smaller photos.' }); }
  finally { if (engine) await engine.session.release(); }
};
