import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
const [slug,source]=process.argv.slice(2),pins={routeboard:['Routeboard','1.0.0'],handback:['Handback','1.0.0']};
if(!pins[slug]||!source)throw new Error('Usage: node scripts/sync-product.mjs <routeboard|handback> <path-to-dist>');
const allowed=['index.html','style.css','icon.svg','src/core.js','src/samples.js','src/app.js','LICENSE','README.md'];
const manifest=JSON.parse(await readFile(resolve(source,'manifest.json'),'utf8'));
if(manifest.product!==pins[slug][0]||manifest.version!==pins[slug][1]||manifest.files.length!==allowed.length||new Set(manifest.files.map(f=>f.file)).size!==allowed.length)throw new Error('Unexpected product/version/manifest. Review release pins before updating.');
const files=[];
for(const file of manifest.files){if(!allowed.includes(file.file))throw new Error('Unexpected public file');const bytes=await readFile(resolve(source,file.file));if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('Build hash mismatch: '+file.file);files.push([file.file,bytes]);}
for(const [file,bytes]of files){const target=resolve('public',slug,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
await copyFile(resolve(source,'manifest.json'),resolve('public',slug,'manifest.json'));await copyFile(resolve(source,'icon.svg'),resolve('assets',slug+'.svg'));
console.log(`Synced ${pins[slug][0]} ${pins[slug][1]}: ${files.length} verified app files.`);
