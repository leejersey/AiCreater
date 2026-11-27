'use client';
// The task tray in the top bar: work that is queued or running anywhere in the account, and a notice when it ends.
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {request} from '../lib/editor';
import {TASK_STATE,elapsed,finished,isActive,type Task,type TaskList} from '../lib/tasks';
import {useToast} from './ToastContext';
import {Spinner} from './Icons';

export function TaskTray(){
  const toast=useToast(),router=useRouter();
  const [list,setList]=useState<TaskList|null>(null),[open,setOpen]=useState(false),[now,setNow]=useState(Date.now());
  const seen=useRef<Task[]|null>(null),box=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let live=true,timer:ReturnType<typeof setTimeout>;
    const look=async()=>{
      try{
        const next=await request<TaskList>('/api/tasks');if(!live)return;
        if(seen.current)for(const t of finished(seen.current,next.tasks))
          toast(`${t.label}${t.state==='succeeded'?'已完成':t.state==='failed'?'失败':'已取消'} · ${t.title}`,
            {variant:t.state==='succeeded'?'success':t.state==='failed'?'error':'info',duration:8000,action:{label:'查看',onClick:()=>router.push(t.href)}});
        seen.current=next.tasks;setList(next);setNow(Date.now());
      }catch{/* the tray is a convenience; a failed look is retried later */}
      if(live)timer=setTimeout(look,(seen.current??[]).some(isActive)?4000:20000);
    };
    void look();
    const focus=()=>{clearTimeout(timer);void look();};
    window.addEventListener('focus',focus);
    return()=>{live=false;clearTimeout(timer);window.removeEventListener('focus',focus);};
  },[]);
  useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};
    document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);},[open]);
  const active=list?.active??0;
  return <div className="task-tray" ref={box}>
    <button type="button" className={`task-tray-button${active?' busy':''}`} aria-expanded={open} aria-label={`任务：${active} 个进行中`} onClick={()=>setOpen(o=>!o)}>
      {active?<><Spinner size={13} className="icon-spin"/> {active} 个任务进行中</>:'任务'}
    </button>
    {open&&<div className="task-tray-panel" role="dialog" aria-label="任务">
      {!list?.tasks.length?<p className="hint">没有进行中或刚结束的任务。配音、Agent 生成、导出和拆解都会出现在这里。</p>:
      <ul>{list.tasks.map(t=><li key={t.id} data-state={t.state}>
        <Link href={t.href} onClick={()=>setOpen(false)}><b>{t.label}</b><span>{t.title}</span></Link>
        <small>{isActive(t)&&<Spinner size={10} className="icon-spin"/>} {TASK_STATE[t.state]}{t.state==='running'&&t.started_at?` · ${elapsed(t.started_at,now)}`:''}</small>
      </li>)}</ul>}
      <p className="hint task-tray-foot">刚结束的任务保留 15 分钟。</p>
    </div>}
  </div>;
}
