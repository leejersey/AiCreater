import test from 'node:test';
import assert from 'node:assert/strict';
import {teachingStructures} from '../src/teaching-plan';
import {designInputHash} from '../src/design-content';
import {buildTeachingSchedule,TeachingScheduleError} from '../src/teaching-schedule';
import {teachingBrief as brief,teachingCues as cues,teachingExample} from './fixtures/teaching-examples';

test('all six structures produce bound deterministic non-renderable schedules without coordinates',()=>{
 for(const structure of teachingStructures){
  const plan=teachingExample(structure),schedule=buildTeachingSchedule(plan,brief,cues);
  assert.deepEqual(schedule,buildTeachingSchedule(plan,brief,cues));
  assert.equal(schedule.renderable,false);assert.equal(schedule.accepted,false);
  assert.deepEqual(schedule.pending,['layout','routes','motion','render-review']);
  assert.match(schedule.scheduleSha256,/^[a-f0-9]{64}$/);assert.match(schedule.assetSha256,/^[a-f0-9]{64}$/);
  assert.equal(schedule.inputSha256,plan.inputSha256);
  assert.equal(new Set(schedule.objectIds).size,plan.objects.length);
  assert.equal(new Set(schedule.events.map(e=>e.id)).size,schedule.events.length);
  for(const event of schedule.events){
   const cue=cues.find(c=>c.id===event.cueId)!;
   assert.ok(Number.isInteger(event.startFrame)&&Number.isInteger(event.endFrame));
   assert.ok(event.startFrame>=cue.startFrame&&event.endFrame<=cue.endFrame&&event.endFrame>event.startFrame);
   assert.ok(schedule.objectIds.includes(event.objectId));
  }
  assert.doesNotMatch(JSON.stringify(schedule),/"(x|y|tsx|source|artwork|path)":/);
  assert.ok(Object.isFrozen(schedule)&&Object.isFrozen(schedule.events));
 }
});

test('filter and composition expand all real payload identities without generating clones',()=>{
 const filter=buildTeachingSchedule(teachingExample('filter'),brief,cues);
 const moves=filter.events.filter(e=>e.kind==='transport');
 assert.deepEqual(moves.map(e=>[e.objectId,e.targetId,e.reason]),[['paper','keep','select'],['other','bin','discard']]);
 const composition=buildTeachingSchedule(teachingExample('composition'),brief,cues);
 assert.deepEqual(composition.events.filter(e=>e.kind==='transport').map(e=>[e.objectId,e.targetId]),[['paper','bag'],['other','bag']]);
 assert.deepEqual(composition.topology.groups,[['paper','other','bag']]);
});

test('loop transports retain the same identity and each previous destination',()=>{
 const schedule=buildTeachingSchedule(teachingExample('loop'),brief,cues);
 assert.deepEqual(schedule.events.map(e=>[e.objectId,e.fromId,e.targetId]),[['paper','paper','a'],['paper','a','b'],['paper','b','a']]);
 assert.deepEqual(schedule.topology.groups,[['a','b']]);
 assert.equal(schedule.topology.closed,true);
});

test('state transitions preserve source states and gaps hold the previous result',()=>{
 const schedule=buildTeachingSchedule(teachingExample('state-change'),brief,cues);
 assert.deepEqual(schedule.events.map(e=>[e.fromState,e.toState]),[['idle','processing'],['processing','emitting']]);
 assert.deepEqual(schedule.holds,[{startFrame:0,endFrame:6},{startFrame:54,endFrame:60},{startFrame:114,endFrame:120}]);
});

test('too-short cues fail before any executable or partial render artifact is returned',()=>{
 const short=[{...cues[0],endFrame:16},cues[1]],plan=teachingExample('composition');plan.inputSha256=designInputHash(brief,short);
 assert.throws(()=>buildTeachingSchedule(plan,brief,short),(e:unknown)=>e instanceof TeachingScheduleError&&e.code==='timing');
});

test('unsupported multi-structure actions and disconnected flow are rejected, never simplified',()=>{
 const mixed=teachingExample('comparison');mixed.objects.push({id:'machine',component:'container',meaning:'machine',label:'machine',ownerId:null,initialState:'empty'});
 mixed.beats[1].actions.push({kind:'transfer',objectId:'left',targetId:'machine'});
 assert.throws(()=>buildTeachingSchedule(mixed,brief,cues),/unsupported/);
 const flow=teachingExample('flow');flow.objects.push({id:'other',component:'document',meaning:'other',label:'other',ownerId:null,initialState:'waiting'},{id:'bag',component:'wallet',meaning:'bag',label:'bag',ownerId:null,initialState:'empty'});
 flow.relations.push({kind:'flow',from:'other',to:'bag',label:''});
 assert.throws(()=>buildTeachingSchedule(flow,brief,cues),/chain/);
});

test('schedules cannot consume the same combined input twice or accept non-root ownership',()=>{
 const combined=teachingExample('composition');combined.beats[1].actions=[combined.beats[0].actions[0]];
 assert.throws(()=>buildTeachingSchedule(combined,brief,cues),/unsupported|combined/);
 const owned=teachingExample('state-change');owned.objects.push({id:'part',component:'indicator',meaning:'part',label:'part',ownerId:'machine',initialState:'idle'});
 assert.throws(()=>buildTeachingSchedule(owned,brief,cues),/ownership/);
});

test('event capacity and changed timeline binding fail without a partial success result',()=>{
 const longBrief={...brief,narration:'X'.repeat(17),durationInFrames:1020};
 const longCues=Array.from({length:17},(_,i)=>({id:'cue-'+i,text:'X',startFrame:i*60,endFrame:(i+1)*60}));
 const plan=teachingExample('flow');plan.inputSha256=designInputHash(longBrief,longCues);
 plan.beats=longCues.map((cue,i)=>({cueId:cue.id,actions:[i===0?{kind:'transfer',objectId:'paper',targetId:'machine'}:{kind:'hold',objectId:'machine'},...Array.from({length:7},()=>({kind:'hold' as const,objectId:'machine'}))]}));
 assert.throws(()=>buildTeachingSchedule(plan,longBrief,longCues),(e:unknown)=>e instanceof TeachingScheduleError&&e.code==='capacity');
 assert.throws(()=>buildTeachingSchedule(teachingExample('flow'),brief,[{...cues[0],endFrame:53},cues[1]]),/binding/);
});

test('100 bounded schedules preserve exact cue coverage, no overlap and stable frozen hashes',()=>{
 for(let seed=0;seed<100;seed++){
  const plan=teachingExample('flow');plan.objects[0].label='Item '+seed;
  for(let i=0;i<seed%6;i++)plan.beats[0].actions.push({kind:'highlight',objectId:'machine'});
  for(let i=0;i<(seed+1)%6;i++)plan.beats[1].actions.push({kind:'hold',objectId:'machine'});
  const schedule=buildTeachingSchedule(plan,brief,cues);
  for(const cue of cues){
   const events=schedule.events.filter(e=>e.cueId===cue.id);
   assert.equal(events[0].startFrame,cue.startFrame);assert.equal(events.at(-1)!.endFrame,cue.endFrame);
   for(let i=1;i<events.length;i++)assert.equal(events[i].startFrame,events[i-1].endFrame);
  }
  const hash=schedule.scheduleSha256;plan.objects[0].label='Changed';assert.equal(schedule.scheduleSha256,hash);
  assert.notEqual(buildTeachingSchedule(plan,brief,cues).scheduleSha256,hash);
 }
});
