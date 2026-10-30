import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMotionPlan,evaluateMotion} from '../src/motion-plan';
const pose=(frame:number,x:number,y=0)=>({frame,x,y,scale:1,opacity:1});
function fixture():any{return {schemaVersion:'motion-plan:2',durationInFrames:40,tracks:[
 {id:'carrier',keys:[pose(0,0),pose(10,100),pose(20,200),pose(30,300)]},
 {id:'fragment',keys:[pose(0,5),pose(10,105),pose(15,999),pose(20,205),pose(30,205,100)],attachments:[{startFrame:10,endFrame:20,parentId:'carrier',offset:{x:5,y:0,scale:1,opacity:1}}]},
 {id:'mark',parentId:'fragment',keys:[pose(0,2,3)]},
]};}
test('timed attachment uses parent world pose, ignores free keys while held and releases continuously',()=>{
 const plan=parseMotionPlan(fixture());
 assert.equal(evaluateMotion(plan,15).fragment.x,155);
 assert.equal(evaluateMotion(plan,15).mark.x,157);
 assert.equal(evaluateMotion(plan,20).fragment.x,205);
 assert.equal(evaluateMotion(plan,30).fragment.y,100);
 for(const frame of [9,10,11,19,20,21,15,0,39,10])assert.deepEqual(evaluateMotion(plan,frame),evaluateMotion(plan,frame));
});
test('reject discontinuous attach/release, missing parents, ambiguous overlaps and time-dependent cycles',()=>{
 const changes=[
  (v:any)=>v.tracks[1].attachments[0].offset.x=6,
  (v:any)=>v.tracks[1].keys[3].x=206,
  (v:any)=>v.tracks[1].attachments[0].offset.scale=0.5,
  (v:any)=>v.tracks[1].attachments[0].offset.opacity=0.5,
  (v:any)=>v.tracks[1].attachments[0].parentId='missing',
  (v:any)=>v.tracks[1].attachments.push({...v.tracks[1].attachments[0],startFrame:19,endFrame:25}),
  (v:any)=>v.tracks[1].attachments[0].endFrame=10,
  (v:any)=>v.tracks[1].attachments[0].startFrame=10.5,
  (v:any)=>v.tracks[1].parentId='carrier',
  (v:any)=>v.tracks[0].parentId='fragment',
  (v:any)=>v.schemaVersion='motion-plan:1',
 ];
 for(const change of changes){const v=fixture();change(v);assert.throws(()=>parseMotionPlan(v),/motion_plan/);}
});
test('a final attachment may continue to the exclusive duration boundary and inherits scale/opacity',()=>{
 const v=fixture();v.tracks[1].attachments[0].endFrame=40;
 const plan=parseMotionPlan(v);
 assert.equal(evaluateMotion(plan,39).fragment.x,305);
 const scaled={schemaVersion:'motion-plan:2',durationInFrames:30,tracks:[
  {id:'carrier',keys:[{frame:0,x:10,y:20,scale:2,opacity:0.5}]},
  {id:'child',keys:[{frame:0,x:16,y:28,scale:1,opacity:0.25}],attachments:[{startFrame:0,endFrame:30,parentId:'carrier',offset:{x:3,y:4,scale:0.5,opacity:0.5}}]},
 ]};
 assert.deepEqual(evaluateMotion(parseMotionPlan(scaled),15).child,{x:16,y:28,scale:1,opacity:0.25});
});
