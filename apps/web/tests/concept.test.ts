import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseProject} from '../../../packages/video-schema/src/validate';
import {conceptProject} from '../../../packages/video-schema/tests/concept-fixture';
import {SceneEditor} from '../app/SceneEditor';
import {formSteps,updateStep,cueSteps,scenePatch,type Project} from '../lib/editor';
import {CourseOverview} from '../app/CourseOverview';

function overviewProject():Project {
  const {scenes,...config}=parseProject(conceptProject());
  return {id:'p',title:'概念核对',revision:1,source_text:scenes[0].narration.text,config,scenes:scenes.map(scene=>({id:'row-'+scene.id,revision:1,state:'ready',scene}))};
}
function overview(project:Project,dirty=false,busy=false,reviews=new Set<string>()) {
  return renderToStaticMarkup(createElement(CourseOverview,{project,jobs:[],reviews,dirty,busy,onSelect:()=>{},onReview:()=>{},onSubmit:()=>{},onTiming:()=>{}}));
}

test('course review shows saved concept roles and exact cue excerpts without rewriting data',()=>{
  const p=overviewProject(),before=structuredClone(p),html=overview(p);
  for(const label of ['定义','特征','例证','总结'])assert.ok(html.includes(`教学角色：${label}`));
  for(const e of p.scenes[0].scene.elements)assert.ok(html.includes(`<mark>${e.content}</mark>`));
  assert.match(html,/Unicode码点/);assert.match(html,/已保存稿/);assert.deepEqual(p,before);
});

test('course review uses Unicode code points and escapes step text instead of interpreting markup',()=>{
  const p=overviewProject(),s=p.scenes[0].scene;s.type='card_sequence';s.narration.text='A😀<script>x</script>';
  s.elements=[{id:'e',content:'<img src=x onerror=alert(1)>',cue:{text_start:1,text_end:2}}];
  const html=overview(p);assert.match(html,/<mark>😀<\/mark>/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.doesNotMatch(html,/教学角色：/);
});

test('invalid saved cue produces a readable warning rather than crashing or inventing an excerpt',()=>{
  for(const cue of [undefined,null,{text_start:-1,text_end:2},{text_start:0,text_end:999},{text_start:0,text_end:0},{text_start:0,text_end:NaN}]){
    const p=overviewProject();Reflect.set(p.scenes[0].scene.elements[0],'cue',cue);
    const html=overview(p);assert.match(html,/范围无效，请定位章节修正后再确认/);
    assert.ok(!html.includes(`<mark>${p.scenes[0].scene.elements[0].content}</mark>`));
  }
});

test('readonly review never confirms automatically and retains dirty/busy confirmation guards',()=>{
  const p=overviewProject(),reviews=new Set<string>();
  Reflect.set(p.scenes[0].scene.elements[0],'concept_role','toString');
  for(const [dirty,busy] of [[true,false],[false,true]]){
    const html=overview(p,dirty,busy,reviews);assert.match(html,/未记录或无效/);
    assert.match(html,/<input type="checkbox" disabled=""/);assert.doesNotMatch(html,/checked=""/);
  }
  assert.equal(reviews.size,0);
});

test('concept form displays readonly teaching roles and preserves them in existing save patches',()=>{
  const scene=parseProject(conceptProject()).scenes[0],steps=JSON.stringify(scene.elements);
  const html=renderToStaticMarkup(createElement(SceneEditor,{projectId:'p',row:{id:'row',revision:1,state:'ready',scene},disabled:false,onDirty:()=>{},save:async()=>{},act:async()=>{}}));
  for(const label of ['定义','特征','例证','总结'])assert.ok(html.includes(`教学角色：${label}`));
  assert.match(html,/只读/);
  const changed=updateStep(steps,0,{content:'保持原有运动状态'});
  assert.equal(formSteps(changed)[0].concept_role,'definition');
  const patch=scenePatch(scene,scene.narration.text,'',changed);
  assert.equal(patch.elements[0].concept_role,'definition');
  assert.deepEqual(Object.keys(patch).sort(),['elements','narration_text']);
});
test('concept advanced JSON rejects unknown roles and cue edits enforce source excerpts and order',()=>{
  const scene=parseProject(conceptProject()).scenes[0],steps=JSON.stringify(scene.elements);
  const malformed=structuredClone(scene.elements);Reflect.set(malformed[0],'concept_role','invented');
  assert.throws(()=>formSteps(JSON.stringify(malformed)),/步骤字段/);
  const raw={c0:{text_start:'0',text_end:'2'}};
  assert.throws(()=>cueSteps(steps,scene.narration.text,'concept',raw),/原文|摘录/);
  const backward=structuredClone(scene.elements);backward[1].cue={...backward[0].cue};backward[1].content=backward[0].content;
  assert.throws(()=>cueSteps(JSON.stringify(backward),scene.narration.text,'concept'),/递增/);
  const valid=cueSteps(steps,scene.narration.text,'concept');assert.deepEqual(JSON.parse(valid),scene.elements);
  assert.equal(steps,JSON.stringify(scene.elements));
});
