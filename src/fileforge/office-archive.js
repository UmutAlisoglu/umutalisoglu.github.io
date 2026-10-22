import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

// Bound expansion before invoking either renderer. External relationships are
// removed so a document cannot load a remote image, template or linked font.
export function prepareOffice(bytes, kind) {
  if (!['word-pdf', 'powerpoint-pdf'].includes(kind)) throw new Error('Choose a supported Office format.');
  let total = 0, count = 0, removed = 0;
  let entries;
  try {
    entries = unzipSync(new Uint8Array(bytes), { filter(entry) {
      total += entry.originalSize; count++;
      if (count > 2000 || entry.originalSize > 20e6 || total > 80e6) throw new Error('This document expands beyond the browser limit (80 MB / 2,000 entries).');
      return true;
    } });
  } catch (error) { throw new Error(error.message.includes('limit') ? error.message : 'This file is not a readable, unencrypted DOCX or PPTX archive.'); }
  const root = kind === 'word-pdf' ? 'word/document.xml' : 'ppt/presentation.xml';
  if (!entries[root] || !entries['[Content_Types].xml']) throw new Error('The file contents do not match the selected Office format.');
  for (const [path, data] of Object.entries(entries)) {
    if (/vbaProject|embeddings\/.*\.(?:bin|exe|dll|docm|xlsm)$/i.test(path)) throw new Error('Documents with macros or embedded objects are not supported. Remove those objects and save a new copy.');
    if (/\.xml$|\.rels$/.test(path)) {
      const text = strFromU8(data);
      if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('This document contains unsupported XML declarations.');
      if (path.endsWith('.rels')) {
        const clean = text.replace(/<(?:\w+:)?Relationship\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?Relationship>)/g, tag => {
          if (/TargetMode\s*=\s*["']External["']/i.test(tag)) { removed++; return ''; }
          return tag;
        });
        entries[path] = strToU8(clean);
      }
    }
  }
  const pages = Object.keys(entries).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path)).length;
  if (kind === 'powerpoint-pdf' && (!pages || pages > 20)) throw new Error('Choose a presentation with 1–20 slides.');
  return { bytes: zipSync(entries, { level: 1 }), removed };
}
