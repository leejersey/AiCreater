import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {parseVisualJobs,visualFileUrl,measuredReady,canAcceptPreview,canReviseDesign,reviewFrames,visualError,sceneAudioActions,visualGenerationActions,visualGenerateBody,isVisualDataMode} from '../lib/visual-workbench';
import VisualWorkbench,{VisualArtifact,VisualJobStatus,VisualGenerationModeSelect} from '../app/VisualWorkbench';
import type {SceneRow,Job} from '../lib/editor';
import * as visual from '../lib/visual-workbench';
import * as workbench from '../app/VisualWorkbench';

const layout={id:'layout',project_id:'p',scene_id:'s',kind:'propose-layout',state:'succeeded',input_summary:{generation_mode:'source'},result:{generation_mode:'source',requests_dispatched:0,execution:'not_run',technical:'passed',visual:'pending',production_adopted:false,diagnostic:true,design_sha256:'a'.repeat(64),original_design_sha256:'b'.repeat(64),layout_sha256:'c'.repeat(64),design:{title:'<script>design</script>'},moves:[{objectId:'label',from:{x:10,y:20},to:{x:10,y:40}}],unresolved:[{kind:'collision',objects:['label','other'],detail:'<script>warning</script>'}],layout_preflight:'passed'}};
test('layout proposal validates all metadata, bounded arrays, coordinates and hashes without executable artifacts',()=>{
 const clean={...layout,result:{...layout.result,unresolved:[]}};
 const [job]=parseVisualJobs({jobs:[clean]},'p');
 assert.deepEqual(job.result,clean.result);assert.equal(job.generation_mode,'source');
 assert.equal(visual.canApplyLayout(job),true);assert.equal(canAcceptPreview(job),false);
 const contradictory={...job,result:{...job.result,unresolved:layout.result.unresolved}};
 assert.equal(visual.canApplyLayout(contradictory),false);
 assert.throws(()=>parseVisualJobs({jobs:[layout]},'p'));
 const [failed]=parseVisualJobs({jobs:[{...layout,result:{...layout.result,layout_preflight:'failed'}}]},'p');
 assert.deepEqual(failed.result?.unresolved,layout.result.unresolved);assert.equal(visual.canApplyLayout(failed),false);
 assert.deepEqual(visualGenerationActions(job),{review:false,repair:false});
 for(const key of Object.keys(layout.result)){
  const result={...clean.result} as Record<string,unknown>;delete result[key];
  assert.throws(()=>parseVisualJobs({jobs:[{...layout,result}]},'p'),key);
  for(const value of [undefined,null,...(['moves','unresolved'].includes(key)?[]:[[]]),...(key==='design'?[]:[{}])])assert.throws(()=>parseVisualJobs({jobs:[{...layout,result:{...clean.result,[key]:value}}]},'p'),`${key}: invalid type`);
 }
 for(const change of [{generation_mode:'host-motion'},{requests_dispatched:1},{execution:'run'},{technical:'failed'},{visual:'passed'},{diagnostic:false},{production_adopted:true},{design_sha256:'bad'},{original_design_sha256:null},{layout_sha256:'A'.repeat(64)},{design:[]},{layout_preflight:'unknown'},
  ...['source','sha256','video','frames','geometry','srt','extra'].map(key=>({[key]:null})),
  {moves:[{objectId:'label',from:{x:NaN,y:0},to:{x:0,y:1}}]},
  {moves:[{objectId:'label',from:{x:0,y:0},to:{x:0,y:Infinity}}]},
  {moves:[{objectId:'label',from:{x:'0',y:0},to:{x:0,y:1}}]},
  {moves:[{objectId:'',from:{x:0,y:0},to:{x:0,y:1}}]},
  {moves:[{...layout.result.moves[0],extra:true}]},{moves:[{...layout.result.moves[0],from:{x:0,y:0,z:0}}]},
  {moves:Array(10001).fill(layout.result.moves[0])},{moves:Array(2)},{moves:[null]},
  {unresolved:[{kind:'collision',objects:[1],detail:'warning'}]},
  {unresolved:[{...layout.result.unresolved[0],objects:Array(10001).fill('label')}]},
  {unresolved:[{...layout.result.unresolved[0],detail:'x'.repeat(2001)}]},
  {unresolved:[{kind:'',objects:[],detail:''}]},{unresolved:Array(10001).fill(layout.result.unresolved[0])}])
  assert.throws(()=>parseVisualJobs({jobs:[{...layout,result:{...layout.result,layout_preflight:'failed',...change}}]},'p'),JSON.stringify(change).slice(0,200));
 for(const input_summary of [{},{generation_mode:'host-components'},null])assert.throws(()=>parseVisualJobs({jobs:[{...clean,input_summary}]},'p'));
 assert.throws(()=>parseVisualJobs({jobs:[{...layout,result:null}]},'p'));
 for(const state of ['queued','running','failed','cancelled']){
  const [pending]=parseVisualJobs({jobs:[{...layout,state,result:{requests_dispatched:0}}]},'p');
  assert.equal(visual.canApplyLayout(pending),false);
  assert.throws(()=>parseVisualJobs({jobs:[{...layout,state,result:{source:'forbidden'}}]},'p'));
 }
 for(const change of [{current:false},{stage:'stale'},{state:'failed'},{kind:'generate'},{result:{...job.result,moves:[]}},{result:{...job.result,layout_preflight:'failed'}}])assert.equal(visual.canApplyLayout({...job,...change} as visual.VisualJob),false);
});
test('layout eligibility and SSR keep vertical label suggestions separate from preview and acceptance',()=>{
 const parent:visual.VisualJob={id:'failed',project_id:'p',scene_id:'s',kind:'generate',state:'failed',generation_mode:'source',result:{requests_dispatched:1}};
 assert.equal(visual.canProposeLayout(parent),true);
 const controls=(job:visual.VisualJob,disabled=false)=>renderToStaticMarkup(createElement(workbench.VisualLayoutProposal,{job,disabled,onAction:()=>{}}));
 assert.match(controls(parent),/标签布局建议（免费）/);
 for(const change of [{current:false},{stage:'stale'},{kind:'repair'},{state:'succeeded'},{generation_mode:'host-motion'},{generation_mode:'host-intent'},{generation_mode:'host-components'},{result:{requests_dispatched:2}}]){
  const job={...parent,...change} as visual.VisualJob;assert.equal(visual.canProposeLayout(job),false);assert.equal(controls(job),'');
 }
 const [job]=parseVisualJobs({jobs:[{...layout,result:{...layout.result,layout_preflight:'failed'}}]},'p'),html=controls(job);
 for(const pattern of [/仅标签纵向建议/,/未采用.*不可预览或验收/,/label/,/10, 20/,/10, 40/,/collision/,/other/,/未解决/,/a{64}/,/b{64}/,/c{64}/,/采用布局并生成源码/])assert.match(html,pattern);
 assert.doesNotMatch(html,/<script|<video|<img|运行并预览|人工验收/);
 for(const candidate of [{...job,current:false},{...job,stage:'stale'},{...job,result:{...job.result,layout_preflight:'failed' as const}},{...job,result:{...job.result,moves:[]}}])assert.match(controls(candidate),/<button[^>]*disabled/);
 assert.match(controls(job,true),/<button[^>]*disabled/);
 const source=readFileSync(new URL('../app/VisualWorkbench.tsx',import.meta.url),'utf8');assert.match(source,/<VisualLayoutProposal job=\{job\}/);
});

const recovery={id:'recovery',project_id:'p',scene_id:'s',kind:'recover-source',state:'succeeded',input_summary:{generation_mode:'source'},result:{sha256:'a'.repeat(64),design_sha256:'b'.repeat(64),recovery_sha256:'c'.repeat(64),source:'<script>never execute</script>',design:{title:'frozen'},requests_dispatched:0,execution:'not_run',technical:'passed',visual:'pending',production_adopted:false,diagnostic:true,generation_mode:'source'}};
test('source recovery strictly parses offline unadopted metadata and never unlocks preview',()=>{
 const [job]=parseVisualJobs({jobs:[recovery]},'p');
 assert.equal(job.generation_mode,'source');assert.equal(job.result?.recovery_sha256,recovery.result.recovery_sha256);
 assert.deepEqual(visualGenerationActions(job),{review:false,repair:false});assert.equal(canAcceptPreview(job),false);
 for(const key of Object.keys(recovery.result)){
  const result={...recovery.result} as Record<string,unknown>;delete result[key];
  assert.throws(()=>parseVisualJobs({jobs:[{...recovery,result}]},'p'),key);
  for(const value of [undefined,null,[],...(key==='design'?[]:[{}])])assert.throws(()=>parseVisualJobs({jobs:[{...recovery,result:{...recovery.result,[key]:value}}]},'p'),`${key}: ${JSON.stringify(value)}`);
 }
 for(const change of [{sha256:'bad'},{design_sha256:'A'.repeat(64)},{recovery_sha256:'bad'},{requests_dispatched:1},{requests_dispatched:null},{execution:'run'},{technical:'failed'},{visual:'passed'},{production_adopted:true},{diagnostic:false},{generation_mode:'host-motion'},{source:''},{source:'   '},{design:[]},{video:undefined},{frames:[]},{geometry:{}},{srt:'video.srt'},{accepted:false},{assembly_sha256:'d'.repeat(64)}])
  assert.throws(()=>parseVisualJobs({jobs:[{...recovery,result:{...recovery.result,...change}}]},'p'),JSON.stringify(change));
 for(const input_summary of [{},{generation_mode:'host-motion'},null])assert.throws(()=>parseVisualJobs({jobs:[{...recovery,input_summary}]},'p'));
 assert.throws(()=>parseVisualJobs({jobs:[{...recovery,result:null}]},'p'));
});
test('free source diagnosis eligibility is bounded to current failed source budgets',()=>{
 const parent={id:'failed',project_id:'p',scene_id:'s',kind:'generate',state:'failed',generation_mode:'source',result:{requests_dispatched:2}} as visual.VisualJob;
 assert.equal(visual.canRecoverSource(parent),true);
 assert.equal(visual.canRecoverSource({...parent,kind:'repair',result:{requests_dispatched:1}}),true);
 for(const change of [{kind:'repair',result:{requests_dispatched:2}},{result:{requests_dispatched:1}},{result:null},{current:false},{stage:'stale'},{state:'succeeded'},{kind:'preview'},{generation_mode:'host-intent'},{generation_mode:'host-motion'},{generation_mode:'host-components'}])
  assert.equal(visual.canRecoverSource({...parent,...change} as visual.VisualJob),false);
});
test('source recovery SSR shows escaped candidate details and only paid revision, never preview or acceptance',()=>{
 const [job]=parseVisualJobs({jobs:[recovery]},'p');
 const html=renderToStaticMarkup(createElement(workbench.VisualSourceRecovery,{job,disabled:false,feedback:'fix',onFeedback:()=>{},onAction:()=>{}}));
 assert.match(html,/待审阅，未采用/);assert.match(html,/源码与设计详情/);assert.match(html,/c{64}/);assert.match(html,/&lt;script&gt;/);assert.match(html,/付费/);
 assert.doesNotMatch(html,/<script|<video|<img|运行并预览|人工验收|审批并诊断预览/);
 const stale=renderToStaticMarkup(createElement(workbench.VisualSourceRecovery,{job:{...job,current:false},disabled:false,feedback:'fix',onFeedback:()=>{},onAction:()=>{}}));
 assert.match(stale,/<button[^>]*disabled/);
 const failed:visual.VisualJob={...job,kind:'generate',state:'failed',result:{requests_dispatched:2}};
 const controls=(job:visual.VisualJob)=>renderToStaticMarkup(createElement(workbench.VisualSourceRecovery,{job,disabled:false,feedback:'',onFeedback:()=>{},onAction:()=>{}}));
 assert.match(controls(failed),/源码离线诊断（免费）/);
 assert.equal(controls({...failed,current:false}),'');
 assert.equal(controls({...failed,generation_mode:'host-components'}),'');
 assert.equal(controls({...failed,result:{requests_dispatched:1}}),'');
});

const sha='a'.repeat(64);
const raw={id:'j',project_id:'p',scene_id:'s',kind:'preview',state:'succeeded',stage:'done',created_at:'2026-10-23',input_summary:{},result:{sha256:sha,geometry:{status:'passed'},frames:['stills/frame-0.png','stills/frame-10.png','stills/frame-20.png'],video:'video.mp4'}};
test('prepared transfer candidate shows hashes but cannot render, repair or be accepted',()=>{
 const candidate={...raw,kind:'prepare-transfer',result:{sha256:sha,design_sha256:'b'.repeat(64),assembly_sha256:'c'.repeat(64),binding_sha256:'d'.repeat(64),source:'export {}',design:{},requests_dispatched:0,technical:'passed',execution:'not_run',visual:'pending',production_adopted:false}};
 const [job]=parseVisualJobs({jobs:[candidate]},'p');
 assert.deepEqual(visualGenerationActions(job),{review:false,repair:false});assert.equal(canAcceptPreview(job),false);
 const html=renderToStaticMarkup(createElement(VisualArtifact,{job}));assert.match(html,/机构绑定 SHA-256/);assert.match(html,/d{64}/);
 for(const change of [{requests_dispatched:1},{execution:'executed'},{production_adopted:true},{video:'video.mp4'},{binding_sha256:undefined}])
  assert.throws(()=>parseVisualJobs({jobs:[{...candidate,result:{...candidate.result,...change}}]},'p'));
});
test('transfer diagnostic remains excluded from acceptance even with geometry-passed media',()=>{
 const diagnostic={...raw,kind:'preview-transfer',result:{...raw.result,srt:'video.srt',design_sha256:'b'.repeat(64),assembly_sha256:'c'.repeat(64),binding_sha256:'d'.repeat(64),diagnostic:true,production_adopted:false,requests_dispatched:0}};
 const [job]=parseVisualJobs({jobs:[diagnostic]},'p');assert.equal(canAcceptPreview(job),false);assert.equal(job.result?.diagnostic,true);
 assert.deepEqual(visualGenerationActions(job),{review:false,repair:false});
 for(const change of [{diagnostic:false},{production_adopted:true},{requests_dispatched:1},{accepted:true},{binding_sha256:undefined},{srt:undefined}])
  assert.throws(()=>parseVisualJobs({jobs:[{...diagnostic,result:{...diagnostic.result,...change}}]},'p'));
});
test('recipe provenance is visible and must match queued preset metadata',()=>{
 const candidate={...raw,kind:'prepare-transfer',input_summary:{preset:'rag-augmentation:1'},result:{sha256:sha,design_sha256:'b'.repeat(64),assembly_sha256:'c'.repeat(64),binding_sha256:'d'.repeat(64),source:'export {}',design:{},requests_dispatched:0,technical:'passed',execution:'not_run',visual:'pending',production_adopted:false,preset:'rag-augmentation:1',origin_sha256:'e'.repeat(64)}};
 const [job]=parseVisualJobs({jobs:[candidate]},'p');assert.equal(job.result?.preset,'rag-augmentation:1');
 assert.match(renderToStaticMarkup(createElement(VisualArtifact,{job})),/RAG 增强搬运预设/);
 for(const change of [{preset:'unknown'},{origin_sha256:undefined}])assert.throws(()=>parseVisualJobs({jobs:[{...candidate,result:{...candidate.result,...change}}]},'p'));
 assert.throws(()=>parseVisualJobs({jobs:[{...candidate,input_summary:{}}]},'p'));
});
test('host-components is an explicit data-mode option without changing the source default',()=>{
 const html=renderToStaticMarkup(createElement(VisualGenerationModeSelect,{value:'host-components',disabled:false,onChange:()=>{}}));
 assert.match(html,/<option value="host-components" selected="">宿主组件绘图（实验）<\/option>/);
 assert.equal(isVisualDataMode('host-components'),true);
 assert.deepEqual(visualGenerateBody('scene',4,'host-components'),{scene_id:'scene',expected_revision:4,confirmed:true,max_requests:2,generation_mode:'host-components'});
 const source=readFileSync(new URL('../app/VisualWorkbench.tsx',import.meta.url),'utf8');
 assert.match(source,/useState<VisualGenerationMode>\('source'\)/);
});
test('source selection is named freeform scene source without changing the source API mode',()=>{
 const html=renderToStaticMarkup(createElement(VisualGenerationModeSelect,{value:'source',disabled:false,onChange:()=>{}}));
 assert.match(html,/<option value="source" selected="">自由画面源码<\/option>/);
 assert.deepEqual(visualGenerateBody('s',4,'source'),{scene_id:'s',expected_revision:4,confirmed:true,max_requests:2,generation_mode:'source'});
});
test('component generation and repairs require matching modes and both provenance hashes',()=>{
 for(const kind of ['generate','repair']){
  const component={...raw,kind,input_summary:{generation_mode:'host-components'},result:{sha256:sha,generation_mode:'host-components',assembly_sha256:'b'.repeat(64),intent_sha256:'c'.repeat(64)}};
  const [job]=parseVisualJobs({jobs:[component]},'p');
  assert.equal(job.generation_mode,'host-components');
  assert.equal(job.result?.assembly_sha256,component.result.assembly_sha256);
  assert.equal(job.result?.intent_sha256,component.result.intent_sha256);
  const html=renderToStaticMarkup(createElement(VisualArtifact,{job}));
  assert.match(html,/宿主组件绘图/);assert.match(html,/装配数据 SHA-256/);assert.match(html,/动作意图 SHA-256/);
  assert.match(html,/b{64}/);assert.match(html,/c{64}/);
  for(const field of ['assembly_sha256','intent_sha256'])for(const value of [undefined,null,'','bad']){
   assert.throws(()=>parseVisualJobs({jobs:[{...component,result:{...component.result,[field]:value}}]},'p'));
  }
  for(const generation_mode of [undefined,null,'source','host-motion','host-intent','invalid']){
   assert.throws(()=>parseVisualJobs({jobs:[{...component,result:{...component.result,generation_mode}}]},'p'));
  }
  assert.throws(()=>parseVisualJobs({jobs:[{...component,result:null}]},'p'));
  assert.throws(()=>parseVisualJobs({jobs:[{...component,input_summary:{generation_mode:'host-intent'}}]},'p'));
  for(const state of ['queued','running','failed']){
   const [incomplete]=parseVisualJobs({jobs:[{...component,state,result:{requests_dispatched:1}}]},'p');
   assert.equal(incomplete.generation_mode,'host-components');
  }
 }
});
test('intent mode selector, submission and reviewed provenance are explicit',()=>{
 const html=renderToStaticMarkup(createElement(VisualGenerationModeSelect,{value:'host-intent',disabled:false,onChange:()=>{}}));
 assert.match(html,/host-intent/);assert.match(html,/动作意图/);
 assert.equal(visualGenerateBody('scene',4,'host-intent').generation_mode,'host-intent');
 const intent={...raw,kind:'generate',input_summary:{generation_mode:'host-intent'},result:{sha256:sha,generation_mode:'host-intent',assembly_sha256:'b'.repeat(64),intent_sha256:'c'.repeat(64)}};
 const [job]=parseVisualJobs({jobs:[intent]},'p');assert.equal(job.result?.intent_sha256,'c'.repeat(64));
 assert.match(renderToStaticMarkup(createElement(VisualArtifact,{job})),/意图.*SHA-256/);
 for(const change of [{intent_sha256:undefined},{intent_sha256:'bad'},{assembly_sha256:undefined},{generation_mode:'host-motion'}]){
  assert.throws(()=>parseVisualJobs({jobs:[{...intent,result:{...intent.result,...change}}]},'p'));
 }
 const [failed]=parseVisualJobs({jobs:[{...intent,state:'failed',result:{requests_dispatched:1}}]},'p');
 assert.equal(failed.generation_mode,'host-intent');
});
test('mode selector and paid submission explicitly carry the selected generation mode',()=>{
 const html=renderToStaticMarkup(createElement(VisualGenerationModeSelect,{value:'host-motion',disabled:true,onChange:()=>{}}));
 assert.match(html,/select/);assert.match(html,/host-motion/);assert.match(html,/source/);assert.match(html,/disabled/);assert.match(html,/selected/);
 assert.deepEqual(visualGenerateBody('scene',4,'host-motion'),{scene_id:'scene',expected_revision:4,confirmed:true,max_requests:2,generation_mode:'host-motion'});
 assert.throws(()=>visualGenerateBody('scene',4,'invalid' as 'host-motion'));
});
test('job mode and assembly hash survive parsing while malformed or conflicting modes are refused',()=>{
 const host={...raw,kind:'generate',input_summary:{generation_mode:'host-motion'},result:{sha256:sha,generation_mode:'host-motion',assembly_sha256:'b'.repeat(64)}};
 const [job]=parseVisualJobs({jobs:[host]},'p');
 assert.equal(job.generation_mode,'host-motion');assert.equal(job.result?.assembly_sha256,'b'.repeat(64));
 const html=renderToStaticMarkup(createElement(VisualArtifact,{job}));assert.match(html,/宿主运动/);assert.match(html,/装配/);
 for(const change of [{input_summary:{generation_mode:'bad'}},{input_summary:{generation_mode:null}},{result:{...host.result,generation_mode:'source'}},{result:{...host.result,assembly_sha256:'bad'}}])assert.throws(()=>parseVisualJobs({jobs:[{...host,...change}]},'p'));
 const [legacy]=parseVisualJobs({jobs:[{...raw,kind:'generate'}]},'p');assert.equal(legacy.generation_mode,'source');
});
test('design-stage failures offer explicit revision without confusing source repair or stale input',()=>{
 const candidate={...raw,kind:'generate',state:'failed',stage:'failed',current:true,result:{requests_dispatched:1}};
 assert.equal(canReviseDesign(parseVisualJobs({jobs:[candidate]},'p')[0]),true);
 for(const change of [{kind:'repair'},{state:'running'},{current:false},{stage:'stale'},{result:{requests_dispatched:2}},{result:{requests_dispatched:null}}]){
  assert.equal(canReviseDesign(parseVisualJobs({jobs:[{...candidate,...change}]},'p')[0]),false);
 }
 for(const requests_dispatched of [true,-1,3,'1'])assert.throws(()=>parseVisualJobs({jobs:[{...candidate,result:{requests_dispatched}}]},'p'));
});
test('visual parser validates ownership, states and relative allowlisted media',()=>{
  const [job]=parseVisualJobs({jobs:[raw]},'p');
  assert.equal(canAcceptPreview(job),true);
  for(const bad of [{...raw,project_id:'other'},{...raw,state:'ready'},{...raw,state:['succeeded']},{...raw,kind:['preview']},{...raw,result:{...raw.result,frames:['/private/file.png']}},{...raw,result:{...raw.result,video:'https://evil.test/a'}}])assert.throws(()=>parseVisualJobs({jobs:[bad]},'p'));
  assert.throws(()=>parseVisualJobs({jobs:[raw,raw]},'p'));
  assert.equal(visualFileUrl('p','j','stills/frame-10.png'),'/api/projects/p/visual/j/files/stills/frame-10.png');
  for(const name of ['../video.mp4','stills/../../x','//evil','source.tsx','stills/frame-1.png?x'])assert.throws(()=>visualFileUrl('p','j',name));
});
test('only real ready audio with measured captions unlocks generation',()=>{
  const row={id:'s',revision:1,state:'ready',scene:{duration_frames:30,narration:{text:'口播',audio_asset_id:'a'},captions:[{text:'口播',start_frame:6,end_frame:20}]}} as unknown as SceneRow;
  assert.equal(measuredReady(row),true);
  assert.equal(measuredReady({...row,state:'needs_timing'}),false);
  assert.equal(measuredReady({...row,scene:{...row.scene,captions:[]}} as SceneRow),false);
  assert.equal(measuredReady({...row,scene:{...row.scene,narration:{text:'口播'}}}),false);
  assert.equal(measuredReady({...row,scene:{...row.scene,captions:[null]}} as unknown as SceneRow),false);
});
test('geometry is never aesthetic approval and frames remain server supplied strings',()=>{
  const [job]=parseVisualJobs({jobs:[raw]},'p');
  for(const status of ['failed','partial','pending'])assert.equal(canAcceptPreview({...job,result:{...job.result,geometry:{status}}}),false);
  assert.equal(canAcceptPreview({...job,state:'failed'}),false);
  assert.deepEqual(reviewFrames([...raw.result.frames,'stills/frame-30.png']),['stills/frame-0.png','stills/frame-20.png','stills/frame-30.png']);
});
test('SSR never fetches, executes source, or mounts the legacy player',()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
  try {
    const html=renderToStaticMarkup(createElement(VisualWorkbench,{routeProjectId:'p'}));
    assert.match(html,/legacy/);assert.match(html,/读取/);assert.equal(calls,0);
    const [job]=parseVisualJobs({jobs:[{...raw,kind:'generate',result:{sha256:sha,source:'<script>alert(1)</script>',design:{title:'<img src=x onerror=alert(1)>'}}}]},'p');
    const artifact=renderToStaticMarkup(createElement(VisualArtifact,{job}));
    assert.match(artifact,/&lt;script&gt;/);assert.doesNotMatch(artifact,/<script|<iframe|onerror="/);
    assert.match(artifact,new RegExp(sha));
  } finally {globalThis.fetch=original;}
  const source=readFileSync(new URL('../app/VisualWorkbench.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"].*(?:remotion|Workbench['"]|Video['"])/);
  const primary=readFileSync(new URL('../app/courses/[id]/page.tsx',import.meta.url),'utf8');
  assert.match(primary,/<VisualWorkbench/);assert.doesNotMatch(primary,/<Workbench\b/);
  const legacy=readFileSync(new URL('../app/courses/[id]/legacy/page.tsx',import.meta.url),'utf8');
  assert.match(legacy,/<Workbench\b/);
});
test('untrusted errors are reduced to fixed messages',()=>{
  assert.doesNotMatch(visualError(new Error('/private/key provider response')),/private|provider/);
  assert.match(visualError(new Error('conflict',{cause:409})),/版本/);
});
test('generated artifact includes exact design hash and strips provider extras',()=>{
  const [job]=parseVisualJobs({jobs:[{...raw,kind:'generate',result:{sha256:sha,design_sha256:'b'.repeat(64),source:'export default function Scene() {}',design:{title:'设计'},provider_response:'SECRET'}}]},'p');
  const html=renderToStaticMarkup(createElement(VisualArtifact,{job}));
  assert.match(html,new RegExp('b'.repeat(64)));
  assert.doesNotMatch(JSON.stringify(job),/SECRET|provider_response/);
});
test('historical voice jobs do not block actions and failed retry uses the existing retry route',()=>{
  const row={id:'s',revision:2,state:'needs_voice',scene:{narration:{text:'口播'}}} as SceneRow;
  const job={job_id:'voice-job',kind:'voice',scene_id:'s',base_revision:2,state:'failed',error:{message:'失败',retryable:true}} as Job;
  assert.equal(sceneAudioActions(row,[job]).voiceBlocked,false);
  assert.equal(sceneAudioActions(row,[job]).voicePath,'/api/jobs/voice-job/retry');
  assert.equal(sceneAudioActions(row,[{...job,state:'succeeded'}]).voicePath,'/api/scenes/s/voice');
  for(const state of ['queued','running'])assert.equal(sceneAudioActions(row,[job,{...job,state}]).voiceBlocked,true);
  assert.equal(sceneAudioActions(row,[{...job,state:'running',voice_current:false}]).voiceBlocked,false);
  assert.equal(sceneAudioActions(row,[{...job,state:'running',base_revision:1}]).voiceBlocked,false);
});
test('existing audio can be retimed for free without generating voice, active timing blocks duplicates',()=>{
  const row={id:'s',revision:2,state:'needs_timing',scene:{narration:{text:'口播',audio_asset_id:'audio'}}} as SceneRow;
  assert.equal(sceneAudioActions(row,[]).timingBlocked,false);
  assert.equal(sceneAudioActions(row,[]).timingPath,'/api/scenes/s/timing');
  assert.deepEqual(sceneAudioActions(row,[]).timingBody,{expected_revision:2});
  assert.equal(sceneAudioActions(row,[]).voiceBlocked,true);
  assert.equal(sceneAudioActions({...row,scene:{...row.scene,narration:{text:'口播'}}},[]).timingBlocked,true);
  const timing={job_id:'t',kind:'timing',scene_id:'s',base_revision:2,state:'queued'} as Job;
  assert.equal(sceneAudioActions(row,[timing]).timingBlocked,true);
  assert.equal(sceneAudioActions(row,[{...timing,state:'failed'}]).timingBlocked,false);
});
test('sanitized backend diagnostics are bounded strings rendered as escaped text',()=>{
  const [job]=parseVisualJobs({jobs:[{...raw,state:'failed',stage:'geometry',error:'几何检查失败 <script>不可执行</script>'}]},'p');
  assert.equal(job.stage,'geometry');assert.match(job.error!,/几何检查失败/);
  const html=renderToStaticMarkup(createElement(VisualJobStatus,{job}));
  assert.match(html,/geometry/);assert.match(html,/几何检查失败/);assert.doesNotMatch(html,/<script>/);
  for(const diagnostic of [{error:{message:'private'}},{error:'错'.repeat(501)},{stage:'x'.repeat(121)}])assert.throws(()=>parseVisualJobs({jobs:[{...raw,...diagnostic}]},'p'));
  const artifact=renderToStaticMarkup(createElement(VisualArtifact,{job}));
  assert.match(artifact,/<details\b/);assert.doesNotMatch(artifact,/<details[^>]*\bopen/);
});
test('failed generation and repair allow explicit repair but never source review or preview approval',()=>{
  const [job]=parseVisualJobs({jobs:[raw]},'p');
  for(const kind of ['generate','repair'] as const){
    assert.deepEqual(visualGenerationActions({...job,kind,state:'failed',result:null}),{review:false,repair:true});
    assert.deepEqual(visualGenerationActions({...job,kind,state:'succeeded'}),{review:true,repair:true});
    for(const state of ['queued','running','cancelled'] as const)assert.deepEqual(visualGenerationActions({...job,kind,state}),{review:false,repair:false});
  }
  for(const kind of ['preview','export'] as const)assert.deepEqual(visualGenerationActions({...job,kind,state:'failed'}),{review:false,repair:false});
});
