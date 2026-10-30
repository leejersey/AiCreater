import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMotionPlan, evaluateMotion, motionTransforms} from '../src/motion-plan';

const input=()=>({schemaVersion:'motion-plan:1',durationInFrames:60,tracks:[
 {id:'payload',keys:[{frame:0,x:10,y:20,scale:1,opacity:1},{frame:10,x:10,y:20,scale:1,opacity:1},{frame:30,x:110,y:80,scale:0.5,opacity:1},{frame:59,x:110,y:80,scale:0.5,opacity:1}]},
 {id:'fragment',parentId:'payload',keys:[{frame:0,x:30,y:40,scale:1,opacity:1}]},
]});

test('deterministic tracks hold through pauses and clamp seek positions',()=>{
 const plan=parseMotionPlan(input());
 assert.deepEqual(evaluateMotion(plan,-1),evaluateMotion(plan,0));
 assert.deepEqual(evaluateMotion(plan,9),evaluateMotion(plan,0));
 assert.equal(evaluateMotion(plan,20).payload.x,60);
 assert.deepEqual(evaluateMotion(plan,59),evaluateMotion(plan,100));
 assert.deepEqual(evaluateMotion(plan,30),evaluateMotion(plan,30));
 assert.throws(()=>evaluateMotion(plan,NaN),/frame/);
});

test('a rigid child derives world pose from its parent without a second drawable identity',()=>{
 const plan=parseMotionPlan(input());
 for(let frame=0;frame<60;frame++){
  const m=evaluateMotion(plan,frame);
  assert.equal(m.fragment.x,m.payload.x+30*m.payload.scale);
  assert.equal(m.fragment.y,m.payload.y+40*m.payload.scale);
  assert.equal(m.fragment.scale,m.payload.scale);
 }
});

test('the host produces actual world transforms, so illustration code need not recalculate coordinates',()=>{
 const plan=parseMotionPlan(input());
 assert.deepEqual(motionTransforms(plan,30),{
  payload:{transform:'translate(110 80) scale(0.5)',opacity:1},
  fragment:{transform:'translate(125 100) scale(0.5)',opacity:1},
 });
});

test('reject malformed and ambiguous plans before evaluation',()=>{
 const mutations=[
  (v:any)=>v.tracks.push(v.tracks[0]),
  (v:any)=>v.tracks[0].keys[1].frame=0,
  (v:any)=>v.tracks[0].keys[0].frame=1,
  (v:any)=>v.tracks[0].keys[1].x=Infinity,
  (v:any)=>v.tracks[0].keys[1].scale=0,
  (v:any)=>v.tracks[0].keys[1].opacity=1.1,
  (v:any)=>v.tracks[0].keys[1].frame=60,
  (v:any)=>v.tracks[0].parentId='fragment',
  (v:any)=>v.tracks[1].parentId='missing',
  (v:any)=>v.tracks[0].extra='ignored',
  (v:any)=>v.tracks[0].keys[1].ease='custom',
  (v:any)=>v.tracks[0].keys=[],
  (v:any)=>v.tracks[0].id='__proto__',
 ];
 for(const mutate of mutations){const v=input();mutate(v);assert.throws(()=>parseMotionPlan(v),/motion_plan/);}
});

test('plan parsing copies and freezes input so later data mutation cannot change motion',()=>{
 const v=input(),plan=parseMotionPlan(v);
 v.tracks[0].keys[0].x=999;
 assert.equal(evaluateMotion(plan,0).payload.x,10);
 assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(plan.tracks[0].keys[0]));
});
