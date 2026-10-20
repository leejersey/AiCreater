import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import demo from '../../../examples/demo.json';
import {VersionHistory, VersionContent} from '../app/VersionHistory';
import * as history from '../app/VersionHistory';
import type {VideoProject} from '../../../packages/video-schema/src/types';
import type {ChangeSummary} from '../lib/version-changes';
import {visualStyles} from '../../../packages/video-components/src/theme';

const frozen=()=>({id:'v2',project_id:'p',revision:2,dsl:structuredClone(demo) as VideoProject,profile:{visual_style:{id:'whiteboard' as const,tokens:structuredClone(visualStyles.whiteboard)}}});
const versionPage=()=>({items:[{id:'v2',project_id:'p',revision:2,theme:'tech_explainer',scene_count:3},{id:'v1',project_id:'p',revision:1,theme:'tech_explainer',scene_count:1}],next_before_revision:null});

test('new frozen response derives a safe ID and reuses full frozen validation unchanged',()=>{
  assert.equal(typeof history.parseCreatedVersion,'function');const v=frozen(),before=structuredClone(v);
  assert.equal(history.parseCreatedVersion(v,'p',2),v);assert.deepEqual(v,before);
});

test('new frozen response rejects unsafe IDs, ownership, revision and corrupt snapshots before render',()=>{
  assert.equal(typeof history.parseCreatedVersion,'function');
  for(const value of [null,[],{},...['','../other','v?x=1','v#hash',' v '].map(id=>({...frozen(),id})),{...frozen(),project_id:'other'},{...frozen(),revision:1},{...frozen(),dsl:null},{...frozen(),profile:{visual_style:{}}}])assert.throws(()=>history.parseCreatedVersion(value,'p',2),/冻结/);
});

test('version page preserves valid descending rows and readonly metadata',()=>{
  assert.equal(typeof history.parseVersionPage,'function');const page=versionPage(),before=structuredClone(page);
  assert.equal(history.parseVersionPage(page,'p'),page);assert.deepEqual(page,before);
  assert.deepEqual(history.parseVersionPage({items:[],next_before_revision:null},'p'),{items:[],next_before_revision:null});
});

test('version page rejects malformed shape, fields, ownership, IDs and duplicate rows',()=>{
  assert.equal(typeof history.parseVersionPage,'function');
  for(const value of [null,[],{}, {items:{},next_before_revision:null}])assert.throws(()=>history.parseVersionPage(value,'p'),/版本列表格式错误/);
  for(const patch of [{id:'../other'},{id:'v?x=1'},{id:''},{project_id:'other'},{revision:0},{revision:'2'},{theme:{}},{scene_count:-1},{scene_count:NaN}]){
    const page=versionPage();Object.assign(page.items[0],patch);assert.throws(()=>history.parseVersionPage(page,'p'),/版本列表格式错误/);
  }
  const page=versionPage();page.items[1]={...page.items[0]};assert.throws(()=>history.parseVersionPage(page,'p'),/版本列表格式错误/);
});

test('version cursor must match last revision and strictly advance across pages',()=>{
  assert.equal(typeof history.parseVersionPage,'function');
  for(const next_before_revision of [undefined,'1',0,NaN,2,3])assert.throws(()=>history.parseVersionPage({...versionPage(),next_before_revision},'p'),/版本列表格式错误/);
  assert.throws(()=>history.parseVersionPage(versionPage(),'p',2),/版本列表格式错误/);
  assert.throws(()=>history.parseVersionPage({items:[],next_before_revision:1},'p'),/版本列表格式错误/);
  const page={...versionPage(),next_before_revision:1};assert.equal(history.parseVersionPage(page,'p',3),page);
});

test('frozen detail accepts its selected identity and unchanged legacy or frozen style metadata',()=>{
  assert.equal(typeof history.parseVersion,'function');const v=frozen(),before=structuredClone(v);
  assert.equal(history.parseVersion(v,'p','v2',2),v);assert.deepEqual(v,before);
  const legacy={...v,profile:null};assert.equal(history.parseVersion(legacy,'p','v2',2),legacy);
});

test('frozen detail rejects mismatched identity/revision and invalid DSL before rendering',()=>{
  assert.equal(typeof history.parseVersion,'function');
  for(const value of [null,[],{}, {...frozen(),id:'other'},{...frozen(),project_id:'other'},{...frozen(),revision:3},{...frozen(),dsl:null},{...frozen(),dsl:{scenes:null}}])assert.throws(()=>history.parseVersion(value,'p','v2',2),/冻结版本格式错误/);
  const v=frozen();Reflect.set(v.dsl.scenes[0].narration,'text',{});assert.throws(()=>history.parseVersion(v,'p','v2',2),/冻结版本格式错误/);
});

test('bad frozen style is rejected without leaking profile or substituting current defaults',()=>{
  assert.equal(typeof history.parseVersion,'function');
  for(const profile of [[],42,{visual_style:{}},{visual_style:{id:'toString',tokens:{}}},{visual_style:{id:'whiteboard',tokens:{label:{secret:'DO_NOT_SHOW_PROFILE'}}}}]){
    const v={...frozen(),profile};assert.throws(()=>history.parseVersion(v,'p','v2',2),error=>error instanceof Error&&error.message==='冻结版本格式错误，已有详情未改变，请手动重试。');
  }
});

test('frozen version exposes only its own style label and explicit historical legacy fallback',()=>{
  const version={id:'v',project_id:'p',revision:2,dsl:structuredClone(demo) as VideoProject,profile:{visual_style:{id:'whiteboard' as const,tokens:structuredClone(visualStyles.whiteboard)},voice:{speaker:'DO_NOT_SHOW_PROFILE'}}};
  const html=renderToStaticMarkup(createElement(VersionContent,{version}));
  assert.match(html,/冻结风格：白板线稿（whiteboard）/);assert.doesNotMatch(html,/DO_NOT_SHOW_PROFILE|<select/);
  const old=renderToStaticMarkup(createElement(VersionContent,{version:{...version,profile:undefined}}));assert.match(old,/legacy（历史版本未单独记录）/);
});

test('history starts folded and cannot edit or imply known dates',()=>{
  const html=renderToStaticMarkup(createElement(VersionHistory,{projectId:'p'}));
  assert.match(html,/版本历史（只读）/);assert.match(html,/创建时间未记录/);
  assert.doesNotMatch(html,/<input|<textarea|回滚|配音（收费）|<details open/);
});

test('history explains bounded reads and manual retry without claiming a task cancellation',()=>{
  const html=renderToStaticMarkup(createElement(VersionHistory,{projectId:'p'}));
  assert.match(html,/列表、详情和比较读取最多等待5秒/);assert.match(html,/手动重试/);
  assert.match(html,/不取消后台任务/);assert.doesNotMatch(html,/自动重试|<input|<textarea/);
});

test('snapshot content displays original manuscript, code and all scene data without profile',()=>{
  const dsl=structuredClone(demo) as VideoProject;
  dsl.scenes[0]={...dsl.scenes[0],type:'code_walkthrough',code:{language:'python',source:'print("fixture")'}};
  const version={id:'v',project_id:'p',revision:1,dsl,profile:{voice:{speaker:'DO_NOT_SHOW_PROFILE'}}};
  const html=renderToStaticMarkup(createElement(VersionContent,{version}));
  assert.match(html,/只读冻结版本 r1/);assert.match(html,/tech_explainer/);
  assert.ok(html.includes(demo.scenes[0].narration.text));
  assert.ok(html.includes('flow_diagram'));assert.ok(html.includes('&quot;edges&quot;'));
  assert.ok(html.includes('print'));assert.doesNotMatch(html,/DO_NOT_SHOW_PROFILE|<input|<textarea/);
});

test('comparison summary is readonly and labels the captured revisions and fields',()=>{
  assert.equal(typeof history.VersionChanges,'function');
  const html=renderToStaticMarkup(createElement(history.VersionChanges,{oldRevision:1,currentRevision:4,summary:{themeChanged:false,scenes:[{id:'flow',type:'flow_diagram',kind:'changed',beforePosition:3,afterPosition:3,changes:['连线']}]}}));
  assert.match(html,/r1/);assert.match(html,/r4/);assert.match(html,/连线/);
  assert.match(html,/未保存输入/);assert.match(html,/配音/);assert.doesNotMatch(html,/<input|<textarea|回滚|保存按钮/);
});

test('empty comparison does not claim identical audio and unsafe IDs remain text',()=>{
  assert.equal(typeof history.VersionChanges,'function');
  const empty=renderToStaticMarkup(createElement(history.VersionChanges,{oldRevision:1,currentRevision:4,summary:{themeChanged:false,scenes:[]}}));
  assert.match(empty,/本摘要覆盖的教学字段无变化/);assert.doesNotMatch(empty,/版本完全一致/);
  const html=renderToStaticMarkup(createElement(history.VersionChanges,{oldRevision:1,currentRevision:4,summary:{themeChanged:true,scenes:[{id:'<img src=x>',type:'card_sequence',kind:'added',afterPosition:1,changes:[]}]}}));
  assert.match(html,/主题变化/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
});

test('field values unfold as escaped readonly text with captured revisions and explicit empties',()=>{
  const summary:ChangeSummary={themeChanged:false,scenes:[{id:'flow',type:'flow_diagram',kind:'changed',changes:['口播','代码','连线'],values:[
    {label:'口播',before:'<img src=x onerror=alert(1)>',after:''},
    {label:'代码',before:null,after:'print("fixture")'},
    {label:'连线',before:'[]',after:'[{"from":"a","to":"b"}]'}]}]};
  const html=renderToStaticMarkup(createElement(history.VersionChanges,{oldRevision:1,currentRevision:4,summary}));
  assert.match(html,/<summary>口播：旧值与已保存新值<\/summary>/);
  assert.match(html,/aria-label="flow 口播 旧值"/);assert.match(html,/aria-label="flow 代码 新值"/);
  assert.match(html,/旧冻结 r1/);assert.match(html,/本次读取的已保存 r4/);
  assert.match(html,/（空文本）/);assert.match(html,/（未设置）/);assert.match(html,/\[\]/);
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<input|<textarea|回滚|恢复按钮/);
  assert.match(html,/逐字高亮/);
});

test('untrusted snapshot strings render as text, not HTML',()=>{
  const dsl=structuredClone(demo) as VideoProject;dsl.scenes[0].narration.text='<img src=x onerror=alert(1)>';
  const html=renderToStaticMarkup(createElement(VersionContent,{version:{id:'v',project_id:'p',revision:1,dsl}}));
  assert.ok(html.includes('&lt;img'));assert.doesNotMatch(html,/<img src=x|onerror="/);
});
