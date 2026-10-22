import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { parseCSV, jsonToCSV } from '../src/fileforge/document-data.js';
import { prepareOffice } from '../src/fileforge/office-archive.js';
import { findTools } from '../src/site/tool-catalog.js';
import { compatibleTools } from '../src/site/workspace-tools.js';

test('CSV parsing preserves multiline quotes, leading zeros and prototype-like column names', () => {
  const rows = parseCSV('\uFEFFname,code,note,__proto__\r\nAda,001,"one, two\nthree ""quotes""",safe\r\n');
  assert.equal(rows[0].code, '001'); assert.equal(rows[0].note, 'one, two\nthree "quotes"');
  assert.equal(Object.getPrototypeOf(rows[0]), Object.prototype); assert.equal(rows[0].__proto__, 'safe');
  assert.throws(() => parseCSV('a,a\n1,2'), /unique/); assert.throws(() => parseCSV('a,b\n1'), /same number/);
  assert.throws(() => parseCSV('a\n"unfinished'), /unclosed/); assert.throws(() => parseCSV('a\n"x"y'), /Unexpected/);
});
test('JSON to CSV escapes cells, unions columns and protects formula-like strings without corrupting numbers', () => {
  const csv = jsonToCSV('[{"name":"=1+1","n":-5},{"name":"a, b","extra":"line\\nnext"}]');
  const rows = parseCSV(csv); assert.equal(rows[0].name, "'=1+1"); assert.equal(rows[0].n, '-5');
  assert.equal(rows[1].extra, 'line\nnext'); assert.equal(rows[1].n, '');
  assert.equal(parseCSV(jsonToCSV('[{"a":"=1+1"}]', false))[0].a, '=1+1');
  assert.throws(() => jsonToCSV('[{"a":{"b":2}}]'), /Nested/); assert.throws(() => jsonToCSV('null'), /array/);
});
const office = extra => zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<document/>'), ...extra });
test('Office input strips external relationships and preserves embedded content', () => {
  const source = office({ 'word/_rels/document.xml.rels': strToU8('<Relationships><Relationship Id="r1" Target="https://external.invalid/tracker" TargetMode="External"/><Relationship Id="r2" Target="media/photo.png"/></Relationships>'), 'word/media/photo.png': new Uint8Array([1,2,3]) });
  const result = prepareOffice(source, 'word-pdf'), entries = unzipSync(result.bytes);
  assert.equal(result.removed, 1); assert.doesNotMatch(strFromU8(entries['word/_rels/document.xml.rels']), /external.invalid/);
  assert.match(strFromU8(entries['word/_rels/document.xml.rels']), /media\/photo.png/); assert.deepEqual(entries['word/media/photo.png'], new Uint8Array([1,2,3]));
});
test('Office input refuses format spoofing, XML entities, embedded objects and expansion bombs', () => {
  assert.throws(() => prepareOffice(office({}), 'powerpoint-pdf'), /contents/);
  assert.throws(() => prepareOffice(office({ 'word/document.xml': strToU8('<!DOCTYPE test><document/>') }), 'word-pdf'), /XML/);
  assert.throws(() => prepareOffice(office({ 'word/embeddings/item.bin': new Uint8Array([1]) }), 'word-pdf'), /embedded/);
  assert.throws(() => prepareOffice(office({ 'word/media/big.bin': new Uint8Array(20000001) }), 'word-pdf'), /limit/);
});
test('new format directions select exact tools; legacy and reverse Office conversions remain unavailable', () => {
  for (const [query,id] of [['DOCX to PDF','word-pdf'],['Word into PDF','word-pdf'],['PPTX to PDF','powerpoint-pdf'],['PowerPoint to PDF','powerpoint-pdf'],['TXT to PDF','text-pdf'],['PDF to TXT','pdf-text'],['CSV to JSON','data'],['JSON to CSV','data']]) assert.deepEqual(findTools(query).map(tool => tool.id), [id], query);
  for (const query of ['DOC to PDF','PPT to PDF','PDF to Word','PDF to PPTX']) assert.deepEqual(findTools(query), [], query);
  assert.deepEqual(compatibleTools([{name:'talk.pptx',size:1000}]).map(tool=>tool.id),['powerpoint-pdf']);
  assert.deepEqual(compatibleTools([{name:'talk.pptx',size:10000001}]),[]);
});
