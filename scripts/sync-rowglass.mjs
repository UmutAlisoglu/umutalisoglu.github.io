import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/sync-rowglass.mjs <path-to-rowglass-dist>');
const allowed = ['index.html', 'style.css', 'icon.svg', 'src/core.js', 'src/samples.js', 'src/app.js', 'LICENSE', 'README.md'];
const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
if (manifest.product !== 'Rowglass' || manifest.version !== '1.0.0' || manifest.files.length !== allowed.length) throw new Error('Unexpected Rowglass build manifest. Review a new release before changing the pinned version.');
if (new Set(manifest.files.map(file => file.file)).size !== allowed.length) throw new Error('Duplicate manifest file.');
const files = [];
for (const file of manifest.files) {
  if (!allowed.includes(file.file)) throw new Error(`Unexpected public asset: ${file.file}`);
  const bytes = await readFile(resolve(source, file.file));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Hash mismatch: ${file.file}`);
  files.push([file.file, bytes]);
}
for (const [file, bytes] of files) {
  const target = resolve('public/rowglass', file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
}
await copyFile(resolve(source, 'manifest.json'), resolve('public/rowglass/manifest.json'));
await copyFile(resolve(source, 'icon.svg'), resolve('assets/rowglass.svg'));
console.log(`Synced Rowglass ${manifest.version}: ${files.length} verified app files. No development or visitor data copied.`);
