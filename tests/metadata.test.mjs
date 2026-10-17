import test from 'node:test';
import assert from 'node:assert/strict';
import { stripMetadata, jpegOrientation } from '../src/fileforge/metadata.js';

const segment = (marker, data) => Buffer.concat([Buffer.from([255, marker, (data.length + 2) >> 8, (data.length + 2) & 255]), data]);
test('JPEG cleaner removes EXIF/GPS and comments, keeps only orientation and entropy bytes', () => {
  const tiff = Buffer.alloc(100); tiff.write('II'); tiff.writeUInt16LE(42,2); tiff.writeUInt32LE(8,4); tiff.writeUInt16LE(2,8);
  tiff.writeUInt16LE(274,10); tiff.writeUInt16LE(3,12); tiff.writeUInt32LE(1,14); tiff.writeUInt16LE(6,18);
  tiff.writeUInt16LE(34853,22); tiff.writeUInt16LE(4,24); tiff.writeUInt32LE(1,26); tiff.writeUInt32LE(40,30); tiff.write('SECRET GPS AND CAMERA',40);
  const pixels = Buffer.from([1,2,255,0,3,255,208,4]);
  const input = Buffer.concat([Buffer.from([255,216]), segment(225,Buffer.concat([Buffer.from('Exif\0\0'),tiff])), segment(218,Buffer.from([1,2])),pixels,segment(254,Buffer.from('PRIVATE BETWEEN SCANS')),segment(218,Buffer.from([3])),pixels,Buffer.from([255,217]),Buffer.from('PRIVATE AFTER EOI')]);
  assert.equal(jpegOrientation(input),6);
  const out = Buffer.from(stripMetadata(input).bytes);
  assert.equal(jpegOrientation(out),6);
  assert.ok(!out.includes(Buffer.from('SECRET'))); assert.ok(!out.includes(Buffer.from('PRIVATE')));
  assert.ok(out.includes(pixels)); assert.ok(out.includes(Buffer.from([18,1,3,0,1,0,0,0,6,0])));
  assert.equal(out.readUInt16BE(out.length-2),0xffd9);
});
const chunk = (type,data) => { const head=Buffer.alloc(8);head.writeUInt32BE(data.length);head.write(type,4);return Buffer.concat([head,data,Buffer.alloc(4)]); };
test('PNG cleaner removes descriptive chunks and keeps compressed pixels and colour profiles byte for byte', () => {
  const signature=Buffer.from([137,80,78,71,13,10,26,10]), pixels=chunk('IDAT',Buffer.from('COMPRESSED PIXELS')),profile=chunk('iCCP',Buffer.from('COLOUR PROFILE'));
  const out=Buffer.from(stripMetadata(Buffer.concat([signature,chunk('IHDR',Buffer.alloc(13)),chunk('tEXt',Buffer.from('GPS=SECRET')),chunk('iTXt',Buffer.from('CAMERA=SECRET')),profile,pixels,chunk('IEND',Buffer.alloc(0))])).bytes);
  assert.ok(!out.includes(Buffer.from('SECRET'))); assert.ok(out.includes(pixels)); assert.ok(out.includes(profile));
});
test('malformed and unsupported files cannot produce a misleading clean export', () => {
  assert.throws(()=>stripMetadata(Buffer.from('not an image')),/JPG or PNG/);
  assert.throws(()=>stripMetadata(Buffer.from([255,216,255,225,255,255])),/Truncated/);
  assert.throws(()=>stripMetadata(Buffer.from([137,80,78,71,13,10,26,10])),/Incomplete/);
});
