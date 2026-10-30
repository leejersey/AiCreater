import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pipelineMotion} from '../../../examples/custom-scenes/repaired-rag-pipeline/motion';

test('pipeline motion holds the closed gripper through the retrieval gap',()=>{
 for(let f=310;f<=520;f++)assert.equal(pipelineMotion(f).jawOpen,0);
 assert.equal(pipelineMotion(550).jawOpen,1);
 for(let f=282;f<=520;f++){
  const m=pipelineMotion(f);assert.equal(m.hand.x,m.fragment.x+60*m.fragment.scale);assert.equal(m.hand.y,m.fragment.y);
 }
});
test('one fragment moves continuously through pickup, handoff and attachment',()=>{
 for(let f=1;f<938;f++){
  const a=pipelineMotion(f-1).fragment,b=pipelineMotion(f).fragment;
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<18,`fragment jump at ${f}`);
  assert.ok(Math.abs(a.scale-b.scale)<.02);
 }
 for(let f=520;f<938;f++){
  const m=pipelineMotion(f);assert.ok(Math.abs(m.fragment.x-m.roll.x-30)<1e-9);assert.ok(Math.abs(m.fragment.y-m.roll.y-90)<1e-9);
  assert.equal(m.fragment.scale,.5);
  assert.ok(m.fragment.y>m.roll.y+70,'context stays below the question glyph');
 }
});
test('payload stays outside generator until generation and is fully ingested before answer',()=>{
 for(let f=0;f<673;f++)assert.ok(pipelineMotion(f).roll.x+120<=1470-12);
 assert.ok(pipelineMotion(778).roll.x>=1470);
 assert.ok(pipelineMotion(778).roll.x+120<=1770);
 assert.equal(pipelineMotion(778).slotSealed,false);
 for(let f=0;f<=790;f++)assert.equal(pipelineMotion(f).answerProgress,0);
 assert.equal(pipelineMotion(842).answerProgress,1);
});
test('all poses are deterministic and continuous at measured cue boundaries',()=>{
 for(let f=0;f<938;f++){
  const m=pipelineMotion(f);assert.deepEqual(m,pipelineMotion(f));
  for(const point of [m.roll,m.fragment,m.hand])assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
  if(f){const p=pipelineMotion(f-1);assert.ok(Math.hypot(m.roll.x-p.roll.x,m.roll.y-p.roll.y)<18,`roll jump at ${f}`);}
 }
});
test('standalone source embeds the tested helper without importing or executing generated source',async()=>{
 const helper=(await readFile('examples/custom-scenes/repaired-rag-pipeline/motion.ts','utf8')).replace('export function pipelineMotion','function pipelineMotion').trim();
 const source=await readFile('examples/custom-scenes/repaired-rag-pipeline/Scene.tsx','utf8');
 assert.ok(source.includes(helper));
 assert.equal((source.match(/data-object="doc-fragment"/g)||[]).length,1);
 assert.match(source,/data-object="question-roll"/);
 assert.match(source,/opacity=\{answerProgress > 0 \? 1 : 0\}/);
 assert.match(source,/const motion = pipelineMotion\(frame\)/);
 assert.doesNotMatch(source,/<div/);
 assert.match(source,/rx=\{40\} fill=\{theme.background\}/);
 assert.ok(source.indexOf('data-object="doc-fragment"')<source.lastIndexOf('<Generator'));
 assert.ok(source.indexOf('data-object="answer-sheet"')<source.lastIndexOf('<Generator'));
});
