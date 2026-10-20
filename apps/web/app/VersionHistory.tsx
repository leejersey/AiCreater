'use client';
import React, {useEffect, useRef, useState} from 'react';
import type {VideoProject} from '../../../packages/video-schema/src/types';
import {parseProject} from '../../../packages/video-schema/src/validate';
import {validateVisualStyle, type VisualStyleSnapshot} from '../../../packages/video-components/src/theme';
import {request} from '../lib/editor';
import {compareSavedVersion, type ChangeSummary} from '../lib/version-changes';

type Summary = {id:string; project_id:string; revision:number; theme:string; scene_count:number};
type Page = {items:Summary[]; next_before_revision:number|null};
type Version = {id:string; project_id:string; revision:number; dsl:VideoProject;profile?:(Record<string,unknown>&{visual_style?:VisualStyleSnapshot})|null};

export function parseVersionPage(value:unknown,projectId:string,cursor?:number):Page {
  const invalid=()=>new Error('版本列表格式错误，已有列表未改变，请手动重试。');
  const page=value as Page;
  if(!page||typeof page!=='object'||Array.isArray(page)||!Array.isArray(page.items)||page.items.length>50)throw invalid();
  const ids=new Set<string>();let previous=cursor??Infinity;
  for(const row of page.items){
    if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!/^[A-Za-z0-9_-]+$/.test(row.id)||ids.has(row.id)||row.project_id!==projectId||
      !Number.isSafeInteger(row.revision)||row.revision<1||row.revision>=previous||typeof row.theme!=='string'||!row.theme.trim()||!Number.isSafeInteger(row.scene_count)||row.scene_count<0)throw invalid();
    ids.add(row.id);previous=row.revision;
  }
  if(page.next_before_revision!==null&&(!page.items.length||!Number.isSafeInteger(page.next_before_revision)||page.next_before_revision<1||page.next_before_revision!==previous))throw invalid();
  return page;
}
export function parseVersion(value:unknown,projectId:string,id:string,revision:number):Version {
  const invalid=()=>new Error('冻结版本格式错误，已有详情未改变，请手动重试。');
  const version=value as Version;
  if(!version||typeof version!=='object'||Array.isArray(version)||version.id!==id||version.project_id!==projectId||!Number.isSafeInteger(version.revision)||version.revision<1||version.revision!==revision||
    (version.profile!=null&&(typeof version.profile!=='object'||Array.isArray(version.profile))))throw invalid();
  try{parseProject(version.dsl);if(version.profile?.visual_style!==undefined)validateVisualStyle(version.dsl,undefined,version.profile.visual_style);}
  catch{throw invalid();}
  return version;
}

export function parseCreatedVersion(value:unknown,projectId:string,revision:number):Version {
  const id=(value as {id?:unknown}|null)?.id;
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('冻结响应缺少有效版本ID，未提交渲染；请核对版本历史。');
  return parseVersion(value,projectId,id,revision);
}

export function VersionChanges({oldRevision,currentRevision,summary}:{oldRevision:number;currentRevision:number;summary:ChangeSummary}) {
  const labels={added:'新增',removed:'删除',changed:'变化'};
  return <section aria-label="教学内容变化摘要"><h3>旧冻结 r{oldRevision} → 本次读取的已保存 r{currentRevision}</h3>
    <p className="hint">不含未保存输入或读取后修改；只比较教学字段，不比较视觉风格、配音、字幕或时轴。需要最新结果请再次比较。</p>
    {summary.themeChanged&&<p>主题变化</p>}
    {!summary.themeChanged&&!summary.scenes.length&&<p>本摘要覆盖的教学字段无变化</p>}
    {summary.scenes.map(s=><div key={s.id}><p>{labels[s.kind]} · {s.id} · {s.type} · 位置 {s.beforePosition??'—'} → {s.afterPosition??'—'}{s.changes.length?' · '+s.changes.join('、'):''}</p>
      {s.values?.map(v=><details key={v.label}><summary>{v.label}：旧值与已保存新值</summary>
        <p className="hint">只读源值，非逐字高亮。</p>
        <h4>旧冻结 r{oldRevision}</h4><pre aria-label={`${s.id} ${v.label} 旧值`}>{v.before===null?'（未设置）':v.before===''?'（空文本）':v.before}</pre>
        <h4>本次读取的已保存 r{currentRevision}</h4><pre aria-label={`${s.id} ${v.label} 新值`}>{v.after===null?'（未设置）':v.after===''?'（空文本）':v.after}</pre>
      </details>)}
    </div>)}
  </section>;
}

export function VersionContent({version}:{version:Version}) {
  return <section aria-label="冻结版本详情"><h3>只读冻结版本 r{version.revision}</h3>
    <p className="hint">主题：{version.dsl.theme??'tech_explainer'} · 创建时间未记录 · 不覆盖当前编辑</p>
    <p className="hint">冻结风格：{version.profile?.visual_style?`${version.profile.visual_style.tokens.label}（${version.profile.visual_style.id}）`:'legacy（历史版本未单独记录）'} · 旧版本导出使用自己的冻结参数，不跟随当前选择。</p>
    {version.dsl.scenes.map((scene,i)=><details key={scene.id}><summary>{i+1}. {scene.type}</summary>
      <p>{scene.narration.text}</p>{scene.code&&<pre>{scene.code.source}</pre>}
      <details><summary>完整场景数据（只读）</summary><pre>{JSON.stringify(scene,null,2)}</pre></details>
    </details>)}
  </section>;
}

export function VersionHistory({projectId}:{projectId:string}) {
  const [items,setItems]=useState<Summary[]>([]),[next,setNext]=useState<number|null>(null);
  const [loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [detail,setDetail]=useState<Version|null>(null),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState('');
  const [comparison,setComparison]=useState<{versionId:string;revision:number;summary:ChangeSummary}|null>(null);
  const [comparing,setComparing]=useState(false),[compareError,setCompareError]=useState('');
  const live=useRef(true),listEpoch=useRef(0),detailEpoch=useRef(0),listBusy=useRef(false),compareEpoch=useRef(0),compareBusy=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;listEpoch.current++;detailEpoch.current++;compareEpoch.current++;};},[]);
  async function load(cursor?:number) {
    if(listBusy.current)return;
    listBusy.current=true;const epoch=++listEpoch.current;setLoading(true);setError('');
    try {
      const response=await request<unknown>('/api/projects/'+projectId+'/versions'+(cursor===undefined?'':'?before_revision='+cursor),undefined,'GET',AbortSignal.timeout(5000));
      if(!live.current||epoch!==listEpoch.current)return;
      const page=parseVersionPage(response,projectId,cursor);
      if(cursor!==undefined&&page.items.some(v=>items.some(old=>old.id===v.id||old.revision===v.revision)))throw new Error('版本列表格式错误，已有列表未改变，请手动重试。');
      setItems(old=>cursor===undefined?page.items:[...old,...page.items.filter(v=>!old.some(e=>e.id===v.id))]);
      setNext(page.next_before_revision);setLoaded(true);
    } catch(e){if(live.current&&epoch===listEpoch.current)setError(e instanceof Error&&e.name==='TimeoutError'?'读取版本历史超时，请手动重试。':e instanceof Error?e.message:'读取版本历史失败。');}
    finally{if(live.current&&epoch===listEpoch.current){listBusy.current=false;setLoading(false);}}
  }
  function clearComparison(){compareEpoch.current++;compareBusy.current=false;setComparing(false);setComparison(null);setCompareError('');}
  async function compare(){
    if(!detail||detailLoading||compareBusy.current)return;
    const version=detail,epoch=++compareEpoch.current;compareBusy.current=true;setComparing(true);setCompareError('');
    try{
      const current=await request<unknown>('/api/projects/'+projectId,undefined,'GET',AbortSignal.timeout(5000));
      if(!live.current||epoch!==compareEpoch.current)return;
      setComparison({versionId:version.id,...compareSavedVersion(version.dsl,current,projectId)});
    }catch(e){if(live.current&&epoch===compareEpoch.current)setCompareError(e instanceof Error&&e.name==='TimeoutError'?'比较已保存稿超时，请手动重试。':e instanceof Error?e.message:'比较已保存稿失败。');}
    finally{if(live.current&&epoch===compareEpoch.current){compareBusy.current=false;setComparing(false);}}
  }
  async function inspect(selected:Summary) {
    clearComparison();const epoch=++detailEpoch.current;setDetailLoading(true);setDetailError('');
    try {
      const response=await request<unknown>('/api/versions/'+selected.id,undefined,'GET',AbortSignal.timeout(5000));
      if(!live.current||epoch!==detailEpoch.current)return;
      setDetail(parseVersion(response,projectId,selected.id,selected.revision));
    } catch(e){if(live.current&&epoch===detailEpoch.current)setDetailError(e instanceof Error&&e.name==='TimeoutError'?'读取冻结版本超时，请手动重试。':e instanceof Error?e.message:'读取冻结版本失败。');}
    finally{if(live.current&&epoch===detailEpoch.current)setDetailLoading(false);}
  }
  return <details onToggle={e=>{if(e.currentTarget.open&&!loaded&&!listBusy.current)void load();}}>
    <summary>版本历史（只读）</summary><p className="hint">创建时间未记录；按冻结时的项目版本倒序。查看旧稿不修改当前未保存输入，不播放旧视频。列表、详情和比较读取最多等待5秒，超时后可手动重试；不取消后台任务。</p>
    <button type="button" disabled={loading} onClick={()=>void load()}>刷新版本历史</button>
    {loading&&<p role="status">正在读取版本历史…</p>}
    {error&&<p role="alert" className="error-text">{error} · 当前编辑未改变；若API尚未重载，请先完成激活。</p>}
    {loaded&&!items.length&&<p className="muted">暂无冻结版本</p>}
    {items.map(v=><div className="job" key={v.id}><span>r{v.revision} · {v.theme} · {v.scene_count} 个场景</span>
      <button type="button" disabled={detailLoading} onClick={()=>void inspect(v)}>查看冻结版本 r{v.revision}</button></div>)}
    {next!==null&&<button type="button" disabled={loading} onClick={()=>void load(next)}>加载更早版本</button>}
    {detailLoading&&<p role="status">正在读取冻结版本…</p>}
    {detailError&&<p role="alert" className="error-text">{detailError}</p>}
    {detail&&<><button type="button" onClick={()=>{detailEpoch.current++;clearComparison();setDetail(null);setDetailLoading(false);setDetailError('');}}>关闭版本详情</button>
      <button type="button" disabled={detailLoading||comparing} onClick={()=>void compare()}>与当前已保存稿比较</button>
      {comparing&&<p role="status">正在读取已保存稿并比较…</p>}
      {compareError&&<p role="alert" className="error-text">{compareError} · 原比较结果与当前输入保留。</p>}
      {comparison?.versionId===detail.id&&<VersionChanges oldRevision={detail.revision} currentRevision={comparison.revision} summary={comparison.summary}/>}
      <VersionContent version={detail}/></>}
  </details>;
}
