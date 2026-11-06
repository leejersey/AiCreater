'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import type {SceneRow} from '../lib/editor';
import {request,parseJobs,parseSceneJob,type Project,type Job} from '../lib/editor';
import {confirmEstimate} from '../lib/cost-estimates';
import {currentVoiceJob} from '../lib/course';
import {parseVisualJobs,visualFileUrl,measuredReady,reviewFrames,visualError,sceneAudioActions,videoTaskStatus,videoProgress,latestAgentJob,canAcceptAgent,exportedVersion,chapterStatus,agentBatchScenes,visualAgentBody,restyleOf,renderedTheme,sameLook,AGENT_MAX_TURNS,estimatedSeconds,codePointOffset,AGENT_MAX_SECONDS,type VisualJob} from '../lib/visual-workbench';
import {agentModelLabel,confirmVisualAction,visualAgentAction,visualAgentReviseAction,type AgentModel} from '../lib/visual-workbench-actions';
import {parseModelSettings} from '../lib/model-settings';
import {useConfirm} from './ConfirmContext';
import {VoiceSettings} from './VoiceSettings';
import {ThemeSettings} from './ThemeSettings';
import {parseThemes,themeName,type ThemeSummary} from '../lib/themes';
import {RefreshCw,Check,Film,Mic,X} from './Icons';

export function VisualJobStatus({job}:{job:VisualJob}) {
  return <>{job.stage&&<p>执行阶段：{job.stage}</p>}{job.state==='failed'&&<p role="alert">{job.error||'任务未完成，请检查当前项目与任务状态。'} 未自动重试。</p>}</>;
}
const states:Record<string,string>={queued:'排队中',running:'执行中',succeeded:'已完成',failed:'失败，未自动重试',cancelled:'已取消'};
const kinds:Record<VisualJob['kind'],string>={agent:'Agent 生成',export:'整课导出',restyle:'按新主题重渲染'};
export function VisualHistoryEntry({job,children}:{job:VisualJob;children?:React.ReactNode}){
 const [open,setOpen]=useState(false);
 return <details className="vw-history-entry" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{kinds[job.kind]} · {videoTaskStatus(job)}{job.current===false?' · 历史版本':''}</summary>{open&&children}</details>;
}
export function VisualTaskProgress({job,now,updatedAt,disabled,onCancel,onRefresh}:{job:VisualJob;now:number;updatedAt:number;disabled:boolean;onCancel:()=>void;onRefresh:()=>void}){
 const progress=videoProgress(job,now);
 return <div className="vw-task-feedback" aria-label="视频任务进度">
  <p role={job.state==='failed'?'alert':'status'}><strong>{progress.label}</strong></p>
  <ol className="vw-progress-steps" aria-label="视频制作阶段">{['排队','生成与检查','渲染视频','视频就绪'].map((label,i)=><li key={label} aria-current={progress.step===i+1?'step':undefined} data-complete={progress.step>i+1}><span>{i+1}</span>{label}</li>)}</ol>
  {progress.active&&<progress aria-label={progress.label}/>}
  <p>{progress.detail}</p>
  <div className="vw-task-meta" aria-live="off">{progress.elapsed&&<span>{progress.elapsed}</span>}{updatedAt>0&&<span>最近更新 {new Date(updatedAt).toLocaleTimeString('zh-CN',{hour12:false})}</span>}{progress.active&&now-updatedAt>15000&&updatedAt>0&&<span className="vw-warning">状态超过15秒未更新，请刷新检查</span>}</div>
  <div className="vw-toolbar"><button disabled={disabled} onClick={onRefresh}><RefreshCw size={14}/>刷新状态</button>{progress.active&&<button disabled={disabled} onClick={onCancel}><X size={14}/>取消任务</button>}</div>
 </div>;
}
/** Narration of one chapter: edit, split at the caret, merge with the next one, delete. Every change drops the voice. */
export function ChapterEditor({row,isLast,isOnly,voiced,disabled,blockedReason,onSave,onSplit,onMergeNext,onDelete}:{row:SceneRow;isLast:boolean;isOnly:boolean;voiced:boolean;disabled:boolean;blockedReason?:string;
 onSave:(text:string)=>void;onSplit:(at:number)=>void;onMergeNext:()=>void;onDelete:()=>void}){
 const saved=row.scene.narration.text;
 const [text,setText]=useState(saved),[caret,setCaret]=useState(0);
 const area=useRef<HTMLTextAreaElement>(null);
 const seconds=estimatedSeconds(text),changed=text!==saved,length=Array.from(text).length;
 const at=codePointOffset(saved,caret);
 const canSplit=!changed&&at>0&&at<Array.from(saved).length&&!!Array.from(saved).slice(0,at).join('').trim()&&!!Array.from(saved).slice(at).join('').trim();
 const off=disabled||!!blockedReason;
 return <details className="vw-chapter-editor" open={seconds>AGENT_MAX_SECONDS-10||undefined}><summary>口播稿 · {length} 字 · 预计约 {seconds} 秒{seconds>AGENT_MAX_SECONDS-10?' · 偏长，建议拆分':''}</summary>
  <textarea ref={area} aria-label="本章口播" value={text} maxLength={800} rows={6} disabled={off}
   onChange={e=>setText(e.target.value)} onSelect={e=>setCaret(e.currentTarget.selectionStart)}/>
  {seconds>AGENT_MAX_SECONDS-10&&<p className="vw-warning">预计约 {seconds} 秒。Agent 只能生成 {AGENT_MAX_SECONDS} 秒以内的章节，建议在合适的句号处拆分。</p>}
  {voiced&&<p className="hint">修改、拆分或合并后，本章需要重新配音（付费），已有的视频和确认会失效。</p>}
  <div className="vw-toolbar">
   <button disabled={off||!changed||!text.trim()} onClick={()=>onSave(text)}>保存口播</button>
   {changed&&<button disabled={off} onClick={()=>setText(saved)}>撤销修改</button>}
   <button disabled={off||!canSplit} title={changed?'先保存或撤销修改':canSplit?undefined:'先在文本框里把光标放到要拆开的位置'} onClick={()=>onSplit(at)}>从光标处拆分</button>
   <button disabled={off||isLast||changed} onClick={onMergeNext}>与下一章合并</button>
   <button disabled={off||isOnly||changed} onClick={onDelete}>删除本章</button>
  </div>
  {blockedReason&&<p className="hint">{blockedReason}</p>}
 </details>;
}
/** One paid job designs, checks and renders the chapter. */
/** A version drawn before the course changed theme: say so, and offer (or show) a free re-render in the current theme. */
export function ThemeNotice({projectId,job,restyle,themes,courseTheme,courseAccent,now,updatedAt,disabled,blockedReason,onRestyle,onRefresh,onCancel}:{projectId:string;job:VisualJob;restyle?:VisualJob;
 themes:ThemeSummary[];courseTheme:string;courseAccent?:string|null;now:number;updatedAt:number;disabled:boolean;blockedReason?:string;onRestyle:()=>void;onRefresh:()=>void;onCancel:()=>void}){
 const fallback=themes.find(t=>t.default)?.id??courseTheme;
 if(job.state!=='succeeded'||sameLook(job,fallback,courseTheme,courseAccent))return null;
 const look=(id:string,accent?:string|null)=>themeName(themes,id)+(accent?` · 强调色 ${accent}`:'');
 const [was,now_]=[look(renderedTheme(job,fallback),job.theme_accent),look(courseTheme,courseAccent)];
 const running=!!restyle&&['queued','running'].includes(restyle.state);
 return <div className="vw-theme-note" aria-label="主题提示">
  <p>这个版本按「{was}」主题渲染，课程现在是「{now_}」。确认不受影响，整课导出会按「{now_}」渲染。</p>
  {restyle?.state==='succeeded'&&restyle.result?.video?<><p>按「{now_}」重渲染的预览：</p><VisualMedia projectId={projectId} job={restyle}/></>
   :running?<VisualTaskProgress job={restyle!} now={now} updatedAt={updatedAt} disabled={disabled} onRefresh={onRefresh} onCancel={onCancel}/>
   :<><div className="vw-toolbar"><button disabled={disabled||!!blockedReason} onClick={onRestyle}><RefreshCw size={14}/>按「{now_}」重渲染预览（免费）</button></div>
    {restyle?.state==='failed'&&<p role="alert">{restyle.error||'重渲染失败，未自动重试。'}</p>}</>}
 </div>;
}
export function VisualAgentPanel({projectId,job,exported,now,updatedAt,disabled,blockedReason,onStart,onRefresh,onCancel,onAccept,onRevise,children}:{projectId:string;job?:VisualJob;exported?:VisualJob;now:number;updatedAt:number;disabled:boolean;blockedReason?:string;onStart:()=>void;onRefresh:()=>void;onCancel:()=>void;onAccept?:()=>void;onRevise?:(feedback:string)=>void;children?:React.ReactNode}){
 const running=!!job&&['queued','running'].includes(job.state);
 const [feedback,setFeedback]=useState('');
 return <div aria-label="Agent 视频" className="vw-current-video"><h3>Agent 视频</h3>
  {!job&&<p>由 Agent 自行设计画面并检查，通过后直接生成本章视频（使用当前配音与字幕）。</p>}
  {job&&job.state==='succeeded'&&job.result?.agent&&<p>{job.result.agent.finish_by==='model'?'Agent 已自检并通过检查':'Agent 未自行收尾，已采用最后一个通过检查的版本'} · {job.result.agent.turns} 轮 · 输出 {job.result.agent.output_tokens.toLocaleString('zh-CN')} token{job.agent?.llm?.source==='account'?` · 模型 ${job.agent.llm.model}（你的配置）`:''}</p>}
  {job?.agent?.revision&&<p className="hint">按意见修改自上一版：「{job.agent.revision.feedback}」</p>}
  {job&&job.result?.accepted===true&&<p>已确认此版本 · 可用于整课导出</p>}
  {job&&onAccept&&canAcceptAgent(job)&&!job.result?.accepted&&<div className="vw-toolbar"><button disabled={disabled} onClick={onAccept}><Check size={14}/>看完后确认此版本</button></div>}
  {job&&job.state==='succeeded'&&<VisualMedia projectId={projectId} job={job} diagnostics/>}
  {children}
  <p>整课导出将使用：{!exported?'暂无已确认的版本':exported.id===job?.id?'上方这个版本':`更早确认的版本${exported.created_at?`（${new Date(exported.created_at).toLocaleString('zh-CN',{hour12:false})}）`:''}`}</p>
  {job&&job.state!=='succeeded'&&<VisualTaskProgress job={job} now={now} updatedAt={updatedAt} disabled={disabled} onRefresh={onRefresh} onCancel={onCancel}/>}
  {job?.state==='failed'&&typeof job.result?.requests_dispatched==='number'&&<p>{job.result.requests_dispatched?`本次已消耗 ${job.result.requests_dispatched} 轮模型调用。`:'本次没有产生模型消耗。'}</p>}
  {job&&onRevise&&canAcceptAgent(job)&&<div className="vw-revise"><label>修改意见（说清楚哪里不满意、想要怎样，比如「第 2 段的流程图太小，放大到占画面一半」）
   <textarea maxLength={2000} rows={3} value={feedback} disabled={disabled||running||!!blockedReason} onChange={e=>setFeedback(e.target.value)}/></label>
   <div className="vw-toolbar"><button disabled={disabled||running||!!blockedReason||!feedback.trim()} onClick={()=>onRevise(feedback)}>按意见修改（付费）</button></div></div>}
  <div className="vw-toolbar"><button disabled={disabled||running||!!blockedReason} onClick={onStart}><Film size={14}/>{job?'Agent 重新生成（付费）':'Agent 生成视频（付费）'}</button></div>
  {blockedReason&&!running&&<p>{blockedReason}</p>}
 </div>;
}
export default function VisualWorkbench({routeProjectId}:{routeProjectId:string}) {
  const confirm=useConfirm();
  const [project,setProject]=useState<Project|null>(null);
  const [jobs,setJobs]=useState<VisualJob[]>([]);
  const [voiceJobs,setVoiceJobs]=useState<Job[]>([]);
  const [themes,setThemes]=useState<ThemeSummary[]>([]);
  const [llm,setLlm]=useState<AgentModel|undefined>();
  useEffect(()=>{let live=true;request<unknown>('/api/auth/model-settings').then(v=>{if(live)setLlm(parseModelSettings(v));}).catch(()=>{});return()=>{live=false;};},[]);
  useEffect(()=>{let live=true;request<unknown>('/api/themes').then(v=>{if(live)setThemes(parseThemes(v));}).catch(()=>{});return()=>{live=false;};},[]);
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [dirty,setDirty]=useState(false);
  const [updatedAt,setUpdatedAt]=useState(0),[now,setNow]=useState(0);
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
  const agentJob=latestAgentJob(sceneJobs);
  const statuses=(project?.scenes??[]).map(scene=>chapterStatus(scene,jobs));
  const confirmedCount=statuses.filter(s=>s.key==='confirmed').length;
  const missing=statuses.map((s,i)=>s.key==='confirmed'?0:i+1).filter(Boolean);
  const batch=project?agentBatchScenes(project.scenes,jobs):[];
  const latestExport=jobs.find(j=>j.kind==='export'&&j.current!==false&&j.state==='succeeded'&&j.result?.video);
  const activeJob=jobs.find(j=>['queued','running'].includes(j.state));
  const active=!!activeJob;
  useEffect(()=>{setNow(Date.now());if(!active)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[active]);
  const disabled=busy||dirty||!!error;
  const voice=row?currentVoiceJob(row,voiceJobs):undefined;
  const audioActions=row?sceneAudioActions(row,voiceJobs):null;
  const retime=()=>void act(async()=>{
    if(!row||!project||!audioActions)return;
    if(!await confirm({title:'免费重算本章时间轴',message:'按已有音频计算字幕时间，保留原音频，不调用模型或配音服务；已有 Agent 视频与确认会失效。',confirmText:'确认免费重算',variant:'info'}))return;
    const job=parseSceneJob(await request<unknown>(audioActions.timingPath,audioActions.timingBody),project.id,row,'timing');
    setVoiceJobs(previous=>[job,...previous.filter(j=>j.job_id!==job.job_id)]);
  });
  const voicedNote=(r:SceneRow)=>r.scene.narration.audio_asset_id?'本章已有配音，改动后需要重新配音（付费），已有的视频和确认会失效。':'';
  function chapterEdit(path:string,body:Record<string,unknown>,method:string,title:string,message:string){
    if(!row||!project)return;
    void act(async()=>{
      if(message&&!await confirm({title,message,confirmText:title,variant:'warning'}))return;
      setProject(await request<Project>(`${base}/visual/chapters/${encodeURIComponent(row.id)}${path}`,{expected_revision:project.revision,...body},method));
    });
  }
  return <main className="visual-workbench">
    <header className="vw-header"><div><a href="/courses">课程</a><h1>{project?.title??'视觉工作台'}</h1><span>{project?`${project.scenes.length} 章 · 已确认 ${confirmedCount}/${project.scenes.length}`:''}</span></div>
      <nav><button title="刷新项目与任务" aria-label="刷新项目与任务" disabled={busy} onClick={()=>void act(refresh)}><RefreshCw size={16}/></button></nav>
    </header>
    {error&&<p role="alert" className="vw-error">{error}</p>}
    {!project?<p role="status">正在读取项目与任务…</p>:<>
      <div className="vw-toolbar">
        {!project.scenes.length&&<button disabled={disabled||active} onClick={()=>void act(async()=>{setProject(await request<Project>(base+'/visual/prepare',{expected_revision:project.revision}));})}>整理口播章节（免费）</button>}
        {!!project.scenes.length&&<span className="vw-course-progress">已确认 {confirmedCount}/{project.scenes.length}{missing.length?` · 未确认：第 ${missing.join('、')} 章`:''}</span>}
        <button disabled={disabled||active||!batch.length} title={batch.length?undefined:'没有可批量生成的章节（需已配音、未确认、未在生成）'} onClick={()=>void act(async()=>{
          if(!await confirm({title:`批量 Agent 生成 ${batch.length} 章（付费）`,message:`为第 ${batch.map(s=>project.scenes.indexOf(s)+1).join('、')} 章各提交一个 Agent 任务，依次执行。模型：${agentModelLabel(llm)}。每章最多 ${AGENT_MAX_TURNS} 轮模型调用，合计最多 ${batch.length*AGENT_MAX_TURNS} 轮；失败不自动重试。每章完成后仍需你看过并确认。`,confirmText:`确认最多 ${batch.length*AGENT_MAX_TURNS} 轮付费调用`,variant:'warning'}))return;
          for(const scene of batch)await submit('/agent',visualAgentBody(scene.id,project.revision));
        })}><Film size={14}/>批量 Agent 生成{batch.length?` ${batch.length} 章`:''}（付费）</button>
        <button disabled={disabled||active||!project.scenes.length||missing.length>0} title={missing.length?'每章都需要一个已确认的视频':undefined} onClick={()=>void act(async()=>{
          if(await confirm({title:'整课导出',message:`导出全部 ${project.scenes.length} 章。每章使用最新确认的 Agent 版本；在本机渲染，不调用模型或配音。`,confirmText:'确认导出'}))await submit('/export',{expected_revision:project.revision,confirmed:true});
        })}><Film size={14}/>导出整课视频</button>
        {latestExport?.result?.video&&<a href={visualFileUrl(project.id,latestExport.id,latestExport.result.video)} download>下载整课 MP4</a>}
      </div>
      <div className="vw-layout"><aside aria-label="章节列表"><h2>口播章节 · {project.scenes.length}</h2>
        {!project.scenes.length&&<p>尚未整理章节</p>}
        {project.scenes.map((s,i)=><button key={s.id} aria-pressed={s.id===row?.id} disabled={busy||dirty} onClick={()=>setSelected(s.id)}><span>{i+1}. {s.scene.narration.text.slice(0,36)}</span><small data-status={statuses[i].key}>{statuses[i].label}</small></button>)}
        <ThemeSettings key={project.id+':'+(project.theme_id??'')+':'+(project.theme_accent??'')} project={project} themes={themes} disabled={disabled||active} act={act}
          onSave={async (theme_id,accent)=>{setProject(await request<Project>(base+'/theme',{expected_revision:project.revision,theme_id,...(accent?{accent}:{})},'PATCH'));}}/>
        <VoiceSettings key={project.id} project={project} dirty={dirty} busy={busy} formEditing={dirty} onDirty={setDirty} act={act} onSave={async speaker=>{setProject(await request<Project>(base+'/voice',{expected_revision:project.revision,speaker},'PATCH'));setDirty(false);}}/>
      </aside><div className="vw-content">
        {activeJob&&activeJob.id!==agentJob?.id&&<div><h2>当前项目有任务正在执行</h2><VisualTaskProgress job={activeJob} now={now} updatedAt={updatedAt} disabled={busy} onRefresh={()=>void act(refresh)} onCancel={()=>cancelVisual(activeJob)}/>{activeJob.scene_id&&<button onClick={()=>setSelected(activeJob.scene_id!)}>查看执行中的章节</button>}</div>}
        {row&&<section aria-label="当前章节"><h2>当前章节 · r{row.revision}</h2><ChapterEditor key={row.id+':'+row.revision} row={row} isLast={project.scenes.at(-1)?.id===row.id} isOnly={project.scenes.length===1}
            voiced={!!row.scene.narration.audio_asset_id||sceneJobs.length>0} disabled={disabled} blockedReason={active?'项目内有任务进行中，结束后再修改章节。':undefined}
            onSave={text=>chapterEdit('',{narration:text},'PATCH','保存本章口播',voicedNote(row))}
            onSplit={at=>chapterEdit('/split',{at},'POST','从光标处拆分本章','拆成两章后，两章都需要重新配音（付费）。'+voicedNote(row))}
            onMergeNext={()=>chapterEdit('/merge-next',{},'POST','与下一章合并','两章合成一章后需要重新配音（付费），两章已有的视频和确认都会失效。')}
            onDelete={()=>chapterEdit('/delete',{confirmed:true},'POST','删除本章','本章的口播、配音和视频都会从课程中移除，不可恢复。')}/>
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
          <button disabled={disabled||audioActions!.timingBlocked} onClick={retime}><RefreshCw size={14}/>{row.state==='needs_timing'?'实测对齐（免费）':'重算时间轴（免费）'}</button></div>
          </div>
          <div className="vw-step" aria-label="第 2 步：生成视频"><h3>第 2 步 · 生成视频</h3>
          <p>{measuredReady(row)?'配音已就绪，可以生成视频。':'配音完成后才能生成可确认、可导出的视频。'}</p>
          <VisualAgentPanel key={row.id} projectId={project.id} job={agentJob} exported={exportedVersion(sceneJobs)} now={now} updatedAt={updatedAt} disabled={disabled} blockedReason={!measuredReady(row)?(row.state==='needs_timing'?'先完成第 1 步：实测对齐（免费）。':'先完成第 1 步：添加配音。'):active?'项目内有任务进行中，结束后再生成。':undefined}
            onStart={()=>void act(()=>confirmVisualAction(visualAgentAction(row.id,project.revision,llm),confirm,submit))}
            onRevise={text=>{if(agentJob)void act(()=>confirmVisualAction(visualAgentReviseAction(row.id,project.revision,agentJob.id,text,llm),confirm,submit));}}
            onRefresh={()=>void act(refresh)} onCancel={()=>{if(agentJob)cancelVisual(agentJob);}}
            onAccept={()=>void act(async()=>{const job=agentJob!;
              if(await confirm({title:'确认 Agent 视频',message:'确认已播放并检查画面、口播和字幕同步？确认后整课导出将使用此版本；口播或配音变化后确认失效。',detail:'SHA-256: '+job.result!.sha256,confirmText:'确认此版本'}))await submit('/'+job.id+'/accept',{confirmed:true,sha256:job.result!.sha256});})}>
            {agentJob&&project.theme_id&&themes.length>0&&<ThemeNotice projectId={project.id} job={agentJob} restyle={restyleOf(sceneJobs,agentJob.id)} themes={themes} courseTheme={project.theme_id} courseAccent={project.theme_accent}
              now={now} updatedAt={updatedAt} disabled={disabled} blockedReason={active?'项目内有任务进行中，结束后再重渲染。':undefined}
              onRefresh={()=>void act(refresh)} onCancel={()=>{const r=restyleOf(sceneJobs,agentJob.id);if(r)cancelVisual(r);}}
              onRestyle={()=>void act(async()=>{
                if(await confirm({title:`按「${themeName(themes,project.theme_id)}」重渲染本章预览`,message:'用这个版本的画面代码、配音和字幕在本机重新渲染，不调用模型、不计费，也不改变确认状态。',confirmText:'确认免费重渲染',variant:'info'}))
                  await submit('/'+agentJob.id+'/restyle',{expected_revision:project.revision});})}/>}
          </VisualAgentPanel>
          </div>
        </section>}
        {!!sceneJobs.length&&<details className="vw-history"><summary>本章历史版本 · {sceneJobs.length} 条记录</summary>{sceneJobs.map(job=><VisualHistoryEntry key={job.id} job={job}><section className="vw-job" aria-label={kinds[job.kind]}><div className="vw-toolbar">
          {['queued','running'].includes(job.state)&&<button disabled={busy} onClick={()=>void act(async()=>{if(await confirm({title:'取消任务',message:'确认请求取消？已发出的模型调用仍可能计费。'}))await submit('/'+job.id+'/cancel',{});})}><X size={14}/>取消</button>}</div>
          <VisualJobStatus job={job}/>
          {job.kind==='agent'&&job.state==='succeeded'&&<><p>{videoTaskStatus(job)} · {job.result?.agent?.turns} 轮{themes.length>0?` · ${themeName(themes,renderedTheme(job,themes.find(t=>t.default)!.id))}主题`:''}</p><VisualMedia projectId={project.id} job={job} diagnostics/></>}
          {job.kind==='restyle'&&job.state==='succeeded'&&<><p>{videoTaskStatus(job)}{job.theme_id&&themes.length>0?` · ${themeName(themes,job.theme_id)}主题`:''}</p><VisualMedia projectId={project.id} job={job}/></>}
        </section></VisualHistoryEntry>)}</details>}
        <details className="vw-history"><summary>整课导出记录</summary>{jobs.filter(j=>j.kind==='export').map(j=><VisualHistoryEntry key={j.id} job={j}><VisualJobStatus job={j}/>{j.state==='succeeded'&&<VisualMedia projectId={project.id} job={j}/>}</VisualHistoryEntry>)}</details>
      </div></div>
    </>}
  </main>;
}
const STILL_LABELS=['开头','中段','结尾'];
export function VisualMedia({projectId,job,diagnostics=false}:{projectId:string;job:VisualJob;diagnostics?:boolean}) {
  return <>{job.result?.backup==='pending'&&<p className="vw-warning" role="status">这个视频尚未备份到 TOS（上传失败），目前只保存在本机；执行器每 10 分钟自动重试，备份前请勿清理本机缓存。</p>}
    {job.state==='succeeded'&&job.result?.video&&<video controls preload="metadata" src={visualFileUrl(projectId,job.id,job.result.video)}/>}
    {diagnostics&&<div className="vw-stills">{reviewFrames(job.result?.frames??[]).map((name,i)=><figure key={name}><img alt={STILL_LABELS[i]} src={visualFileUrl(projectId,job.id,name)}/><figcaption>{STILL_LABELS[i]}</figcaption></figure>)}</div>}
    {job.state==='succeeded'&&job.result?.video&&<a href={visualFileUrl(projectId,job.id,job.result.video)} download>下载 MP4</a>}{' '}
    {job.state==='succeeded'&&job.result?.srt&&<a href={visualFileUrl(projectId,job.id,job.result.srt)} download>下载 SRT</a>}</>;
}
