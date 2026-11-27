'use client';
// 用量: what this account used today and this month (services/projects/activity.usage). Observations, not a bill.
import {useEffect,useState} from 'react';
import {request} from '../../lib/editor';
import {tokenText,type Usage,type UsagePeriod} from '../../lib/tasks';

function Period({title,p,priced}:{title:string;p:UsagePeriod;priced:boolean}){
  const yuan=(v:number|null)=>v==null?'':`约 ¥${v.toFixed(2)}`;
  return <div className="usage-period">
    <h3>{title}{p.total_cny!=null&&<span className="usage-total">合计约 ¥{p.total_cny.toFixed(2)}</span>}</h3>
    <dl>
      <dt>配音</dt><dd>{p.voice.characters} 字 · ¥{p.voice.cny.toFixed(2)}</dd>
      <dt>文案与选题（服务端模型）</dt><dd>{p.content.server.calls} 次 · {tokenText(p.content.server)}{priced?` · ${yuan(p.content.server.cny)}`:''}</dd>
      <dt>Agent 画面（服务端模型）</dt><dd>{tokenText(p.agent.server)}{priced?` · ${yuan(p.agent.server.cny)}`:''}</dd>
      {(p.content.own_model.calls>0||p.agent.own_model.output>0)&&<><dt>你的模型</dt><dd>文案 {p.content.own_model.calls} 次 · {tokenText(p.content.own_model)}；Agent {tokenText(p.agent.own_model)}（由你的服务商计费）</dd></>}
    </dl>
  </div>;
}

export function UsageCard(){
  const [usage,setUsage]=useState<Usage|null>(null),[error,setError]=useState('');
  useEffect(()=>{request<Usage>('/api/usage').then(setUsage).catch(e=>setError(e instanceof Error?e.message:'读取用量失败'));},[]);
  return <section className="settings-card" aria-labelledby="usage-title">
    <h2 id="usage-title">用量</h2>
    <p className="hint">按本机记录估算，不是服务商账单。配音按已核对的参考价；DeepSeek 只有在 .env 配置了价格（DEEPSEEK_PRICE_*）时才换算成元，否则只显示 token。</p>
    {error&&<p role="alert" className="error">{error}</p>}
    {!usage?!error&&<p className="hint">正在读取…</p>:<div className="usage-grid">
      <Period title="今天" p={usage.today} priced={usage.prices.deepseek_configured}/>
      <Period title="本月" p={usage.month} priced={usage.prices.deepseek_configured}/>
    </div>}
  </section>;
}
