import * as ort from 'onnxruntime-web/wasm';

// A single WASM thread works on ordinary GitHub Pages without isolation headers.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = '/vendor/ort/';
ort.env.logLevel = 'error';
const report = message => self.postMessage({ type: 'progress', message });

self.onmessage = async ({ data }) => {
  let session;
  try {
    report('Downloading the background model (4.6 MB)…');
    const response = await fetch('/assets/models/u2netp.onnx');
    if (!response.ok) throw new Error('The background model could not load. Check your connection and try again.');
    const bytes = await response.arrayBuffer();
    report('Preparing the local background engine…');
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const pixels = new Uint8ClampedArray(data.pixels), size = 320 * 320;
    if (pixels.length !== size * 4) throw new Error('Could not prepare this image.');
    const mean = [0.485, 0.456, 0.406], deviation = [0.229, 0.224, 0.225];
    let maximum = 1;
    for (let i = 0; i < size; i++) for (let channel = 0; channel < 3; channel++) maximum = Math.max(maximum, pixels[i * 4 + channel]);
    const tensor = new Float32Array(size * 3);
    for (let channel = 0; channel < 3; channel++) for (let i = 0; i < size; i++) tensor[channel * size + i] = (pixels[i * 4 + channel] / maximum - mean[channel]) / deviation[channel];
    report('Finding the subject on your device…');
    const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, 320, 320]) });
    const prediction = outputs[session.outputNames[0]].data;
    let minimum = Infinity, peak = -Infinity;
    for (let i = 0; i < size; i++) { minimum = Math.min(minimum, prediction[i]); peak = Math.max(peak, prediction[i]); }
    if (!Number.isFinite(peak) || peak - minimum < 0.00001) throw new Error('No clear subject was found. Try a photo with a distinct foreground object.');
    const mask = new Uint8ClampedArray(size * 4);
    for (let i = 0; i < size; i++) { mask[i * 4] = mask[i * 4 + 1] = mask[i * 4 + 2] = 255; mask[i * 4 + 3] = Math.round((prediction[i] - minimum) / (peak - minimum) * 255); }
    for (const output of Object.values(outputs)) output.dispose();
    self.postMessage({ type: 'result', mask: mask.buffer }, [mask.buffer]);
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'Background removal could not finish. Try a smaller image or another browser.' }); }
  finally { if (session) await session.release(); }
};
