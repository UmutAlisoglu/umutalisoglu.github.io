import { validateQuad, rectifiedSize, warpDocument, cleanPaper } from './scanner-math.js';

self.onmessage = ({ data }) => {
  try {
    const quad = validateQuad(data.points, data.width, data.height);
    const size = rectifiedSize(quad);
    const pixels = warpDocument(new Uint8ClampedArray(data.pixels), data.width, data.height, quad, size.width, size.height, progress => self.postMessage({ type: 'progress', message: 'Straightening your document…', progress: progress * .8 }));
    self.postMessage({ type: 'progress', message: 'Cleaning the paper…', progress: .85 });
    cleanPaper(pixels, size.width, size.height, data.mode);
    self.postMessage({ type: 'result', pixels: pixels.buffer, ...size }, [pixels.buffer]);
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'The document could not be straightened.' }); }
};
