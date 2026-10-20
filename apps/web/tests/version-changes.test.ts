import {test} from 'node:test';
import assert from 'node:assert/strict';
import demo from '../../../examples/demo.json';
import type {VideoProject} from '../../../packages/video-schema/src/types';
import type {Project} from '../lib/editor';
import {summarizeVersionChanges} from '../lib/version-changes';
import * as changes from '../lib/version-changes';

function fixture(){
  const old=structuredClone(demo) as VideoProject;
  const {scenes,...config}=structuredClone(old);
  const current:Project={id:'p',title:'fixture',revision:4,source_text:'',config,scenes:scenes.map((scene,i)=>({id:'database-row-'+i,revision:1,state:'ready',scene}))};
  return {old,current};
}

test('saved comparison accepts unfinished drafts without audio, timing or duration requirements',()=>{
  assert.equal(typeof changes.compareSavedVersion,'function');const {old,current}=fixture();
  for(const row of current.scenes){row.state='needs_voice';delete row.scene.duration_frames;delete row.scene.narration.audio_asset_id;Reflect.deleteProperty(row.scene,'captions');Reflect.deleteProperty(row.scene,'animations');}
  current.config.assets=[];const before=structuredClone(current),result=changes.compareSavedVersion(old,current,'p');
  assert.deepEqual(result,{revision:4,summary:{themeChanged:false,scenes:[]}});assert.deepEqual(current,before);
  current.scenes=[];assert.equal(changes.compareSavedVersion(old,current,'p').summary.scenes.length,old.scenes.length);
});

test('saved comparison rejects wrong owner or unsafe revision without exposing response fields',()=>{
  assert.equal(typeof changes.compareSavedVersion,'function');
  for(const patch of [{id:'other'},{revision:0},{revision:NaN},{revision:'4'},{revision:{secret:'DO_NOT_SHOW'}}]){
    const {old,current}=fixture();Object.assign(current,patch);
    assert.throws(()=>changes.compareSavedVersion(old,current,'p'),error=>error instanceof Error&&error.message==='已保存稿格式错误，原比较结果与输入保留，请手动重试。');
  }
});

test('saved comparison rejects malformed config or row collections before creating renderable summary',()=>{
  assert.equal(typeof changes.compareSavedVersion,'function');
  for(const patch of [{config:null},{config:[]},{config:{theme:{}}},{scenes:null},{scenes:{}},{scenes:[null]},{scenes:[{scene:null}]}]){
    const {old,current}=fixture();Object.assign(current,patch);assert.throws(()=>changes.compareSavedVersion(old,current,'p'),/已保存稿格式错误/);
  }
  for(const value of [null,undefined,[],{}])assert.throws(()=>changes.compareSavedVersion(fixture().old,value,'p'),/已保存稿格式错误/);
});

test('saved comparison rejects object text/type, unsafe steps, code and edge fields',()=>{
  assert.equal(typeof changes.compareSavedVersion,'function');
  for(const patch of [{id:{}},{type:{}},{narration:{text:{}}},{elements:{}},{elements:[{id:'e',content:{},cue:{text_start:0,text_end:1}}]},{code:{language:'python',source:{}}},{edges:[{from:{},to:'x'}]}]){
    const {old,current}=fixture();Object.assign(current.scenes[0].scene,patch);assert.throws(()=>changes.compareSavedVersion(old,current,'p'),/已保存稿格式错误/);
  }
});

test('saved comparison rejects duplicate teaching IDs and never mutates the rejected response',()=>{
  assert.equal(typeof changes.compareSavedVersion,'function');const {old,current}=fixture();current.scenes[1].scene.id=current.scenes[0].scene.id;const before=structuredClone(current);
  assert.throws(()=>changes.compareSavedVersion(old,current,'p'),/已保存稿格式错误/);assert.deepEqual(current,before);
});

test('saved comparison captures exact field values but not unrelated profile data',()=>{
  assert.equal(typeof changes.compareSavedVersion,'function');const {old,current}=fixture();current.scenes[0].scene.narration.text='  <script>🙂</script>\n新口播  ';Object.assign(current,{profile:{secret:'DO_NOT_SHOW'}});
  const result=changes.compareSavedVersion(old,current,'p');assert.equal(result.summary.scenes[0].values?.[0].after,current.scenes[0].scene.narration.text);assert.ok(!JSON.stringify(result).includes('DO_NOT_SHOW'));
  current.scenes[0].scene.narration.text='later';assert.notEqual(result.summary.scenes[0].values?.[0].after,'later');
});

test('same teaching data ignores object key order without modifying inputs',()=>{
  const {old,current}=fixture();current.scenes[0].scene.elements[0]=Object.fromEntries(Object.entries(current.scenes[0].scene.elements[0]).reverse()) as typeof old.scenes[0]['elements'][0];
  const before=JSON.stringify({old,current});
  assert.deepEqual(summarizeVersionChanges(old,current),{themeChanged:false,scenes:[]});
  assert.equal(JSON.stringify({old,current}),before);
});
test('added and removed scenes do not mislabel remaining relative order',()=>{
  const {old,current}=fixture();const first=old.scenes[0].id;
  current.scenes.shift();const newRow=structuredClone(current.scenes[0]);newRow.scene.id='new_scene';current.scenes.unshift(newRow);
  const result=summarizeVersionChanges(old,current);
  assert.deepEqual(result.scenes.map(s=>[s.id,s.kind]),[['new_scene','added'],[first,'removed']]);
});
test('common relative order changes are reported with absolute positions',()=>{
  const {old,current}=fixture();[current.scenes[0],current.scenes[1]]=[current.scenes[1],current.scenes[0]];
  const result=summarizeVersionChanges(old,current);
  assert.deepEqual(result.scenes.map(s=>s.changes),[['顺序'],['顺序']]);assert.equal(result.scenes[0].beforePosition,2);assert.equal(result.scenes[0].afterPosition,1);
});
test('manuscript and code changes are independent of database row IDs',()=>{
  const {old,current}=fixture();current.scenes[0].scene.narration.text+='新稿';current.scenes[0].scene.code={language:'python',source:'print(1)'};
  assert.deepEqual(summarizeVersionChanges(old,current).scenes[0].changes,['口播','代码']);
});
test('type steps structure timeline and chart use teaching values',()=>{
  const {old,current}=fixture();const s=current.scenes[0].scene;
  s.type='card_sequence';s.elements[0].content+='变化';s.structure={kind:'array',name:'nums'};s.timeline={duration_ms:100,lanes:[]};
  // Source-only fixture exercises comparison, not final DSL validation.
  Object.assign(s,{chart:{kind:'bar',rows:[{id:'x',label:'x',values:[1]}]}});
  assert.deepEqual(summarizeVersionChanges(old,current).scenes[0].changes,['类型','步骤','数据结构','执行时间线','图表']);
});
test('flow edge order is ignored but changed connections are detected',()=>{
  const {old,current}=fixture();const row=current.scenes.find(s=>s.scene.type==='flow_diagram')!;
  row.scene.edges=[...row.scene.edges!].reverse();assert.deepEqual(summarizeVersionChanges(old,current).scenes,[]);
  row.scene.edges=[];assert.deepEqual(summarizeVersionChanges(old,current).scenes[0].changes,['连线']);
});
test('derived audio captions timing assets and row state do not imply teaching changes',()=>{
  const {old,current}=fixture();Object.assign(current.scenes[0].scene,{duration_frames:1,captions:[],animations:[]});current.scenes[0].scene.narration.audio_asset_id='new_audio';current.scenes[0].state='needs_timing';current.config.assets=[];
  assert.deepEqual(summarizeVersionChanges(old,current),{themeChanged:false,scenes:[]});
});
test('legacy theme and absent edges use documented defaults',()=>{
  const {old,current}=fixture();Reflect.deleteProperty(old,'theme');current.config.theme='tech_explainer';delete old.scenes[0].edges;current.scenes[0].scene.edges=[];
  assert.deepEqual(summarizeVersionChanges(old,current),{themeChanged:false,scenes:[]});current.config.theme='light_teaching';assert.equal(summarizeVersionChanges(old,current).themeChanged,true);
});
test('empty saved manuscript marks old scenes removed',()=>{
  const {old,current}=fixture();current.scenes=[];
  assert.equal(summarizeVersionChanges(old,current).scenes.length,old.scenes.length);assert.ok(summarizeVersionChanges(old,current).scenes.every(s=>s.kind==='removed'));
  old.scenes=[];assert.deepEqual(summarizeVersionChanges(old,current),{themeChanged:false,scenes:[]});
});
test('changed manuscript and code capture exact isolated field text without private extras',()=>{
  const {old,current}=fixture();const scene=current.scenes[0].scene;
  scene.narration.text='  新稿\n第二行  ';scene.code={language:'python',source:'print(1)\nprint(2)',array_name:'nums'};
  Object.assign(scene.code,{profile:'DO_NOT_SHOW_PROFILE'});
  const before=JSON.stringify({old,current});const result=summarizeVersionChanges(old,current);
  const values=result.scenes[0].values;
  assert.deepEqual(values,[{label:'口播',before:old.scenes[0].narration.text,after:scene.narration.text},
    {label:'代码',before:null,after:JSON.stringify({language:'python',source:'print(1)\nprint(2)',array_name:'nums'},null,2)}]);
  assert.equal(JSON.stringify({old,current}),before);const saved=JSON.stringify(values);
  scene.code.source='later';scene.narration.text='later';assert.equal(JSON.stringify(values),saved);
});
test('cleared code and edges distinguish unset and legal empty connections',()=>{
  const {old,current}=fixture();const i=old.scenes.findIndex(s=>s.type==='flow_diagram');
  old.scenes[i].code={language:'python',source:''};current.scenes[i].scene.narration.text='';current.scenes[i].scene.edges=[];
  const values=summarizeVersionChanges(old,current).scenes[0].values;
  assert.equal(values?.find(v=>v.label==='口播')?.after,'');
  assert.equal(values?.find(v=>v.label==='代码')?.before,JSON.stringify({language:'python',source:''},null,2));
  assert.equal(values?.find(v=>v.label==='代码')?.after,null);
  assert.deepEqual(values?.find(v=>v.label==='连线'),{label:'连线',before:JSON.stringify(old.scenes[i].edges,null,2),after:'[]'});
});
test('other categories and scene additions do not invent three-field values',()=>{
  const {old,current}=fixture();current.scenes[0].scene.elements[0].content+='变化';
  const added=structuredClone(current.scenes[0]);added.scene.id='extra';current.scenes.push(added);
  const result=summarizeVersionChanges(old,current);assert.ok(result.scenes.every(s=>s.values===undefined));
});

test('duplicate business IDs fail clearly on either side',()=>{
  const {old,current}=fixture();current.scenes[1].scene.id=current.scenes[0].scene.id;assert.throws(()=>summarizeVersionChanges(old,current),/重复/);
  const second=fixture();second.old.scenes[1].id=second.old.scenes[0].id;assert.throws(()=>summarizeVersionChanges(second.old,second.current),/重复/);
});
