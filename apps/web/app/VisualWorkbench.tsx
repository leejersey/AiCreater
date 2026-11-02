'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {request,parseJobs,parseSceneJob,type Project,type Job} from '../lib/editor';
import {confirmEstimate} from '../lib/cost-estimates';
import {currentVoiceJob} from '../lib/course';
import {parseVisualJobs,parseTransferImport,visualFileUrl,measuredReady,canAcceptPreview,canReviseDesign,reviewFrames,visualError,sceneAudioActions,visualGenerationActions,visualModeLabels,isVisualDataMode,type VisualGenerationMode,type VisualJob} from '../lib/visual-workbench';
import {confirmVisualAction,visualGenerateAction,visualCreateVideoAction,visualRenderVideoAction,visualRepairAndRenderAction,visualRepairDesignVideoAction,visualAlignDraftAction,visualRepairAction,visualRepairVideoAction,visualPreviewAction,visualTransferAction,visualTransferPreviewAction,visualAutomaticTransferAction} from '../lib/visual-workbench-actions';
import {useConfirm} from './ConfirmContext';
import {VoiceSettings} from './VoiceSettings';
import {RefreshCw,Play,Check,Film,Mic,Code,X} from './Icons';
import {canRecoverSource,canRepairRecoveredSource} from '../lib/visual-workbench';
import {visualRecoverSourceAction,visualRepairSourceAction,type VisualAction} from '../lib/visual-workbench-actions';
import {canProposeLayout,canApplyLayout} from '../lib/visual-workbench';
import {visualProposeLayoutAction,visualApplyLayoutAction} from '../lib/visual-workbench-actions';
import {chapterPresentation,videoTaskStatus,videoProgress,latestAgentJob,canAcceptAgent,exportedVersion} from '../lib/visual-workbench';
import {visualAgentAction} from '../lib/visual-workbench-actions';

export function VisualLayoutProposal({job,disabled,onAction}:{job:VisualJob;disabled:boolean;onAction:(action:VisualAction)=>void}){
 return <>{canProposeLayout(job)&&<button disabled={disabled} onClick={()=>onAction(visualProposeLayoutAction(job))}><Code size={14}/>标签布局建议（免费）</button>}
  {job.kind==='propose-layout'&&job.state==='succeeded'&&job.result&&<>
   <p>仅标签纵向建议 · 未采用，不可预览或验收</p>
   <p>布局预检：{job.result.layout_preflight==='passed'?'通过':'未通过'}</p>
   <ul aria-label="标签坐标变化">{job.result.moves?.map((move,i)=><li key={i}>{move.objectId}：({move.from.x}, {move.from.y}) → ({move.to.x}, {move.to.y})</li>)}</ul>
   <p>未解决告警：{job.result.unresolved?.length??0}</p>
   <ul aria-label="未解决告警">{job.result.unresolved?.map((warning,i)=><li key={i}>{warning.kind} · {warning.objects.join('、')}：{warning.detail}</li>)}</ul>
   <details><summary>布局提案与设计详情</summary>
    <label>新设计 SHA-256<pre>{job.result.design_sha256}</pre></label>
    <label>原设计 SHA-256<pre>{job.result.original_design_sha256}</pre></label>
    <label>布局提案 SHA-256<pre>{job.result.layout_sha256}</pre></label>
    <label>提案设计<pre>{JSON.stringify(job.result.design,null,2)}</pre></label>
   </details>
   <button disabled={disabled||!canApplyLayout(job)} onClick={()=>onAction(visualApplyLayoutAction(job))}><Code size={14}/>采用布局并生成源码</button>
  </>}</>;
}

export function VisualArtifact({job}:{job:VisualJob}) {
  return <details aria-label="源码审核"><summary>源码与设计详情</summary>
    {job.generation_mode&&<p>生成方式：{visualModeLabels[job.generation_mode]}</p>}
    <label>SHA-256<pre>{job.result?.sha256??'尚无源码哈希'}</pre></label>
    {job.result?.design_sha256&&<label>设计 SHA-256<pre>{job.result.design_sha256}</pre></label>}
    {job.result?.recovery_sha256&&<label>诊断 SHA-256<pre>{job.result.recovery_sha256}</pre></label>}
    {job.result?.assembly_sha256&&<label>装配数据 SHA-256<pre>{job.result.assembly_sha256}</pre></label>}
    {job.result?.intent_sha256&&<label>动作意图 SHA-256<pre>{job.result.intent_sha256}</pre></label>}
    {job.result?.binding_sha256&&<label>机构绑定 SHA-256<pre>{job.result.binding_sha256}</pre></label>}
    {job.result?.preset&&<p>来源：RAG 增强搬运预设 · 固定机构 · 视觉待审阅</p>}
    {job.result?.origin_sha256&&<label>预设来源 SHA-256<pre>{job.result.origin_sha256}</pre></label>}
    {job.result?.source!==undefined&&<label>场景源码<pre>{job.result.source}</pre></label>}
    {job.result?.design!==undefined&&<label>视觉设计<pre>{JSON.stringify(job.result.design,null,2)}</pre></label>}
  </details>;
}
export function VisualGenerationModeSelect({value,onChange,disabled,sourceOnly=false}:{value:VisualGenerationMode;onChange:(value:VisualGenerationMode)=>void;disabled:boolean;sourceOnly?:boolean}){
 return <label>生成方式 <select value={value} disabled={disabled} onChange={event=>onChange(event.target.value as VisualGenerationMode)}>
  <option value="source">自由画面源码</option><option disabled={sourceOnly} value="host-motion">宿主运动（实验）</option>
  <option disabled={sourceOnly} value="host-intent">动作意图（实验）</option>
  <option disabled={sourceOnly} value="host-components">宿主组件绘图（实验）</option>
 </select></label>;
}
export function VisualJobStatus({job}:{job:VisualJob}) {
  return <>{job.timing_mode==='draft'&&<p>估时草稿 · 无声 · 不可验收或整课导出</p>}{job.operation==='retime'&&<p>免费实测对齐 · 新源码待审批</p>}{job.stage&&<p>执行阶段：{job.stage}</p>}{job.state==='failed'&&<p role="alert">{job.error||'任务未完成，请检查当前项目与任务状态。'} 未自动重试或回退模板。</p>}</>;
}
export function VisualSourceRecovery({job,disabled,feedback,onFeedback,onAction}:{job:VisualJob;disabled:boolean;feedback:string;onFeedback:(value:string)=>void;onAction:(action:VisualAction)=>void}){
 return <>{canRecoverSource(job)&&<button disabled={disabled} onClick={()=>onAction(visualRecoverSourceAction(job))}><Code size={14}/>源码离线诊断（免费）</button>}
  {job.kind==='recover-source'&&job.state==='succeeded'&&<><p>离线诊断成功 · 待审阅，未采用 · 不可预览或验收</p><VisualArtifact job={job}/>
   <label>源码修订反馈<textarea maxLength={8000} value={feedback} disabled={disabled} onChange={event=>onFeedback(event.target.value)}/></label>
   <button disabled={disabled||!canRepairRecoveredSource(job)||!feedback.trim()} onClick={()=>onAction(visualRepairSourceAction(job,feedback))}>作为起点修订源码（付费）</button>
  </>}</>;
}
const states:Record<string,string>={queued:'排队中',running:'执行中',succeeded:'已完成',failed:'失败，未自动重试',cancelled:'已取消'};
const kinds:Record<string,string>={agent:'Agent 生成',generate:'视觉生成',repair:'显式修复',preview:'预览',export:'整课导出','prepare-transfer':'机构候选','preview-transfer':'机构诊断预览','recover-source':'源码离线诊断','propose-layout':'标签布局建议'};
export function VisualHistoryEntry({job,children}:{job:VisualJob;children?:React.ReactNode}){
 const [open,setOpen]=useState(false);
 return <details className="vw-history-entry" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{kinds[job.kind]} · {videoTaskStatus(job)}{job.current===false?' · 历史版本':''}</summary>{open&&children}</details>;
}
export function VisualTaskProgress({job,now,updatedAt,disabled,onCancel,onRefresh}:{job:VisualJob;now:number;updatedAt:number;disabled:boolean;onCancel:()=>void;onRefresh:()=>void}){
 const progress=videoProgress(job,now);
 return <div className="vw-task-feedback" aria-label="视频任务进度">
  <p role={job.state==='failed'?'alert':'status'}><strong>{progress.label}</strong></p>
  <ol className="vw-progress-steps" aria-label="视频制作阶段">{['准备画面','自动检查','检查与渲染','视频就绪'].map((label,i)=><li key={label} aria-current={progress.step===i+1?'step':undefined} data-complete={progress.step>i+1}><span>{i+1}</span>{label}</li>)}</ol>
  {progress.active&&<progress aria-label={progress.label}/>}
  <p>{progress.detail}</p>
  <div className="vw-task-meta" aria-live="off">{progress.elapsed&&<span>{progress.elapsed}</span>}{updatedAt>0&&<span>最近更新 {new Date(updatedAt).toLocaleTimeString('zh-CN',{hour12:false})}</span>}{progress.active&&now-updatedAt>15000&&updatedAt>0&&<span className="vw-warning">状态超过15秒未更新，请刷新检查</span>}</div>
  <div className="vw-toolbar"><button disabled={disabled} onClick={onRefresh}><RefreshCw size={14}/>刷新状态</button>{progress.active&&<button disabled={disabled} onClick={onCancel}><X size={14}/>取消任务</button>}</div>
 </div>;
}
/** Agent path: one paid job designs, checks and renders the chapter; shown beside the existing video. */
export function VisualAgentPanel({projectId,job,exported,now,updatedAt,disabled,blockedReason,onStart,onRefresh,onCancel,onAccept}:{projectId:string;job?:VisualJob;exported?:VisualJob;now:number;updatedAt:number;disabled:boolean;blockedReason?:string;onStart:()=>void;onRefresh:()=>void;onCancel:()=>void;onAccept?:()=>void}){
 const running=!!job&&['queued','running'].includes(job.state);
 return <div aria-label="Agent 视频" className="vw-current-video"><h3>Agent 视频</h3>
  {!job&&<p>由 Agent 自行设计画面并检查，通过后直接生成本章视频（使用当前配音与字幕）。</p>}
  {job&&job.state==='succeeded'&&job.result?.agent&&<p>{job.result.agent.finish_by==='model'?'Agent 已自检并通过检查':'Agent 未自行收尾，已采用最后一个通过检查的版本'} · {job.result.agent.turns} 轮 · 输出 {job.result.agent.output_tokens.toLocaleString('zh-CN')} token</p>}
  {job&&job.state==='succeeded'&&<VisualMedia projectId={projectId} job={job} diagnostics/>}
  {job&&job.result?.accepted===true&&<p>已确认此版本 · 可用于整课导出</p>}
  <p>整课导出将使用：{!exported?'暂无已确认的版本':exported.id===job?.id?'上方这个 Agent 版本':`${exported.kind==='agent'?'更早确认的 Agent 版本':'已验收的预览'}${exported.created_at?`（${new Date(exported.created_at).toLocaleString('zh-CN',{hour12:false})}）`:''}`}</p>
  {job&&onAccept&&canAcceptAgent(job)&&!job.result?.accepted&&<div className="vw-toolbar"><button disabled={disabled} onClick={onAccept}><Check size={14}/>确认此版本</button></div>}
  {job&&job.state!=='succeeded'&&<VisualTaskProgress job={job} now={now} updatedAt={updatedAt} disabled={disabled} onRefresh={onRefresh} onCancel={onCancel}/>}
  {job?.state==='failed'&&typeof job.result?.requests_dispatched==='number'&&<p>{job.result.requests_dispatched?`本次已消耗 ${job.result.requests_dispatched} 轮模型调用。`:'本次没有产生模型消耗。'}</p>}
  <div className="vw-toolbar"><button disabled={disabled||running||!!blockedReason} onClick={onStart}><Film size={14}/>{job?'Agent 重新生成（付费）':'Agent 生成视频（付费）'}</button></div>
  {blockedReason&&!running&&<p>{blockedReason}</p>}
 </div>;
}
export default function VisualWorkbench({routeProjectId}:{routeProjectId:string}) {
  const confirm=useConfirm();
  const [project,setProject]=useState<Project|null>(null);
  const [jobs,setJobs]=useState<VisualJob[]>([]);
  const [voiceJobs,setVoiceJobs]=useState<Job[]>([]);
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [dirty,setDirty]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [generationMode,setGenerationMode]=useState<VisualGenerationMode>('source');
  const [transferInput,setTransferInput]=useState<ReturnType<typeof parseTransferImport>|null>(null);
  const [updatedAt,setUpdatedAt]=useState(0),[now,setNow]=useState(0);
  const [autoRepair,setAutoRepair]=useState(true);
  const lock=useRef(false),alive=useRef(true);
  const base='/api/projects/'+encodeURIComponent(routeProjectId);
  const refresh=useCallback(async()=>{
    const p=await request<Project>(base);
    const visual=parseVisualJobs(await request<unknown>(base+'/visual'),routeProjectId);
    const voice=parseJobs(await request<unknown>(base+'/jobs'),routeProjectId);
    if(alive.current){setProject(p);setJobs(visual);setVoiceJobs(voice);setUpdatedAt(Date.now());}
  },[base,routeProjectId]);
  useEffect(()=>{
    alive.current=true;let stopped=false;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{await refresh();if(!stopped)setError('');}catch(e){if(!stopped)setError(visualError(e));}
      if(!stopped)timer=setTimeout(()=>void poll(),3000);};
    void poll();return()=>{stopped=true;alive.current=false;clearTimeout(timer);};
  },[refresh]);
  async function act(fn:()=>Promise<unknown>){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await fn();await refresh();}catch(e){if(alive.current)setError(visualError(e));}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function submit(path:string,body:unknown){
    parseVisualJobs({jobs:[await request<unknown>(base+'/visual'+path,body)]},routeProjectId);
  }
  function cancelVisual(job:VisualJob){void act(async()=>{
    if(await confirm({title:'取消当前任务',message:'确认取消？已经发出的模型请求仍可能计费；不会自动重新提交。',confirmText:'取消任务'}))await submit('/'+job.id+'/cancel',{});
  });}
  const row=project?.scenes.find(s=>s.id===selected)??project?.scenes[0];
  const sceneJobs=jobs.filter(j=>j.scene_id===row?.id);
  // The older template flow; Agent jobs have their own panel and must not show up here as its latest task.
  const presentation=chapterPresentation(sceneJobs.filter(j=>j.kind!=='agent'));
  const latestExport=jobs.find(j=>j.kind==='export'&&j.current!==false&&j.state==='succeeded'&&j.result?.video);
  const activeJob=jobs.find(j=>['queued','running'].includes(j.state));
  const active=!!activeJob;
  useEffect(()=>{setNow(Date.now());if(!active)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[active]);
  const disabled=busy||dirty||!!error;
  const voice=row?currentVoiceJob(row,voiceJobs):undefined;
  const audioActions=row?sceneAudioActions(row,voiceJobs):null;
  const retime=()=>void act(async()=>{
    if(!row||!project||!audioActions)return;
    if(!await confirm({title:'免费重算本章时间轴',message:'按已有音频计算字幕与画面时间，保留原音频，不调用模型或配音服务；已有视觉预览与验收可能失效。',confirmText:'确认免费重算',variant:'info'}))return;
    const job=parseSceneJob(await request<unknown>(audioActions.timingPath,audioActions.timingBody),project.id,row,'timing');
    setVoiceJobs(previous=>[job,...previous.filter(j=>j.job_id!==job.job_id)]);
  });
  return <main className="visual-workbench">
    <header className="vw-header"><div><a href="/courses">课程</a><h1>{project?.title??'视觉工作台'}</h1><span>定制视觉 {project?`· r${project.revision}`:''}</span></div>
      <nav><a href={'/courses/'+encodeURIComponent(routeProjectId)+'/legacy'}>旧版模板工作台</a><button title="刷新项目与任务" aria-label="刷新项目与任务" disabled={busy} onClick={()=>void act(refresh)}><RefreshCw size={16}/></button></nav>
    </header>
    {error&&<p role="alert" className="vw-error">{error}</p>}
    {!project?<p role="status">正在读取项目与任务…</p>:<>
      <div className="vw-toolbar">
        {!project.scenes.length&&<button disabled={disabled||active} onClick={()=>void act(async()=>{setProject(await request<Project>(base+'/visual/prepare',{expected_revision:project.revision}));})}>整理口播章节（免费）</button>}
        <button disabled={disabled||active||!project.scenes.length||!project.scenes.every(measuredReady)} onClick={()=>void act(async()=>{
          if(await confirm({title:'整课导出',message:`确认导出当前项目 r${project.revision}？每章必须具有当前有效且已确认的预览或 Agent 视频（取最新确认的一个）；服务端将再次检查。`,confirmText:'确认导出'}))await submit('/export',{expected_revision:project.revision,confirmed:true});
        })}><Film size={14}/>导出整课视频</button>
        {latestExport?.result?.video&&<a href={visualFileUrl(project.id,latestExport.id,latestExport.result.video)} download>下载整课 MP4</a>}
      </div>
      <div className="vw-layout"><aside aria-label="章节列表"><h2>口播章节 · {project.scenes.length}</h2>
        {!project.scenes.length&&<p>尚未整理章节</p>}
        {project.scenes.map((s,i)=><button key={s.id} aria-pressed={s.id===row?.id} disabled={busy||dirty} onClick={()=>{setSelected(s.id);setFeedback('');setTransferInput(null);}}><span>{i+1}. {s.scene.narration.text.slice(0,36)}</span><small>r{s.revision} · {measuredReady(s)?'实测就绪':s.state==='needs_voice'?'待配音':'待实测对齐'}</small></button>)}
        <VoiceSettings key={project.id} project={project} dirty={dirty} busy={busy} formEditing={dirty} onDirty={setDirty} act={act} onSave={async speaker=>{setProject(await request<Project>(base+'/voice',{expected_revision:project.revision,speaker},'PATCH'));setDirty(false);}}/>
      </aside><div className="vw-content">
        {activeJob&&activeJob.id!==presentation.active?.id&&<div><h2>当前项目有任务正在执行</h2><VisualTaskProgress job={activeJob} now={now} updatedAt={updatedAt} disabled={busy} onRefresh={()=>void act(refresh)} onCancel={()=>cancelVisual(activeJob)}/>{activeJob.scene_id&&<button onClick={()=>{setSelected(activeJob.scene_id!);setFeedback('');setTransferInput(null);}}>查看执行中的章节</button>}</div>}
        {row&&<section aria-label="当前章节"><h2>当前章节 · r{row.revision}</h2><details><summary>口播稿</summary><p className="vw-narration">{row.scene.narration.text}</p></details>
          <div className="vw-step" aria-label="第 1 步：配音与对齐"><h3>第 1 步 · 配音与对齐</h3>
          <p>{measuredReady(row)?`实测音频与字幕已就绪 · ${row.scene.duration_frames} 帧`:row.state==='needs_timing'?'已有音频，待实测对齐':'待配音'}</p>
          {voice&&<p role="status">配音：{states[voice.state]??'待核对'} {voice.state==='failed'?(voice.error?.retryable?'可显式确认付费后重试。':'此任务不可重试，请检查项目状态。'):''}</p>}
          <div className="vw-toolbar"><button disabled={disabled||audioActions!.voiceBlocked} onClick={()=>void act(async()=>{
            const revision=project.revision;
            if(!await confirmEstimate(audioActions!.retry?'显式重试当前章节付费配音':'为当前章节付费配音',audioActions!.estimatePath??base+'/estimate',audioActions!.retry?undefined:{operation:'voice',expected_revision:revision,scenes:[{scene_id:row.id,expected_revision:row.revision}]},()=>alive.current,{
              confirm:message=>confirm({title:'付费配音确认',message,confirmText:'确认付费配音',variant:'warning'})}))return;
            const job=parseSceneJob(await request<unknown>(audioActions!.voicePath,audioActions!.voiceBody),project.id,row,'voice');
            setVoiceJobs(previous=>[job,...previous.filter(j=>j.job_id!==job.job_id)]);
          })}><Mic size={14}/>{audioActions!.retry?'重试配音（付费）':measuredReady(row)?'配音已就绪':'添加配音（付费）'}</button>
          {row.state==='needs_timing'&&<button disabled={disabled||audioActions!.timingBlocked} onClick={retime}><RefreshCw size={14}/>实测对齐（免费）</button>}</div>
          </div>
          <div className="vw-step" aria-label="第 2 步：生成视频"><h3>第 2 步 · 生成视频</h3>
          <p>{measuredReady(row)?'配音已就绪，可以生成视频。':'配音完成后才能生成可确认、可导出的视频。'}</p>
          <VisualAgentPanel projectId={project.id} job={latestAgentJob(sceneJobs)} exported={exportedVersion(sceneJobs)} now={now} updatedAt={updatedAt} disabled={disabled} blockedReason={!measuredReady(row)?(row.state==='needs_timing'?'先完成第 1 步：实测对齐（免费）。':'先完成第 1 步：添加配音。'):active?'项目内有任务进行中，结束后再生成。':undefined}
            onStart={()=>void act(()=>confirmVisualAction(visualAgentAction(row.id,project.revision),confirm,submit))}
            onRefresh={()=>void act(refresh)} onCancel={()=>{const job=latestAgentJob(sceneJobs);if(job)cancelVisual(job);}}
            onAccept={()=>void act(async()=>{const job=latestAgentJob(sceneJobs)!;
              if(await confirm({title:'确认 Agent 视频',message:'确认已播放并检查画面、口播和字幕同步？确认后整课导出将使用此版本；口播或配音变化后确认失效。',detail:'SHA-256: '+job.result!.sha256,confirmText:'确认此版本'}))await submit('/'+job.id+'/accept',{confirmed:true,sha256:job.result!.sha256});})}/>
          <div aria-label="本章视频" className="vw-current-video"><h3>本章视频</h3>
            {presentation.video?<><p>{presentation.video.timing_mode==='draft'?'无声草稿':'视频已生成'}{presentation.video.result?.accepted?' · 已确认':''}</p><VisualMedia projectId={project.id} job={presentation.video}/></>:<p>本章暂无可播放视频</p>}
            {presentation.latest&&presentation.latest.id!==presentation.video?.id&&<><VisualTaskProgress job={presentation.latest} now={now} updatedAt={updatedAt} disabled={busy} onRefresh={()=>void act(refresh)} onCancel={()=>cancelVisual(presentation.latest!)}/>{presentation.video&&<p>保留上次可播放版本。</p>}</>}
          </div>
          {!measuredReady(row)&&<p>旧流程可先按估计时长生成无声草稿；草稿不能确认或导出，配音后用「同步配音（免费）」对齐。</p>}
          <div className="vw-toolbar"><button disabled={disabled||active||!row.scene.narration.text.trim()} onClick={()=>void act(async()=>{
            await confirmVisualAction(presentation.designRepairTarget?visualRepairDesignVideoAction(presentation.designRepairTarget):presentation.repairTarget?visualRepairAndRenderAction(presentation.repairTarget):presentation.pending?visualRenderVideoAction(presentation.pending,autoRepair):visualCreateVideoAction(row.id,project.revision,measuredReady(row)?generationMode:'source',!measuredReady(row),autoRepair),confirm,submit);
          })}><Film size={14}/>{active?presentation.active?'视频任务进行中':'等待项目内任务结束':presentation.designRepairTarget?'修复并继续':presentation.repairTarget?'程序修复画面':presentation.video||presentation.repairStopped?'重新生成视频':'生成视频'}</button>
          {presentation.repairStopped&&<p>本轮程序修复已停止，没有追加调用。重新生成属于新的付费任务，需另行确认。</p>}
          {presentation.draft&&!presentation.pending&&(!presentation.video||presentation.video.timing_mode==='draft')&&measuredReady(row)&&<button disabled={disabled||active} onClick={()=>void act(()=>confirmVisualAction(visualAlignDraftAction(presentation.draft!),confirm,submit))}><RefreshCw size={14}/>同步配音（免费）</button>}
          {presentation.video&&canAcceptPreview(presentation.video)&&!presentation.video.result?.accepted&&<button disabled={disabled||active} onClick={()=>void act(async()=>{
            const video=presentation.video!;
            if(await confirm({title:'确认当前视频',message:'确认已播放并检查画面、口播和字幕同步？',detail:'SHA-256: '+video.result!.sha256,confirmText:'确认此版本'}))await submit('/'+video.id+'/accept',{confirmed:true,sha256:video.result!.sha256});
          })}><Check size={14}/>确认此版本</button>}</div>

          </div>
          {!active&&!presentation.repairTarget&&!presentation.designRepairTarget&&<label className="vw-auto-repair"><input type="checkbox" checked={autoRepair} disabled={busy} onChange={e=>setAutoRepair(e.target.checked)}/>设计或画面异常时自动修复一次（共用额外最多一次模型费用）</label>}
          {!active&&presentation.pending&&<details><summary>画面源码与设计</summary><VisualArtifact job={presentation.pending}/></details>}
          {!active&&presentation.editable&&<details className="vw-modify"><summary>修改视频</summary><label>修改意见<textarea maxLength={4000} value={feedback} disabled={busy} onChange={e=>setFeedback(e.target.value)}/></label>
            <button disabled={disabled||active||!feedback.trim()} onClick={()=>void act(()=>confirmVisualAction(visualRepairAction(presentation.editable!,feedback),confirm,submit))}><Code size={14}/>提交修改</button>
          </details>}
          <details className="vw-advanced"><summary>高级设置</summary><div className="vw-toolbar">
          <button disabled={disabled||audioActions!.timingBlocked} onClick={retime}><RefreshCw size={14}/>重算时间轴（免费）</button>
          <VisualGenerationModeSelect value={measuredReady(row)?generationMode:'source'} onChange={setGenerationMode} disabled={disabled||active} sourceOnly={!measuredReady(row)}/>
          </div>
          <div className="vw-toolbar"><label>机构设计文件<input key={row.id} type="file" accept="application/json,.json" disabled={disabled||active} onChange={event=>{
            const file=event.target.files?.[0];setTransferInput(null);if(!file)return;
            void act(async()=>{if(file.size>128*1024)throw Error('Transfer input too large');const input=parseTransferImport(JSON.parse(await file.text()));if(alive.current)setTransferInput(input);});
          }}/></label>
          <button disabled={disabled||active||!measuredReady(row)||!transferInput} onClick={()=>void act(async()=>{
            await confirmVisualAction(visualTransferAction(row.id,project.revision,transferInput),confirm,submit);
          })}><Code size={14}/>准备机构候选（免费）</button>
          <button disabled={disabled||active||!measuredReady(row)} onClick={()=>void act(async()=>{
            await confirmVisualAction(visualAutomaticTransferAction(row.id,project.revision),confirm,submit);
          })}><Code size={14}/>RAG 增强机构（免费）</button></div></details>
        </section>}
        {!!sceneJobs.length&&<details className="vw-history"><summary>版本与高级详情 · {sceneJobs.length} 条记录</summary>{sceneJobs.map(job=><VisualHistoryEntry key={job.id} job={job}><section className="vw-job" aria-label={kinds[job.kind]}><div className="vw-toolbar">
          {['queued','running'].includes(job.state)&&<button disabled={busy} onClick={()=>void act(async()=>{if(await confirm({title:'取消任务',message:'确认请求取消？已发出的模型调用仍可能计费。'}))await submit('/'+job.id+'/cancel',{});})}><X size={14}/>取消</button>}</div>
          <VisualJobStatus job={job}/>
          <VisualLayoutProposal job={job} disabled={disabled||active} onAction={action=>void act(()=>confirmVisualAction(action,confirm,submit))}/>
          <VisualSourceRecovery job={job} disabled={disabled||active} feedback={feedback} onFeedback={setFeedback} onAction={action=>void act(()=>confirmVisualAction(action,confirm,submit))}/>
          {job.kind==='prepare-transfer'&&job.state==='succeeded'&&<><p>候选已准备 · 待审阅 · 未采用</p><VisualArtifact job={job}/>
            <button disabled={disabled||active||job.current===false||!job.result?.sha256||!job.result?.source} onClick={()=>void act(async()=>{
              await confirmVisualAction(visualTransferPreviewAction(job),confirm,submit);
            })}><Play size={14}/>审批并诊断预览</button></>}
          {visualGenerationActions(job).review&&<>
            <VisualArtifact job={job}/>
            {job.timing_mode==='draft'&&<button disabled={disabled||active||job.current===false||!row||!measuredReady(row)} onClick={()=>void act(()=>confirmVisualAction(visualAlignDraftAction(job),confirm,submit))}><RefreshCw size={14}/>按实测配音对齐（免费）</button>}
            <p className="vw-warning">预览会在本机运行 AI 生成的代码，并非安全沙箱，可能访问本机资源。仅在信任代码来源并接受风险时批准；源码不会在当前网页执行。</p>
            <button disabled={disabled||active||!job.result?.sha256||!job.result?.source} onClick={()=>void act(async()=>{
              await confirmVisualAction(visualPreviewAction(job),confirm,submit);
            })}><Play size={14}/>仅检查并预览（不自动修复）</button>
          </>}
          {visualGenerationActions(job).repair&&<>
            <label>{canReviseDesign(job)?'设计修订反馈':isVisualDataMode(job.generation_mode)?'视觉数据修订反馈':'源码修复反馈'}<textarea maxLength={4000} value={feedback} disabled={busy} onChange={e=>setFeedback(e.target.value)}/></label>
            <button disabled={disabled||active||!feedback.trim()} onClick={()=>void act(async()=>{
              await confirmVisualAction(visualRepairAction(job,feedback),confirm,submit);
            })}>{canReviseDesign(job)?isVisualDataMode(job.generation_mode)?'修订设计并生成数据':'修订设计并生成源码':isVisualDataMode(job.generation_mode)?'提交单次数据修订':'提交单次源码修复'}</button>
          </>}
          {job.kind==='preview'&&job.result&&<><p>{videoTaskStatus(job)}</p><p>几何检查：{job.result.geometry?.status==='passed'?'通过（仍需人工验收）':'未通过或未完成，禁止验收'}</p><VisualMedia projectId={project.id} job={job} diagnostics/>
            <button disabled={disabled||!canAcceptPreview(job)} onClick={()=>void act(async()=>{
              if(await confirm({title:'人工验收当前预览',message:'确认已检查视频及首／中／末帧，画面、口播同步和几何表现符合要求？旧版本或媒体变化后本次验收将失效。',detail:'SHA-256: '+job.result!.sha256,confirmText:'确认人工验收'}))await submit('/'+job.id+'/accept',{confirmed:true,sha256:job.result!.sha256});
            })}><Check size={14}/>人工验收</button>{job.result.accepted===true&&<p>服务端已登记验收</p>}</>}
          {job.kind==='agent'&&job.state==='succeeded'&&<><p>{videoTaskStatus(job)} · {job.result?.agent?.turns} 轮</p><VisualMedia projectId={project.id} job={job} diagnostics/><VisualArtifact job={job}/></>}
          {job.kind==='preview-transfer'&&job.result&&<><p>诊断预览 · 几何：{job.result.geometry?.status??'待检查'} · 未采用</p><VisualMedia projectId={project.id} job={job} diagnostics/></>}
        </section></VisualHistoryEntry>)}</details>}
        <details className="vw-history"><summary>整课导出记录</summary>{jobs.filter(j=>j.kind==='export').map(j=><VisualHistoryEntry key={j.id} job={j}><VisualJobStatus job={j}/>{j.state==='succeeded'&&<VisualMedia projectId={project.id} job={j}/>}</VisualHistoryEntry>)}</details>
      </div></div>
    </>}
  </main>;
}
export function VisualMedia({projectId,job,diagnostics=false}:{projectId:string;job:VisualJob;diagnostics?:boolean}) {
  return <>{job.state==='succeeded'&&job.result?.video&&<video controls preload="metadata" src={visualFileUrl(projectId,job.id,job.result.video)}/>}
    {diagnostics&&<div className="vw-stills">{reviewFrames(job.result?.frames??[]).map((name,i)=><figure key={name}><img alt={['首帧','中间帧','末帧'][i]} src={visualFileUrl(projectId,job.id,name)}/><figcaption>{['首帧','中间帧','末帧'][i]}</figcaption></figure>)}</div>}
    {job.state==='succeeded'&&job.result?.video&&<a href={visualFileUrl(projectId,job.id,job.result.video)} download>下载 MP4</a>}{' '}
    {job.state==='succeeded'&&job.result?.srt&&<a href={visualFileUrl(projectId,job.id,job.result.srt)} download>下载 SRT</a>}</>;
}
