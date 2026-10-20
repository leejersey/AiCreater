import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {validateProject,parseProject} from '../src/validate';
import {conceptProject} from './concept-fixture';

const variants=()=>{
  const cases:ReturnType<typeof conceptProject>[]=[];
  const mutate=(f:(p:ReturnType<typeof conceptProject>)=>void)=>{const p=conceptProject();f(p);cases.push(p);};
  mutate(p=>{Reflect.deleteProperty(p.scenes[0].elements[0],'concept_role');});
  mutate(p=>{p.scenes[0].elements[0].concept_role='feature';});
  mutate(p=>{p.scenes[0].elements[1].concept_role='definition';});
  mutate(p=>{p.scenes[0].elements[1].concept_role='summary';});
  mutate(p=>{p.scenes[0].elements[1].concept_role='invented';});
  mutate(p=>{p.scenes[0].elements[0].content='惯性是一种力';});
  mutate(p=>{p.scenes[0].elements[0].content='é';});
  mutate(p=>{p.scenes[0].elements[1].cue={...p.scenes[0].elements[0].cue};});
  mutate(p=>{p.scenes[0].animations[1].start_frame=12;});
  for(const extra of [{role:'topic'},{icon:'idea'},{step:1},{panel_style:'conclusion'},{code_lines:[1]},{event:{lane_id:'x',start_ms:0,end_ms:1,phase:'wait'}}])mutate(p=>{Object.assign(p.scenes[0].elements[0],extra);});
  mutate(p=>{p.scenes[0].type='card_sequence';});
  mutate(p=>{Object.assign(p.scenes[0],{edges:[]});});
  return cases;
};
test('concept supports original Unicode excerpts, optional support and source-order roles',()=>{
  const p=conceptProject(),before=structuredClone(p);
  assert.deepEqual(validateProject(p),[]);parseProject(p);assert.deepEqual(p,before);
  const minimal=conceptProject();minimal.scenes[0].elements.splice(1);minimal.scenes[0].animations.splice(1);
  assert.deepEqual(validateProject(minimal),[]);
  const exampleFirst=conceptProject();exampleFirst.scenes[0].elements[0].concept_role='example';exampleFirst.scenes[0].elements[2].concept_role='definition';
  assert.deepEqual(validateProject(exampleFirst),[]);
  const unicode=conceptProject(),e=unicode.scenes[0].elements[0];e.content='🙂 e\u0301';e.cue={text_start:2,text_end:7};
  assert.deepEqual(validateProject(unicode),[]);
  e.content='é';assert.ok(validateProject(unicode).length,'normalization must not invent an excerpt');
});
test('concept rejects role misuse, fabricated/normalized excerpts, state fields and out-of-order cues/times',()=>{
  assert.deepEqual(validateProject(conceptProject()),[]);
  for(const p of variants())assert.ok(validateProject(p).length,JSON.stringify(p));
});
test('TS and Python share the concept contract for positive and negative cases',()=>{
  for(const p of [conceptProject(),...variants()]){
    const result=spawnSync('python3',['packages/video-schema/validate.py','-'],{input:JSON.stringify(p),encoding:'utf8',timeout:10000});
    assert.equal(result.error,undefined);const py=JSON.parse(result.stdout);
    assert.equal(py.valid,validateProject(p).length===0,result.stderr);
    if(py.valid)assert.equal(result.status,0);else assert.equal(result.status,1);
  }
});
