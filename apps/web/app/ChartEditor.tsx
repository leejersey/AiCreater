'use client';
import {useState} from 'react';
import type {SceneRow} from '../lib/editor';
import {chartPayload,chartStarter} from '../lib/chart';
import {DraftNotice, useLocalDraft} from './LocalDraft';
export function ChartEditor({projectId,row,disabled,onDirty,save,act}:{projectId:string;row:SceneRow;disabled:boolean;onDirty:(v:boolean)=>void;save:(body:ReturnType<typeof chartPayload>)=>Promise<void>;act:(fn:()=>Promise<unknown>)=>Promise<void>}){
  const [confirmed,setConfirmed]=useState(false);
  const draft=useLocalDraft({kind:'chart',projectId,sceneId:row.id,label:'图表JSON · '+row.id},row.revision,{text:chartStarter(row.scene)},()=>{setConfirmed(false);onDirty(true);});
  const text=draft.value.text;
  const externalDisabled=disabled; disabled=disabled||draft.blocked;
  return <details open={row.scene.type==='data_chart'||draft.notice.pending!==null||draft.edited}><summary>数据图表 · 人工录入与确认</summary>
    <DraftNotice {...draft.notice} disabled={externalDisabled}/>
    <p className="hint">支持bar柱状、line折线、proportion比例、matrix矩阵；单系列最多6项，矩阵最多6×6，首版非负数。矩阵填写columns，每行values数量须一致。标签≤8码点、标题≤24、来源≤32，数值0–10亿；超限明确拒绝。</p>
    <p className="hint">title标题、unit单位、source_note真实来源必填。data按elements顺序绑定element_id；每个cue是口播中的Unicode码点区间，不能猜时机或补造数字。转换已有场景保留音轨，随后需本地重算时间轴。</p>
    <label>图表与触发数据JSON<textarea aria-label="图表与触发数据JSON" disabled={disabled} rows={18} value={text} onChange={e=>{draft.change({text:e.target.value});setConfirmed(false);onDirty(true);}} spellCheck={false}/></label>
    <label className="check"><input type="checkbox" disabled={disabled} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对数字、单位、来源、行列和触发位置；示例数据不代表真实统计</label>
    <button type="button" disabled={disabled||!confirmed} onClick={()=>void act(async()=>{await save(chartPayload(text,confirmed));draft.clear();setConfirmed(false);})}>确认并保存图表（不计费）</button>
    <p className="hint">缺数据时不能保存；模型禁止创建或替换已确认图表。来源只是你的声明，系统不自动核实事实。</p>
  </details>;
}
