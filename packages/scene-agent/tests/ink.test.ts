import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {decodePng,emptySpace,inkCoverage} from '../src/render/ink';
import {defaultFrames,inkFindings} from '../src/tools/checks';

// Encodes RGB rows with a chosen filter per row, so the decoder's filters are exercised.
function png(width:number,rows:number[][][],filters:number[]):Buffer{
 const chunk=(type:string,body:Buffer)=>{const head=Buffer.alloc(8);head.writeUInt32BE(body.length,0);head.write(type,4,'latin1');return Buffer.concat([head,body,Buffer.alloc(4)]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(rows.length,4);ihdr[8]=8;ihdr[9]=2;
 const raw:number[]=[];
 rows.forEach((row,y)=>{
  const flat=row.flat(),prev=y?rows[y-1].flat():flat.map(()=>0),f=filters[y];
  raw.push(f);
  flat.forEach((v,x)=>{
   const a=x>=3?flat[x-3]:0,b=prev[x],c=x>=3?prev[x-3]:0;
   const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c),paeth=pa<=pb&&pa<=pc?a:pb<=pc?b:c;
   raw.push((v-[0,a,b,(a+b)>>1,paeth][f]+256)&255);
  });
 });
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from(raw))),chunk('IEND',Buffer.alloc(0))]);
}
const BG=[14,26,46],INK=[214,229,255];

test('decodes every PNG filter type and measures non-background pixels',()=>{
 const rows=[0,1,2,3,4].map(y=>[0,1,2,3].map(x=>x===y%4?INK:BG));
 const image=decodePng(png(4,rows,[0,1,2,3,4]));
 assert.deepEqual([image.width,image.height,image.channels],[4,5,3]);
 assert.deepEqual([...image.pixels.subarray(0,6)],[...INK,...BG]);
 assert.equal(inkCoverage(image,'#0e1a2e'),5/20);
 assert.equal(inkCoverage(decodePng(png(2,[[BG,[20,30,50]]],[0])),'#0e1a2e'),0); // anti-aliasing noise is below tolerance
 assert.throws(()=>decodePng(Buffer.from('nope')),/bad signature/);
});

test('blank and sparse frames are judged by where they fall in the cues',()=>{
 const cues=[{id:'a',text:'x',startFrame:0,endFrame:100},{id:'b',text:'y',startFrame:100,endFrame:200}];
 const frame=(f:number,ink:number)=>({frame:f,file:'',ink,audit:{issues:[],labels:0,movers:0,routes:0,obstacles:0}});
 const findings=inkFindings({sourceSha256:'x',failures:[],frames:[frame(0,0),frame(50,0),frame(150,0.004),frame(199,0),frame(120,0.2)]},cues,200);
 assert.deepEqual(findings.map(f=>[f.severity,f.kind,f.frames]),[['low','blank-frame',[0,199]],['high','blank-frame',[50]],['medium','sparse-frame',[150]]]);
});

test('default sampling keeps every cue midpoint when the frame cap applies',()=>{
 const cues=Array.from({length:6},(_,i)=>({id:`c${i}`,text:'x',startFrame:i*160+6,endFrame:i*160+150}));
 const frames=defaultFrames(982,cues);
 assert.ok(frames.length<=12);
 for(const c of cues)assert.ok(frames.includes(Math.floor((c.startFrame+c.endFrame)/2)),`midpoint of ${c.id}`);
});

test('empty space is the largest undrawn band of rows and of columns above the captions, in canvas pixels',()=>{
 // 20×10 image standing for 1920×1080: ink only in the top-left 4×3 block; rows 9+ are the caption band.
 const rows=Array.from({length:10},(_,y)=>Array.from({length:20},(_,x)=>x<4&&y<3?INK:BG));
 const space=emptySpace(decodePng(png(20,rows,rows.map(()=>0))),'#0e1a2e');
 assert.deepEqual(space.rows,[288,960]); // rows 3–9 of 10 (980 px safe height ≈ 9 rows of 108)
 assert.deepEqual(space.cols,[384,1920]);
});

test('a frame that leaves most of the canvas empty mid-cue is reported with coordinates; edges and full frames are not',()=>{
 const cues=[{id:'a',text:'x',startFrame:0,endFrame:100},{id:'b',text:'y',startFrame:100,endFrame:200}];
 const frame=(f:number,rows:[number,number],cols:[number,number])=>({frame:f,file:'',ink:0.05,space:{rows,cols},audit:{issues:[],labels:0,movers:0,routes:0,obstacles:0}});
 const findings=inkFindings({sourceSha256:'x',failures:[],frames:[
  frame(50,[542,980],[1680,1920]), // bottom 45% empty
  frame(150,[700,980],[0,800]),     // 42% of the width empty
  frame(120,[800,980],[0,200]),     // full enough
  frame(199,[0,980],[0,1920]),      // cue edge: not judged
 ]},cues,200);
 const empty=findings.find(f=>f.kind==='empty-area')!;
 assert.equal(empty.severity,'medium');
 assert.deepEqual(empty.frames,[50,150]);
 assert.match(empty.detail,/frame 50: nothing drawn in y 542–980 \(45% of the height\)/);
 assert.match(empty.detail,/frame 150: nothing drawn in x 0–800 \(42% of the width\)/);
});
