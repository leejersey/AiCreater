import {canRetime,type SceneRow,type Job} from './editor';
export type VisualGenerationMode='source'|'host-motion'|'host-intent'|'host-components';
export const visualModeLabels:Record<VisualGenerationMode,string>={source:'自由画面源码','host-motion':'宿主运动','host-intent':'动作意图','host-components':'宿主组件绘图'};
export const isVisualDataMode=(mode?:VisualGenerationMode)=>mode==='host-motion'||mode==='host-intent'||mode==='host-components';

type LayoutPoint={x:number;y:number};
type LayoutResult={original_design_sha256:string;layout_sha256:string;layout_preflight:'passed'|'failed';moves:{objectId:string;from:LayoutPoint;to:LayoutPoint}[];unresolved:{kind:string;objects:string[];detail:string}[]};
export type VisualJob = {
  id:string; project_id:string; scene_id:string|null; kind:'generate'|'repair'|'preview'|'export'|'prepare-transfer'|'preview-transfer'|'recover-source'|'propose-layout'|'agent';
  agent?:{model:string;max_turns:number};
  state:'queued'|'running'|'succeeded'|'failed'|'cancelled';
  stage?:string|null; error?:string|null;current?:boolean;
  created_at?:string;
  generation_mode?:VisualGenerationMode;
  timing_mode?:'draft';
  operation?:'retime'|'quality-repair';
  repair_preview_id?:string;
  design_revision_of?:string;
  result: (Partial<LayoutResult>&{sha256?:string;design_sha256?:string;recovery_sha256?:string;generation_mode?:VisualGenerationMode;assembly_sha256?:string;intent_sha256?:string;binding_sha256?:string;execution?:'not_run';technical?:'passed';visual?:'pending';production_adopted?:false;diagnostic?:true;preset?:'rag-augmentation:1';origin_sha256?:string;source?:string;design?:unknown;geometry?:{status:string};frames?:string[];video?:string;srt?:string;accepted?:boolean;requests_dispatched?:number|null;
   agent?:{status:'passed';turns:number;finish_by:'model'|'harness';output_tokens:number}})|null;
};
export const AGENT_MAX_TURNS=25;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]+$/.test(v);
const file=(v:unknown):v is string=>typeof v==='string'&&/^(?:source\.txt|design\.json|video\.mp4|video\.srt|stills\/frame-\d+\.png)$/.test(v);
const invalid=()=>new Error('视觉任务响应无效，请刷新状态，不要重复提交。');
const layoutKeys=['generation_mode','requests_dispatched','execution','technical','visual','production_adopted','diagnostic','design_sha256','original_design_sha256','layout_sha256','design','moves','unresolved','layout_preflight'];
const boundedText=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
const boundedArray=(v:unknown,check:(item:unknown)=>boolean):boolean=>Array.isArray(v)&&v.length<=1000&&Array.from(v).every(check);
const layoutPoint=(v:unknown):boolean=>object(v)&&Object.keys(v).sort().join(',')==='x,y'&&typeof v.x==='number'&&Number.isFinite(v.x)&&typeof v.y==='number'&&Number.isFinite(v.y);
function validLayoutResult(r:unknown):r is NonNullable<VisualJob['result']>&LayoutResult{
 return object(r)&&Object.keys(r).length===layoutKeys.length&&Object.keys(r).every(k=>layoutKeys.includes(k))&&
  r.generation_mode==='source'&&r.requests_dispatched===0&&r.execution==='not_run'&&r.technical==='passed'&&r.visual==='pending'&&r.production_adopted===false&&r.diagnostic===true&&
  ['design_sha256','original_design_sha256','layout_sha256'].every(k=>typeof r[k]==='string'&&/^[a-f0-9]{64}$/.test(r[k] as string))&&object(r.design)&&
  ['passed','failed'].includes(r.layout_preflight as string)&&
  boundedArray(r.moves,m=>object(m)&&Object.keys(m).sort().join(',')==='from,objectId,to'&&boundedText(m.objectId,200)&&layoutPoint(m.from)&&layoutPoint(m.to))&&
  boundedArray(r.unresolved,u=>object(u)&&Object.keys(u).sort().join(',')==='detail,kind,objects'&&boundedText(u.kind,120)&&boundedText(u.detail,2000)&&boundedArray(u.objects,id=>boundedText(id,200)))&&
  (r.layout_preflight!=='passed'||(r.unresolved as unknown[]).length===0);
}
const recoveryKeys=['sha256','design_sha256','recovery_sha256','source','design','requests_dispatched','execution','technical','visual','production_adopted','diagnostic','generation_mode'];
function validRecoveryResult(r:unknown):boolean{
 return object(r)&&Object.keys(r).every(k=>recoveryKeys.includes(k))&&
  ['sha256','design_sha256','recovery_sha256'].every(k=>typeof r[k]==='string'&&/^[a-f0-9]{64}$/.test(r[k] as string))&&
  typeof r.source==='string'&&!!r.source.trim()&&object(r.design)&&r.requests_dispatched===0&&
  r.execution==='not_run'&&r.technical==='passed'&&r.visual==='pending'&&r.production_adopted===false&&r.diagnostic===true&&r.generation_mode==='source';
}
export function parseVisualJobs(value:unknown,projectId:string):VisualJob[] {
  if(!object(value)||!Array.isArray(value.jobs))throw invalid();
  const ids=new Set<string>();
  return value.jobs.map((v:unknown)=>{
    if(!object(v)||!identifier(v.id)||ids.has(v.id)||v.project_id!==projectId||
      (v.scene_id!=null&&!identifier(v.scene_id))||typeof v.kind!=='string'||!['generate','repair','preview','export','prepare-transfer','preview-transfer','recover-source','propose-layout','agent'].includes(v.kind)||
      typeof v.state!=='string'||!['queued','running','succeeded','failed','cancelled'].includes(v.state)||
      (v.stage!=null&&(typeof v.stage!=='string'||v.stage.length>120))||
      (v.current!==undefined&&typeof v.current!=='boolean')||
      (v.created_at!=null&&(typeof v.created_at!=='string'||v.created_at.length>80||!Number.isFinite(Date.parse(v.created_at))))||
      (v.error!=null&&(typeof v.error!=='string'||v.error.length>500)))throw invalid();
    ids.add(v.id);
    if(v.input_summary!==undefined&&!object(v.input_summary))throw invalid();
    const summary=object(v.input_summary)?v.input_summary:{};
    if(summary.timing_mode!==undefined&&summary.timing_mode!=='draft')throw invalid();
    if(summary.operation!==undefined&&(!['retime','quality-repair'].includes(summary.operation as string)||v.kind!=='repair'))throw invalid();
    if(summary.repair_preview_id!==undefined&&!identifier(summary.repair_preview_id))throw invalid();
    if(summary.design_revision_of!==undefined&&!identifier(summary.design_revision_of))throw invalid();
    if(summary.timing_mode==='draft'&&(v.accepted===true||(object(v.result)&&v.result.accepted===true)))throw invalid();
    if(v.kind==='propose-layout'&&(summary.generation_mode!=='source'||(v.state==='succeeded'&&!validLayoutResult(v.result))||
      (object(v.result)&&['source','sha256','video','frames','geometry','srt'].some(k=>Object.hasOwn(v.result as object,k)))))throw invalid();
    if(v.kind==='recover-source'&&(summary.generation_mode!=='source'||(v.state==='succeeded'&&!validRecoveryResult(v.result))))throw invalid();
    if(summary.preset!==undefined&&summary.preset!=='rag-augmentation:1')throw invalid();
    if(Object.hasOwn(summary,'generation_mode')&&!['source','host-motion','host-intent','host-components'].includes(summary.generation_mode as string))throw invalid();
    const resultMode=object(v.result)?v.result.generation_mode:undefined;
    const mode=summary.generation_mode??resultMode??'source';
    if(!['source','host-motion','host-intent','host-components'].includes(mode as string)||(resultMode!==undefined&&resultMode!==mode))throw invalid();
    let agent:VisualJob['agent'];
    if(v.kind==='agent'){
      // Any configured model name; a strict value here would hide the whole job list when the default changes.
      if(typeof summary.model!=='string'||!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(summary.model)||!Number.isInteger(summary.max_turns)||Number(summary.max_turns)<1||Number(summary.max_turns)>AGENT_MAX_TURNS)throw invalid();
      agent={model:summary.model,max_turns:Number(summary.max_turns)};
    }else if(Object.hasOwn(summary,'max_turns'))throw invalid();
    const r0=object(v.result)?v.result:undefined;
    let agentResult:NonNullable<VisualJob['result']>['agent'];
    if(v.kind==='agent'&&v.state==='succeeded'){
      const usage=r0?.usage;
      if(!r0||r0.status!=='passed'||!['model','harness'].includes(r0.finish_by as string)||!Number.isInteger(r0.turns)||Number(r0.turns)<1||Number(r0.turns)>agent!.max_turns||
        r0.requests_dispatched!==r0.turns||!object(usage)||!Number.isInteger(usage.outputTokens)||Number(usage.outputTokens)<0||
        r0.video!=='video.mp4'||r0.srt!=='video.srt'||!Array.isArray(r0.frames)||!r0.frames.length)throw invalid();
      agentResult={status:'passed',turns:Number(r0.turns),finish_by:r0.finish_by as 'model'|'harness',output_tokens:Number(usage.outputTokens)};
    }
    // Agent runs report paid turns, which may exceed the two-request cap of the older generators.
    const maxRequests=v.kind==='agent'?(agent?.max_turns??0):2;
    let result:VisualJob['result']=null;
    if(v.result!=null){
      const r=v.result;if(!object(r))throw invalid();
      if(v.state==='succeeded'&&['prepare-transfer','preview-transfer'].includes(v.kind)&&(summary.preset!==r.preset||
        (r.preset!==undefined&&(r.preset!=='rag-augmentation:1'||typeof r.origin_sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.origin_sha256)))||
        (r.preset===undefined&&r.origin_sha256!==undefined)))throw invalid();
      if(v.kind==='preview-transfer'&&v.state==='succeeded'&&(r.diagnostic!==true||r.production_adopted!==false||r.requests_dispatched!==0||r.accepted===true||
        !['sha256','design_sha256','assembly_sha256','binding_sha256'].every(k=>typeof r[k]==='string'&&/^[a-f0-9]{64}$/.test(r[k] as string))||
        !object(r.geometry)||!Array.isArray(r.frames)||!r.frames.length||
        (object(r.geometry)&&r.geometry.status==='passed'&&(r.video!=='video.mp4'||r.srt!=='video.srt'))))throw invalid();
      if(v.kind==='prepare-transfer'&&v.state==='succeeded'&&(r.requests_dispatched!==0||r.execution!=='not_run'||r.technical!=='passed'||r.visual!=='pending'||r.production_adopted!==false||
        !['sha256','design_sha256','assembly_sha256','binding_sha256'].every(k=>typeof r[k]==='string'&&/^[a-f0-9]{64}$/.test(r[k] as string))||typeof r.source!=='string'||!r.source||!object(r.design)||
        ['video','srt','frames','geometry','generation_mode'].some(k=>Object.hasOwn(r,k))))throw invalid();
      if((r.sha256!==undefined&&(typeof r.sha256!=='string'||! /^[a-f0-9]{64}$/.test(r.sha256)))||
        (r.design_sha256!==undefined&&(typeof r.design_sha256!=='string'||! /^[a-f0-9]{64}$/.test(r.design_sha256)))||
        (r.assembly_sha256!==undefined&&(typeof r.assembly_sha256!=='string'||! /^[a-f0-9]{64}$/.test(r.assembly_sha256)))||
        (r.intent_sha256!==undefined&&(typeof r.intent_sha256!=='string'||! /^[a-f0-9]{64}$/.test(r.intent_sha256)))||
        (r.source!==undefined&&typeof r.source!=='string')||
        (r.frames!==undefined&&(!Array.isArray(r.frames)||!r.frames.every(f=>file(f)&&f.startsWith('stills/'))))||
        (r.video!==undefined&&r.video!=='video.mp4')||(r.srt!==undefined&&r.srt!=='video.srt')||
        (r.geometry!==undefined&&(!object(r.geometry)||typeof r.geometry.status!=='string'))||
        (r.accepted!==undefined&&typeof r.accepted!=='boolean')||
        (r.requests_dispatched!=null&&(!Number.isInteger(r.requests_dispatched)||Number(r.requests_dispatched)<0||Number(r.requests_dispatched)>maxRequests)))throw invalid();
      result={...(r.sha256!==undefined?{sha256:r.sha256 as string}:{}),...(r.design_sha256!==undefined?{design_sha256:r.design_sha256 as string}:{}),...(r.source!==undefined?{source:r.source as string}:{}),
        ...(v.kind==='propose-layout'&&validLayoutResult(r)?{original_design_sha256:r.original_design_sha256,layout_sha256:r.layout_sha256,layout_preflight:r.layout_preflight,moves:r.moves,unresolved:r.unresolved,execution:'not_run',technical:'passed',visual:'pending',production_adopted:false,diagnostic:true}:{}),
        ...(resultMode!==undefined?{generation_mode:resultMode as VisualGenerationMode}:{}),...(r.assembly_sha256!==undefined?{assembly_sha256:r.assembly_sha256 as string}:{}),
        ...(r.intent_sha256!==undefined?{intent_sha256:r.intent_sha256 as string}:{}),
        ...(v.kind==='recover-source'&&v.state==='succeeded'?{recovery_sha256:r.recovery_sha256 as string,execution:'not_run',technical:'passed',visual:'pending',production_adopted:false,diagnostic:true}:{}),
        ...(v.kind==='prepare-transfer'&&v.state==='succeeded'?{binding_sha256:r.binding_sha256 as string,execution:'not_run',technical:'passed',visual:'pending',production_adopted:false}:{}),
        ...(v.kind==='preview-transfer'&&v.state==='succeeded'?{binding_sha256:r.binding_sha256 as string,diagnostic:true,production_adopted:false}:{}),
        ...(v.state==='succeeded'&&r.preset==='rag-augmentation:1'?{preset:'rag-augmentation:1',origin_sha256:r.origin_sha256 as string}:{}),
        ...(r.design!==undefined?{design:r.design}:{}),...(r.frames!==undefined?{frames:r.frames as string[]}:{}),
        ...(r.video?{video:'video.mp4'}:{}),...(r.srt?{srt:'video.srt'}:{}),
        ...(r.geometry?{geometry:{status:(r.geometry as {status:string}).status}}:{}),...(r.accepted!==undefined?{accepted:r.accepted as boolean}:{}),...(r.requests_dispatched!==undefined?{requests_dispatched:r.requests_dispatched as number|null}:{}),...(agentResult?{agent:agentResult}:{})};
    }
    if(['generate','repair'].includes(v.kind)&&v.state==='succeeded'&&(mode==='host-intent'||mode==='host-components')&&
      (resultMode!==mode||!result?.assembly_sha256||!result.intent_sha256))throw invalid();
    return {id:v.id,project_id:projectId,...(summary.design_revision_of?{design_revision_of:summary.design_revision_of as string}:{}),scene_id:(v.scene_id??null) as string|null,kind:v.kind as VisualJob['kind'],state:v.state as VisualJob['state'],stage:v.stage as string|null|undefined,error:v.error as string|null|undefined,...(typeof v.created_at==='string'?{created_at:v.created_at}:{}),...(summary.repair_preview_id?{repair_preview_id:summary.repair_preview_id as string}:{}),...(summary.timing_mode==='draft'?{timing_mode:'draft' as const}:{}),...(summary.operation?{operation:summary.operation as VisualJob['operation']}:{}),...(agent?{agent}:{}),...(v.current!==undefined?{current:v.current as boolean}:{}),...(['generate','repair','recover-source','propose-layout'].includes(v.kind)?{generation_mode:mode as VisualGenerationMode}:{}),result};
  });
}
export function visualGenerateBody(sceneId:string,revision:number,mode:VisualGenerationMode){
 if(!['source','host-motion','host-intent','host-components'].includes(mode))throw invalid();
 return {scene_id:sceneId,expected_revision:revision,confirmed:true,max_requests:2,generation_mode:mode};
}
export function parseTransferImport(value:unknown):{design:Record<string,unknown>;roles:Record<string,unknown>}{
 if(!object(value)||Object.keys(value).sort().join(',')!=='design,roles'||!object(value.design)||!object(value.roles)||new TextEncoder().encode(JSON.stringify(value)).length>128*1024)throw invalid();
 return {design:value.design,roles:value.roles};
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
  const scene=row.scene as SceneRow['scene']&{captions?:{start_frame:number;end_frame:number;text:string}[]};
  return row.state==='ready'&&!!scene.narration.audio_asset_id&&Number.isSafeInteger(scene.duration_frames)&&
    (scene.duration_frames??0)>0&&Array.isArray(scene.captions)&&scene.captions.length>0&&
    scene.captions.every(c=>!!c&&typeof c.text==='string'&&Number.isSafeInteger(c.start_frame)&&Number.isSafeInteger(c.end_frame)&&c.start_frame>=0&&c.end_frame>c.start_frame&&c.end_frame<=scene.duration_frames!);
}
export function canAcceptPreview(job:VisualJob):boolean {
  return job.timing_mode!=='draft'&&job.kind==='preview'&&job.state==='succeeded'&&job.result?.geometry?.status==='passed'&&
    !!job.result.sha256&&job.result.video==='video.mp4'&&(job.result.frames?.length??0)>0;
}
export function visualGenerationActions(job:VisualJob) {
  const generated=job.kind==='generate'||job.kind==='repair';
  return {review:generated&&job.state==='succeeded',repair:generated&&['succeeded','failed'].includes(job.state)};
}
export function chapterPresentation(jobs:VisualJob[]){
 const current=jobs.filter(j=>j.current!==false);
 const video=current.find(j=>j.kind==='preview'&&j.state==='succeeded'&&j.result?.video==='video.mp4');
 const sources=current.filter(j=>(j.kind==='generate'||j.kind==='repair')&&(j.state==='succeeded'||(j.state==='failed'&&(j.result?.requests_dispatched??0)>0)));
 const candidate=sources.find(j=>j.state==='succeeded'&&j.result?.source&&j.result.sha256);
 const active=current.find(j=>['queued','running'].includes(j.state));
 const designRepairTarget=!active&&sources[0]&&canReviseDesign(sources[0])?sources[0]:undefined;
 const failedGeneration=sources[0]?.kind==='generate'&&sources[0].state==='failed';
 const repairTarget=!active&&candidate?current.find(j=>j.kind==='preview'&&j.state==='succeeded'&&j.result?.geometry?.status==='failed'&&!j.result.video&&j.result.sha256===candidate.result?.sha256):undefined;
 const priorRepair=repairTarget?current.find(j=>j.operation==='quality-repair'&&j.repair_preview_id===repairTarget.id):undefined;
 return {video,active,latest:active??current[0],
  designRepairTarget,repairTarget:failedGeneration||priorRepair?undefined:repairTarget,repairStopped:!failedGeneration&&!!priorRepair&&['failed','cancelled'].includes(priorRepair.state),
  editable:sources[0],pending:!failedGeneration&&!active&&!priorRepair&&candidate&&candidate.result?.sha256!==video?.result?.sha256?candidate:undefined,
  draft:sources.find(j=>j.timing_mode==='draft'&&j.state==='succeeded'&&j.result?.source)};
}
export function videoProgress(job:VisualJob,now=0){
 const active=job.state==='queued'||job.state==='running';
 const failureText=job.error||'任务执行失败。';
 const failureDetail=/未自动重试|未追加模型调用/.test(failureText)?failureText:failureText+' 未自动重试。';
 const rendering=['preview','preview-transfer','export','agent'].includes(job.kind);
 const step=rendering?(job.state==='succeeded'&&job.result?.video?4:3):job.state==='succeeded'&&job.result?.source?2:1;
 const label=job.design_revision_of&&(job.state==='queued'||job.state==='running')?(job.state==='queued'?'设计修复已排队':'程序正在修订设计'):job.state==='queued'?(job.operation==='quality-repair'?'程序修复已排队':'等待执行'):job.state==='running'?(rendering?'检查画面与渲染视频':job.operation==='retime'?'同步配音时间':job.operation==='quality-repair'?'程序正在修复画面':job.kind==='repair'?'修改画面':'设计画面与生成动画'):job.kind==='preview'&&job.state==='succeeded'&&job.result?.geometry?.status==='failed'?'画面需要程序修复':videoTaskStatus(job);
 const detail=job.state==='queued'?'任务已提交，等待执行器领取。':job.state==='running'?(rendering?'正在检查画面并生成 MP4，视频文件尚未就绪。':job.design_revision_of?'程序正依据已保存诊断修订设计，通过后继续生成视频；未通过则停止。':job.operation==='retime'?'正在使用实测字幕调整画面时间，不调用模型或配音。':job.operation==='quality-repair'?'程序已读取检查报告，正在修复具体画面问题；本轮最多一次模型请求，失败后停止。':'正在处理画面设计和动画代码，尚未进入视频渲染。'):job.state==='failed'?failureDetail:job.state==='cancelled'?'任务已取消，不会自动重新提交。':step===2?'画面已准备，下一步将自动检查并生成视频。':job.result?.video?'可播放视频已就绪。':job.result?.geometry?.status==='failed'?'程序已保留问题报告，可根据报告修复画面，不必手动填写诊断或重复检查。':'没有生成可播放视频，请检查失败详情或修改画面。';
 const seconds=active&&job.created_at&&now>0?Math.max(0,Math.floor((now-Date.parse(job.created_at))/1000)):undefined;
 const elapsed=seconds===undefined?undefined:`已等待 ${seconds>=60?`${Math.floor(seconds/60)}分`:''}${seconds%60}秒`;
 return {active,step,label,detail,elapsed};
}
export function videoTaskStatus(job:VisualJob):string{
 if(job.state==='queued')return '视频任务排队中';
 if(job.state==='running')return '视频生成中';
 if(job.state==='failed')return '视频生成失败';
 if(job.state==='cancelled')return '视频任务已取消';
 if(job.kind==='preview')return job.result?.video?'视频已生成':job.result?.geometry?.status==='failed'?'视频未生成：画面检查未通过':'视频未生成：检查结束但没有可播放文件';
 if(job.kind==='export')return job.result?.video?'整课视频已导出':'整课视频未生成';
 if(job.kind==='agent')return job.result?.video?'Agent 视频已生成':'Agent 未生成视频';
 if((job.kind==='generate'||job.kind==='repair')&&job.result?.source)return '画面已准备，待生成视频';
 return '准备任务已完成，尚未生成视频';
}
export function canReviseDesign(job:VisualJob):boolean{
 return job.kind==='generate'&&job.state==='failed'&&job.stage!=='stale'&&job.current!==false&&job.result?.requests_dispatched===1;
}
export function canRecoverSource(job:VisualJob):boolean{
 return (job.generation_mode??'source')==='source'&&job.state==='failed'&&job.current!==false&&job.stage!=='stale'&&
  ((job.kind==='generate'&&job.result?.requests_dispatched===2)||(job.kind==='repair'&&job.result?.requests_dispatched===1));
}
export function canProposeLayout(job:VisualJob):boolean{
 return (job.generation_mode??'source')==='source'&&canReviseDesign(job);
}
export function canApplyLayout(job:VisualJob):boolean{
 return job.kind==='propose-layout'&&job.state==='succeeded'&&job.generation_mode==='source'&&job.current!==false&&job.stage!=='stale'&&validLayoutResult(job.result)&&job.result.layout_preflight==='passed'&&job.result.moves.length>0;
}
export function canRepairRecoveredSource(job:VisualJob):boolean{
 return job.kind==='recover-source'&&job.state==='succeeded'&&job.current!==false&&job.stage!=='stale'&&
  job.generation_mode==='source'&&validRecoveryResult(job.result);
}
export function reviewFrames(frames:string[]):string[] {
  if(!frames.length)return [];
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
export function visualAgentBody(sceneId:string,revision:number){
 if(!identifier(sceneId)||!Number.isInteger(revision)||revision<1)throw invalid();
 return {scene_id:sceneId,expected_revision:revision,confirmed:true,max_turns:AGENT_MAX_TURNS};
}
export function canAcceptAgent(job:VisualJob):boolean{
 return job.kind==='agent'&&job.state==='succeeded'&&job.current!==false&&job.result?.agent?.status==='passed'&&
  !!job.result.sha256&&job.result.video==='video.mp4'&&(job.result.frames?.length??0)>0;
}
/** The version course export will use for a chapter: the newest accepted, current preview or Agent video. */
export function exportedVersion(jobs:VisualJob[]):VisualJob|undefined{
 return jobs.filter(j=>(j.kind==='preview'||j.kind==='agent')&&j.state==='succeeded'&&j.current!==false&&j.result?.accepted===true)
  .sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??''))[0];
}
