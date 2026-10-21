import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {interactiveExamples} from './interactive-fixture';
import * as demo from '../src/DialogueDemonstration';
const api=()=>{assert.equal(typeof demo.dialogueFrame,'function','missing dialogue frame model');return demo;};
const scene=()=>interactiveExamples()[0];
test('message and initial state text cannot appear before their own cues',()=>{
 const s=scene(),a=api(),id=s.dialogue!.messages[0],start=s.animations.find(x=>x.target===id)!.start_frame;
 assert.equal(a.dialogueFrame(s,5).stateVisible,false);
 assert.equal(a.dialogueFrame(s,start-1).messages.some((m:{id:string})=>m.id===id),false);
 assert.ok(a.dialogueFrame(s,start).messages.some((m:{id:string})=>m.id===id));
 const html=renderToStaticMarkup(React.createElement(a.DialogueDemonstration,{scene:s,frame:5}));assert.ok(!html.includes('等待消息')&&!html.includes('订单A'));
});
test('explicit update retains the previous state and removes update-source speech duplication',()=>{
 const s=scene(),update=s.visual_actions!.find(a=>a.kind==='update')!,a=api();
 const before=a.dialogueFrame(s,update.start_frame-1),after=a.dialogueFrame(s,update.start_frame+12);
 assert.equal(before.value,'等待消息');assert.equal(before.previous,undefined);
 assert.equal(after.value,'取消订单');assert.equal(after.previous,'等待消息');assert.equal(after.updateProgress,1);
 assert.ok(!after.messages.some((m:{id:string})=>m.id===update.source));
});
test('only explicit source-bound connections move and cannot leak future endpoints',()=>{
 const s=scene(),action=s.visual_actions!.find(a=>a.kind==='connect')!,a=api();
 assert.equal(a.dialogueFrame(s,action.start_frame-1).connections[0].progress,0);
 const active=a.dialogueFrame(s,action.start_frame+6);assert.equal(active.connections[0].progress,.5);assert.equal(active.transfers.length,1);
});
test('remaining narration boundary reveals caption-by-caption, not the full future conclusion',()=>{
 const s=scene();s.narration.text+='先澄清，不执行。';s.captions=[{text:'先澄清，',start_frame:300,end_frame:330},{text:'不执行。',start_frame:330,end_frame:360}];
 const a=api();assert.equal(a.dialogueFrame(s,299).boundary,'');assert.equal(a.dialogueFrame(s,300).boundary,'先澄清，');assert.equal(a.dialogueFrame(s,330).boundary,'先澄清，不执行。');
});
test('a repeated phrase is matched to its own source occurrence, not a later boundary',()=>{
 const s=scene();s.narration.text+='订单A，再澄清。';s.captions=[{text:'订单A',start_frame:300,end_frame:330},{text:'订单A',start_frame:330,end_frame:350},{text:'再澄清。',start_frame:350,end_frame:360}];
 assert.equal(api().dialogueFrame(s,300).boundary,'');assert.equal(api().dialogueFrame(s,330).boundary,'订单A');
});
test('multiple updates follow frame time rather than array position',()=>{
 const s=scene(),late=s.visual_actions!.find(a=>a.kind==='update')!,early=s.elements.find(e=>e.id===s.dialogue!.messages[0])!;
 s.visual_actions!.push({kind:'update',target:s.dialogue!.state,source:early.id,cue:early.cue,start_frame:s.animations.find(a=>a.target===early.id)!.start_frame,duration_frames:12});
 assert.equal(api().dialogueFrame(s,late.start_frame+12).value,'取消订单');assert.equal(api().dialogueFrame(s,late.start_frame+12).previous,'订单A');
});
test('direct seek equals replay and no scene mutation occurs',()=>{
 const s=scene(),copy=structuredClone(s),a=api(),late=a.dialogueFrame(s,350);
 const snapshot=(f:ReturnType<typeof a.dialogueFrame>)=>({...f,opacity:Object.fromEntries(s.elements.map(e=>[e.id,f.opacity(e.id)]))});
 a.dialogueFrame(s,0);assert.deepEqual(snapshot(a.dialogueFrame(s,350)),snapshot(late));assert.deepEqual(s,copy);
 assert.throws(()=>a.dialogueFrame({...s,dialogue:undefined},20),/requires_dialogue/);
});
test('long Unicode states and messages fit shared rendering text rectangles',()=>{
 const s=scene(),sources=new Set(s.visual_actions!.filter(a=>a.kind==='update').map(a=>a.source));s.elements.forEach(e=>e.content=e.id===s.dialogue!.state||sources.has(e.id)?'长🙂'.repeat(8):'长🙂'.repeat(20));
 for(const b of api().dialogueTextBoxes(s,350)){assert.ok(b.fontSize>=30);assert.ok(b.x>=120&&b.x+b.width<=1800&&b.y+b.height<=920);assert.ok(b.lines.length*b.fontSize*1.35<=b.height);}
});
