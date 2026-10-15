import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleTools, validateWorkspaceFiles } from '../src/site/workspace-tools.js';
const file = (name,size=1000)=>({name,size});
const ids = files=>compatibleTools(files).map(tool=>tool.id);
test('workspace accepts only tools matching the entire batch and practical size limits',()=>{
  assert.deepEqual(ids([file('picture.PNG')]),['image-pdf','background','image','svg','crop','text','screenshot','scanner']);
  assert.deepEqual(ids([file('one.jpg'),file('two.webp')]),['image-pdf','image']);
  assert.deepEqual(ids([file('one.pdf'),file('two.pdf')]),['merge','organize']);
  assert.deepEqual(ids([file('one.pdf',24e6)]),['pdf-images','merge','organize','text']);
  assert.deepEqual(ids([file('picture.png',21e6)]),[]);
  assert.deepEqual(ids([file('one.pdf'),file('picture.png')]),[]);
  assert.deepEqual(ids([file('movie.mp4',100e6)]),['video']);
  assert.deepEqual(ids([file('unknown.docx')]),[]);
  assert.throws(()=>validateWorkspaceFiles([file('empty.png',0)]),/empty/);
  assert.throws(()=>validateWorkspaceFiles(Array.from({length:51},()=>file('x.png'))),/50 files/);
  assert.throws(()=>validateWorkspaceFiles([file('movie.mp4',100e6+1)]),/100 MB/);
});
