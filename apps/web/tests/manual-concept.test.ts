import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manualConceptElements, cueSteps, updateStep} from '../lib/editor';
import type {Element} from '../../../packages/video-schema/src/types';

type Step=Pick<Element,'content'|'concept_role'>;
const text='🙂先举例：水杯落地。重力是物体受到的引力。方向指向地心。';
const steps:Step[]=[{content:'水杯落地',concept_role:'example'},{content:'重力是物体受到的引力',concept_role:'definition'},{content:'方向指向地心',concept_role:'feature'}];
test('manual concept creates exact Unicode-bound excerpts without reordering or rewriting',()=>{
 const before=structuredClone(steps),elements=manualConceptElements(text,steps);
 assert.deepEqual(steps,before);assert.deepEqual(elements.map(e=>e.concept_role),['example','definition','feature']);
 for(const e of elements)assert.equal([...text].slice(e.cue.text_start,e.cue.text_end).join(''),e.content);
 assert.equal(elements[0].cue.text_start,5);assert.equal(new Set(elements.map(e=>e.id)).size,3);
 assert.deepEqual(JSON.parse(cueSteps(JSON.stringify(elements),text,'concept')),elements);
});
test('manual concept rejects blank, ambiguous, absent, reversed and oversized excerpts',()=>{
 for(const input of [[],Array.from({length:7},()=>steps[0]),[{content:'',concept_role:'definition'}],
  [{content:' ',concept_role:'definition'}],[{content:'不存在',concept_role:'definition'}],
  [{content:'概'.repeat(41),concept_role:'definition'}],steps.slice().reverse(),
  steps.map(e=>({...e,concept_role:'feature'})),steps.map(e=>({...e,concept_role:'definition'})),
  [{content:steps[1].content,concept_role:'definition'},...steps.map(e=>({...e,concept_role:'summary'}))],
  [{content:steps[1].content,concept_role:'constructor'}]]){
  assert.throws(()=>manualConceptElements(text,input as Step[]));
 }
 assert.throws(()=>manualConceptElements('相同。相同。',[{content:'相同',concept_role:'definition'}]),/唯一/);
});
test('role edits permit a valid definition swap but block missing definitions and duplicate summaries',()=>{
 const elements=manualConceptElements(text,steps),raw=JSON.stringify(elements);
 const invalid=updateStep(raw,0,{concept_role:'definition'});
 assert.throws(()=>cueSteps(invalid,text,'concept'),/定义/);
 const swapped=updateStep(invalid,1,{concept_role:'feature'});
 assert.equal(JSON.parse(cueSteps(swapped,text,'concept'))[0].concept_role,'definition');
 const summary=updateStep(updateStep(raw,0,{concept_role:'summary'}),2,{concept_role:'summary'});
 assert.throws(()=>cueSteps(summary,text,'concept'),/总结/);
});
