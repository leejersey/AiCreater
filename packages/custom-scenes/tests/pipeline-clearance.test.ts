import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pipelineMotion} from '../../../examples/custom-scenes/repaired-rag-clearance/motion';

test('assembled payload clears unrelated machines for the entire transfer, including strokes and curl',()=>{
 const obstacles=[{x:510,y:330,width:240,height:420},{x:830,y:300,width:260,height:420}];
 for(let f=500;f<=654;f++){
  const m=pipelineMotion(f),box={x:m.roll.x-4,y:m.roll.y-10,right:m.roll.x+124,bottom:m.roll.y+190};
  for(const o of obstacles)assert.ok(box.right<=o.x-12||box.x>=o.x+o.width+12||box.bottom<=o.y-12||box.y>=o.y+o.height+12,`clearance failure at ${f}`);
  assert.ok(box.y>=0&&box.bottom<=980,`caption boundary failure at ${f}`);
 }
});
test('transfer follows the displayed three-leg route and reaches the dock inside the measured cue',()=>{
 for(let f=500;f<=654;f++){
  const {roll}=pipelineMotion(f),x=roll.x+60,y=roll.y+85;
  assert.ok(Math.abs(x-390)<1e-8||Math.abs(y-859)<1e-8||Math.abs(x-1240)<1e-8,`route deviation at ${f}`);
 }
 assert.deepEqual(pipelineMotion(654).roll,{x:1180,y:500});
 assert.deepEqual(pipelineMotion(672).roll,pipelineMotion(654).roll);
});
test('releasing after attachment does not introduce jumps, premature output or detached context',()=>{
 for(let f=0;f<938;f++){
  const m=pipelineMotion(f);
  for(const p of [m.roll,m.fragment,m.hand])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(f){const previous=pipelineMotion(f-1);for(const key of ['roll','fragment','hand'] as const)assert.ok(Math.hypot(m[key].x-previous[key].x,m[key].y-previous[key].y)<18,`${key} jump at ${f}`);}
  if(f>=500){assert.ok(Math.abs(m.fragment.x-m.roll.x-30)<1e-8);assert.ok(Math.abs(m.fragment.y-m.roll.y-90)<1e-8);}
  if(f<=790)assert.equal(m.answerProgress,0);
  if(f<673)assert.ok(m.roll.x+120<=1458);
 }
 for(let f=310;f<=500;f++)assert.equal(pipelineMotion(f).jawOpen,0);
 assert.equal(pipelineMotion(778).slotSealed,false);
 assert.ok(pipelineMotion(778).roll.x>=1470);
});
test('the standalone source binds tested motion, route and explicit tray intake without execution',async()=>{
 const helper=(await readFile('examples/custom-scenes/repaired-rag-clearance/motion.ts','utf8')).replace('export function pipelineMotion','function pipelineMotion').trim();
 const source=await readFile('examples/custom-scenes/repaired-rag-clearance/Scene.tsx','utf8');
 assert.ok(source.includes(helper));assert.match(source,/id="route-transfer"/);
 assert.match(source,/M 390 555 V 859 H 1240 V 585/);
 assert.match(source,/data-part="tray-intake"/);
 assert.match(source,/frame>=500&&frame<=654\?'route-transfer'/);
 assert.equal((source.match(/data-object="doc-fragment"/g)||[]).length,1);
});
