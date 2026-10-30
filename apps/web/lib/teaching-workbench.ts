export const teachingStages={prepared:'待执行','plan-queued':'规划排队中',planning:'正在规划',revising:'正在修订','response-cached':'响应已保存','revision-pending':'等待定向修订','artifact-cached':'画面数据已保存 · 未渲染','render-queued':'预览排队中',rendering:'检查与渲染中','preview-ready':'无声预览已就绪','render-blocked':'渲染已停止',blocked:'已停止',stale:'输入已变化',cancelled:'已取消'} as const;
export type TeachingStage=keyof typeof teachingStages;
export type TeachingRender={id:string;state:'queued'|'running'|'succeeded'|'failed'|'interrupted'|'cancelled';artifact_sha256:string;error_code:string|null;video_ready:boolean;accepted:false};
export type TeachingTask={id:string;project_id:string;scene_id:string;base_revision:number;created_at:string;snapshot_sha256:string;state:'active'|'cancelled';max_requests:2;requests_used:number;
  calls:{id:string;stage:'plan'|'revision';request_sha256:string;state:'dispatched'|'succeeded'|'failed'|'unknown'|'cancelled';output_sha256:string|null}[];
  generation_mode:'teaching-plan';stage:TeachingStage;message:string;current:boolean;timing_mode:'draft'|'measured'|'unknown';can_run:boolean;can_render?:boolean;render?:TeachingRender|null;video_ready:boolean;accepted:false;execution:'not-run'|TeachingRender['state']};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hash=/^[a-f0-9]{64}$/;
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function parseTeachingReadiness(value:unknown):boolean{
 if(!record(value)||value.generation_mode!=='teaching-plan'||value.experimental!==true||typeof value.ready!=='boolean')throw new Error('执行服务就绪状态无效，未提交任务。');
 return value.ready;
}
export function shouldRenderPlanResult(task:TeachingTask,result:unknown){
  return task.can_render===true&&record(result)&&result.status==='artifact-ready';
}
export function teachingStageLabel(stage:TeachingStage){return teachingStages[stage];}
export function currentTeachingTask(tasks:TeachingTask[],scene:string,timing:'draft'|'measured'){
  return tasks.find(task=>task.scene_id===scene&&task.timing_mode===timing&&task.current);
}
export function parseTeachingTask(value:unknown,projectId:string):TeachingTask {
  const bad=()=>new Error('教学任务响应无效，未更新状态；请刷新读取，不要重复提交。');
  if(!record(value)||value.project_id!==projectId||![value.id,value.project_id,value.scene_id].every(v=>typeof v==='string'&&uuid.test(v))||
    !Number.isSafeInteger(value.base_revision)||(value.base_revision as number)<1||typeof value.created_at!=='string'||!Number.isFinite(Date.parse(value.created_at))||
    typeof value.snapshot_sha256!=='string'||!hash.test(value.snapshot_sha256)||!['active','cancelled'].includes(String(value.state))||value.max_requests!==2||
    !Number.isSafeInteger(value.requests_used)||(value.requests_used as number)<0||(value.requests_used as number)>2||!Array.isArray(value.calls)||value.calls.length!==value.requests_used||
    value.generation_mode!=='teaching-plan'||typeof value.stage!=='string'||!Object.hasOwn(teachingStages,value.stage)||typeof value.message!=='string'||!value.message.trim()||
    typeof value.current!=='boolean'||typeof value.can_run!=='boolean'||!['draft','measured','unknown'].includes(String(value.timing_mode))||
    typeof value.video_ready!=='boolean'||value.accepted!==false||(value.can_render!==undefined&&typeof value.can_render!=='boolean'))throw bad();
  const render=value.render;
  if(render!=null&&(!record(render)||typeof render.id!=='string'||!uuid.test(render.id)||!['queued','running','succeeded','failed','interrupted','cancelled'].includes(String(render.state))||
    typeof render.artifact_sha256!=='string'||!hash.test(render.artifact_sha256)||typeof render.video_ready!=='boolean'||render.accepted!==false||
    !(render.error_code===null||typeof render.error_code==='string'&&/^[a-z-]{1,64}$/.test(render.error_code))||render.video_ready&&(render.state!=='succeeded'||render.error_code!==null)))throw bad();
  if(value.video_ready!==(render!=null&&(render as TeachingRender).video_ready)||value.execution!==(render!=null?(render as TeachingRender).state:'not-run'))throw bad();
  if(value.video_ready&&!['preview-ready','cancelled','stale'].includes(value.stage))throw bad();
  if(value.stage==='preview-ready'&&!value.video_ready||value.stage==='render-queued'&&(!record(render)||render.state!=='queued')||value.stage==='rendering'&&(!record(render)||render.state!=='running')||
    value.stage==='render-blocked'&&(!record(render)||render.video_ready||['queued','running'].includes(String(render.state))))throw bad();
  if(value.can_render&&(!value.current||value.state!=='active'||value.timing_mode!=='draft'||!['artifact-cached','render-queued'].includes(value.stage)||value.video_ready))throw bad();
  const ids=new Set(),stages=new Set();
  for(const call of value.calls){
    if(!record(call)||typeof call.id!=='string'||!uuid.test(call.id)||ids.has(call.id)||!['plan','revision'].includes(String(call.stage))||stages.has(call.stage)||
      !['dispatched','succeeded','failed','unknown','cancelled'].includes(String(call.state))||typeof call.request_sha256!=='string'||!hash.test(call.request_sha256)||
      !(call.output_sha256===null||typeof call.output_sha256==='string'&&hash.test(call.output_sha256)))throw bad();
    ids.add(call.id);stages.add(call.stage);
  }
  if(value.can_run&&(!value.current||!['prepared','response-cached','revision-pending'].includes(value.stage))||
    (value.state==='cancelled')!==(value.stage==='cancelled'))throw bad();
  return value as TeachingTask;
}
export function teachingVideoUrl(project:string,task:TeachingTask,download=false){
 const checked=parseTeachingTask(task,project);
 if(!checked.video_ready)throw new Error('尚无已校验视频');
 return `/api/projects/${project}/teaching-tasks/${checked.id}/video${download?'?download=true':''}`;
}
export function parseTeachingTasks(value:unknown,projectId:string):TeachingTask[]{
  if(!record(value)||!Array.isArray(value.tasks)||value.limit!==50)throw new Error('教学任务列表无效。');
  const tasks=value.tasks.map(task=>parseTeachingTask(task,projectId));
  if(new Set(tasks.map(task=>task.id)).size!==tasks.length)throw new Error('教学任务列表包含重复记录。');
  return tasks;
}
// Keep the key after ambiguous network failures: the same click must recover the same root.
export function prepareKey(storage:Pick<Storage,'getItem'|'setItem'>,project:string,scene:string,revision:number,timing:'draft'|'measured',create=()=>crypto.randomUUID()):string{
  const key=`teaching-plan:${project}:${scene}:${revision}:${timing}`;
  const existing=storage.getItem(key);if(existing)return existing;
  const value=create();storage.setItem(key,value);return value;
}
