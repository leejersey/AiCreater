'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {API,formSteps,type SceneRow} from '../lib/editor';
import {sceneTeachingChanges} from '../lib/version-changes';
import {Sparkles,Code,Spinner,AlertCircle,CheckCircle,Clock} from './Icons';

export type Candidate={id:string;scene_id:string;base_revision:number;accepted:boolean;draft:SceneRow['scene']};

export function parseCandidates(value:unknown,sceneId:string):Candidate[] {
  if(!Array.isArray(value))throw new Error('候选列表格式错误。');
  const ids=new Set<string>();
  for(const item of value){
    if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id.trim()||ids.has(item.id)||
      item.scene_id!==sceneId||!Number.isSafeInteger(item.base_revision)||item.base_revision<1||
      typeof item.accepted!=='boolean'||!Object.hasOwn(item,'draft'))throw new Error('候选列表与当前章节不一致或格式错误。');
    ids.add(item.id);
  }
  return value as Candidate[];
}

export function CandidateList({row,busy,dirty,refreshToken,onAccept}:{row:SceneRow;busy:boolean;dirty:boolean;refreshToken:string;onAccept:(candidate:Candidate)=>void}) {
  const [items,setItems]=useState<Candidate[]|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    if(active.current)return;
    const controller=new AbortController();active.current=controller;setItems(null);setLoading(true);setError('');
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(API+'/api/scenes/'+encodeURIComponent(row.id)+'/candidates',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('Candidates unavailable');
      const data=parseCandidates(await response.json(),row.id);
      if(active.current===controller)setItems(data);
    }catch{if(active.current===controller)setError('候选读取失败或超时；旧列表已隐藏，可重试读取，不会重新生成。');}
    finally{clearTimeout(timer);if(active.current===controller){active.current=null;setLoading(false);}}
  },[row.id]);
  useEffect(()=>{
    void refresh();return()=>{active.current?.abort();active.current=null;};
  },[refresh,refreshToken]);
  return <section aria-label="候选分镜">
    <h3><Sparkles size={14} /> 候选分镜</h3><button type="button" disabled={loading||busy} onClick={()=>void refresh()}>刷新候选列表</button>
    {loading&&<p role="status"><Spinner size={14} className="icon-spin" /> 正在读取候选…</p>}
    {error&&<p role="alert" className="error-text"><AlertCircle size={14} /> {error}</p>}
    {!loading&&!error&&items?.length===0&&<p className="hint">暂无候选；刷新只读取，不会生成。</p>}
    {!loading&&!error&&items?.map(candidate=><CandidateReview key={candidate.id} row={row} candidate={candidate} busy={busy} dirty={dirty} onAccept={()=>onAccept(candidate)}/>)}
  </section>;
}

export function CandidateReview({row,candidate,busy,dirty,onAccept}:{row:SceneRow;candidate:Candidate;busy:boolean;dirty:boolean;onAccept:()=>void}) {
  const owned=candidate.scene_id===row.id&&candidate.draft?.id===row.scene.id;
  let summary:ReturnType<typeof sceneTeachingChanges>|null=null;
  try {
    if(owned&&typeof candidate.draft.narration?.text==='string'){
      formSteps(JSON.stringify(candidate.draft.elements));
      summary=sceneTeachingChanges(row.scene,candidate.draft);
    }
  } catch { /* Historical malformed data stays read-only. */ }
  const problem=!owned?'候选不属于当前章节，不能接受。':!summary?'候选数据无法比较，不能接受；完整JSON仍可查看。':'';
  const allowed=!busy&&!dirty&&!candidate.accepted&&candidate.base_revision===row.revision&&!!summary&&owned;
  return <details><summary><Sparkles size={13} /> 候选 · 基于r{candidate.base_revision}{candidate.accepted?'（已接受）':candidate.base_revision!==row.revision?'（已过期）':''}</summary>
    <h3>已保存 r{row.revision} → 候选</h3>
    <p className="hint">不含未保存输入；只比较教学字段，不比较配音、字幕或时轴。接受仍需核对事实和代码，不自动派发任务。</p>
    {candidate.accepted?<p className="hint"><CheckCircle size={12} /> 已接受，仅供查看，不能重复接受。</p>:candidate.base_revision!==row.revision&&<p role="alert"><Clock size={12} /> 候选已过期 · 当前 r{row.revision}，不能接受。</p>}
    {dirty&&<p className="hint">有未保存输入，保存或放弃后才能接受；摘要仍使用已保存稿。</p>}
    {problem&&<p role="alert">{problem}</p>}
    {summary&&<>
      <p>{summary.changes.length?'变化字段：'+summary.changes.join('、'):'本摘要覆盖的教学字段无变化'}</p>
      {summary.values?.map(value=><details key={value.label}><summary>{value.label}：当前与候选</summary>
        <h4>当前已保存值</h4><pre>{value.before===null?'（未设置）':value.before===''?'（空文本）':value.before}</pre>
        <h4>候选值</h4><pre>{value.after===null?'（未设置）':value.after===''?'（空文本）':value.after}</pre>
      </details>)}
      {summary.changes.includes('步骤')&&<details><summary>步骤：当前与候选</summary>
        <p className="hint">内容与触发范围概览；角色、变量等其他字段请核对完整JSON。</p>
        {[{label:'当前步骤',steps:row.scene.elements},{label:'候选步骤',steps:candidate.draft.elements}].map(group=><div key={group.label}><h4>{group.label}</h4><ol>{group.steps.map(step=><li key={step.id}>{step.content}<small> · 触发范围 [{step.cue.text_start}, {step.cue.text_end})</small></li>)}</ol></div>)}
      </details>}
    </>}
    <details><summary><Code size={13} /> 完整候选JSON（只读）</summary><pre>{JSON.stringify(candidate.draft,null,2)}</pre></details>
    <button type="button" disabled={!allowed} onClick={()=>{if(allowed)onAccept();}}>确认接受</button>
  </details>;
}
