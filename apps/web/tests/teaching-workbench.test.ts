import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTeachingTask,parseTeachingTasks,teachingStageLabel,prepareKey,currentTeachingTask,teachingVideoUrl,shouldRenderPlanResult,parseTeachingReadiness} from '../lib/teaching-workbench';
import {safeReturn} from '../lib/accounts';

test('readiness is explicit and a queued plan is not a video or a paid request',()=>{
 assert.equal(parseTeachingReadiness({generation_mode:'teaching-plan',experimental:true,ready:false}),false);
 assert.equal(parseTeachingReadiness({generation_mode:'teaching-plan',experimental:true,ready:true}),true);
 for(const value of [{ready:true},{generation_mode:'source',experimental:true,ready:true},{generation_mode:'teaching-plan',experimental:true,ready:'true'}])assert.throws(()=>parseTeachingReadiness(value));
 assert.equal(parseTeachingTask({...task,stage:'plan-queued',can_run:false},project).requests_used,0);
 assert.throws(()=>parseTeachingTask({...task,stage:'plan-queued',can_run:true},project));
});

const project='11111111-1111-4111-8111-111111111111',scene='22222222-2222-4222-8222-222222222222';
const task={id:'33333333-3333-4333-8333-333333333333',project_id:project,scene_id:scene,base_revision:1,created_at:'2026-10-29T00:00:00Z',snapshot_sha256:'a'.repeat(64),state:'active',max_requests:2,requests_used:0,calls:[],generation_mode:'teaching-plan',stage:'prepared',message:'已准备',current:true,timing_mode:'draft',can_run:false,video_ready:false,accepted:false,execution:'not-run'};
test('accepts scoped tasks but never confuses artifact cache with video',()=>{
  assert.equal(parseTeachingTask(task,project).stage,'prepared');
  assert.match(teachingStageLabel('artifact-cached'),/未渲染/);
  assert.deepEqual(parseTeachingTasks({tasks:[task],limit:50},project),[task]);
});
test('rejects invalid scope, budget, stages and premature completion',()=>{
  for(const change of [{project_id:scene},{requests_used:3},{requests_used:0.5},{max_requests:3},{stage:'succeeded'},{video_ready:true},{accepted:true},{execution:'rendered'},{can_run:true,stage:'blocked'},{state:'cancelled',stage:'prepared'},{calls:[{}]}])
    assert.throws(()=>parseTeachingTask({...task,...change},project));
  assert.throws(()=>parseTeachingTasks({tasks:[task,task],limit:50},project));
});
test('prepare key is stable for the same revision and timing, not shared across changes',()=>{
  const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  let count=0;const uuid=()=>`key-${++count}`;
  assert.equal(prepareKey(storage,project,scene,1,'draft',uuid),prepareKey(storage,project,scene,1,'draft',uuid));
  assert.notEqual(prepareKey(storage,project,scene,1,'draft',uuid),prepareKey(storage,project,scene,2,'draft',uuid));
  assert.notEqual(prepareKey(storage,project,scene,1,'draft',uuid),prepareKey(storage,project,scene,1,'measured',uuid));
});
test('login return allows only the explicit teaching subroute',()=>{
  assert.equal(safeReturn(`/courses/${project}/teaching`),`/courses/${project}/teaching`);
  for(const suffix of ['/teaching/../../login','/teaching/extra','/teaching\\evil'])assert.equal(safeReturn(`/courses/${project}${suffix}`),'/courses');
});
test('current snapshot survives unrelated project revision changes; base revision is not scene revision',()=>{
 const root=parseTeachingTask({...task,base_revision:8},project);
 assert.equal(currentTeachingTask([root],scene,'draft'),root);
 assert.equal(currentTeachingTask([{...root,current:false,stage:'stale'}],scene,'draft'),undefined);
 assert.equal(currentTeachingTask([root],scene,'measured'),undefined);
});
test('preview requires a successful scoped render, never a producer status alone',()=>{
 const render={id:'44444444-4444-4444-8444-444444444444',state:'succeeded',artifact_sha256:'b'.repeat(64),error_code:null,video_ready:true,accepted:false};
 const ready={...task,stage:'preview-ready',execution:'succeeded',video_ready:true,can_render:false,render};
 const parsed=parseTeachingTask(ready,project);
 assert.equal(teachingVideoUrl(project,parsed),`/api/projects/${project}/teaching-tasks/${task.id}/video`);
 assert.match(teachingVideoUrl(project,parsed,true),/\?download=true$/);
 for(const change of [{render:null},{render:{...render,state:'failed'}},{render:{...render,error_code:'output-unavailable'}},{execution:'not-run'},{can_render:true},{accepted:true},{stage:'prepared'}])assert.throws(()=>parseTeachingTask({...ready,...change},project));
 assert.throws(()=>teachingVideoUrl(scene,parsed));
});
test('blocked or missing plan result cannot automatically submit rendering',()=>{
 const ready=parseTeachingTask({...task,stage:'artifact-cached',can_render:true},project);
 assert.equal(shouldRenderPlanResult(ready,{status:'artifact-ready'}),true);
 for(const result of [null,{},true,{status:'blocked'},{status:'unsupported'}])assert.equal(shouldRenderPlanResult(ready,result),false);
 assert.equal(shouldRenderPlanResult({...ready,can_render:false},{status:'artifact-ready'}),false);
});
