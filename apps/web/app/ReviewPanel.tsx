'use client';
// The content review report: claims traced to the evidence pack, rule findings, and (on a course) confirming blocks.
import {useState} from 'react';
import {CLAIM_LABELS,KIND_LABELS,LEVEL_LABELS,SEVERITY_LABELS,orderedItems,type Evidence,type ReviewItem,type ReviewOverride,type ReviewResult} from '../lib/review';

export function ReviewReport({result,overrides={},evidence=[],stale=false,disabled=false,onOverride}:{
  result:ReviewResult;overrides?:Record<string,ReviewOverride>;evidence?:Evidence[];stale?:boolean;disabled?:boolean;
  onOverride?:(item:ReviewItem,note:string)=>void;
}){
  const [notes,setNotes]=useState<Record<string,string>>({});
  const byId=Object.fromEntries(evidence.map(e=>[e.id,e]));
  const c=result.counts;
  const open=result.items.filter(i=>i.severity==='block'&&!overrides[i.id]).length;
  const level=open?'block':result.items.some(i=>i.severity!=='info')?'warn':'pass';
  return <div className="review-report">
    <div className={`review-head review-${level}`}>
      <b>{LEVEL_LABELS[level]}</b>
      <span>断言 {c.claims} 条：{c.sourced} 条有来源 · {c.secondhand} 条二手来源 · {c.unsourced} 条找不到来源（证据 {c.evidence} 条）</span>
    </div>
    {stale&&<p className="hint review-stale">口播在审核之后改过了，这份报告已过期，请重新审核。</p>}
    {c.evidence===0&&c.claims>0&&<p className="hint">这份文稿没有证据包，带数字或「研究显示」的断言都无法溯源。{onOverride?'可以修改口播，或核实后逐条点「我已核实」。':'可以在选题台挑一张选题卡「用这个选题做视频」，带着证据写稿后再审核。'}</p>}
    {result.items.length===0&&<p className="hint">没有发现问题。</p>}
    <ul className="review-items">
      {orderedItems(result.items,overrides).map(item=>{
        const done=overrides[item.id],ev=item.evidence_id?byId[item.evidence_id]:undefined;
        return <li key={item.id} className={`review-item review-${item.severity}${done?' review-done':''}`}>
          <div className="review-item-head">
            <span className={`review-tag review-${item.severity}`}>{done?'已确认':SEVERITY_LABELS[item.severity]}</span>
            <span className="review-kind">{KIND_LABELS[item.kind]??item.kind}</span>
            <span className="review-section">{item.section}</span>
          </div>
          <p className="review-text">「{item.text}」</p>
          <p className="hint" style={{margin:0}}>{item.detail}</p>
          {ev&&<p className="hint review-evidence">{ev.id}：{ev.text.slice(0,120)}{ev.text.length>120?'…':''}{ev.source?.url?<> · <a href={ev.source.url} target="_blank" rel="noreferrer noopener">{ev.source.title||'来源'}</a></>:null}</p>}
          {done&&<p className="hint review-evidence">核实依据：{done.note}</p>}
          {onOverride&&item.severity==='block'&&!done&&<div className="review-override">
            <input maxLength={300} value={notes[item.id]??''} disabled={disabled||stale} placeholder="已核实的依据，例如：原始报告第 3 页" onChange={e=>setNotes(n=>({...n,[item.id]:e.target.value}))}/>
            <button type="button" disabled={disabled||stale||!(notes[item.id]??'').trim()} onClick={()=>onOverride(item,(notes[item.id]??'').trim())}>我已核实</button>
          </div>}
        </li>;
      })}
    </ul>
    {result.claims.length>0&&<details className="review-claims"><summary>全部断言（{result.claims.length}）</summary>
      <ul>{result.claims.map(cl=><li key={cl.id}><span className={`review-tag review-${cl.status==='sourced'?'pass':cl.status==='secondhand'?'warn':'block'}`}>{CLAIM_LABELS[cl.status]}</span> {cl.section} · 「{cl.text}」{cl.evidence_id?` → ${cl.evidence_id}`:''}{cl.cited_by_section?'（本段已标注依据）':''}{cl.judged_by==='ai'?'（AI 判断）':''}</li>)}</ul>
    </details>}
  </div>;
}
