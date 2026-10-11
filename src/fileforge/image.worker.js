import { PDFDocument } from 'pdf-lib';
import { zipSync } from 'fflate';
import { batchNames, imageSettings, resultName } from './shared.js';

const MAX_OUTPUT_BYTES = 150_000_000;

self.onmessage = async ({ data: { files, options } }) => {
  try {
    const settings = imageSettings(options);
    if (!settings) throw new Error('Choose valid image settings.');
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') throw new Error('Image conversion needs a recent browser. Update your browser or use FileForge for Windows.');
    const { format, quality, width } = settings;
    const pdf = format === 'pdf' ? await PDFDocument.create() : null;
    const entries = Object.create(null), names = batchNames(files, format);
    let total = 0, dimensions = '';
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      postMessage({ type: 'progress', message: `Converting image ${index + 1} of ${files.length}: ${file.name}`, progress: 5 + index / files.length * 85 });
      let bitmap;
      try { bitmap = await createImageBitmap(new Blob([file.bytes])); }
      catch { throw new Error(`“${file.name}” could not be opened. Try a valid JPG, PNG or WebP image.`); }
      try {
        if (bitmap.width * bitmap.height > 40_000_000) throw new Error(`“${file.name}” exceeds 40 megapixels. Use a smaller image or the desktop app.`);
        const scale = width ? Math.min(1, width / bitmap.width) : 1;
        const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('The browser could not allocate an image canvas. Try fewer or smaller images.');
        if (format === 'jpg' || pdf) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        dimensions = `${canvas.width} × ${canvas.height} pixels`;
        const type = pdf ? 'image/jpeg' : { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[format];
        const blob = await canvas.convertToBlob({ type, quality: quality / 100 });
        if (blob.type !== type) throw new Error('Your browser does not support this output format. Try PNG or JPG.');
        total += blob.size;
        if (total > MAX_OUTPUT_BYTES) throw new Error('The converted images exceed 150 MB. Choose a smaller width, JPG/WebP, or fewer images.');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (pdf) {
          const embedded = await pdf.embedJpg(bytes);
          const size = canvas.width > canvas.height ? [841.89, 595.28] : [595.28, 841.89];
          const fit = Math.min((size[0] - 48) / canvas.width, (size[1] - 48) / canvas.height);
          const imageWidth = canvas.width * fit, imageHeight = canvas.height * fit;
          pdf.addPage(size).drawImage(embedded, { x: (size[0] - imageWidth) / 2, y: (size[1] - imageHeight) / 2, width: imageWidth, height: imageHeight });
        } else entries[names[index]] = bytes;
        canvas.width = 1; canvas.height = 1;
      } finally { bitmap.close(); }
    }
    postMessage({ type: 'progress', message: 'Preparing your download…', progress: 95 });
    let result;
    if (pdf) result = { bytes: await pdf.save(), type: 'application/pdf', name: files.length === 1 ? resultName(files[0].name, 'pdf') : 'images-fileforge.pdf', detail: `${files.length} A4 page(s), in your image order. Transparent areas use white.` };
    else if (files.length === 1) result = { bytes: entries[names[0]], type: { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[format], name: names[0], detail: `${dimensions}. Source metadata removed.` };
    else result = { bytes: zipSync(entries, { level: 0 }), type: 'application/zip', name: 'images-fileforge.zip', detail: `${files.length} ${format.toUpperCase()} images. Source metadata removed. Duplicate names kept distinct.` };
    postMessage({ type: 'result', result: { ...result, bytes: result.bytes.buffer } }, [result.bytes.buffer]);
  } catch (error) { postMessage({ type: 'error', message: error.message || 'The images could not be converted. Try a smaller batch.' }); }
};
