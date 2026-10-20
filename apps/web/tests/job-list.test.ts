import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as editor from '../lib/editor';

const job=()=>({job_id:'j',project_id:'p',kind:'voice',state:'queued',progress:0,scene_id:null,base_revision:1,cancel_requested:false,voice_current:null,error:null,result:null});

const scene:editor.SceneRow={id:'s',revision:2,state:'ready',scene:{id:'dsl-s',type:'card_sequence',narration:{text:'saved'},elements:[]}};

test('local preview response preserves server task state and requires preview scope',()=>{
  assert.equal(typeof editor.parseSceneJob,'function');
  const response={...job(),kind:'render',scope:'scene',preview_scene_id:'s',base_revision:2,state:'succeeded',progress:100};
  assert.equal(editor.parseSceneJob(response,'p',scene,'render'),response);
  assert.throws(()=>editor.parseSceneJob({...response,scope:undefined},'p',scene,'render'),/任务响应/);
});

test('local timing response is tied to saved row ID and revision, not DSL scene ID',()=>{
  assert.equal(typeof editor.parseSceneJob,'function');
  const response={...job(),kind:'timing',scene_id:'s',base_revision:2};
  assert.equal(editor.parseSceneJob(response,'p',scene,'timing'),response);
  for(const changes of [{scene_id:'dsl-s'},{base_revision:1},{base_revision:null},{kind:'voice'}])assert.throws(()=>editor.parseSceneJob({...response,...changes},'p',scene,'timing'),/任务响应/);
});

test('local response rejects wrong preview target, revision or project before list insertion',()=>{
  assert.equal(typeof editor.parseSceneJob,'function');
  const response={...job(),kind:'render',scope:'scene',preview_scene_id:'s',base_revision:2};
  for(const changes of [{preview_scene_id:'other'},{base_revision:3},{project_id:'other'},{progress:'0'}])assert.throws(()=>editor.parseSceneJob({...response,...changes},'p',scene,'render'));
});

test('local response validation never edits the saved row or task payload',()=>{
  assert.equal(typeof editor.parseSceneJob,'function');
  const response={...job(),kind:'timing',scene_id:'s',base_revision:2,state:'failed',error:{message:'old failure',retryable:true}},before=structuredClone({scene,response});
  assert.equal(editor.parseSceneJob(response,'p',scene,'timing'),response);assert.deepEqual({scene,response},before);
});

test('paid scene responses remain target-bound and cannot masquerade as scene previews',()=>{
  for(const kind of ['voice','regenerate'] as const){
    const response={...job(),kind,scene_id:scene.id,base_revision:scene.revision},before=structuredClone(response);
    assert.equal(editor.parseSceneJob(response,'p',scene,kind),response);assert.deepEqual(response,before);
    for(const changes of [{scene_id:'other'},{base_revision:1},{scope:'scene',preview_scene_id:'s'},{project_id:'other'}])assert.throws(()=>editor.parseSceneJob({...response,...changes},'p',scene,kind));
  }
});

test('non-render scene response rejects preview-only metadata even without explicit preview scope',()=>{
  assert.throws(()=>editor.parseSceneJob({...job(),kind:'timing',scene_id:'s',base_revision:2,preview_scene_id:'s'},'p',scene,'timing'));
});

test('job list accepts actual nullable wire fields and retains rows, metadata and order',()=>{
  assert.equal(typeof editor.parseJobs,'function');
  const jobs=[job(),{...job(),job_id:'preview',kind:'render',scope:'scene',preview_scene_id:'s',state:'succeeded',progress:100,result:{attached:false,checksums:{mp4:'hash'}},stage:'complete'}],before=structuredClone(jobs);
  assert.equal(editor.parseJobs(jobs,'p'),jobs);assert.deepEqual(jobs,before);assert.deepEqual(editor.parseJobs([],'p'),[]);
});

test('job list rejects malformed array and core render fields before assigning UI state',()=>{
  assert.equal(typeof editor.parseJobs,'function');
  for(const value of [null,undefined,{},'jobs',{items:[]},[null],[[]],[{}]])assert.throws(()=>editor.parseJobs(value,'p'),/任务响应格式错误/);
  for(const changes of [{job_id:''},{job_id:1},...['..','../other','j?retry=1','j#fragment','j/path',' j '].map(job_id=>({job_id})),{kind:{}},{kind:'toString'},{state:[]},{state:'constructor'},{progress:'50'},{progress:NaN},{progress:Infinity},{progress:-1},{progress:101}])assert.throws(()=>editor.parseJobs([{...job(),...changes}],'p'),/任务响应格式错误/);
});

test('job list rejects foreign, missing project ownership and duplicate job IDs',()=>{
  assert.equal(typeof editor.parseJobs,'function');
  for(const project_id of ['other',undefined,null,7])assert.throws(()=>editor.parseJobs([{...job(),project_id}],'p'),/任务响应格式错误/);
  assert.throws(()=>editor.parseJobs([job(),job()],'p'),/任务响应格式错误/);
});

test('job list rejects unsafe action flags and nested error/result fields',()=>{
  assert.equal(typeof editor.parseJobs,'function');
  for(const changes of [{cancel_requested:'false'},{voice_current:'false'},{scene_id:{}},{preview_scene_id:[]},{scope:'other'},{base_revision:'1'},{error:'failed'},{error:[]},{error:{message:{},retryable:true}},{error:{message:'failure',retryable:'true'}},{result:[]},{result:'ready'},{result:{attached:'false'}},{result:{candidate_id:{}}}])assert.throws(()=>editor.parseJobs([{...job(),...changes}],'p'),/任务响应格式错误/);
});

test('job list accepts ordinary errors and explicit publish/cancellation metadata',()=>{
  assert.equal(typeof editor.parseJobs,'function');
  const jobs=[{...job(),state:'failed',error:{message:'<script>仅作文字</script>',retryable:false}}, {...job(),job_id:'running',state:'running',cancel_requested:true,voice_current:false,result:{attached:false}}];
  assert.equal(editor.parseJobs(jobs,'p'),jobs);
});

test('one invalid job rejects the entire response without rewriting valid entries',()=>{
  assert.equal(typeof editor.parseJobs,'function');
  const jobs=[job(),{...job(),job_id:'bad',error:{message:['not text'],retryable:false}}],before=structuredClone(jobs);
  assert.throws(()=>editor.parseJobs(jobs,'p'),/不要重复提交/);assert.deepEqual(jobs,before);
});
