import test from 'node:test';
import assert from 'node:assert/strict';
import { findTools, toolCatalog } from '../src/site/tool-catalog.js';

const ids = (query, category) => findTools(query, category).map(tool => tool.id);

test('conversion searches distinguish direction even when tools share format keywords', () => {
  for (const query of ['JPG to PNG', 'jpeg → webp', 'GIF -> JPG', 'BMP into PNG', 'image to jpg', 'photos to WebP']) {
    assert.deepEqual(ids(query), ['image'], query);
  }
  for (const query of ['PNG to PDF', 'jpg → pdf', 'pictures into a pdf']) {
    assert.deepEqual(ids(query), ['image-pdf'], query);
  }
  for (const query of ['PDF to PNG', 'pdf → jpeg', 'pdf to images']) {
    assert.deepEqual(ids(query), ['pdf-images'], query);
  }
  for (const query of ['PNG to SVG', 'jpg → svg', 'GIF to SVG', 'bmp into svg']) {
    assert.deepEqual(ids(query), ['svg'], query);
  }
  for (const query of ['Excel to PDF', 'XLSX → PDF', 'CSV into PDF']) {
    assert.deepEqual(ids(query), ['spreadsheet'], query);
  }
});

test('unsupported conversion directions do not suggest a tool with misleading shared keywords', () => {
  for (const query of ['SVG to PNG', 'svg → jpg', 'TIFF to PDF', 'tif to png', 'PNG to TIFF', 'pdf to svg', 'PDF to WebP', 'png to gif', 'HEIC to JPG', 'DOCX to PDF', 'XLS to PDF']) {
    assert.deepEqual(ids(query), [], query);
  }
});

test('natural filler words do not hide supported tasks', () => {
  assert.deepEqual(ids('any image to svg'), ['svg']);
  assert.deepEqual(ids('can you convert my png to a pdf for me'), ['image-pdf']);
  assert.deepEqual(ids('can you convert it from JPEG to SVG'), ['svg']);
  assert.deepEqual(ids('can you remove a background please'), ['background']);
  assert.deepEqual(ids('I want to make this video smaller'), ['video']);
});

test('general discovery and category filtering remain available alongside directional searches', () => {
  assert.equal(ids('').length, toolCatalog.length);
  assert.deepEqual(ids('', 'Images'), ['background', 'image', 'svg', 'crop', 'screenshot']);
  assert.deepEqual(ids('', 'PDFs'), ['image-pdf', 'pdf-images', 'merge', 'organize']);
  assert.deepEqual(ids('remove bg'), ['background']);
  assert.deepEqual(ids('crop screenshot'), ['crop']);
  assert.deepEqual(ids('PNG to PDF', 'Images'), []);
  assert.deepEqual(ids('PNG to PDF', 'PDFs'), ['image-pdf']);
});
