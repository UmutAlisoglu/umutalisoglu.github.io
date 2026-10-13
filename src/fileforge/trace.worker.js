import ImageTracer from 'imagetracerjs';

// Choose colours from the actual pixels. Deterministic histogram sampling avoids
// the upstream grid sampler's fractional-row offsets and random initial colours.
function samplePalette(pixels, count) {
  const buckets = new Map(), stride = Math.max(1, Math.floor(Math.sqrt(pixels.length / 4 / 16000)));
  for (let offset = 0; offset < pixels.length; offset += stride * 4) {
    const a = pixels[offset + 3];
    const r = a < 8 ? 0 : pixels[offset], g = a < 8 ? 0 : pixels[offset + 1], b = a < 8 ? 0 : pixels[offset + 2];
    const key = (r >> 4) << 12 | (g >> 4) << 8 | (b >> 4) << 4 | a >> 4;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, a: 0, n: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.a += a; bucket.n++;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, count).map(bucket => ({
    r: Math.round(bucket.r / bucket.n), g: Math.round(bucket.g / bucket.n), b: Math.round(bucket.b / bucket.n), a: Math.round(bucket.a / bucket.n),
  }));
}

self.onmessage = ({ data }) => {
  try {
    const { pixels, width, height, colors, detail } = data;
    if (width * height > 1_000_000 || ![2, 4, 8, 16, 32].includes(colors)) throw new Error('Choose a supported tracing size and colour count.');
    const imageData = new Uint8ClampedArray(pixels);
    const options = {
      numberofcolors: colors, colorsampling: 2, colorquantcycles: 3,
      pal: samplePalette(imageData, colors),
      ltres: detail === 'fine' ? 0.5 : detail === 'simple' ? 2 : 1,
      qtres: detail === 'fine' ? 0.5 : detail === 'simple' ? 2 : 1,
      pathomit: detail === 'fine' ? 2 : detail === 'simple' ? 16 : 8,
      rightangleenhance: true, roundcoords: 2, strokewidth: 0,
      linefilter: false, scale: 1, viewbox: true, desc: false,
    };
    const svg = ImageTracer.imagedataToSVG({ data: imageData, width, height }, options);
    if (svg.length > 20_000_000) throw new Error('This image produces a very large SVG. Try fewer colours or simpler detail.');
    self.postMessage({ type: 'result', svg });
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'Tracing failed. Try a simpler image.' }); }
};
