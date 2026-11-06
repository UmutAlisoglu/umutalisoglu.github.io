import { cp, mkdir, writeFile } from 'node:fs/promises';

// Pages serves the finished dist folder. These are website assets, never visitor files.
for (const file of ['CNAME', '.nojekyll', 'robots.txt', 'sitemap.xml']) {
  await cp(file, `dist/${file}`);
}
await cp('assets', 'dist/assets', { recursive: true });
await cp('styles.css', 'dist/styles.css'); // Kept for old bookmarked pages that still link it.
await cp('showcase', 'dist/showcase', { recursive: true });
await mkdir('dist/vendor/ffmpeg', { recursive: true });
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await cp(`node_modules/@ffmpeg/core/dist/esm/${file}`, `dist/vendor/ffmpeg/${file}`);
}
await writeFile('dist/vendor/ffmpeg/README.txt', 'FFmpeg WebAssembly core 0.12.10. See /THIRD_PARTY_NOTICES.md for licenses and corresponding source.\n');
await cp('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
console.log('Static site ready in dist/. No conversion server is included.');
