import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SceneEditor} from '../app/SceneEditor';
import * as editor from '../lib/editor';
import assert from 'node:assert/strict';
import {parseSteps, readyVideo, scenePatch, canRetime, canPreview, retryMessage, formSteps, updateStep, type Project} from '../lib/editor';
import demo from '../../../examples/demo.json';
import type {VideoProject} from '../../../packages/video-schema/src/types';

test('project list accepts valid summaries and empty lists without changing metadata, order or identity',()=>{
  assert.equal(typeof editor.parseProjectSummaries,'function');
  const projects=[{id:'b',title:'  数组🙂  ',revision:3},{id:'a',title:'<script>纯文本</script>',revision:1}],before=structuredClone(projects);
  assert.equal(editor.parseProjectSummaries(projects),projects);assert.deepEqual(projects,before);assert.deepEqual(editor.parseProjectSummaries([]),[]);
});

test('project list rejects nonarrays rather than treating them as an empty list',()=>{
  assert.equal(typeof editor.parseProjectSummaries,'function');
  for(const value of [null,undefined,{},'projects',42,{items:[]}])assert.throws(()=>editor.parseProjectSummaries(value),/项目列表格式错误/);
});

test('project list rejects missing, blank or wrongly typed IDs and titles before rendering',()=>{
  assert.equal(typeof editor.parseProjectSummaries,'function');
  for(const row of [null,[],42,{}, {id:'',title:'课'},{id:'  ',title:'课'},{id:1,title:'课'},{id:'p'},{id:'p',title:null},{id:'p',title:7},{id:'p',title:'  '}]){
    assert.throws(()=>editor.parseProjectSummaries([{id:'valid',title:'保留'},row]),/项目列表格式错误/);
  }
});

test('project list rejects duplicate IDs as a whole without dropping or rewriting entries',()=>{
  assert.equal(typeof editor.parseProjectSummaries,'function');
  const projects=[{id:'p',title:'第一份'},{id:'p',title:'第二份'}],before=structuredClone(projects);
  assert.throws(()=>editor.parseProjectSummaries(projects),/项目列表格式错误/);assert.deepEqual(projects,before);
});

test('project search matches Chinese and case-insensitive title substrings, ignoring query edge spaces',()=>{
  assert.equal(typeof editor.filterProjects,'function');
  const projects=[{id:'a',title:'Python 数组'},{id:'b',title:'物理🙂入门'},{id:'c',title:'python 复核'}];
  assert.deepEqual(editor.filterProjects(projects,' PYTHON ').map(p=>p.id),['a','c']);
  assert.deepEqual(editor.filterProjects(projects,'物理🙂').map(p=>p.id),['b']);
});

test('project search treats punctuation literally rather than as a regular expression',()=>{
  assert.equal(typeof editor.filterProjects,'function');
  const projects=[{id:'a',title:'A[1].*'},{id:'b',title:'A123'}];
  assert.deepEqual(editor.filterProjects(projects,'[1].*'),[projects[0]]);
});

test('empty project query preserves loaded order and object identity without changing titles',()=>{
  assert.equal(typeof editor.filterProjects,'function');
  const projects=[{id:'b',title:'  原标题  '},{id:'a',title:'第二课'}],before=structuredClone(projects);
  const result=editor.filterProjects(projects,'  ');assert.deepEqual(result,projects);assert.equal(result[0],projects[0]);assert.deepEqual(projects,before);
});

test('project search handles no match and empty loaded list without inventing results',()=>{
  assert.equal(typeof editor.filterProjects,'function');
  assert.deepEqual(editor.filterProjects([{id:'p',title:'数组'}],'不存在'),[]);
  assert.deepEqual(editor.filterProjects([],'数组'),[]);
});

test('chapter title prefers existing topic text without rewriting it or the saved scene',()=>{
  assert.equal(typeof editor.sceneTitle,'function');
  const scene=(structuredClone(demo) as VideoProject).scenes[0];
  scene.elements=[{id:'body',content:'第一步',cue:{text_start:0,text_end:1}},{id:'topic',content:'  数组🙂与循环  ',role:'topic',cue:{text_start:0,text_end:1}}];
  const before=structuredClone(scene);assert.equal(editor.sceneTitle(scene),'  数组🙂与循环  ');assert.deepEqual(scene,before);
});

test('chapter title uses saved chart title then first step, never infers text from narration',()=>{
  assert.equal(typeof editor.sceneTitle,'function');
  const scene=(structuredClone(demo) as VideoProject).scenes[0];
  scene.elements=[{id:'e',content:'第一步内容',cue:{text_start:0,text_end:1}}];
  Reflect.set(scene,'chart',{title:'已有图表标题'});assert.equal(editor.sceneTitle(scene),'已有图表标题');
  Reflect.deleteProperty(scene,'chart');assert.equal(editor.sceneTitle(scene),'第一步内容');
});

test('empty chapter labels fall back to template and finally explicit unnamed text',()=>{
  assert.equal(typeof editor.sceneTitle,'function');
  const scene=(structuredClone(demo) as VideoProject).scenes[0];scene.elements=[];
  assert.equal(editor.sceneTitle(scene),scene.type);Reflect.set(scene,'type','');assert.equal(editor.sceneTitle(scene),'未命名章节');
});

test('running cancellation remains pending until the executor confirms a terminal state',()=>{
  assert.equal(typeof editor.cancellationPending,'function');
  const job:editor.Job={job_id:'j',kind:'voice',state:'running',progress:40,cancel_requested:true};
  const before=structuredClone(job);
  assert.equal(editor.cancellationPending(job),true);
  assert.equal(editor.cancellationPending({...job,state:'cancelled'}),false);
  assert.equal(editor.cancellationPending({...job,state:'succeeded'}),false);
  assert.deepEqual(job,before);
});

test('queued, failed and unknown states never claim a pending executor cancellation',()=>{
  assert.equal(typeof editor.cancellationPending,'function');
  for(const state of ['queued','failed','cancelled','succeeded','unknown'])assert.equal(editor.cancellationPending({job_id:'j',kind:'voice',state,progress:0,cancel_requested:true}),false);
});

test('missing or nonboolean cancellation flag does not claim a submitted request',()=>{
  assert.equal(typeof editor.cancellationPending,'function');
  for(const value of [undefined,false,'true',1,null])assert.equal(editor.cancellationPending({job_id:'j',kind:'voice',state:'running',progress:0,cancel_requested:value} as editor.Job),false);
});

test('cancellation feedback applies to render, generation and local jobs without retries',()=>{
  assert.equal(typeof editor.cancellationPending,'function');
  for(const kind of ['generate','regenerate','voice','timing','render'])assert.equal(editor.cancellationPending({job_id:'j',kind,state:'running',progress:1,cancel_requested:true}),true);
});

test('active task filter includes queued and running even when cancellation is pending',()=>{
  assert.equal(typeof editor.filterJobs,'function');
  const jobs:editor.Job[]=['succeeded','queued','running','cancelled','failed'].map((state,index)=>({job_id:String(index),kind:'voice',state,progress:0,cancel_requested:true}));
  assert.deepEqual(editor.filterJobs(jobs,'active').map(j=>j.state),['queued','running']);
});

test('failed task filter keeps errors regardless of retry permission or old voice',()=>{
  assert.equal(typeof editor.filterJobs,'function');
  const jobs:editor.Job[]=[{job_id:'failed',kind:'voice',state:'failed',progress:0,voice_current:false,error:{message:'历史失败',retryable:false}},{job_id:'cancelled',kind:'render',state:'cancelled',progress:0}];
  assert.deepEqual(editor.filterJobs(jobs,'failed'),[jobs[0]]);
});

test('all task filter retains original order and unknown states without mutating jobs',()=>{
  assert.equal(typeof editor.filterJobs,'function');
  const jobs:editor.Job[]=['generate','regenerate','voice','timing','render'].map((kind,index)=>({job_id:String(index),kind,state:index===0?'future-state':'failed',progress:0}));
  const before=structuredClone(jobs);
  assert.deepEqual(editor.filterJobs(jobs,'all'),jobs);
  editor.filterJobs(jobs,'active');editor.filterJobs(jobs,'failed');
  assert.deepEqual(jobs,before);
});

test('empty task filters remain empty and filtered results preserve row identity',()=>{
  assert.equal(typeof editor.filterJobs,'function');
  for(const filter of ['all','active','failed'] as const)assert.deepEqual(editor.filterJobs([],filter),[]);
  const job:editor.Job={job_id:'j',kind:'render',state:'running',progress:1};
  assert.equal(editor.filterJobs([job],'active')[0],job);
});

test('successful work can remain unapplied without being relabelled failed or retried',()=>{
  assert.equal(typeof editor.jobResultNotice,'function');
  for(const kind of ['generate','voice','timing']){
    const job:editor.Job={job_id:'j',kind,state:'succeeded',progress:100,result:{attached:false}};
    const before=structuredClone(job);
    assert.match(editor.jobResultNotice(job)!,/发布时未应用/);
    assert.match(editor.jobResultNotice(job)!,/不会自动覆盖或重试/);
    assert.deepEqual(job,before);
  }
});

test('applied result refers to publication time, never claims historical result is still current',()=>{
  assert.equal(typeof editor.jobResultNotice,'function');
  for(const kind of ['generate','voice','timing']){
    const message=editor.jobResultNotice({job_id:'j',kind,state:'succeeded',progress:100,result:{attached:true}})!;
    assert.match(message,/发布时已应用/);assert.match(message,/不代表当前稿/);
  }
});

test('missing or malformed result metadata and nonterminal work never claim applied status',()=>{
  assert.equal(typeof editor.jobResultNotice,'function');
  for(const result of [undefined,null,{},[],{attached:'false'},{attached:1}])assert.equal(editor.jobResultNotice({job_id:'j',kind:'voice',state:'succeeded',progress:100,result} as editor.Job),null);
  for(const state of ['queued','running','failed','cancelled'])assert.equal(editor.jobResultNotice({job_id:'j',kind:'voice',state,progress:0,result:{attached:false}}),null);
  for(const kind of ['render','unknown'])assert.equal(editor.jobResultNotice({job_id:'j',kind,state:'succeeded',progress:100,result:{attached:false}}),null);
});

test('candidate result links its review workflow without guessing historical acceptance',()=>{
  assert.equal(typeof editor.jobResultNotice,'function');
  const job:editor.Job={job_id:'j',kind:'regenerate',state:'succeeded',progress:100,result:{candidate_id:'candidate'}};
  assert.match(editor.jobResultNotice(job)!,/独立候选/);assert.match(editor.jobResultNotice(job)!,/是否已接受/);
  assert.doesNotMatch(editor.jobResultNotice(job)!,/尚未接受|尚需接受/);
  for(const candidate_id of ['',undefined,42])assert.equal(editor.jobResultNotice({...job,result:{candidate_id}} as editor.Job),null);
});

test('saved refresh keeps an existing selected scene after reordering or revision changes',()=>{
  assert.equal(typeof editor.selectedSceneId,'function');
  const p=taskProject(),selected=p.scenes[1].id;p.scenes.reverse();p.scenes.find(s=>s.id===selected)!.revision++;
  assert.equal(editor.selectedSceneId(p,selected),selected);
});

test('saved refresh replaces a removed or foreign scene with the first existing database row',()=>{
  assert.equal(typeof editor.selectedSceneId,'function');
  const p=taskProject(),removed=p.scenes.pop()!.id;
  for(const id of [removed,'foreign-scene',p.scenes[0].scene.id])assert.equal(editor.selectedSceneId(p,id),p.scenes[0].id);
});

test('initial selection and an empty saved draft have explicit safe defaults',()=>{
  assert.equal(typeof editor.selectedSceneId,'function');
  const p=taskProject();assert.equal(editor.selectedSceneId(p,''),p.scenes[0].id);
  p.scenes=[];assert.equal(editor.selectedSceneId(p,''),'');assert.equal(editor.selectedSceneId(p,'removed'),'');
});

test('selection reconciliation is read-only and does not change revisions or recover old rows',()=>{
  assert.equal(typeof editor.selectedSceneId,'function');
  const p=taskProject(),before=structuredClone(p);
  editor.selectedSceneId(p,p.scenes[1].id);editor.selectedSceneId(p,'removed');
  assert.deepEqual(p,before);
});

function taskProject():Project {
  const {scenes,...config}=structuredClone(demo) as VideoProject;
  return {id:'project',title:'课程',revision:1,source_text:'',config,scenes:scenes.map((scene,index)=>({id:`row-${index}`,scene,revision:1,state:'ready'}))};
}

test('scene workflow tasks locate existing database scene rows in every task state',()=>{
  assert.equal(typeof editor.jobScene,'function');
  const p=taskProject(),row=p.scenes[1];
  for(const kind of ['regenerate','voice','timing'])for(const state of ['queued','running','succeeded','failed','cancelled']){
    assert.equal(editor.jobScene(p,{job_id:'j',project_id:p.id,kind,state,progress:0,scene_id:row.id}),row);
  }
});

test('single chapter render locates preview_scene_id rather than nullable scene_id',()=>{
  assert.equal(typeof editor.jobScene,'function');
  const p=taskProject(),job:editor.Job={job_id:'j',kind:'render',state:'succeeded',progress:100,scope:'scene',preview_scene_id:p.scenes[1].id,scene_id:null};
  assert.equal(editor.jobScene(p,job),p.scenes[1]);
  assert.equal(editor.jobScene(p,{...job,scene_id:p.scenes[0].id}),p.scenes[1]);
  assert.equal(editor.jobScene(p,{...job,preview_scene_id:undefined}),null);
});

test('course-wide, deleted and foreign tasks never link an unrelated chapter',()=>{
  assert.equal(typeof editor.jobScene,'function');
  const p=taskProject(),base:editor.Job={job_id:'j',kind:'voice',state:'failed',progress:0,scene_id:p.scenes[0].id};
  assert.equal(editor.jobScene(null,base),null);
  assert.equal(editor.jobScene(p,{...base,scene_id:'archived'}),null);
  assert.equal(editor.jobScene(p,{...base,scene_id:p.scenes[0].scene.id}),null);
  assert.equal(editor.jobScene(p,{...base,project_id:'other-project'}),null);
  for(const kind of ['generate','render','unknown'])assert.equal(editor.jobScene(p,{...base,kind}),null);
});

test('task navigation is read-only and does not depend on retry permission or current audio',()=>{
  assert.equal(typeof editor.jobScene,'function');
  const p=taskProject(),job:editor.Job={job_id:'j',kind:'voice',state:'failed',progress:0,scene_id:p.scenes[0].id,voice_current:false,base_revision:0,error:{message:'old',retryable:false}};
  const before=structuredClone({p,job});
  assert.equal(editor.jobScene(p,job),p.scenes[0]);
  assert.deepEqual({p,job},before);
});

test('single-scene render guard and retry stay local',()=>{
  const row={id:'scene',revision:1,state:'ready',scene:(demo as VideoProject).scenes[0]};
  assert.equal(canPreview(row),true);
  assert.equal(canPreview({...row,state:'needs_timing'}),false);
  assert.equal(canPreview({...row,state:'needs_voice'}),false);
  assert.equal(canPreview({...row,scene:{...row.scene,narration:{text:'draft'}}}),false);
  assert.match(retryMessage('render'),/本地/);
  assert.match(retryMessage('render'),/不调用模型或配音/);
});

test('preview only includes complete ready scenes', () => {
  const {scenes, ...config} = demo as VideoProject;
  const project = {id: 'p', title: 't', revision: 1, source_text: '', config,
    scenes: scenes.map(scene => ({id: scene.id, revision: 1, state: 'ready', scene}))} satisfies Project;
  assert.deepEqual(readyVideo(project), demo);
  assert.equal(readyVideo({...project, scenes: []}), null);
  assert.equal(readyVideo({...project, scenes: project.scenes.map(s => ({...s, state: 'needs_voice'}))}), null);
});

test('local retiming requires preserved audio and never advertises paid retries', () => {
  const row = {id:'s',revision:1,state:'ready',scene:(demo as VideoProject).scenes[0]};
  assert.equal(canRetime(row), true);
  assert.equal(canRetime({...row,state:'needs_timing'}), true);
  assert.equal(canRetime({...row,state:'needs_voice'}), false);
  assert.equal(canRetime({...row,scene:{...row.scene,narration:{text:'draft'}}}), false);
  assert.match(retryMessage('timing'), /本地/);
  assert.match(retryMessage('timing'), /不调用配音/);
  assert.match(retryMessage('voice'), /费用/);
});

test('flow editor only sends backend-supported patch fields', () => {
  const scene = (demo as VideoProject).scenes.find(s => s.type === 'flow_diagram')!;
  assert.ok(scene);
  const patch = scenePatch(scene, scene.narration.text, '', JSON.stringify(scene.elements), scene.edges);
  assert.deepEqual(Object.keys(patch).sort(), ['edges', 'elements', 'narration_text']);
  assert.deepEqual(patch.elements, scene.elements);
  assert.deepEqual(patch.edges, scene.edges);
  assert.deepEqual(scenePatch(scene,scene.narration.text,'',JSON.stringify(scene.elements),[]).edges,[]);
  const other=(demo as VideoProject).scenes.find(s=>s.type==='card_sequence')!;
  assert.equal('edges' in scenePatch(other,other.narration.text,'',JSON.stringify(other.elements),[]),false);
});

test('unchanged flow edits retain the legacy patch until edges explicitly change',()=>{
  const scene=(demo as VideoProject).scenes.find(s=>s.type==='flow_diagram')!;
  assert.equal('edges' in scenePatch(scene,scene.narration.text,'',JSON.stringify(scene.elements)),false);
});

test('flow form rejects incomplete and self links but delegates DAG to server',()=>{
  assert.equal(typeof editor.formEdgeError,'function');
  const scene=(demo as VideoProject).scenes.find(s=>s.type==='flow_diagram')!;
  const [a,b]=scene.elements.map(e=>e.id);
  assert.equal(editor.formEdgeError(scene.elements,[]),'');
  assert.match(editor.formEdgeError(scene.elements,[{from:'',to:b}]),/选择/);
  assert.match(editor.formEdgeError(scene.elements,[{from:a,to:'missing'}]),/选择/);
  assert.match(editor.formEdgeError(scene.elements,[{from:a,to:a}]),/自身/);
  assert.equal(editor.formEdgeError(scene.elements,[{from:a,to:b},{from:b,to:a}]),'');
});

test('flow scene form offers editable existing nodes and disabled controls',()=>{
  const scene=(demo as VideoProject).scenes.find(s=>s.type==='flow_diagram')!;
  const html=renderToStaticMarkup(createElement(SceneEditor,{projectId:'p',row:{id:'row',revision:1,state:'ready',scene},disabled:false,onDirty:()=>{},save:async()=>{},act:async()=>{}}));
  assert.match(html,/新增连线/);assert.match(html,/删除连线 1/);
  assert.match(html,/aria-label="连线 1 来源节点"/);assert.match(html,/aria-label="连线 1 目标节点"/);
  assert.ok(html.includes(`value="${scene.elements[0].id}"`));assert.match(html,/保存当前场景/);
  assert.doesNotMatch(html,/流程边（只读）/);
  const disabled=renderToStaticMarkup(createElement(SceneEditor,{projectId:'p',row:{id:'row',revision:1,state:'ready',scene},disabled:true,onDirty:()=>{},save:async()=>{},act:async()=>{}}));
  assert.match(disabled,/<fieldset disabled=""[^>]*><legend>流程连线/);
});

test('state preview and JSON edits retain structure and full snapshots', () => {
  const {scenes, ...config} = demo as VideoProject;
  const scene = {...scenes[0], type: 'state_diagram' as const, structure: {kind: 'object' as const, name: 'user'},
    elements: scenes[0].elements.map(e => ({...e, items: [{id: 'name', key: 'name', value: '小林'}], active_item_ids: ['name']}))};
  const project = {id: 'p', title: 't', revision: 1, source_text: '', config, scenes: [{id: scene.id, revision: 1, state: 'ready', scene}]} satisfies Project;
  assert.deepEqual(readyVideo(project)?.scenes[0].structure, scene.structure);
  const steps = scene.elements.map(e => ({...e, items: [{id: 'name', key: 'name', value: '小李'}]}));
  const patch = scenePatch(scene, scene.narration.text, '', JSON.stringify(steps));
  assert.deepEqual(patch.elements, steps);
  assert.deepEqual(Object.keys(patch).sort(), ['elements', 'narration_text']);
});

test('form preserves readonly topic marker when changing its label',()=>{
  const steps=JSON.stringify([{id:'title',content:'主题',cue:{text_start:0,text_end:2},role:'topic'}]);
  const changed=updateStep(steps,0,{content:'新的主题'});
  assert.equal(formSteps(changed)[0].role,'topic');
  assert.deepEqual(formSteps(changed)[0].cue,{text_start:0,text_end:2});
});

test('raw code snapshot recovery applies the same four-field guard as typing',()=>{
  assert.equal(typeof editor.codeStateFields,'function');
  assert.throws(()=>editor.codeStateFields('{'));
  assert.throws(()=>editor.codeStateFields('{}'));
  assert.throws(()=>editor.codeStateFields('{"array_items":[],"pointers":[],"loop":null,"input":"","extra":1}'));
  assert.deepEqual(editor.codeStateFields('{"array_items":[],"pointers":[],"loop":null,"input":""}'),{array_items:[],pointers:[],loop:null,input:''});
});

test('invalid step JSON is rejected without a save request', () => {
  assert.throws(() => parseSteps('{'), /JSON/);
  assert.throws(() => parseSteps('{}'), /数组/);
  assert.throws(() => parseSteps('[]'), /数组/);
  assert.deepEqual(parseSteps(JSON.stringify(demo.scenes[0].elements)), demo.scenes[0].elements);
});
