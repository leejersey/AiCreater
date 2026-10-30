import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildRagMotionAssembly,ragMotionDesignHash} from '../../../examples/custom-scenes/motion-rag/fixture';
import {designHash,parseDesign} from '../src/design';
import {evaluateMotion} from '../src/motion-plan';
import {assembleMotionScene} from '../src/motion-assembly';
import {checkMotionBindings} from '../src/motion-bindings';
import {pipelineMotion} from '../../../examples/custom-scenes/repaired-rag-clearance/motion';

async function fixture(){return parseDesign(JSON.parse(await readFile('examples/custom-scenes/motion-rag/design.json','utf8')));}
test('RAG fixture is bound to the frozen brief/design, with one identity throughout handoff',async()=>{
 const design=await fixture();assert.equal(designHash(design),ragMotionDesignHash);
 const input=buildRagMotionAssembly(design);
 assert.deepEqual(input.brief,design.brief);assert.equal(input.plan.durationInFrames,938);
 assert.equal(input.layers.filter(l=>l.id==='doc-fragment').length,1);
 const artifact=await assembleMotionScene(input);checkMotionBindings(artifact.source,input.plan.tracks.map(t=>t.id));
 const changed={...design,thesis:'Changed'};
 assert.throws(()=>buildRagMotionAssembly(changed),/frozen_design/);
});
test('trusted RAG trajectories preserve grasp anchor, rigid attachment, release, pauses and continuous seek',async()=>{
 const {plan}=buildRagMotionAssembly(await fixture());
 for(let frame=0;frame<938;frame++){
  const m=evaluateMotion(plan,frame),baseline=pipelineMotion(frame);
  assert.ok(Math.abs(m['question-roll'].x-baseline.roll.x)<1e-7);
  // The new opening is a straight lift/carry, not the baseline's extra 14px arc.
  assert.ok(Math.abs(m['question-roll'].y-baseline.roll.y)<=14+1e-7);
  for(const key of ['x','y','scale'] as const)assert.ok(Math.abs(m['doc-fragment'][key]-baseline.fragment[key])<1e-7,`fragment ${key} at ${frame}`);
  if(frame>=282&&frame<=500){assert.ok(Math.abs(m.hand.x-m['doc-fragment'].x-60*m['doc-fragment'].scale)<1e-7);assert.ok(Math.abs(m.hand.y-m['doc-fragment'].y)<1e-7);}
  if(frame>=500){assert.ok(Math.abs(m['doc-fragment'].x-m['question-roll'].x-30)<1e-7);assert.ok(Math.abs(m['doc-fragment'].y-m['question-roll'].y-90)<1e-7);}
  if(frame>=310&&frame<=500){assert.equal(m['jaw-left'].x,m.hand.x-8);assert.equal(m['jaw-right'].x,m.hand.x+8);}
  if(frame<=790)assert.equal(m['answer-sheet'].opacity,0);
  if(frame){const p=evaluateMotion(plan,frame-1);for(const id of ['question-roll','doc-fragment','hand'])assert.ok(Math.hypot(m[id].x-p[id].x,m[id].y-p[id].y)<18,`${id} jump ${frame}`);}
 }
 assert.deepEqual(evaluateMotion(plan,654)['question-roll'],evaluateMotion(plan,672)['question-roll']);
 assert.equal(evaluateMotion(plan,530)['jaw-left'].x,evaluateMotion(plan,530).hand.x-26);
 assert.equal(evaluateMotion(plan,560).hand.x,630);
 assert.equal(evaluateMotion(plan,842)['answer-sheet'].opacity,1);
});
test('whole payload clears shelf and gantry during all transfer frames and stays above captions',async()=>{
 const {plan}=buildRagMotionAssembly(await fixture());
 for(let frame=500;frame<=654;frame++){
  const roll=evaluateMotion(plan,frame)['question-roll'];
  const box={left:roll.x-4,right:roll.x+124,top:roll.y-10,bottom:roll.y+190};
  for(const o of [{x:510,y:330,w:240,h:420},{x:830,y:300,w:260,h:420}])assert.ok(box.right<=o.x-12||box.left>=o.x+o.w+12||box.bottom<=o.y-12||box.top>=o.y+o.h+12,`collision ${frame}`);
  assert.ok(box.bottom<=980,`caption ${frame}`);
 }
});
