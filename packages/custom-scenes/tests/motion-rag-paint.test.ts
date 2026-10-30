import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseDesign} from '../src/design';
import {assembleMotionScene} from '../src/motion-assembly';
import {buildRepairedRagAssembly} from '../../../examples/custom-scenes/motion-rag-clearance/fixture';
import {assertRagPaintClearance} from '../../../examples/custom-scenes/motion-rag-paint/clearance';
import {buildPaintSafeRagAssembly} from '../../../examples/custom-scenes/motion-rag-paint/fixture';
async function design(){return parseDesign(JSON.parse(await readFile('examples/custom-scenes/motion-rag/design.json','utf8')));}

test('the approved previous candidate reproduces whole-gripper versus library-heading clearance failure',async()=>{
 const input=buildRepairedRagAssembly(await design());
 assert.throws(()=>assertRagPaintClearance(input),/library_heading/);
});
test('all-frame swept paint checks pass without changing motion, briefing or existing audit references',async()=>{
 const d=await design(),old=buildRepairedRagAssembly(d),input=buildPaintSafeRagAssembly(d);
 assert.deepEqual(input.plan,old.plan);assert.deepEqual(input.brief,old.brief);assert.deepEqual(input.audit,old.audit);
 assert.doesNotThrow(()=>assertRagPaintClearance(input));
 const label=input.layers.find(l=>l.id==='library')!.artwork.find(n=>n.tag==='text')!;
 assert.equal(label.attrs.y,-30);
 await assembleMotionScene(input);
});
test('any decorative line crossing either actual port is rejected, not just changes to the shell',async()=>{
 for(const x of [20,280]){
  const input=buildPaintSafeRagAssembly(await design());
  input.layers.find(l=>l.id==='generator-front')!.artwork.push({tag:'line',attrs:{x1:x,y1:200,x2:x+10,y2:200,stroke:'muted',strokeWidth:2}});
  assert.throws(()=>assertRagPaintClearance(input),/port_paint/);
 }
});
test('unknown painted geometry fails closed rather than silently disappearing from the clearance test',async()=>{
 const input=buildPaintSafeRagAssembly(await design());
 input.layers.find(l=>l.id==='generator-front')!.artwork.push({tag:'path',attrs:{d:'M 20 200 H 100',fill:'none',stroke:'muted',strokeWidth:2}});
 assert.throws(()=>assertRagPaintClearance(input),/unsupported_paint/);
});
