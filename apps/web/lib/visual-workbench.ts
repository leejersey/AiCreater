import {canRetime,type SceneRow,type Job} from './editor';

export type VisualJob = {
  id:string; project_id:string; scene_id:string|null; kind:'agent'|'export'|'restyle';
  /** The theme the job rendered in; restyle_of is the Agent version a restyle re-rendered. */
  theme_id?:string; theme_accent?:string; restyle_of?:string;
  agent?:{model:string;max_turns:number;revision?:{of:string;feedback:string};llm?:{source:'account'|'env';model:string}};
  state:'queued'|'running'|'succeeded'|'failed'|'cancelled';
  stage?:string|null; error?:string|null;current?:boolean;
  created_at?:string;
  result:{sha256?:string;frames?:string[];video?:string;srt?:string;accepted?:boolean;requests_dispatched?:number|null;
   /** pending: published from this machine only; the object-storage upload failed and the runner retries it. */
   backup?:'pending';
   agent?:{status:'passed';turns:number;finish_by:'model'|'harness';output_tokens:number}}|null;
};
export const AGENT_MAX_TURNS=25,MAX_FEEDBACK=2000;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]+$/.test(v);
const file=(v:unknown):v is string=>typeof v==='string'&&/^(?:source\.txt|video\.mp4|video\.srt|stills\/frame-\d+\.png)$/.test(v);
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const invalid=()=>new Error('视觉任务响应无效，请刷新状态，不要重复提交。');

export function parseVisualJobs(value:unknown,projectId:string):VisualJob[] {
  if(!object(value)||!Array.isArray(value.jobs))throw invalid();
  const ids=new Set<string>();
  return value.jobs.map((v:unknown)=>{
    if(!object(v)||!identifier(v.id)||ids.has(v.id)||v.project_id!==projectId||
      (v.scene_id!=null&&!identifier(v.scene_id))||(v.kind!=='agent'&&v.kind!=='export'&&v.kind!=='restyle')||
      typeof v.state!=='string'||!['queued','running','succeeded','failed','cancelled'].includes(v.state)||
      (v.stage!=null&&(typeof v.stage!=='string'||v.stage.length>120))||
      (v.current!==undefined&&typeof v.current!=='boolean')||
      (v.created_at!=null&&(typeof v.created_at!=='string'||v.created_at.length>80||!Number.isFinite(Date.parse(v.created_at))))||
      (v.error!=null&&(typeof v.error!=='string'||v.error.length>500)))throw invalid();
    ids.add(v.id);
    if(v.input_summary!==undefined&&!object(v.input_summary))throw invalid();
    const summary=object(v.input_summary)?v.input_summary:{};
    if(summary.theme_id!==undefined&&(typeof summary.theme_id!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(summary.theme_id)))throw invalid();
    if(v.kind==='restyle'&&!identifier(summary.agent_id))throw invalid();
    if(summary.theme_accent!==undefined&&(typeof summary.theme_accent!=='string'||!/^#[0-9a-f]{6}$/.test(summary.theme_accent)))throw invalid();
    let agent:VisualJob['agent'];
    if(v.kind==='agent'){
      // Any configured model name; a strict value here would hide the whole job list when the default changes.
      if(typeof summary.model!=='string'||!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(summary.model)||!Number.isInteger(summary.max_turns)||Number(summary.max_turns)<1||Number(summary.max_turns)>AGENT_MAX_TURNS)throw invalid();
      if((summary.revision_of!==undefined||summary.feedback!==undefined)&&(!identifier(summary.revision_of)||typeof summary.feedback!=='string'||!summary.feedback.trim()||summary.feedback.length>MAX_FEEDBACK))throw invalid();
      const llm=summary.llm as Record<string,unknown>|undefined;
      if(llm!==undefined&&(!object(llm)||!['account','env'].includes(llm.source as string)||typeof llm.model!=='string'||!/^[\x21-\x7e]{1,200}$/.test(llm.model)))throw invalid();
      agent={model:summary.model,max_turns:Number(summary.max_turns),...(summary.revision_of!==undefined?{revision:{of:summary.revision_of as string,feedback:summary.feedback as string}}:{}),
        ...(llm?{llm:{source:llm.source as 'account'|'env',model:llm.model as string}}:{})};
    }else if(Object.hasOwn(summary,'max_turns'))throw invalid();
    let result:VisualJob['result']=null;
    if(v.result!=null){
      const r=v.result;if(!object(r))throw invalid();
      if((r.sha256!==undefined&&!sha(r.sha256))||
        (r.frames!==undefined&&(!Array.isArray(r.frames)||!r.frames.every(f=>file(f)&&f.startsWith('stills/'))))||
        (r.video!==undefined&&r.video!=='video.mp4')||(r.srt!==undefined&&r.srt!=='video.srt')||
        (r.accepted!==undefined&&typeof r.accepted!=='boolean')||(r.backup!==undefined&&r.backup!=='pending')||
        (r.requests_dispatched!=null&&(!Number.isInteger(r.requests_dispatched)||Number(r.requests_dispatched)<0||Number(r.requests_dispatched)>(agent?.max_turns??0))))throw invalid();
      let agentResult:NonNullable<VisualJob['result']>['agent'];
      if(v.kind==='agent'&&v.state==='succeeded'){
        const usage=r.usage;
        if(r.status!=='passed'||!['model','harness'].includes(r.finish_by as string)||!Number.isInteger(r.turns)||Number(r.turns)<1||Number(r.turns)>agent!.max_turns||
          r.requests_dispatched!==r.turns||!object(usage)||!Number.isInteger(usage.outputTokens)||Number(usage.outputTokens)<0||
          r.video!=='video.mp4'||r.srt!=='video.srt'||!Array.isArray(r.frames)||!r.frames.length)throw invalid();
        agentResult={status:'passed',turns:Number(r.turns),finish_by:r.finish_by as 'model'|'harness',output_tokens:Number(usage.outputTokens)};
      }
      result={...(r.sha256!==undefined?{sha256:r.sha256 as string}:{}),...(r.frames!==undefined?{frames:r.frames as string[]}:{}),
        ...(r.video?{video:'video.mp4'}:{}),...(r.srt?{srt:'video.srt'}:{}),
        ...(r.accepted!==undefined?{accepted:r.accepted as boolean}:{}),...(r.backup==='pending'?{backup:'pending' as const}:{}),...(r.requests_dispatched!==undefined?{requests_dispatched:r.requests_dispatched as number|null}:{}),...(agentResult?{agent:agentResult}:{})};
    }else if(v.kind==='agent'&&v.state==='succeeded')throw invalid();
    return {id:v.id,project_id:projectId,scene_id:(v.scene_id??null) as string|null,kind:v.kind,state:v.state as VisualJob['state'],stage:v.stage as string|null|undefined,error:v.error as string|null|undefined,...(typeof v.created_at==='string'?{created_at:v.created_at}:{}),...(agent?{agent}:{}),...(v.current!==undefined?{current:v.current as boolean}:{}),
      ...(typeof summary.theme_id==='string'?{theme_id:summary.theme_id}:{}),...(typeof summary.theme_accent==='string'?{theme_accent:summary.theme_accent}:{}),...(v.kind==='restyle'?{restyle_of:summary.agent_id as string}:{}),result};
  });
}
export function sceneAudioActions(row:SceneRow,jobs:Job[]) {
  const current=jobs.filter(j=>j.scene_id===row.id&&j.base_revision===row.revision&&(j.kind!=='voice'||j.voice_current!==false));
  const active=current.some(j=>['voice','timing'].includes(j.kind)&&['queued','running'].includes(j.state));
  const voice=current.find(j=>j.kind==='voice');
  const retry=voice?.state==='failed'&&voice.error?.retryable===true;
  return {
    voiceBlocked:active||row.state!=='needs_voice'||(voice?.state==='failed'&&!retry),
    timingBlocked:active||!canRetime(row),
    timingPath:`/api/scenes/${encodeURIComponent(row.id)}/timing`,
    timingBody:{expected_revision:row.revision},
    voicePath:retry?`/api/jobs/${encodeURIComponent(voice.job_id)}/retry`:`/api/scenes/${encodeURIComponent(row.id)}/voice`,
    estimatePath:retry?`/api/jobs/${encodeURIComponent(voice.job_id)}/estimate`:null,
    voiceBody:retry?{}:{expected_revision:row.revision},
    retry,
  };
}
export function visualFileUrl(projectId:string,jobId:string,name:string):string {
  if(!identifier(projectId)||!identifier(jobId)||!file(name))throw invalid();
  return `/api/projects/${projectId}/visual/${jobId}/files/${name}`;
}
export function measuredReady(row:SceneRow):boolean {
  const scene=row.scene;
  return row.state==='ready'&&!!scene.narration.audio_asset_id&&Number.isSafeInteger(scene.duration_frames)&&
    (scene.duration_frames??0)>0&&Array.isArray(scene.captions)&&scene.captions.length>0&&
    scene.captions.every(c=>!!c&&typeof c.text==='string'&&Number.isSafeInteger(c.start_frame)&&Number.isSafeInteger(c.end_frame)&&c.start_frame>=0&&c.end_frame>c.start_frame&&c.end_frame<=scene.duration_frames!);
}
export function videoProgress(job:VisualJob,now=0){
 const active=job.state==='queued'||job.state==='running';
 const failureText=job.error||'任务执行失败。';
 const failureDetail=/未自动重试/.test(failureText)?failureText:failureText+' 未自动重试。';
 const step=job.state==='succeeded'&&job.result?.video?4:job.state==='running'?(job.kind!=='agent'||job.stage?.includes('渲染')?3:2):1;
 const label=job.state==='queued'?'等待执行':job.state==='running'?(job.kind==='export'?'渲染整课视频':job.kind==='restyle'?'按新主题渲染本章':'Agent 正在生成画面'):videoTaskStatus(job);
 const agentStage=job.kind==='agent'&&job.state==='running'&&job.stage&&job.stage!=='agent'?job.stage:undefined;
 const detail=agentStage?agentStage+'。':job.state==='queued'?'任务已提交，等待执行器领取。':job.state==='running'?(job.kind==='export'?'正在本机渲染整课 MP4，视频文件尚未就绪。':job.kind==='restyle'?'正在本机按课程当前主题重新渲染，不调用模型。':'Agent 正在编写、检查和修正画面，通过后渲染本章视频。'):job.state==='failed'?failureDetail:job.state==='cancelled'?'任务已取消，不会自动重新提交。':job.result?.video?'可播放视频已就绪。':'没有生成可播放视频，请检查失败详情。';
 const seconds=active&&job.created_at&&now>0?Math.max(0,Math.floor((now-Date.parse(job.created_at))/1000)):undefined;
 const elapsed=seconds===undefined?undefined:`已等待 ${seconds>=60?`${Math.floor(seconds/60)}分`:''}${seconds%60}秒`;
 return {active,step,label,detail,elapsed};
}
export function videoTaskStatus(job:VisualJob):string{
 if(job.state==='queued')return '视频任务排队中';
 if(job.state==='running')return '视频生成中';
 if(job.state==='failed')return '视频生成失败';
 if(job.state==='cancelled')return '视频任务已取消';
 if(job.kind==='export')return job.result?.video?'整课视频已导出':'整课视频未生成';
 if(job.kind==='restyle')return job.result?.video?'新主题预览已渲染':'新主题预览未生成';
 return job.result?.video?'Agent 视频已生成':'Agent 未生成视频';
}
export function reviewFrames(frames:string[]):string[] {
  if(!frames.length)return [];
  // Agent samples start and end on cue boundaries, where scenes are often mid-fade; use the frames just inside.
  if(frames.length>=5)return [...new Set([frames[1],frames[Math.floor(frames.length/2)],frames[frames.length-2]])];
  return [...new Set([frames[0],frames[Math.floor(frames.length/2)],frames[frames.length-1]])];
}
export function visualError(error:unknown):string {
  const cause=error instanceof Error?error.cause:undefined;
  if(cause===401)return '登录已失效，请重新登录。';
  if(cause===409)return '版本冲突或产物已失效，请刷新并重新核对；不要重复提交。';
  return '操作未完成，请刷新项目与任务状态；不要重复提交。';
}

/** The latest Agent job of a scene that is still current, for the chapter's Agent panel. */
export function latestAgentJob(jobs:VisualJob[]):VisualJob|undefined{
 return jobs.find(j=>j.kind==='agent'&&j.current!==false);
}
/** The newest still-current re-render of an Agent version in the course's theme, if any. */
export function restyleOf(jobs:VisualJob[],agentId:string|undefined):VisualJob|undefined{
 return agentId?jobs.find(j=>j.kind==='restyle'&&j.restyle_of===agentId&&j.current!==false):undefined;
}
/** Jobs from before themes rendered in the default theme. */
export function renderedTheme(job:VisualJob,defaultTheme:string):string{return job.theme_id??defaultTheme;}
/** Whether a job rendered in the course's current theme and accent. */
export function sameLook(job:VisualJob,defaultTheme:string,courseTheme:string,courseAccent?:string|null):boolean{
 return renderedTheme(job,defaultTheme)===courseTheme&&(job.theme_accent??null)===(courseAccent??null);
}
export function visualAgentBody(sceneId:string,revision:number,revise?:{job:string;feedback:string}){
 if(!identifier(sceneId)||!Number.isInteger(revision)||revision<1)throw invalid();
 if(revise&&(!identifier(revise.job)||!revise.feedback.trim()||revise.feedback.length>MAX_FEEDBACK))throw invalid();
 return {scene_id:sceneId,expected_revision:revision,confirmed:true,max_turns:AGENT_MAX_TURNS,...(revise?{revise:revise.job,feedback:revise.feedback.trim()}:{})};
}
export function canAcceptAgent(job:VisualJob):boolean{
 return job.kind==='agent'&&job.state==='succeeded'&&job.current!==false&&job.result?.agent?.status==='passed'&&
  !!job.result.sha256&&job.result.video==='video.mp4'&&(job.result.frames?.length??0)>0;
}
/** The version course export will use for a chapter: the newest accepted, current Agent video. */
export function exportedVersion(jobs:VisualJob[]):VisualJob|undefined{
 return jobs.filter(j=>j.kind==='agent'&&j.state==='succeeded'&&j.current!==false&&j.result?.accepted===true)
  .sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??''))[0];
}

export type ChapterStatus={key:'needs_voice'|'needs_timing'|'running'|'review'|'confirmed'|'todo';label:string};
/** Where a chapter is on the way to an exportable video. */
export function chapterStatus(row:SceneRow,jobs:VisualJob[]):ChapterStatus{
 const own=jobs.filter(j=>j.scene_id===row.id&&j.current!==false);
 if(own.some(j=>['queued','running'].includes(j.state)))return{key:'running',label:'生成中'};
 if(!measuredReady(row))return row.state==='needs_timing'?{key:'needs_timing',label:'待对齐'}:{key:'needs_voice',label:'待配音'};
 if(exportedVersion(own))return{key:'confirmed',label:'已确认'};
 if(own.some(canAcceptAgent))return{key:'review',label:'待确认'};
 return{key:'todo',label:'待生成'};
}
/** Chapters an Agent batch would start: voiced, nothing confirmed, nothing running. */
export function agentBatchScenes(rows:SceneRow[],jobs:VisualJob[]):SceneRow[]{
 return rows.filter(row=>chapterStatus(row,jobs).key==='todo');
}

// Measured on the voiced RAG chapters: about 5 spoken characters per second. The Agent accepts 1–120 s chapters.
export const CHARS_PER_SECOND=5,AGENT_MAX_SECONDS=120;
export function estimatedSeconds(text:string):number{
 return Math.round(Array.from(text).filter(c=>!/\s/u.test(c)).length/CHARS_PER_SECOND);
}
/** Code-point offset of a textarea caret, as the API counts characters. */
export function codePointOffset(text:string,utf16Index:number):number{
 return Array.from(text.slice(0,utf16Index)).length;
}
