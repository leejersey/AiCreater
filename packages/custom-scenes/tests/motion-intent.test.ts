import test from 'node:test';
import assert from 'node:assert/strict';
import {compileMotionIntent} from '../src/motion-intent';
import {evaluateMotion,parseMotionPlan} from '../src/motion-plan';

const pose=(x=0,y=0,scale=1,opacity=1)=>({x,y,scale,opacity});
const input=()=>({schemaVersion:'motion-intent:1',durationInFrames:60,anchors:[
 {id:'home',pose:pose(100,100)}, {id:'destination',pose:pose(300,200)},
],objects:[{id:'payload',initialAnchor:'home',actions:[{kind:'move',startFrame:10,endFrame:30,targetAnchor:'destination'}]}]});

test('named-target moves hold, interpolate and produce an immutable legacy plan',()=>{
 const raw=input(),before=JSON.stringify(raw),plan=compileMotionIntent(raw);
 assert.equal(plan.schemaVersion,'motion-plan:2');assert.deepEqual(parseMotionPlan(plan),plan);
 assert.deepEqual(evaluateMotion(plan,9).payload,pose(100,100));
 assert.deepEqual(evaluateMotion(plan,20).payload,pose(200,150));
 assert.deepEqual(evaluateMotion(plan,59).payload,pose(300,200));
 assert.equal(JSON.stringify(raw),before);raw.anchors[0].pose.x=999;
 assert.deepEqual(evaluateMotion(plan,0).payload,pose(100,100));
 assert.ok(Object.isFrozen(plan.tracks[0].keys));
});

const carry=()=>({schemaVersion:'motion-intent:1',durationInFrames:938,anchors:[
 {id:'sleeve-home',pose:pose(500,500)}, {id:'sleeve-end',pose:pose(1000,500)},
 {id:'a-home',pose:pose(100,100)}, {id:'b-home',pose:pose(220,100)},
 {id:'port-a',objectId:'sleeve',pose:pose(-100,30)},
 {id:'port-b',objectId:'sleeve',pose:pose(10,30)},
],objects:[
 {id:'fragment-a',initialAnchor:'a-home',actions:[
  {kind:'move',startFrame:300,endFrame:430,targetAnchor:'port-a'},
  {kind:'attach',frame:430,parentId:'sleeve'}, {kind:'release',frame:600},
 ]},
 {id:'fragment-b',initialAnchor:'b-home',actions:[
  {kind:'move',startFrame:300,endFrame:430,targetAnchor:'port-b'},
  {kind:'attach',frame:430,parentId:'sleeve'}, {kind:'release',frame:600},
 ]},
 {id:'sleeve',initialAnchor:'sleeve-home',actions:[{kind:'move',startFrame:440,endFrame:560,targetAnchor:'sleeve-end'}]},
]});

test('host derives frame-430 handoffs and release poses, independent of object order',()=>{
 const raw=carry(),plan=compileMotionIntent(raw);
 assert.deepEqual(evaluateMotion(plan,430)['fragment-a'],pose(400,530));
 assert.deepEqual(evaluateMotion(plan,430)['fragment-b'],pose(510,530));
 assert.deepEqual(evaluateMotion(plan,600)['fragment-a'],pose(900,530));
 assert.deepEqual(evaluateMotion(plan,937)['fragment-b'],pose(1010,530));
 for(let frame=430;frame<600;frame++){
  const m=evaluateMotion(plan,frame);
  assert.equal(m['fragment-a'].x,m.sleeve.x-100);
  assert.equal(m['fragment-b'].x,m.sleeve.x+10);
 }
 raw.objects.reverse();const reordered=compileMotionIntent(raw);
 for(const frame of [0,429,430,500,599,600,937])assert.deepEqual(evaluateMotion(plan,frame),evaluateMotion(reordered,frame));
});

test('nested parent motion, scale and opacity are composed and released by the host',()=>{
 const raw={schemaVersion:'motion-intent:1',durationInFrames:60,anchors:[
  {id:'root-home',pose:pose(100,100,2,0.5)}, {id:'root-end',pose:pose(300,200,3,0.25)},
  {id:'hand-home',objectId:'root',pose:pose(10,20)},
  {id:'paper-home',objectId:'hand',pose:pose(5,5,0.5)},
 ],objects:[
  {id:'paper',initialAnchor:'paper-home',actions:[{kind:'attach',frame:0,parentId:'hand'},{kind:'release',frame:40}]},
  {id:'hand',initialAnchor:'hand-home',actions:[{kind:'attach',frame:0,parentId:'root'}]},
  {id:'root',initialAnchor:'root-home',actions:[{kind:'move',startFrame:10,endFrame:30,targetAnchor:'root-end'}]},
 ]};
 const plan=compileMotionIntent(raw);
 assert.deepEqual(evaluateMotion(plan,0).paper,pose(130,150,1,0.5));
 assert.deepEqual(evaluateMotion(plan,40).paper,pose(345,275,1.5,0.25));
 assert.deepEqual(evaluateMotion(plan,59).paper,evaluateMotion(plan,40).paper);
 assert.equal(plan.tracks.find(t=>t.id==='hand')!.attachments![0].endFrame,60);
});

test('moving to a moving target samples the named port at arrival',()=>{
 const raw=carry();
 raw.objects[2].actions=[{kind:'move',startFrame:300,endFrame:430,targetAnchor:'sleeve-end'}];
 const plan=compileMotionIntent(raw);
 assert.deepEqual(evaluateMotion(plan,430)['fragment-a'],pose(900,530));
});

test('release and attach to another object at the same frame remain continuous',()=>{
 const raw=carry() as any;
 raw.objects[0].actions.push({kind:'attach',frame:600,parentId:'fragment-b'},{kind:'release',frame:700});
 const plan=compileMotionIntent(raw);
 assert.deepEqual(evaluateMotion(plan,600)['fragment-a'],pose(900,530));
 assert.deepEqual(evaluateMotion(plan,700)['fragment-a'],pose(900,530));
});

test('reject malformed, unsafe, missing and cyclic dependencies without changing legacy validation',()=>{
 const mutations=[
  (v:any)=>v.extra=true,
  (v:any)=>v.schemaVersion='motion-plan:2',
  (v:any)=>v.durationInFrames=0,
  (v:any)=>v.anchors[0].pose.scale=0,
  (v:any)=>v.anchors[0].pose.x=NaN,
  (v:any)=>v.anchors[0].pose.transform='translate(1 2)',
  (v:any)=>v.anchors.push(v.anchors[0]),
  (v:any)=>v.objects.push(v.objects[0]),
  (v:any)=>v.objects[0].id='__proto__',
  (v:any)=>v.objects[0].initialAnchor='missing',
  (v:any)=>v.objects[0].actions[0].targetAnchor='missing',
  (v:any)=>v.anchors[0].objectId='payload',
  (v:any)=>v.anchors[0].objectId='missing',
  (v:any)=>v.objects[0].actions[0].endFrame=60,
  (v:any)=>v.objects[0].actions[0].startFrame=30,
  (v:any)=>v.objects[0].actions[0].endFrame=30.5,
  (v:any)=>v.objects[0].actions.push({...v.objects[0].actions[0],startFrame:20}),
  (v:any)=>v.objects[0].actions.push({kind:'release',frame:40}),
  (v:any)=>v.objects[0].actions.push({kind:'attach',frame:40,parentId:'missing'}),
  (v:any)=>v.objects[0].actions[0].source='code',
 ];
 for(const mutate of mutations){const raw=input();mutate(raw);assert.throws(()=>compileMotionIntent(raw),/motion_intent/);}
});

test('reject ambiguous operations while attached and noninvertible parent opacity',()=>{
 const mutations=[
  (v:any)=>v.objects[0].actions.push({kind:'move',startFrame:450,endFrame:500,targetAnchor:'a-home'}),
  (v:any)=>v.objects[0].actions.splice(2,0,{kind:'attach',frame:500,parentId:'sleeve'}),
  (v:any)=>v.objects[0].actions[2].frame=430,
  (v:any)=>v.anchors[0].pose.opacity=0,
 ];
 for(const mutate of mutations){const raw=carry();mutate(raw);assert.throws(()=>compileMotionIntent(raw),/motion_intent/);}
});

test('compiled keys and attachments obey existing output budgets at their boundaries',()=>{
 const raw=input() as any;raw.durationInFrames=200;
 raw.objects[0].actions=Array.from({length:60},(_,i)=>({kind:'move',startFrame:i*2,endFrame:i*2+1,targetAnchor:'destination'}));
 assert.equal(compileMotionIntent(raw).tracks[0].keys.length,120);
 raw.objects[0].actions=raw.objects[0].actions.map((a:any)=>({...a,startFrame:a.startFrame+1,endFrame:a.endFrame+1}));
 assert.throws(()=>compileMotionIntent(raw),/motion_intent: motion_plan: invalid keys/);
 const attached=input() as any;attached.durationInFrames=200;
 attached.objects.push({id:'parent',initialAnchor:'home',actions:[]});
 const cycles=(count:number)=>Array.from({length:count},(_,i)=>[
  {kind:'attach',frame:i*2+1,parentId:'parent'}, {kind:'release',frame:i*2+2},
 ]).flat();
 attached.objects[0].actions=cycles(16);
 assert.equal(compileMotionIntent(attached).tracks.find(t=>t.id==='payload')!.attachments!.length,16);
 attached.objects[0].actions=cycles(17);
 assert.throws(()=>compileMotionIntent(attached),/motion_intent: motion_plan: invalid attachments/);
});

test('relative scale and opacity are derived without clamping unrepresentable offsets',()=>{
 const raw={schemaVersion:'motion-intent:1',durationInFrames:60,anchors:[
  {id:'parent-home',pose:pose(0,0,2,0.8)}, {id:'child-home',pose:pose(100,100,1,0.4)},
 ],objects:[
  {id:'parent',initialAnchor:'parent-home',actions:[]},
  {id:'child',initialAnchor:'child-home',actions:[{kind:'attach',frame:1,parentId:'parent'},{kind:'release',frame:10}]},
 ]};
 const plan=compileMotionIntent(raw),attachment=plan.tracks.find(t=>t.id==='child')!.attachments![0];
 assert.deepEqual(attachment.offset,pose(50,50,0.5,0.5));
 assert.deepEqual(evaluateMotion(plan,10).child,pose(100,100,1,0.4));
 raw.anchors[1].pose.opacity=0.9;
 assert.throws(()=>compileMotionIntent(raw),/motion_intent: invalid number/);
});

test('the legacy parser still rejects authored discontinuous handoffs',()=>{
 assert.throws(()=>parseMotionPlan({schemaVersion:'motion-plan:2',durationInFrames:60,tracks:[
  {id:'parent',keys:[{frame:0,...pose()}]},
  {id:'child',keys:[{frame:0,...pose(10)}],attachments:[{startFrame:5,endFrame:10,parentId:'parent',offset:pose()}]},
 ]}),/discontinuous handoff child at 5/);
});
