import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuad, quadHomography, invertHomography, projectPoint, rectifiedSize, warpDocument, cleanPaper } from '../src/fileforge/scanner-math.js';

const square = [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }, { x: 0, y: 9 }];
test('perspective homography maps all corners and inverse restores arbitrary interior points', () => {
  const quad = [{ x: 140, y: 30 }, { x: 500, y: 90 }, { x: 580, y: 600 }, { x: 50, y: 520 }];
  validateQuad(quad, 700, 700); const forward = quadHomography(quad), inverse = invertHomography(forward);
  for (const [index, uv] of [[0,[0,0]], [1,[1,0]], [2,[1,1]], [3,[0,1]]]) { const point = projectPoint(forward, ...uv); assert.ok(Math.abs(point.x - quad[index].x) < 1e-8); assert.ok(Math.abs(point.y - quad[index].y) < 1e-8); }
  for (const uv of [[.15,.2], [.5,.5], [.85,.9]]) { const point = projectPoint(forward, ...uv), back = projectPoint(inverse, point.x, point.y); assert.ok(Math.abs(back.x - uv[0]) < 1e-8); assert.ok(Math.abs(back.y - uv[1]) < 1e-8); }
});
test('crossed, concave, out-of-bounds and singular selections are rejected', () => {
  assert.throws(() => validateQuad([square[0],square[2],square[1],square[3]], 10, 10), /clockwise/);
  assert.throws(() => validateQuad([{x:0,y:0},{x:9,y:0},{x:1,y:1},{x:0,y:9}], 10, 10), /clockwise/);
  assert.throws(() => validateQuad([{x:-1,y:0},...square.slice(1)], 10, 10), /inside/);
  assert.throws(() => validateQuad([{x:0,y:0},{x:3,y:0},{x:6,y:0},{x:9,y:0}], 10, 10), /clockwise/);
  assert.throws(() => validateQuad(square, 4001, 3000), /12 megapixels/);
  assert.throws(() => quadHomography([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:1}]), /stable/);
});
test('identity scan retains exact real source pixels and transparent source flattens to white', () => {
  const pixels = new Uint8ClampedArray(10 * 10 * 4);
  for (let y=0;y<10;y++) for(let x=0;x<10;x++) pixels.set([x*20,y*20,70,255],(y*10+x)*4);
  assert.deepEqual(warpDocument(pixels,10,10,square,10,10),pixels);
  pixels.set([10,20,30,0],0); const result=warpDocument(pixels,10,10,square,10,10);
  assert.deepEqual([...result.slice(0,4)],[255,255,255,255]);
});
test('bilinear interpolation averages neighboring pixels instead of creating staircase samples', () => {
  const pixels=new Uint8ClampedArray([0,0,0,255, 255,0,0,255, 0,255,0,255, 255,255,0,255]);
  const result=warpDocument(pixels,2,2,[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],3,3);
  assert.deepEqual([...result.slice(16,20)],[128,128,0,255]);
});
test('non-affine rectification samples the projected source location, not an axis-aligned crop', () => {
  const pixels=new Uint8ClampedArray(100*100*4);
  for(let y=0;y<100;y++)for(let x=0;x<100;x++)pixels.set([x*2,y*2,40,255],(y*100+x)*4);
  const quad=[{x:30,y:10},{x:70,y:20},{x:90,y:90},{x:10,y:80}];
  const result=warpDocument(pixels,100,100,quad,11,11);
  // Independently solved center: intersect the quadrilateral's two diagonals.
  // P0+t(P2-P0)=P1+s(P3-P1), giving t=5/14, source(360/7,270/7).
  const at=(5*11+5)*4; assert.ok(Math.abs(result[at]-720/7)<=1); assert.ok(Math.abs(result[at+1]-540/7)<=1); assert.equal(result[at+2],40);
});
test('output bounds and paper treatments preserve useful contrast with binary black-and-white output', () => {
  const size=rectifiedSize([{x:0,y:0},{x:3999,y:0},{x:3999,y:2999},{x:0,y:2999}]); assert.ok(size.width*size.height<=3_000_000); assert.ok(Math.max(size.width,size.height)<=3000);
  const pixels=new Uint8ClampedArray(100*100*4);
  for(let y=0;y<100;y++)for(let x=0;x<100;x++){const v=x>30&&x<60&&y>30&&y<60?20:180+Math.round(x*.5);pixels.set([v,v,v,255],(y*100+x)*4);}
  const original=new Uint8ClampedArray(pixels);assert.deepEqual(cleanPaper(pixels,100,100,'original'),original);
  const binary=cleanPaper(new Uint8ClampedArray(original),100,100,'bw');assert.equal(binary[(45*100+45)*4],0);assert.equal(binary[(10*100+10)*4],255);
  for(let i=0;i<binary.length;i+=4){assert.ok(binary[i]===0||binary[i]===255);assert.equal(binary[i],binary[i+1]);assert.equal(binary[i],binary[i+2]);assert.equal(binary[i+3],255);}
  const gray=cleanPaper(new Uint8ClampedArray(original),100,100,'gray');assert.ok(gray[(10*100+80)*4]>original[(10*100+80)*4]);assert.ok(gray[(45*100+45)*4]<30);
  assert.throws(()=>cleanPaper(new Uint8ClampedArray(original),100,100,'unknown'),/supported/);
});
