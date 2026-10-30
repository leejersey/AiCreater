'use client';
import React,{useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {request,type Project} from '../lib/editor';
import {parseTeachingTask,parseTeachingTasks,prepareKey,teachingStageLabel,currentTeachingTask,teachingVideoUrl,shouldRenderPlanResult,parseTeachingReadiness,type TeachingTask} from '../lib/teaching-workbench';
import {useConfirm} from './ConfirmContext';
import {ArrowLeft,RefreshCw,Play,X,Clock,Workflow,AlertCircle,Film} from './Icons';

export function TeachingVideo({task,projectId,historical=false,onError}:{task:TeachingTask;projectId:string;historical?:boolean;onError?:()=>void}){
  if(!task.video_ready)return null;
  const url=teachingVideoUrl(projectId,task);
  return <section aria-label="本章预览视频"><h2>无声预览{historical?' · 历史版本':''}</h2>
    <video key={url} controls preload="metadata" src={url} onError={onError}/>
    <div className="vw-toolbar"><span>估时草稿 · 未验收</span><a href={teachingVideoUrl(projectId,task,true)}>下载预览</a></div>
  </section>;
}

export function TeachingStatus({task}:{task:TeachingTask}){
  const callLabels={dispatched:'等待响应',succeeded:'响应已保存',failed:'失败',unknown:'结果未知',cancelled:'已取消'};
  return <section className="tp-status" aria-label="根任务状态">
    <h3>{teachingStageLabel(task.stage)}</h3>
    <p role="status">{task.message}</p>
    <dl className="tp-meta"><div><dt>模型请求</dt><dd>{task.requests_used} / {task.max_requests}</dd></div><div><dt>时间依据</dt><dd>{task.timing_mode==='draft'?'口播估时':task.timing_mode==='measured'?'实测配音':'未知'}</dd></div><div><dt>创建时项目版本</dt><dd>r{task.base_revision}{!task.current?' · 输入已变化':''}</dd></div><div><dt>视频</dt><dd>{task.video_ready?'预览就绪 · 未验收':task.render?.state==='running'?'容器渲染中':task.render?.state==='queued'?'排队中':task.render?'未生成可播放视频':'尚未渲染'}</dd></div></dl>
    {task.calls.length>0&&<ul className="tp-calls">{task.calls.map(call=><li key={call.id}><span>{call.stage==='plan'?'初次计划':'定向修订'}</span><strong>{callLabels[call.state]}</strong></li>)}</ul>}
    <details><summary>任务标识</summary><p className="tp-hash">{task.id}</p><p className="tp-hash">快照 {task.snapshot_sha256}</p></details>
  </section>;
}

export default function TeachingWorkbench({projectId}:{projectId:string}){
  const [project,setProject]=useState<Project|null>(null),[tasks,setTasks]=useState<TeachingTask[]>([]),[selected,setSelected]=useState(''),[timing,setTiming]=useState<'draft'|'measured'>('draft');
  const [available,setAvailable]=useState<boolean|null>(null),[serviceReady,setServiceReady]=useState(false),[busy,setBusy]=useState(false),[cancelling,setCancelling]=useState(false),[error,setError]=useState(''),[updated,setUpdated]=useState('');
  const confirm=useConfirm(),lock=useRef(false),cancelLock=useRef(false),epoch=useRef(0),mounted=useRef(true);
  const base=`/api/projects/${encodeURIComponent(projectId)}`,endpoint=base+'/teaching-tasks';
  async function refresh(){
    const turn=++epoch.current;
    try{
      const next=await request<Project>(base);
      if(!mounted.current||turn!==epoch.current)return;
      setProject(next);setSelected(previous=>next.scenes.some(row=>row.id===previous)?previous:next.scenes[0]?.id??'');
      try{
        const list=parseTeachingTasks(await request<unknown>(endpoint),projectId);
        const ready=parseTeachingReadiness(await request<unknown>(endpoint+'/readiness'));
        if(mounted.current&&turn===epoch.current){setTasks(list);setAvailable(true);setServiceReady(ready);setUpdated(new Date().toLocaleTimeString());}
      }catch(e){if(e instanceof Error&&e.cause===404){if(mounted.current&&turn===epoch.current){setAvailable(false);setTasks([]);}}else throw e;}
    }catch(e){if(mounted.current&&turn===epoch.current){setServiceReady(false);setError(e instanceof Error?e.message:'读取失败');}}
  }
  useEffect(()=>{
    mounted.current=true;let stopped=false;let timer:ReturnType<typeof setTimeout>;
    async function poll(){await refresh();if(!stopped)timer=setTimeout(poll,3000);}
    void poll();return()=>{stopped=true;mounted.current=false;epoch.current++;clearTimeout(timer);};
  },[projectId]);
  const row=project?.scenes.find(scene=>scene.id===selected);
  const sceneTasks=tasks.filter(task=>task.scene_id===selected),task=currentTeachingTask(tasks,selected,timing);
  const playable=task?.video_ready?task:sceneTasks.find(item=>item.video_ready);
  async function render(root:TeachingTask){
    const result=parseTeachingTask(await request(endpoint+'/'+root.id+'/render',{}),projectId);
    if(result.id!==root.id)throw new Error('返回了其他根任务');
    if(mounted.current)setTasks(previous=>[result,...previous.filter(item=>item.id!==result.id)]);
  }
  async function run(root:TeachingTask){
    const response=await request<{task:unknown;result?:unknown}>(endpoint+'/'+root.id+'/run',{});
    const result=parseTeachingTask(response.task,projectId);
    if(result.id!==root.id)throw new Error('返回了其他根任务');
    if(shouldRenderPlanResult(result,response.result))await render(result);
  }
  async function cancel(root:TeachingTask){
    if(cancelLock.current)return;cancelLock.current=true;setCancelling(true);
    try{
      if(!await confirm({title:'取消根任务',message:'已有数据保留；已派发的请求仍可能计费，取消不会返还请求额度。',confirmText:'取消任务',variant:'warning'}))return;
      const result=parseTeachingTask(await request(endpoint+'/'+root.id+'/cancel',{}),projectId);
      if(result.id!==root.id||result.state!=='cancelled')throw new Error('取消状态未确认，请刷新读取');
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'取消未确认');}
    finally{await refresh();cancelLock.current=false;if(mounted.current)setCancelling(false);}
  }
  async function act(action:()=>Promise<void>){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await action();}catch(e){if(mounted.current)setError((e instanceof Error?e.message:'操作未完成')+' 已保留任务，请读取状态；不会自动重发。');}
    finally{await refresh();lock.current=false;if(mounted.current)setBusy(false);}
  }
  async function start(){
    if(!row||!project||busy)return;
    await act(async()=>{
      if(!await confirm({title:'生成无声预览',message:'本章累计最多 2 次模型请求：初次计划 1 次，必要时定向修订 1 次。计划检查通过后自动渲染无声预览，不另行生成源码或配音。',confirmText:'确认额度并生成'}))return;
      // Storage must succeed before dispatch, so a reload can recover an ambiguous create.
      const key=prepareKey(sessionStorage,projectId,row.id,project.revision,timing);
      const created=parseTeachingTask(await request(endpoint,{scene_id:row.id,expected_revision:project.revision,idempotency_key:key,timing_mode:timing,confirmed:true,max_requests:2}),projectId);
      if(created.scene_id!==row.id||created.base_revision!==project.revision||created.timing_mode!==timing)throw new Error('任务与本次输入不符');
      if(mounted.current)setTasks(previous=>[created,...previous.filter(item=>item.id!==created.id)]);
      if(created.can_run)await run(created);
    });
  }
  const player=playable?<TeachingVideo task={playable} projectId={projectId} historical={playable.id!==task?.id||!playable.current} onError={()=>{setError('视频暂时无法播放，正在核对文件状态。');void refresh();}}/>:null;
  return <main className="visual-workbench teaching-workbench">
    <header className="vw-header"><div><Link href={`/courses/${projectId}`}><ArrowLeft size={14}/> 返回视频工作台</Link><h1>{project?.title??'教学计划'} <small>实验</small></h1></div><button title="刷新任务状态，不重新生成" disabled={busy} onClick={()=>{setError('');void refresh();}}><RefreshCw size={15}/> 刷新状态</button></header>
    {error&&<p role="alert" className="vw-error"><AlertCircle size={16}/> {error}</p>}
    {available===false&&<p role="status" className="tp-unavailable">教学计划实验尚未启用。未创建任务，也未调用模型。</p>}
    {available===true&&!serviceReady&&<p role="status" className="tp-unavailable">执行服务未就绪，暂不接受新任务；已有任务和视频保留。</p>}
    {!project&&<p role="status">正在读取课程…</p>}
    {project&&<div className="vw-layout"><aside aria-label="口播章节"><h2>章节 · {project.scenes.length}</h2>{project.scenes.map((scene,index)=><button key={scene.id} aria-pressed={selected===scene.id} onClick={()=>setSelected(scene.id)}>{index+1}. {scene.scene.narration.text.slice(0,50)}<small>r{scene.revision}</small></button>)}</aside>
      <div className="vw-content">{row?<>
        <section><h2>当前章节 · r{row.revision}</h2><p className="vw-narration">{row.scene.narration.text}</p>
          <div className="vw-toolbar"><label>时间依据 <select value={timing} disabled={busy} onChange={e=>setTiming(e.target.value as 'draft'|'measured')}><option value="draft">口播估时 · 无声草稿</option><option value="measured" disabled>实测配音 · 待接入</option></select></label>
          {!task?<button disabled={busy||available!==true||!serviceReady} onClick={()=>void start()}><Workflow size={16}/> {busy?'提交中…':'生成无声预览'}</button>:<>
            {task.can_render?<button disabled={busy||cancelling||available!==true||!serviceReady} onClick={()=>void act(()=>render(task))}><Film size={15}/> {busy?'提交中…':task.render?'继续排队任务':'生成无声预览'}</button>:<button disabled={busy||cancelling||available!==true||!serviceReady||!task.can_run} onClick={()=>void act(()=>run(task))}><Play size={15}/> {busy?'处理中…':task.video_ready?'预览已就绪':'继续当前任务'}</button>}
            <button disabled={cancelling||available!==true||task.state==='cancelled'} onClick={()=>void cancel(task)}><X size={15}/> {cancelling?'正在取消…':'取消任务'}</button>
          </>}</div>
          {task&&!task.can_run&&['prepared','response-cached','revision-pending'].includes(task.stage)&&<p className="vw-warning">模型执行器未就绪，尚未继续派发请求。</p>}
        </section>
        {task?.video_ready&&player}
        {task&&<TeachingStatus task={task}/>}
        {!task?.video_ready&&player}
        <section><h2>任务记录</h2>{updated&&<p className="tp-updated"><Clock size={13}/> 最近读取 {updated}</p>}{sceneTasks.length===0?<p>本章暂无教学计划任务。</p>:<ul className="tp-history">{sceneTasks.map(item=><li key={item.id}><span>{teachingStageLabel(item.stage)}<small>项目 r{item.base_revision} · {item.timing_mode==='draft'?'估时':'实测'} · {item.id.slice(0,8)}</small></span><span>{item.requests_used} / 2 次</span></li>)}</ul>}</section>
      </>:<p>本课暂无章节。</p>}</div></div>}
  </main>;
}
