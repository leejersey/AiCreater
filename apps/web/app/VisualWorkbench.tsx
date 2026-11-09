'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import type {SceneRow} from '../lib/editor';
import {request,parseJobs,parseSceneJob,type Project,type Job} from '../lib/editor';
import {confirmEstimate} from '../lib/cost-estimates';
import {currentVoiceJob} from '../lib/course';
import {parseVisualJobs,visualFileUrl,measuredReady,reviewFrames,visualError,sceneAudioActions,videoTaskStatus,videoProgress,latestAgentJob,canAcceptAgent,exportedVersion,chapterStatus,agentBatchScenes,visualAgentBody,failureAction,momentNote,restyleOf,renderedTheme,sameLook,nextStep,type NextStep,AGENT_MAX_TURNS,estimatedSeconds,codePointOffset,AGENT_MAX_SECONDS,type VisualJob} from '../lib/visual-workbench';
import {agentModelLabel,autopilotConfirmation,confirmVisualAction,type AutopilotPlan,visualAgentAction,visualAgentReviseAction,type AgentModel} from '../lib/visual-workbench-actions';
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
/** While an Agent job runs: the newest frames it rendered, refreshed with each status update. */
export function LiveFrames({job,updatedAt}:{job:VisualJob;updatedAt:number}){
 const [frames,setFrames]=useState<string[]>([]);
 const base=`/api/projects/${encodeURIComponent(job.project_id)}/visual/${encodeURIComponent(job.id)}/live`;
 useEffect(()=>{let live=true;request<{frames?:unknown}>(base).then(v=>{if(live&&Array.isArray(v.frames))setFrames(v.frames.filter((f):f is string=>typeof f==='string'&&/^[0-9a-f]{12}\/frame-\d{4}\.png$/.test(f)));}).catch(()=>{});return()=>{live=false;};},[base,updatedAt]);
 if(!frames.length)return null;
 return <div className="vw-live" aria-label="最新渲染的画面">{frames.map(f=><img key={f} alt="最新渲染的关键帧" src={`${base}/${f}`}/>)}<small>Agent 最新一轮渲染的画面（开头 · 中段 · 结尾），会随检查与修改更新。</small></div>;
}
export type CourseCosts={voice:{characters:number;cny:number};agent:{server:{input:number;cached_input:number;output:number;cny:number|null};own_model:{input:number;output:number}};
 prices:{deepseek_configured:boolean};next_agent:{max_output_tokens:number;max_output_cny:number|null}};
const wan=(n:number)=>n>=10000?`${(n/10000).toFixed(1)} 万`:String(n);
/** What the course has used so far: voice in yuan; Agent tokens, in yuan only when DeepSeek prices are configured. */
export function costSummary(c:CourseCosts):string{
 const parts=[`配音 ¥${c.voice.cny.toFixed(2)}`];
 const s=c.agent.server;
 if(s.input||s.output)parts.push(`Agent 输入 ${wan(s.input)}（缓存 ${wan(s.cached_input)}）/ 输出 ${wan(s.output)} token${s.cny!=null?`（约 ¥${s.cny.toFixed(2)}）`:''}`);
 if(c.agent.own_model.input||c.agent.own_model.output)parts.push(`你的模型 输入 ${wan(c.agent.own_model.input)} / 输出 ${wan(c.agent.own_model.output)} token`);
 return '已用：'+parts.join(' · ');
}
export type ReviewItem={index:number;row:SceneRow;job:VisualJob};
/** Every chapter waiting for confirmation, one after another: watch, then confirm, write feedback or skip.
 * Keys: J next, K previous, Enter confirm, Esc close (not while typing feedback). */
export function ReviewMode({projectId,items,disabled,onAccept,onRevise,onClose}:{projectId:string;items:ReviewItem[];disabled:boolean;
 onAccept:(job:VisualJob)=>Promise<void>;onRevise:(item:ReviewItem,feedback:string)=>void;onClose:()=>void}){
 const [at,setAt]=useState(0),[feedback,setFeedback]=useState('');
 const video=useRef<HTMLVideoElement>(null);
 const item=items[Math.min(at,items.length-1)];
 useEffect(()=>{setFeedback('');},[item?.job.id]);
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{
   if((e.target as HTMLElement)?.tagName==='TEXTAREA')return;
   if(e.key==='Escape')onClose();
   else if(e.key==='j'||e.key==='J')setAt(i=>Math.min(i+1,items.length-1));
   else if(e.key==='k'||e.key==='K')setAt(i=>Math.max(i-1,0));
   else if(e.key==='Enter'&&item&&!disabled){e.preventDefault();void onAccept(item.job);}
  };
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[items.length,item,disabled,onAccept,onClose]);
 if(!item)return <div className="vw-review" role="dialog" aria-label="连续审片"><div className="vw-review-body"><h2>没有待确认的章节</h2><button onClick={onClose}>关闭</button></div></div>;
 return <div className="vw-review" role="dialog" aria-label="连续审片"><div className="vw-review-body">
  <header><h2>连续审片 · 第 {item.index+1} 章（{Math.min(at,items.length-1)+1}/{items.length}）</h2><button onClick={onClose} aria-label="关闭审片"><X size={16}/></button></header>
  <p className="vw-review-text">{item.row.scene.narration.text}</p>
  <video key={item.job.id} ref={video} controls autoPlay preload="auto" src={visualFileUrl(projectId,item.job.id,item.job.result!.video!)}/>
  <label>修改意见（可选；在画面有问题时暂停，再点「在当前画面提意见」）
   <textarea rows={2} maxLength={2000} value={feedback} disabled={disabled} onChange={e=>setFeedback(e.target.value)}/></label>
  <div className="vw-toolbar">
   <button className="vw-next-button" disabled={disabled} onClick={()=>void onAccept(item.job)}><Check size={14}/>确认此版本（Enter）</button>
   <button disabled={disabled} onClick={()=>{const v=video.current;if(!v)return;v.pause();setFeedback(f=>(f.trim()?f.trimEnd()+'\n':'')+momentNote(v.currentTime,item.row.scene.captions));}}>在当前画面提意见</button>
   <button disabled={disabled||!feedback.trim()} onClick={()=>onRevise(item,feedback)}>按意见修改（付费）</button>
   <button disabled={at>=items.length-1} onClick={()=>setAt(i=>i+1)}>跳过（J）</button>
   <button disabled={at===0} onClick={()=>setAt(i=>i-1)}>上一章（K）</button>
  </div>
 </div></div>;
}
export function VisualTaskProgress({job,now,updatedAt,disabled,onCancel,onRefresh,onRestart}:{job:VisualJob;now:number;updatedAt:number;disabled:boolean;onCancel:()=>void;onRefresh:()=>void;onRestart?:()=>void}){
 const progress=videoProgress(job,now);
 const fix=failureAction(job);
 return <div className="vw-task-feedback" aria-label="视频任务进度">
  <p role={job.state==='failed'?'alert':'status'}><strong>{progress.label}</strong></p>
  <ol className="vw-progress-steps" aria-label="视频制作阶段">{['排队','生成与检查','渲染视频','视频就绪'].map((label,i)=><li key={label} aria-current={progress.step===i+1?'step':undefined} data-complete={progress.step>i+1}><span>{i+1}</span>{label}</li>)}</ol>
  {progress.active&&<progress aria-label={progress.label}/>}
  {job.kind==='agent'&&job.state==='running'&&<LiveFrames job={job} updatedAt={updatedAt}/>}
  <p>{progress.detail}</p>
  <div className="vw-task-meta" aria-live="off">{progress.elapsed&&<span>{progress.elapsed}</span>}{updatedAt>0&&<span>最近更新 {new Date(updatedAt).toLocaleTimeString('zh-CN',{hour12:false})}</span>}{progress.active&&now-updatedAt>15000&&updatedAt>0&&<span className="vw-warning">状态超过15秒未更新，请刷新检查</span>}</div>
  {fix&&<div className="vw-toolbar vw-fix">{fix.href?<a className="primary-link" href={fix.href}>{fix.label}</a>
   :<button disabled={disabled||(fix.action==='restart'&&!onRestart)} onClick={fix.action==='restart'?onRestart:onRefresh}>{fix.label}</button>}</div>}
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
/** hidePrimary: the workbench's 「下一步」 bar starts and confirms; generating again and revising move to 「更多操作」. */
export function VisualAgentPanel({projectId,job,exported,now,updatedAt,disabled,blockedReason,onStart,onRefresh,onCancel,onAccept,onRevise,children,hidePrimary=false,captions}:{projectId:string;job?:VisualJob;exported?:VisualJob;now:number;updatedAt:number;disabled:boolean;blockedReason?:string;onStart:()=>void;onRefresh:()=>void;onCancel:()=>void;onAccept?:()=>void;onRevise?:(feedback:string)=>void;children?:React.ReactNode;hidePrimary?:boolean;captions?:{text:string;start_frame:number;end_frame:number}[]}){
 const running=!!job&&['queued','running'].includes(job.state);
 const [feedback,setFeedback]=useState('');
 const video=useRef<HTMLVideoElement>(null),more=useRef<HTMLDetailsElement>(null);
 // Pause the video where something is wrong, then anchor the note there: the Agent sees the time and the sentence.
 const noteMoment=()=>{const v=video.current;if(!v)return;v.pause();const note=momentNote(v.currentTime,captions);
  setFeedback(f=>(f.trim()?f.trimEnd()+'\n':'')+note);if(more.current)more.current.open=true;};
 return <div aria-label="Agent 视频" className="vw-current-video"><h3>Agent 视频</h3>
  {!job&&<p>由 Agent 自行设计画面并检查，通过后直接生成本章视频（使用当前配音与字幕）。</p>}
  {job&&job.state==='succeeded'&&job.result?.agent&&<p>{job.result.agent.finish_by==='model'?'Agent 已自检并通过检查':'Agent 未自行收尾，已采用最后一个通过检查的版本'} · {job.result.agent.turns} 轮 · 输出 {job.result.agent.output_tokens.toLocaleString('zh-CN')} token{job.agent?.llm?.source==='account'?` · 模型 ${job.agent.llm.model}（你的配置）`:''}</p>}
  {job?.agent?.revision&&<p className="hint">按意见修改自上一版：「{job.agent.revision.feedback}」</p>}
  {job&&job.result?.accepted===true&&<p>已确认此版本 · 可用于整课导出</p>}
  {!hidePrimary&&job&&onAccept&&canAcceptAgent(job)&&!job.result?.accepted&&<div className="vw-toolbar"><button disabled={disabled} onClick={onAccept}><Check size={14}/>看完后确认此版本</button></div>}
  {job&&job.state==='succeeded'&&<VisualMedia projectId={projectId} job={job} diagnostics videoRef={video}/>}
  {job&&onRevise&&canAcceptAgent(job)&&<div className="vw-toolbar"><button disabled={disabled||running} onClick={noteMoment}>在当前画面提意见</button></div>}
  {children}
  <p>整课导出将使用：{!exported?'暂无已确认的版本':exported.id===job?.id?'上方这个版本':`更早确认的版本${exported.created_at?`（${new Date(exported.created_at).toLocaleString('zh-CN',{hour12:false})}）`:''}`}</p>
  {job&&job.state!=='succeeded'&&<VisualTaskProgress job={job} now={now} updatedAt={updatedAt} disabled={disabled} onRefresh={onRefresh} onCancel={onCancel} onRestart={running||blockedReason?undefined:onStart}/>}
  {job?.state==='failed'&&typeof job.result?.requests_dispatched==='number'&&<p>{job.result.requests_dispatched?`本次已消耗 ${job.result.requests_dispatched} 轮模型调用。`:'本次没有产生模型消耗。'}</p>}
  {(()=>{
   const actions=<>{job&&onRevise&&canAcceptAgent(job)&&<div className="vw-revise"><label>修改意见（说清楚哪里不满意、想要怎样，比如「第 2 段的流程图太小，放大到占画面一半」）
    <textarea maxLength={2000} rows={3} value={feedback} disabled={disabled||running||!!blockedReason} onChange={e=>setFeedback(e.target.value)}/></label>
    <div className="vw-toolbar"><button disabled={disabled||running||!!blockedReason||!feedback.trim()} onClick={()=>onRevise(feedback)}>按意见修改（付费）</button></div></div>}
   {(!hidePrimary||job)&&<div className="vw-toolbar"><button disabled={disabled||running||!!blockedReason} onClick={onStart}><Film size={14}/>{job?'Agent 重新生成（付费）':'Agent 生成视频（付费）'}</button></div>}
   {blockedReason&&!running&&<p>{blockedReason}</p>}</>;
   return hidePrimary?(job?<details ref={more} className="vw-more"><summary>更多操作</summary>{actions}</details>:null):actions;
  })()}
 </div>;
}
export default function VisualWorkbench({routeProjectId}:{routeProjectId:string}) {
  const confirm=useConfirm();
  const [project,setProject]=useState<Project|null>(null);
  const [jobs,setJobs]=useState<VisualJob[]>([]);
  const [voiceJobs,setVoiceJobs]=useState<Job[]>([]);
  const [themes,setThemes]=useState<ThemeSummary[]>([]);
  const [settingsOpen,setSettingsOpen]=useState(false),[reviewing,setReviewing]=useState(false);
  const [undo,setUndo]=useState<{sceneId:string;at:number;label:string;until:number}|null>(null);
  useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),Math.max(0,undo.until-Date.now()));return()=>clearTimeout(timer);},[undo]);
  const [llmSettings,setLlm]=useState<AgentModel|undefined>();
  const [costs,setCosts]=useState<CourseCosts|null>(null);
  const llm:AgentModel|undefined=llmSettings&&{...llmSettings,...(costs?{cap:{tokens:costs.next_agent.max_output_tokens,cny:costs.next_agent.max_output_cny}}:{})};
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
    const spent=await request<CourseCosts>(base+'/visual/costs').catch(()=>null);
    if(alive.current){setProject(p);setJobs(visual);setVoiceJobs(voice);setCosts(spent);setUpdatedAt(Date.now());}
  },[base,routeProjectId]);
  useEffect(()=>{
    alive.current=true;let stopped=false;let timer:ReturnType<typeof setTimeout>;
    // Server-sent events refresh the page as soon as the course or a job changes; polling stays as a slow fallback
    // (fast again whenever the event stream is down).
    let pushed=false;const events=typeof EventSource==='undefined'?null:new EventSource(base+'/events');
    if(events){events.addEventListener('change',()=>{pushed=true;void refresh().catch(()=>{});});events.onerror=()=>{pushed=false;};}
    const poll=async()=>{try{await refresh();if(!stopped)setError('');}catch(e){if(!stopped)setError(visualError(e));}
      if(!stopped)timer=setTimeout(()=>void poll(),pushed?15000:3000);};
    void poll();return()=>{stopped=true;alive.current=false;clearTimeout(timer);events?.close();};
  },[refresh,base]);
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
  const voiceChapter=()=>void act(async()=>{
    if(!row||!project||!audioActions)return;
    const revision=project.revision;
    if(!await confirmEstimate(audioActions.retry?'显式重试当前章节付费配音':'为当前章节付费配音',audioActions.estimatePath??base+'/estimate',audioActions.retry?undefined:{operation:'voice',expected_revision:revision,scenes:[{scene_id:row.id,expected_revision:row.revision}]},()=>alive.current,{
      confirm:message=>confirm({title:'付费配音确认',message,confirmText:'确认付费配音',variant:'warning'})}))return;
    const job=parseSceneJob(await request<unknown>(audioActions.voicePath,audioActions.voiceBody),project.id,row,'voice');
    setVoiceJobs(previous=>[job,...previous.filter(j=>j.job_id!==job.job_id)]);
  });
  const startAgent=()=>{if(row&&project)void act(()=>confirmVisualAction(visualAgentAction(row.id,project.revision,llm),confirm,submit));};
  const acceptAgent=()=>void act(async()=>{const job=agentJob;if(!job?.result?.sha256)return;
    if(await confirm({title:'确认 Agent 视频',message:'确认已播放并检查画面、口播和字幕同步？确认后整课导出将使用此版本；口播或配音变化后确认失效。',detail:'SHA-256: '+job.result.sha256,confirmText:'确认此版本'}))await submit('/'+job.id+'/accept',{confirmed:true,sha256:job.result.sha256});});
  const exportCourse=()=>void act(async()=>{if(!project)return;
    if(await confirm({title:'整课导出',message:`导出全部 ${project.scenes.length} 章。每章使用最新确认的 Agent 版本；在本机渲染，不调用模型或配音。`,confirmText:'确认导出'}))await submit('/export',{expected_revision:project.revision,confirmed:true});});
  const index=row&&project?project.scenes.findIndex(s=>s.id===row.id):-1;
  const step:NextStep|undefined=row&&project?nextStep(row,jobs,voiceJobs,{isLast:index===project.scenes.length-1,allConfirmed:missing.length===0,projectBusy:!!activeJob&&activeJob.scene_id!==row.id}):undefined;
  const reviewItems:ReviewItem[]=(project?.scenes??[]).flatMap((scene,i)=>{
    if(statuses[i]?.key!=='review')return [];
    const job=latestAgentJob(jobs.filter(j=>j.scene_id===scene.id));
    return job&&canAcceptAgent(job)&&job.result?.video?[{index:i,row:scene,job}]:[];
  });
  const acceptInReview=async(job:VisualJob)=>{await act(async()=>{await submit('/'+job.id+'/accept',{confirmed:true,sha256:job.result!.sha256});});};
  const reviseInReview=(item:ReviewItem,text:string)=>{if(project)void act(()=>confirmVisualAction(visualAgentReviseAction(item.row.id,project.revision,item.job.id,text,llm),confirm,submit));};
  const startAutopilot=()=>void act(async()=>{if(!project)return;
    const plan=await request<AutopilotPlan>(base+'/visual/autopilot');
    if(!plan.chapters.length)throw new Error('没有需要配音或生成的章节');
    if(!await confirm(autopilotConfirmation(plan)))return;
    setProject(await request<Project>(base+'/visual/autopilot',{expected_revision:plan.revision,confirmed:true,max_turns:AGENT_MAX_TURNS}));});
  const stopAutopilot=()=>void act(async()=>{setProject(await request<Project>(base+'/visual/autopilot/stop',{}));});
  const pilot=project?.autopilot;
  const pilotLeft=pilot?.state==='running'?pilot.scene_ids.filter(id=>{const i=project!.scenes.findIndex(s=>s.id===id);return i>=0&&!['confirmed','review'].includes(statuses[i]?.key);}).length:0;
  const runStep=()=>{
    if(!step||!project)return;
    if(step.key==='voice')voiceChapter();else if(step.key==='retime')retime();else if(step.key==='generate')startAgent();
    else if(step.key==='confirm')acceptAgent();else if(step.key==='export')exportCourse();
    else if(step.key==='next'){const following=project.scenes.slice(index+1).find((_,k)=>statuses[index+1+k].key!=='confirmed')??project.scenes[index+1];if(following)setSelected(following.id);}
  };
  const voicedNote=(r:SceneRow)=>r.scene.narration.audio_asset_id?'本章已有配音，改动后需要重新配音（付费），已有的视频和确认会失效。':'';
  function chapterEdit(path:string,body:Record<string,unknown>,method:string,title:string,message:string,done?:()=>void){
    if(!row||!project)return;
    void act(async()=>{
      if(message&&!await confirm({title,message,confirmText:title,variant:'warning'}))return;
      setProject(await request<Project>(`${base}/visual/chapters/${encodeURIComponent(row.id)}${path}`,{expected_revision:project.revision,...body},method));
      done?.();
    });
  }
  const restoreChapter=()=>void act(async()=>{if(!undo||!project)return;const {sceneId,at}=undo;setUndo(null);
    const restored=await request<Project>(`${base}/visual/chapters/${encodeURIComponent(sceneId)}/restore`,{expected_revision:project.revision,at});
    setProject(restored);setSelected(sceneId);});
  return <main className="visual-workbench">
    <header className="vw-header"><div><a href="/courses">课程</a><h1>{project?.title??'视觉工作台'}</h1><span>{project?`${project.scenes.length} 章 · 已确认 ${confirmedCount}/${project.scenes.length}`:''}</span>{costs&&<small className="vw-costs" title={costs.prices.deepseek_configured?'DeepSeek 按 .env 配置的价格换算':'在 .env 配置 DEEPSEEK_PRICE_* 可把 DeepSeek token 换算成元'}>{costSummary(costs)}</small>}</div>
      <nav>{reviewItems.length>0&&<button className="vw-next-button" onClick={()=>setReviewing(true)}>连续审片（{reviewItems.length}）</button>}{project&&<button aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(open=>!open)}>课程设置</button>}<button title="刷新项目与任务" aria-label="刷新项目与任务" disabled={busy} onClick={()=>void act(refresh)}><RefreshCw size={16}/></button></nav>
    </header>
    {error&&<p role="alert" className="vw-error">{error}</p>}
    {reviewing&&project&&<ReviewMode projectId={project.id} items={reviewItems} disabled={busy} onAccept={acceptInReview} onRevise={reviseInReview} onClose={()=>setReviewing(false)}/>}
    {pilot&&<div className={`vw-pilot vw-pilot-${pilot.state}`} role="status">
      {pilot.state==='running'?<>整课自动生成中 · 还有 {pilotLeft} 章在配音或生成，完成的章节会出现在「连续审片」<button disabled={busy} onClick={stopAutopilot}>停止</button></>
       :pilot.state==='done'?<>整课自动生成已推进完所有章节{reviewItems.length?<>，{reviewItems.length} 章待确认 <button onClick={()=>setReviewing(true)}>连续审片</button></>:'。'}</>
       :pilot.reason==='llm_changed'?<>整课自动生成已停止：提交后修改了模型配置，请重新开始。</>:<>整课自动生成已停止。</>}
    </div>}
    {undo&&<div className="vw-undo" role="status">已删除{undo.label}<button disabled={busy} onClick={restoreChapter}>撤销</button></div>}
    {project&&settingsOpen&&<section className="vw-settings" aria-label="课程设置">
        <ThemeSettings key={project.id+':'+(project.theme_id??'')+':'+(project.theme_accent??'')} project={project} themes={themes} disabled={disabled||active} act={act}
          onSave={async (theme_id,accent)=>{setProject(await request<Project>(base+'/theme',{expected_revision:project.revision,theme_id,...(accent?{accent}:{})},'PATCH'));}}/>
        <VoiceSettings key={project.id} project={project} dirty={dirty} busy={busy} formEditing={dirty} onDirty={setDirty} act={act} onSave={async speaker=>{setProject(await request<Project>(base+'/voice',{expected_revision:project.revision,speaker},'PATCH'));setDirty(false);}}/>
    </section>}
    {!project?<p role="status">正在读取项目与任务…</p>:<>
      <div className="vw-toolbar">
        {!project.scenes.length&&<button disabled={disabled||active} onClick={()=>void act(async()=>{setProject(await request<Project>(base+'/visual/prepare',{expected_revision:project.revision}));})}>整理口播章节（免费）</button>}
        {pilot?.state!=='running'&&statuses.some(st=>['needs_voice','needs_timing','todo'].includes(st.key))&&<button className="vw-next-button" disabled={disabled||active} onClick={startAutopilot}><Film size={14}/>整课自动生成（付费）</button>}
        {!!project.scenes.length&&<span className="vw-course-progress">已确认 {confirmedCount}/{project.scenes.length}{missing.length?` · 未确认：第 ${missing.join('、')} 章`:''}</span>}
        <button disabled={disabled||active||!batch.length} title={batch.length?undefined:'没有可批量生成的章节（需已配音、未确认、未在生成）'} onClick={()=>void act(async()=>{
          if(!await confirm({title:`批量 Agent 生成 ${batch.length} 章（付费）`,message:`为第 ${batch.map(s=>project.scenes.indexOf(s)+1).join('、')} 章各提交一个 Agent 任务，依次执行。模型：${agentModelLabel(llm)}。每章最多 ${AGENT_MAX_TURNS} 轮模型调用，合计最多 ${batch.length*AGENT_MAX_TURNS} 轮；失败不自动重试。每章完成后仍需你看过并确认。`,confirmText:`确认最多 ${batch.length*AGENT_MAX_TURNS} 轮付费调用`,variant:'warning'}))return;
          for(const scene of batch)await submit('/agent',visualAgentBody(scene.id,project.revision));
        })}><Film size={14}/>批量 Agent 生成{batch.length?` ${batch.length} 章`:''}（付费）</button>
        <button disabled={disabled||active||!project.scenes.length||missing.length>0} title={missing.length?'每章都需要一个已确认的视频':undefined} onClick={exportCourse}><Film size={14}/>导出整课视频</button>
        {latestExport?.result?.video&&<a href={visualFileUrl(project.id,latestExport.id,latestExport.result.video)} download>下载整课 MP4</a>}
      </div>
      <div className="vw-layout"><aside aria-label="章节列表"><h2>口播章节 · {project.scenes.length}</h2>
        {!project.scenes.length&&<p>尚未整理章节</p>}
        {project.scenes.map((s,i)=><button key={s.id} aria-pressed={s.id===row?.id} disabled={busy||dirty} onClick={()=>setSelected(s.id)}><span>{i+1}. {s.scene.narration.text.slice(0,36)}</span><small data-status={statuses[i].key}>{statuses[i].label}</small></button>)}
      </aside><div className="vw-content">
        {activeJob&&activeJob.id!==agentJob?.id&&<div><h2>当前项目有任务正在执行</h2><VisualTaskProgress job={activeJob} now={now} updatedAt={updatedAt} disabled={busy} onRefresh={()=>void act(refresh)} onCancel={()=>cancelVisual(activeJob)}/>{activeJob.scene_id&&<button onClick={()=>setSelected(activeJob.scene_id!)}>查看执行中的章节</button>}</div>}
        {row&&<section aria-label="当前章节"><h2>当前章节 · r{row.revision}</h2><ChapterEditor key={row.id+':'+row.revision} row={row} isLast={project.scenes.at(-1)?.id===row.id} isOnly={project.scenes.length===1}
            voiced={!!row.scene.narration.audio_asset_id||sceneJobs.length>0} disabled={disabled} blockedReason={active?'项目内有任务进行中，结束后再修改章节。':undefined}
            onSave={text=>chapterEdit('',{narration:text},'PATCH','保存本章口播',voicedNote(row))}
            onSplit={at=>chapterEdit('/split',{at},'POST','从光标处拆分本章','拆成两章后，两章都需要重新配音（付费）。'+voicedNote(row))}
            onMergeNext={()=>chapterEdit('/merge-next',{},'POST','与下一章合并','两章合成一章后需要重新配音（付费），两章已有的视频和确认都会失效。')}
            onDelete={()=>{const at=index,label=`第 ${index+1} 章`,sceneId=row.id;
              chapterEdit('/delete',{confirmed:true},'POST','删除本章','本章的口播、配音和视频都会从课程中移除；删除后 10 秒内可以撤销。',()=>setUndo({sceneId,at,label,until:Date.now()+10000}));}}/>
          {step&&<div className="vw-next" aria-label="下一步" data-step={step.key}>
            <div><strong>下一步</strong><p>{step.hint}</p></div>
            <button className="vw-next-button" disabled={disabled||['wait','done'].includes(step.key)} onClick={runStep}>{step.label}</button>
          </div>}
          <details className="vw-step" aria-label="配音与对齐"><summary>配音与对齐 · {measuredReady(row)?`已就绪 · ${row.scene.duration_frames} 帧`:row.state==='needs_timing'?'已有音频，待实测对齐':'待配音'}</summary>
          <p>{measuredReady(row)?`实测音频与字幕已就绪 · ${row.scene.duration_frames} 帧`:row.state==='needs_timing'?'已有音频，待实测对齐':'待配音'}</p>
          {voice&&<p role="status">配音：{states[voice.state]??'待核对'} {voice.state==='failed'?(voice.error?.retryable?'可显式确认付费后重试。':'此任务不可重试，请检查项目状态。'):''}</p>}
          <div className="vw-toolbar"><button disabled={disabled||audioActions!.voiceBlocked} onClick={voiceChapter}><Mic size={14}/>{audioActions!.retry?'重试配音（付费）':measuredReady(row)?'配音已就绪':'添加配音（付费）'}</button>
          <button disabled={disabled||audioActions!.timingBlocked} onClick={retime}><RefreshCw size={14}/>{row.state==='needs_timing'?'实测对齐（免费）':'重算时间轴（免费）'}</button></div>
          </details>
          <div className="vw-step" aria-label="视频">
          <VisualAgentPanel key={row.id} hidePrimary captions={row.scene.captions} projectId={project.id} job={agentJob} exported={exportedVersion(sceneJobs)} now={now} updatedAt={updatedAt} disabled={disabled} blockedReason={!measuredReady(row)?(row.state==='needs_timing'?'先完成第 1 步：实测对齐（免费）。':'先完成第 1 步：添加配音。'):active?'项目内有任务进行中，结束后再生成。':undefined}
            onStart={startAgent}
            onRevise={text=>{if(agentJob)void act(()=>confirmVisualAction(visualAgentReviseAction(row.id,project.revision,agentJob.id,text,llm),confirm,submit));}}
            onRefresh={()=>void act(refresh)} onCancel={()=>{if(agentJob)cancelVisual(agentJob);}}
            onAccept={acceptAgent}>
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
export function VisualMedia({projectId,job,diagnostics=false,videoRef}:{projectId:string;job:VisualJob;diagnostics?:boolean;videoRef?:React.Ref<HTMLVideoElement>}) {
  return <>{job.result?.backup==='pending'&&<p className="vw-warning" role="status">这个视频尚未备份到 TOS（上传失败），目前只保存在本机；执行器每 10 分钟自动重试，备份前请勿清理本机缓存。</p>}
    {job.state==='succeeded'&&job.result?.video&&<video ref={videoRef} controls preload="metadata" src={visualFileUrl(projectId,job.id,job.result.video)}/>}
    {diagnostics&&<div className="vw-stills">{reviewFrames(job.result?.frames??[]).map((name,i)=><figure key={name}><img alt={STILL_LABELS[i]} src={visualFileUrl(projectId,job.id,name)}/><figcaption>{STILL_LABELS[i]}</figcaption></figure>)}</div>}
    {job.state==='succeeded'&&job.result?.video&&<a href={visualFileUrl(projectId,job.id,job.result.video)} download>下载 MP4</a>}{' '}
    {job.state==='succeeded'&&job.result?.srt&&<a href={visualFileUrl(projectId,job.id,job.result.srt)} download>下载 SRT</a>}</>;
}
