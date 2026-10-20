import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {validateProject} from '../src/validate';
import {validProject, codeProject} from './fixture';

function python(value: unknown) {
  const r=spawnSync('python3',['packages/video-schema/validate.py','-'],{input:JSON.stringify(value),encoding:'utf8'});
  assert.ok(r.status===0||r.status===1,r.stderr);return JSON.parse(r.stdout).validation_errors;
}
for(const type of ['card_sequence','title_reveal']) test(`topic accepted by both validators: ${type}`,()=>{
  const p=validProject();p.scenes[0].type=type;
  if(type==='title_reveal'){p.scenes[0].elements.pop();p.scenes[0].animations.pop();}
  Object.assign(p.scenes[0].elements[0],{role:'topic'});
  assert.deepEqual(validateProject(p),[]);assert.deepEqual(python(p),[]);
});
test('multiple topics rejected by both semantic validators',()=>{
  const p=validProject();p.scenes[0].elements.forEach(e=>Object.assign(e,{role:'topic'}));
  assert.ok(validateProject(p).some(e=>e.code==='topic_count'));
  assert.ok(python(p).some((e:{code:string})=>e.code==='topic_count'));
});
for(const type of ['flow_diagram','comparison_panel','code_walkthrough']) test(`topic forbidden in ${type}`,()=>{
  const p=type==='code_walkthrough'?codeProject():validProject();p.scenes[0].type=type;
  if(type==='flow_diagram')Object.assign(p.scenes[0],{edges:[]});
  Object.assign(p.scenes[0].elements[0],{role:'topic'});
  assert.ok(validateProject(p).length);assert.ok(python(p).length);
});
for(const field of ['output','variables','code_lines','items','active_item_ids','event']) test(`topic cannot carry ${field}`,()=>{
  const p=validProject();Object.assign(p.scenes[0].elements[0],{role:'topic',[field]:field==='output'?'5':[]});
  assert.ok(validateProject(p).length);assert.ok(python(p).length);
});
test('unknown role rejected',()=>{
  const p=validProject();Object.assign(p.scenes[0].elements[0],{role:'result'});
  assert.ok(validateProject(p).length);assert.ok(python(p).length);
});
