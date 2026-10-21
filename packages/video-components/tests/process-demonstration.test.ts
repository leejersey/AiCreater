import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as demo from '../src/ProcessDemonstration';
import {interactiveExamples} from './interactive-fixture';
const api=()=>{assert.equal(typeof demo.processFrame,'function','missing process demonstration frame model');return demo;};
const scene=()=>interactiveExamples()[1];
const html=(s:ReturnType<typeof scene>,f:number)=>renderToStaticMarkup(createElement(api().ProcessDemonstration,{scene:s,frame:f}));
test('waiting and stage content are gated by actual source timing',()=>{
 const s=scene(),f=s.animations[0].start_frame;
 assert.equal(api().processFrame(s,f-1).stageIndex,-1);assert.equal(api().processFrame(s,f).stageIndex,0);
 assert.doesNotMatch(html(s,f-1),/data-demo-stage="e0"/);assert.match(html(s,f+12),/data-demo-stage="e0"/);
 assert.doesNotMatch(html(s,s.animations[1].start_frame-1),/data-demo-stage="e1"/);
});
test('transport moves only on source-authored connections and never before the receiving cue',()=>{
 const s=scene(),a=s.visual_actions!.find(a=>a.kind==='connect')!,start=a.start_frame;
 assert.equal(api().processFrame(s,start-1).transfers.length,0);
 const early=api().processFrame(s,start+2).transfers[0],later=api().processFrame(s,start+8).transfers[0];assert.ok(later.x>early.x);
 s.edges=[];s.visual_actions=[];assert.equal(api().processFrame(s,start+8).transfers.length,0);
});
test('packet geometry follows the actual straight or branch connection',()=>{
 const s=scene(),connect=s.visual_actions!.find(a=>a.kind==='connect')!;
 const p=api().processFrame(s,connect.start_frame+6);assert.equal(p.transfers[0].y,p.nodes[0].y);
 const target=s.process!.stages[2],at=s.animations.find(a=>a.target===target)!.start_frame;
 s.edges=[{from:s.process!.stages[0],to:target}];s.visual_actions=[{...connect,to:target,cue:s.elements.find(e=>e.id===target)!.cue,start_frame:at,duration_frames:24}];
 const b=api().processFrame(s,at+12),mark=b.transfers[0];assert.equal(mark.y,b.nodes[0].y-114);assert.equal(mark.x,(b.nodes[0].x+b.nodes[2].x)/2);
});
test('source boundary appears on cue and overview waits for all excerpts',()=>{
 const s=scene(),last=s.elements.at(-1)!,at=s.animations.find(a=>a.target===last.id)!.start_frame;
 assert.doesNotMatch(html(s,at-1),new RegExp(`data-demo-detail="${last.id}"`));assert.match(html(s,at),new RegExp(`data-demo-detail="${last.id}"`));
 const lastStart=Math.max(...s.animations.map(a=>a.start_frame));assert.equal(api().processFrame(s,lastStart-1).summary,0);assert.equal(api().processFrame(s,lastStart+48).summary,1);
});
test('rewind is deterministic, source objects are immutable, and markup is inert',()=>{
 const s=scene(),copy=structuredClone(s);const end=html(s,350);html(s,0);assert.equal(html(s,350),end);assert.deepEqual(s,copy);
 s.elements.at(-1)!.content='<script>alert(1)</script>';assert.doesNotMatch(html(s,350),/<script>/);
});
test('maximum source labels fit shared readable text rectangles without covering captions',()=>{
 const s=scene();for(const e of s.elements)e.content='长🙂'.repeat(s.process!.stages.includes(e.id)?12:20);
 for(const f of [100,230,350,410])for(const b of api().processTextBoxes(s,f)){
  assert.ok(b.x>=120&&b.x+b.width<=1800&&b.y>=200&&b.y+b.height<=936);
  assert.ok(b.fontSize>=28);assert.ok(b.lines.length*b.fontSize*1.35<=b.height);
 }
});
