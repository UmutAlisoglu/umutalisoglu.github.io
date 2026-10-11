import { cp, mkdir } from 'node:fs/promises';

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
