'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {API} from '../lib/editor';
import {parseUsageRecords,referenceMoney,type UsageRecords as Records} from '../lib/usage';

export function UsageRecordsView({data,checking,error,onRefresh}:{data:Records|null;checking:boolean;error:string;onRefresh:()=>void}){
  const observed=!checking&&!error?data:null;
  return <section aria-label="用量记录">
    <h3>用量记录</h3>
    <button type="button" disabled={checking} onClick={onRefresh}>{checking?'读取中…':'刷新用量记录'}</button>
    {error&&!checking&&<p role="status" className="error-text">读取失败／未知，请确认本地API已升级后重试；不能据此判断免费。</p>}
    {observed&&<>
      <p>共{observed.summary.attempts}次执行尝试 · 已记录部分参考 {observed.summary.known?referenceMoney(observed.summary.minimum_cny,observed.summary.maximum_cny):'暂无可核价记录'} · {observed.summary.unknown}次待核实（含{observed.summary.historical_unknown}次历史缺记录）</p>
      {!observed.items.length?<p className="hint">暂无执行尝试；排队任务尚未计入，不代表后续免费。</p>:<details><summary>查看每次尝试</summary><div style={{overflowX:'auto'}}><table style={{width:'100%',borderSpacing:'12px 8px',textAlign:'left'}}>
        <thead><tr><th>任务／尝试</th><th>状态</th><th>用量</th><th>参考费用</th><th>价格依据</th></tr></thead>
        <tbody>{observed.items.map(row=>{const u=row.usage,ref=u?.reference;return <tr key={row.attempt_id}>
          <td>{row.kind} · #{row.number}<br/><small>{row.job_id}</small><br/><time dateTime={row.started_at}>{row.started_at}</time></td>
          <td>{row.state}<br/>{!u?'历史缺记录':u.state==='pending'?'调用待核实':u.state==='submitted'?'提交后待核实':u.state==='local'?'本地执行':'用量已记录'}</td>
          <td>{!u?'未知':u.kind==='voice'?`提交${u.quantity.submitted_characters??'未知'}字符`:['generate','regenerate'].includes(u.kind)?`输入${u.quantity.input_tokens??'未知'} / 输出${u.quantity.output_tokens??'未知'} token`:'无新增供应商调用'}</td>
          <td>{ref&&ref.minimum_cny!==null&&ref.maximum_cny!==null?referenceMoney(ref.minimum_cny,ref.maximum_cny):'待核实／未知'}</td>
          <td>{u&&<>{u.prices.model} · {u.prices.checked_on}{u.prices.sources.map(url=><div key={url}><a href={url} target="_blank" rel="noreferrer">官方参考来源</a></div>)}</>}</td>
        </tr>;})}</tbody>
      </table></div></details>}
    </>}
    <p className="hint">这是上次读取的已记录部分，不是账单或扣费硬上限；失败／取消不等于免费。旧任务不补造用量；配音字符是本地提交量，不是供应商计费确认，套餐/免费量未扣。网络中断、缺少usage或未知/过期价格单列待核实，不能按0元算；本地执行不含机器成本。仅手动刷新，不自动对账或启动消费者。</p>
  </section>;
}
export function UsageRecords({projectId}:{projectId:string}){
  const [data,setData]=useState<Records|null>(null),[checking,setChecking]=useState(true),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    if(active.current)return;
    const controller=new AbortController();active.current=controller;setChecking(true);setData(null);setError('');
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(API+'/api/projects/'+encodeURIComponent(projectId)+'/usage',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('Usage unavailable');
      const result=parseUsageRecords(await response.json());if(active.current===controller)setData(result);
    }catch{if(active.current===controller)setError('读取失败');}
    finally{clearTimeout(timer);if(active.current===controller){active.current=null;setChecking(false);}}
  },[projectId]);
  useEffect(()=>{void refresh();return()=>{active.current?.abort();active.current=null;};},[refresh]);
  return <UsageRecordsView data={data} checking={checking} error={error} onRefresh={()=>void refresh()}/>;
}
