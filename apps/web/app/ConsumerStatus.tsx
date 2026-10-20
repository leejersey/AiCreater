'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {API} from '../lib/editor';
import {parseConsumerStatus,type ConsumerStatus as Status} from '../lib/consumers';

export function ConsumerStatusView({data,checking,error,onRefresh}:{data:Status|null;checking:boolean;error:string;onRefresh:()=>void}){
  const observed=!checking&&!error?data:null;
  return <section aria-label="执行器响应检测">
    <h2>执行器响应检测</h2>
    <button type="button" disabled={checking} onClick={onRefresh}>{checking?'检查中…':'刷新消费者检测'}</button>
    <ul>{(['workflow','render'] as const).map(name=>{
      const item=observed?.queues[name];
      const label=checking?'检查中':error?'检查失败／未知':item?.state==='detected'?`检测到响应（${item.responders}个）`:item?.state==='not_detected'?'未检测到响应':'检查失败／未知';
      return <li key={name}><b>{name==='workflow'?'workflow · 分镜／配音／对齐':'render · 预览／整课导出'}</b>：{label}</li>;
    })}</ul>
    {observed&&<p className="hint">上次检查：<time dateTime={observed.checked_at}>{observed.checked_at}</time>（非实时状态）</p>}
    {!checking&&(error||observed&&observed.code!=='checked')&&<p role="status" className="error-text">检查失败，请确认本地API已更新、可访问且Redis配置正确；不影响现有排队规则。</p>}
    <p className="hint">只检查队列订阅响应，不代表beat、供应商或任务执行可用；未响应不代表离线，忙碌的solo消费者也可能暂不响应。仅提示，不自动启动消费者或重试任务；需要时手动刷新。</p>
  </section>;
}
export function ConsumerStatus(){
  const [data,setData]=useState<Status|null>(null),[checking,setChecking]=useState(true),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    if(active.current)return;
    const controller=new AbortController();active.current=controller;
    setChecking(true);setData(null);setError('');
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(API+'/api/consumers',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('Local inspection unavailable');
      const result=parseConsumerStatus(await response.json());
      if(active.current===controller)setData(result);
    }catch{
      if(active.current===controller)setError('检查失败');
    }finally{
      clearTimeout(timer);
      if(active.current===controller){active.current=null;setChecking(false);}
    }
  },[]);
  useEffect(()=>{void refresh();return()=>{active.current?.abort();active.current=null;};},[refresh]);
  return <ConsumerStatusView data={data} checking={checking} error={error} onRefresh={()=>void refresh()}/>;
}
