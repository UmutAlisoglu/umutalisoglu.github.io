import test from 'node:test';
import assert from 'node:assert/strict';
import { conversionSources, conversionTargets, conversionFor } from '../src/site/conversion-options.js';

test('conversion picker keeps direction, format presets and visible limits aligned', () => {
  for(const [source,target,id,href] of [
    ['docx','pdf','word-pdf','/tools/word-to-pdf/'],
    ['pptx','pdf','powerpoint-pdf','/tools/powerpoint-to-pdf/'],
    ['xlsx','pdf','spreadsheet','/tools/excel-to-pdf/'],
    ['jpg','png','image','/tools/image-converter/?format=png'],
    ['png','pdf','image-pdf','/tools/image-converter/?format=pdf'],
    ['pdf','jpg','pdf-images','/tools/pdf-to-images/?format=jpg'],
    ['pdf','txt','pdf-text','/tools/pdf-to-text/'],
    ['png','txt','text','/tools/extract-text/'],
    ['json','csv','data','/tools/csv-json/?format=csv'],
    ['csv','json','data','/tools/csv-json/?format=json'],
    ['heic','jpg','heic','/tools/heic-to-jpg/'],
  ]) {
    const route=conversionFor(source,target);
    assert.equal(route.tool.id,id);assert.equal(route.href,href);
    assert.equal(route.facts.length,2);assert.ok(route.facts.every(Boolean));
  }
  assert.match(conversionFor('docx','pdf').facts.join(' '),/flattened page images/);
  assert.match(conversionFor('pdf','txt').facts.join(' '),/without OCR/);
});

test('only supported choices become converter links; arbitrary input never becomes a URL', () => {
  for(const [source,target] of [['doc','pdf'],['ppt','pdf'],['svg','png'],['pdf','webp'],['heic','pdf'],['png','tiff'],['pdf','docx'],['png','png'],['https://example.com','pdf'],['docx','javascript:alert(1)']]) assert.equal(conversionFor(source,target),null);
  for(const [source] of conversionSources) {
    assert.ok(conversionTargets(source).length>0,source);
    for(const [target] of conversionTargets(source)) assert.match(conversionFor(source,target).href,/^\/tools\/[a-z-]+\/(?:\?format=[a-z]+)?$/);
  }
});
