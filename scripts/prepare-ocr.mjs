import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Versions and bytes are deliberate pins. Updating an OCR dependency requires
// reviewing its worker protocol, these hashes, and the real-browser OCR check.
export const ocrAssets = [
  { package: 'tesseract.js', version: '7.0.0', file: 'dist/worker.min.js', target: 'worker.min.js', bytes: 111307, sha256: '576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d' },
  { package: 'tesseract.js', version: '7.0.0', file: 'dist/worker.min.js.LICENSE.txt', target: 'worker.min.js.LICENSE.txt', bytes: 466, sha256: '45f54171aeaa1d10c0c1a66f374b7bba1f02472b1487fbe892eec04f840002ac' },
  { package: 'tesseract.js-core', version: '7.0.0', file: 'tesseract-core-lstm.wasm.js', target: 'core/tesseract-core-lstm.wasm.js', bytes: 3896484, sha256: 'eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680' },
  { package: 'tesseract.js-core', version: '7.0.0', file: 'tesseract-core-simd-lstm.wasm.js', target: 'core/tesseract-core-simd-lstm.wasm.js', bytes: 3899472, sha256: 'c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38' },
  { package: 'tesseract.js-core', version: '7.0.0', file: 'tesseract-core-relaxedsimd-lstm.wasm.js', target: 'core/tesseract-core-relaxedsimd-lstm.wasm.js', bytes: 3905767, sha256: '861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3' },
  { package: '@tesseract.js-data/eng', version: '1.0.0', file: '4.0.0_best_int/eng.traineddata.gz', target: 'lang/eng.traineddata.gz', bytes: 2952873, sha256: '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91' },
  { package: '@tesseract.js-data/deu', version: '1.0.0', file: '4.0.0_best_int/deu.traineddata.gz', target: 'lang/deu.traineddata.gz', bytes: 1333102, sha256: '306c4280d0cbed46fbff727486bd43b92730181bae80f56941a091f363bdf28b' },
  { package: '@tesseract.js-data/tur', version: '1.0.0', file: '4.0.0_best_int/tur.traineddata.gz', target: 'lang/tur.traineddata.gz', bytes: 2141291, sha256: '384ba0dc28040451b7818d7d60e0a88df0d3003fa5a01d713a468779bc3d8c04' },
];

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function writeChanged(path, bytes) {
  try { if (digest(await readFile(path)) === digest(bytes)) return; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export async function prepareOCR(root = resolve('.')) {
  const checked = new Set();
  for (const asset of ocrAssets) {
    if (!checked.has(asset.package)) {
      const pkg = JSON.parse(await readFile(resolve(root, 'node_modules', asset.package, 'package.json'), 'utf8'));
      if (pkg.version !== asset.version) throw new Error(`OCR needs ${asset.package}@${asset.version}; found ${pkg.version}. Run npm ci.`);
      checked.add(asset.package);
    }
    const bytes = await readFile(resolve(root, 'node_modules', asset.package, asset.file));
    if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw new Error(`OCR dependency checksum mismatch: ${asset.package}/${asset.file}. Restore the pinned dependency before building.`);
    // A missing or corrupted generated copy is repaired from verified npm input.
    await writeChanged(resolve(root, 'public/vendor/tesseract', asset.target), bytes);
    if (asset.target.startsWith('worker.min.js')) {
      // A worker's initial script needs to be inside the app's /tools/ SW scope
      // to start offline. Runtime/core/language bytes still load from /vendor/.
      await writeChanged(resolve(root, 'public/tools/engines/tesseract', asset.target), bytes);
    }
  }
  const manifest = {
    engine: 'Tesseract.js', version: '7.0.0', core: '7.0.0', mode: 'LSTM only (OEM 1)',
    languageData: 'Integerized Tessdata Best / 4.0.0_best_int',
    sources: ['https://github.com/naptha/tesseract.js/tree/v7.0.0', 'https://github.com/naptha/tesseract.js-core/tree/v7.0.0', 'https://github.com/naptha/tessdata', 'https://github.com/tesseract-ocr/tessdata_best'],
    note: 'Each core .wasm.js includes its WebAssembly bytes. Only the supported LSTM builds ship; legacy recognition is disabled. The unmodified worker has a /tools/ alias so it can start inside the offline app scope. Runtime and selected language load from this site only. npm lockfile integrity and this manifest pin input bytes.',
    assets: ocrAssets.map(asset => ({ url: `/vendor/tesseract/${asset.target}`, ...(asset.target.startsWith('worker.min.js') ? { aliases: [`/tools/engines/tesseract/${asset.target}`] } : {}), ...asset })),
  };
  await writeChanged(resolve(root, 'public/vendor/tesseract/manifest.json'), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  await writeChanged(resolve(root, 'public/licenses/tesseract.js-Apache-2.0.txt'), await readFile(resolve(root, 'node_modules/tesseract.js/LICENSE.md')));
  await writeChanged(resolve(root, 'public/licenses/tesseract-core-Apache-2.0.txt'), await readFile(resolve(root, 'node_modules/tesseract.js-core/LICENSE')));
  // The npm package metadata calls its wrapper MIT; the traineddata itself is
  // Apache-2.0 in naptha/tessdata and the upstream tessdata_best repository.
  const attribution = `FileForge local OCR\n\nTesseract.js 7.0.0 and Tesseract.js-core 7.0.0 — Apache-2.0.\nhttps://github.com/naptha/tesseract.js\nhttps://github.com/naptha/tesseract.js-core\n\nEnglish, German and Turkish traineddata: integerized Tessdata Best,\n4.0.0_best_int, from @tesseract.js-data/{eng,deu,tur}@1.0.0.\nThe traineddata repositories use Apache-2.0; npm wrapper metadata says MIT.\nhttps://github.com/naptha/tessdata\nhttps://github.com/tesseract-ocr/tessdata_best\n\nAll files are unmodified. Exact source filenames, sizes and SHA-256 digests:\n/vendor/tesseract/manifest.json\nApache-2.0 terms: /licenses/tesseract-core-Apache-2.0.txt\n`;
  await writeChanged(resolve(root, 'public/licenses/tesseract-traineddata-NOTICE.txt'), Buffer.from(attribution));
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareOCR();
