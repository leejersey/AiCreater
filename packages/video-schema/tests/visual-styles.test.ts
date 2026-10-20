import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseProject,validateProject} from '../src/validate';
import {validProject,codeProject} from './fixture';
import {layoutElements} from '../../video-components/src/layout';
import {formSteps,updateStep} from '../../../apps/web/lib/editor';

test('legacy and three style IDs validate; arbitrary theme does not',()=>{
  for(const theme of ['tech_explainer','tech_multicolor','light_teaching','color_infographic'])assert.doesNotThrow(()=>parseProject({...validProject(),theme}));
  assert.ok(validateProject({...validProject(),theme:'url(https://evil)'}).length);
});
test('display metadata validates with Unicode ranges and literal source labels',()=>{
  const p=validProject();Object.assign(p.scenes[0].elements[0],{icon:'document',step:1,highlight:{text_start:0,text_end:2},source_label:'规则',panel_style:'conclusion'});
  assert.equal(validateProject(p).length,0);
  for(const fields of [{icon:'<svg>'},{step:true},{highlight:{text_start:0,text_end:3}},{highlight:{text_start:1,text_end:1}},{source_label:'虚构来源'},{source_label:'规则\u200b'},{panel_style:'topic'}]){
    const raw=validProject();Object.assign(raw.scenes[0].elements[0],fields);assert.ok(validateProject(raw).length,JSON.stringify(fields));
  }
  const raw=codeProject();Object.assign(raw.scenes[0].elements[0],{icon:'code'});assert.ok(validateProject(raw).length);
});
test('enriched layout preserves all content and reserves labels without overlap',()=>{
  for(const type of ['title_reveal','card_sequence','flow_diagram','comparison_panel'] as const){
    const s=parseProject(validProject()).scenes[0];s.type=type;
    s.elements=Array.from({length:type==='title_reveal'?1:6},(_,i)=>({id:`e${i}`,content:'字'.repeat(type==='title_reveal'?30:40),cue:{text_start:0,text_end:1},icon:'document',step:i+1,source_label:'字',panel_style:'conclusion'}));
    for(const box of layoutElements(s)){
      assert.equal(box.lines.join(''),s.elements.find(e=>e.id===box.id)!.content);
      assert.ok(box.lines.length*box.fontSize*1.35+96<=box.height-32,`${type}/${box.id}`);
      assert.ok(box.y+box.height<=900);
    }
  }
});
test('editor adds and removes display fields without touching role, IDs or cue',()=>{
  const step={id:'a',content:'规则',role:'topic',cue:{text_start:2,text_end:4}};
  const changed=updateStep(JSON.stringify([step]),0,{icon:'search',step:1,source_label:'规则',panel_style:'conclusion',highlight:{text_start:0,text_end:2}});
  assert.equal(formSteps(changed)[0].icon,'search');assert.equal(formSteps(changed)[0].role,'topic');
  assert.deepEqual(formSteps(changed)[0].cue,step.cue);
  assert.equal(formSteps(updateStep(changed,0,{icon:undefined}))[0].icon,undefined);
});
