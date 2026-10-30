import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTeachingMotion,TeachingMotionError} from '../src/teaching-motion';
import {teachingPayloadAsset,teachingAsset} from '../src/teaching-components';
import {teachingStructures} from '../src/teaching-plan';
import {evaluateMotion} from '../src/motion-plan';
import {teachingExample,teachingBrief as brief,teachingCues as cues} from './fixtures/teaching-examples';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import sharp from 'sharp';
import {TeachingMotionDiagnostic} from '../src/teaching-motion-diagnostic';

test('compact cargo is real host artwork with complete readable text and no scene scaling',()=>{
 const asset=teachingPayloadAsset('waiting','\u76f8\u5173\u4ee3\u7801');
 assert.equal(asset.kind,'document');assert.equal(asset.presentation,'payload');
 assert.equal(asset.bounds.width,108);assert.equal(asset.bounds.height,92);
 assert.equal(asset.text.lines.join(''),'\u76f8\u5173\u4ee3\u7801');assert.ok(asset.text.size>=16);
 assert.ok(asset.back.length>=4);
 assert.throws(()=>teachingPayloadAsset('waiting','\u8fd9'.repeat(40)),/label/);
 for(const kind of ['wallet','container','classifier','loop-node'] as const){
  const state=kind==='classifier'||kind==='loop-node'?'idle':'empty';
  assert.ok(teachingAsset(kind,state,'Target').gateway);
 }
});

test('all six examples compile complete identity-preserving motion without a render pass claim',()=>{
 for(const kind of teachingStructures){
  const plan=teachingExample(kind),result=compileTeachingMotion(plan,brief,cues);
  assert.deepEqual(result,compileTeachingMotion(plan,brief,cues));
  assert.equal(result.renderable,false);assert.equal(result.accepted,false);
  assert.deepEqual(result.pending,['scene-artwork','occlusion-review','render-review']);
  assert.deepEqual(result.motion.tracks.map(t=>t.id).sort(),plan.objects.map(o=>o.id).sort());
  assert.equal(result.verification.frames,brief.durationInFrames);
  assert.match(result.motionSha256,/^[a-f0-9]{64}$/);assert.ok(Object.isFrozen(result));
  for(let frame=0;frame<brief.durationInFrames;frame++)for(const pose of Object.values(evaluateMotion(result.motion,frame))){
   assert.ok(Number.isFinite(pose.x)&&Number.isFinite(pose.y));assert.equal(pose.scale,1);assert.equal(pose.opacity,1);
  }
 }
});

test('loop releases and reattaches the same cargo continuously at each declared receiver',()=>{
 const result=compileTeachingMotion(teachingExample('loop'),brief,cues);
 assert.deepEqual(result.transports.map(t=>[t.objectId,t.sourceId,t.targetId]),[['paper',null,'a'],['paper','a','b'],['paper','b','a']]);
 assert.deepEqual(result.residencies.map(r=>r.receiverId),['a','b','a']);
 const track=result.motion.tracks.find(t=>t.id==='paper')!;
 assert.equal(track.attachments?.length,3);
 assert.equal(track.attachments?.at(-1)?.endFrame,brief.durationInFrames);
 for(const transport of result.transports){
  const end=evaluateMotion(result.motion,transport.endFrame-1).paper;
  assert.equal(end.x,transport.destination.x);assert.equal(end.y,transport.destination.y);
 }
});

test('composition reserves two distinct slots and never creates a replacement document',()=>{
 const result=compileTeachingMotion(teachingExample('composition'),brief,cues);
 const slots=result.residencies.filter(r=>r.receiverId==='bag');
 assert.equal(slots.length,2);assert.notDeepEqual(slots[0].destination,slots[1].destination);
 assert.equal(new Set(result.objects.map(o=>o.id)).size,3);
 assert.ok(result.transports.every(t=>t.points.length>=2));
});

test('a top-entry wallet can release its original cargo into a side-entry classifier',()=>{
 const plan=teachingExample('flow');
 plan.objects.push({id:'bag',component:'wallet',meaning:'bag',label:'bag',ownerId:null,initialState:'empty'});
 plan.relations=[{kind:'flow',from:'paper',to:'bag',label:''},{kind:'flow',from:'bag',to:'machine',label:''}];
 plan.beats[0].actions=[{kind:'transfer',objectId:'paper',targetId:'bag'}];
 plan.beats[1].actions=[{kind:'transfer',objectId:'paper',targetId:'machine'}];
 const result=compileTeachingMotion(plan,brief,cues);
 assert.deepEqual(result.residencies.map(r=>r.receiverId),['bag','machine']);
 assert.equal(result.residencies[0].endFrame,60);
 assert.equal(result.transports[1].sourceId,'bag');
 assert.equal(result.motion.tracks.find(t=>t.id==='paper')?.attachments?.length,2);
});

test('dock capacity or unreadable compact labels fail before any renderable artifact exists',()=>{
 const plan=teachingExample('composition');
 plan.objects.push({id:'third',component:'document',meaning:'third',label:'third',ownerId:null,initialState:'waiting'});
 const action=plan.beats[0].actions[0];if(action.kind==='combine')action.objectIds.push('third');
 assert.throws(()=>compileTeachingMotion(plan,brief,cues),(e:unknown)=>e instanceof TeachingMotionError&&e.code==='capacity');
 const long=teachingExample('flow');long.objects[0].label='\u8fd9'.repeat(20);
 assert.throws(()=>compileTeachingMotion(long,brief,cues),(e:unknown)=>e instanceof TeachingMotionError&&e.code==='payload');
});

test('frozen diagnostic artwork keeps one label per identity and rejects invalid frame requests',()=>{
 const compiled=compileTeachingMotion(teachingExample('composition'),brief,cues);
 for(const frame of [0,29,53,119]){
  const svg=renderToStaticMarkup(React.createElement(TeachingMotionDiagnostic,{compiled,frame}));
  const ids=[...svg.matchAll(/data-label-owner="([^"]+)"/g)].map(m=>m[1]).sort();
  assert.deepEqual(ids,compiled.objects.map(o=>o.id).sort());
  assert.equal((svg.match(/data-object="paper"/g)??[]).length,1);
  assert.doesNotMatch(svg,/<script|<foreignObject|href=|src=/);
 }
 for(const frame of [-1,120,NaN,1.5])assert.throws(()=>renderToStaticMarkup(React.createElement(TeachingMotionDiagnostic,{compiled,frame})),/invalid frame/);
});

test('compact Chinese and wide Latin labels remain inside their text region in actual raster pixels',async()=>{
 for(const label of ['\u76f8\u5173\u4ee3\u7801\u5f53\u524d\u4efb\u52a1','WWWWWW','paper']){
  const {text:t}=teachingPayloadAsset('waiting',label);
  const svg=renderToStaticMarkup(React.createElement('svg',{xmlns:'http://www.w3.org/2000/svg',width:108,height:92},
   ...t.lines.map((line,i)=>React.createElement('text',{key:i,x:t.box.x,y:t.box.y+t.baselineOffset+i*t.lineHeight,fontFamily:'"Noto Sans SC", sans-serif',fontWeight:400,fontSize:t.size,fill:'#ffffff'},line))));
  const {data,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});let count=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*info.channels+3]>20){
   count++;assert.ok(x>=t.box.x&&x<t.box.x+t.box.width&&y>=t.box.y&&y<t.box.y+t.box.height,label+' outside cargo label area');
  }
  assert.ok(count>20);assert.equal(t.lines.join(''),label);assert.ok(t.size>=16);
 }
});

test('short Chinese labels compile across all six structures without topic-specific coordinate edits',()=>{
 for(const kind of teachingStructures){
  const plan=teachingExample(kind);plan.objects.forEach((o,i)=>{o.label='\u5bf9\u8c61'+i;});
  const compiled=compileTeachingMotion(plan,brief,cues);
  assert.deepEqual(compiled.objects.map(o=>o.asset.text.lines.join('')).sort(),plan.objects.map(o=>o.label).sort());
  assert.equal(compiled.verification.frames,120);
 }
});
