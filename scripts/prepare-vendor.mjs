import { cp, mkdir } from 'node:fs/promises';
import { prepareOCR } from './prepare-ocr.mjs';

await mkdir('public/vendor/ffmpeg', { recursive: true });
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await cp(`node_modules/@ffmpeg/core/dist/esm/${file}`, `public/vendor/ffmpeg/${file}`);
}
await mkdir('public/licenses', { recursive: true });
await cp('node_modules/pdf-lib/LICENSE.md', 'public/licenses/pdf-lib-MIT.txt');
await cp('node_modules/xlsx/LICENSE', 'public/licenses/SheetJS-Apache-2.0.txt');
await cp('node_modules/@pdf-lib/fontkit/README.md', 'public/licenses/fontkit-README.md');
await cp('node_modules/@pdf-lib/fontkit/dist/fontkit.es.js', 'public/licenses/fontkit-source.js');
// PDF preview resources remain on our own origin and load only when needed.
for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(`node_modules/pdfjs-dist/${directory}`, `public/vendor/pdfjs/${directory}`, { recursive: true });
}
await cp('node_modules/pdfjs-dist/LICENSE', 'public/licenses/pdfjs-Apache-2.0.txt');
await cp('node_modules/fflate/LICENSE', 'public/licenses/fflate-MIT.txt');
for (const [source, target] of [
  ['docx-preview/LICENSE', 'docx-preview-Apache-2.0.txt'],
  ['html2canvas/LICENSE', 'html2canvas-MIT.txt'],
  ['jszip/LICENSE.markdown', 'JSZip-license.txt'],
  ['@aiden0z/pptx-renderer/LICENSE', 'pptx-renderer-Apache-2.0.txt'],
  ['@aiden0z/pptx-renderer/THIRD_PARTY_NOTICES.md', 'pptx-renderer-notices.md'],
  ['@aiden0z/pptx-renderer/licenses/ECMA-text-copyright-notice.txt', 'ECMA-text-copyright-notice.txt'],
  ['mtx-decompressor/LICENSE', 'mtx-decompressor-MPL-2.0.txt'],
  ['echarts/LICENSE', 'ECharts-Apache-2.0.txt'],
  ['zrender/LICENSE', 'zrender-BSD-3-Clause.txt'],
]) await cp(`node_modules/${source}`, `public/licenses/${target}`);
// The model runner's JS/WASM are served here; no third-party runtime requests.
await mkdir('public/vendor/ort', { recursive: true });
for (const file of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await cp(`node_modules/onnxruntime-web/dist/${file}`, `public/vendor/ort/${file}`);
}
await cp('node_modules/imagetracerjs/LICENSE', 'public/licenses/imagetracer-Unlicense.txt');
await prepareOCR();

// Keep the LGPL HEIC decoder replaceable and unmodified, separate from site code.
await mkdir('public/vendor/heic', { recursive: true });
await cp('node_modules/heic-to/dist/next/heic-to.js', 'public/vendor/heic/heic-to.js');
await cp('node_modules/heic-to/LICENSE', 'public/licenses/heic-to-LGPL-3.0.txt');
