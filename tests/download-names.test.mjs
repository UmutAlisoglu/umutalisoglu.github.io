import test from 'node:test';
import assert from 'node:assert/strict';
import { resultName, downloadName, batchNames } from '../src/fileforge/shared.js';
test('chained outputs keep one FileForge suffix and retain case-insensitive ZIP uniqueness', () => {
  assert.equal(resultName('portrait-fileforge.png','webp'),'portrait-fileforge.webp');
  assert.equal(resultName('portrait-fileforge-fileforge.png','pdf'),'portrait-fileforge.pdf');
  assert.deepEqual(batchNames([{name:'portrait.png'},{name:'portrait-fileforge.png'},{name:'PORTRAIT.png'}],'jpg'),['portrait-fileforge.jpg','portrait-fileforge-2.jpg','PORTRAIT-fileforge-3.jpg']);
});
test('custom download names keep the actual format and reject unsafe Windows stems',()=>{
  assert.equal(downloadName('My cropped photo','source.png'),'My cropped photo.png');
  assert.equal(downloadName('resume.v2','source.pdf'),'resume.v2.pdf');
  assert.equal(downloadName('..\\secret/report:*?','source.png'),'_secret_report___.png');
  assert.equal(downloadName('CON','source.webp'),'file_CON.webp');
  assert.equal(downloadName(' . . ','source.svg'),'source.svg');
  assert.equal(downloadName('Türkçe Größe','source.txt'),'Türkçe Größe.txt');
});
