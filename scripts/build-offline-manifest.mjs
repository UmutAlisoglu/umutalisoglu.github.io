import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { join, relative } from 'node:path';

// Run after finalize-build. Every offline response is an existing public build
// artifact; visitor inputs and output blobs can never enter this list.
const root = 'dist';
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(root);
const definitions = [
  { id: 'core', label: 'Everyday image & PDF tools', description: 'Workspace, screenshot studio, document scanner, conversion, cropping, SVG tracing, PDF pages and spreadsheet exports. Required for every pack.' },
  { id: 'heic', label: 'HEIC photo conversion', description: 'Local HEIC/HEIF decoder. Only needed for iPhone photos.' },
  { id: 'office', label: 'Word & PowerPoint preview engines', description: 'Local DOCX/PPTX rendering and page-image PDF exports. Optional; review previews before sharing.' },
  { id: 'background', label: 'Background removal', description: 'The local AI model and its WebAssembly engine.' },
  { id: 'video', label: 'Video compression', description: 'The FFmpeg engine. Larger download; compression uses your device.' },
  { id: 'ocr', label: 'Text extraction engine', description: 'Local OCR engine. Choose at least one language below.' },
  { id: 'ocr-eng', label: 'OCR · English', description: 'English recognition language.' },
  { id: 'ocr-deu', label: 'OCR · German', description: 'German recognition language.' },
  { id: 'ocr-tur', label: 'OCR · Turkish', description: 'Turkish recognition language.' },
];
const descriptors = [];
for (const path of files.sort()) {
  const rel = relative(root, path).replaceAll('\\', '/');
  if (/^(?:skate-scape|showcase)\//.test(rel) || /^(?:sw\.js|offline-manifest\.json)$/.test(rel)) continue;
  // Personal-site screenshots are not required by the offline file tools.
  if (/^assets\/screenshots\//.test(rel) || /^tools\/_assets\/(?:fileforge|skate-scape)-[^/]+\.jpg$/.test(rel)) continue;
  // Homepage is outside the offline app's scope. Its hashed sample is a
  // duplicate of /assets/demos/headphones.png used by the workspace.
  if (/^(?:assets|tools\/_assets)\/headphones-[^/]+\.png$/.test(rel)) continue;
  // ONNX's bundler fallback also emits a duplicate wasm; the runtime's
  // explicit /vendor/ort/ path is the actual engine used by this site.
  if (/^(?:assets|tools\/_assets)\/ort.*\.wasm$/.test(rel) || rel === 'licenses/fontkit-source.js') continue;
  // The classic OCR worker's /tools/ alias is what runs offline. Its original
  // vendor copy remains publicly available for source/provenance inspection.
  if (/^vendor\/tesseract\/worker\.min\.js(?:\.LICENSE\.txt)?$/.test(rel)) continue;
  let group;
  if (/^tools\/office-engine\//.test(rel) || /^tools\/_assets\/(?:office-engine|docx-preview|aiden0z|jszip)/.test(rel)) group = 'office';
  else if (/^vendor\/tesseract\/lang\/(eng|deu|tur)\.traineddata(?:\.gz)?$/.test(rel)) group = `ocr-${rel.match(/\/(eng|deu|tur)\./)[1]}`;
  else if (/^tools\/engines\/tesseract\//.test(rel)) group = 'ocr';
  else if (/^vendor\/tesseract\//.test(rel)) group = 'ocr';
  else if (/^vendor\/heic\//.test(rel)) group = 'heic';
  else if (/^vendor\/ffmpeg\//.test(rel)) group = 'video';
  else if (/^vendor\/ort\//.test(rel) || /^assets\/models\//.test(rel) || /^assets\/ort.*\.wasm$/.test(rel)) group = 'background';
  else if (/^tools\/.+\/index\.html$/.test(rel) || rel === 'tools/index.html' || /^(?:manifest\.webmanifest|icons\/|fonts\/|licenses\/|vendor\/pdfjs\/|THIRD_PARTY_NOTICES\.md)/.test(rel)) group = 'core';
  else if (/^(?:assets|tools\/_assets)\//.test(rel) && !/repodock|social-card/.test(rel)) group = 'core';
  if (!group) continue;
  const body = await readFile(path);
  const file = { url: rel.endsWith('/index.html') ? `/${rel.slice(0, -10)}` : `/${rel}`, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), group };
  if (rel.endsWith('.gz')) {
    // Some static hosts send .gz files with Content-Encoding:gzip. Fetch then
    // exposes decoded bytes. Pin both exact representations before publishing.
    const decoded = gunzipSync(body);
    file.decodedBytes = decoded.length;
    file.decodedSha256 = createHash('sha256').update(decoded).digest('hex');
  }
  descriptors.push(file);
}
if (!descriptors.some(file => file.url === '/tools/workspace/')) throw new Error('Build the FileForge workspace before generating its offline packs.');
const version = createHash('sha256').update(JSON.stringify(descriptors)).digest('hex').slice(0, 16);
const groups = definitions.map(group => ({ ...group, bytes: descriptors.filter(file => file.group === group.id).reduce((sum, file) => sum + file.bytes, 0), files: descriptors.filter(file => file.group === group.id).length })).filter(group => group.files);
const manifest = { schema: 1, version, built: new Date().toISOString(), groups, files: descriptors };
await writeFile(`${root}/offline-manifest.json`, `${JSON.stringify(manifest)}\n`);
const worker = await readFile(`${root}/sw.js`, 'utf8');
if (!worker.includes('__FILEFORGE_BUILD_VERSION__')) throw new Error('Service worker version token is missing.');
await writeFile(`${root}/sw.js`, worker.replaceAll('__FILEFORGE_BUILD_VERSION__', version));
console.log(`Offline packs ${version}: ${groups.map(group => `${group.id} ${(group.bytes / 1e6).toFixed(2)} MB`).join(', ')}. Opt-in only.`);
