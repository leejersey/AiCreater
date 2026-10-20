import React from 'react';
import type {Scene} from '../../video-schema/src/types';
import {activeStepAtFrame} from './motion';
import {wrapText} from './layout';
import {usePalette,useVisualStyle,visualStyles} from './theme';
import {dedicatedPanel,dedicatedReveal} from './dedicated-style';

export function CodeStateLesson({scene,frame}:{scene:Scene;frame:number}){
  const p=usePalette(),style=useVisualStyle(),legacy=style===visualStyles.legacy,step=activeStepAtFrame(scene,frame),items=step?.array_items??[],pointers=step?.pointers??[];
  const panel=dedicatedPanel(style,p),reveal=dedicatedReveal(scene,frame,style);
  const multiline=(s:string,size:number)=>wrapText(s,size).join('\n');
  const valueText=(s:string)=>/^[\x20-\x7e]{0,8}$/.test(s)?s:multiline(s,4);
  return <div data-code-state="snapshot">
    <div style={{position:'absolute',left:80,top:132,width:1000,fontSize:38,fontWeight:700}}>{step?.content??'等待讲解开始'}</div>
    <div style={{position:'absolute',right:80,top:141,color:p.accent,fontSize:24}}>步骤 {step?scene.elements.indexOf(step)+1:'—'} / {scene.elements.length}{step?.loop?` · 第 ${step.loop.current} / ${step.loop.total} 轮`:''}</div>
    <div style={{...panel,left:80,top:184,width:1000,height:686}}>
      <div style={{fontSize:24,lineHeight:1,color:p.muted,marginBottom:20}}>{scene.code!.language.toUpperCase()} / 代码讲解</div>
      {scene.code!.source.split('\n').map((line,i)=><div key={i} data-code-line={i+1} style={{display:'flex',height:34,alignItems:'center',borderRadius:6,background:step?.code_lines?.includes(i+1)?p.accent+'25':'transparent',borderLeft:`4px solid ${step?.code_lines?.includes(i+1)?p.accent:'transparent'}`,fontFamily:'monospace, "Noto Sans SC"',fontSize:30,whiteSpace:'pre'}}><span style={{width:32,flexShrink:0,textAlign:'right',marginRight:16,color:p.muted}}>{i+1}</span><span>{line||' '}</span></div>)}
      <div style={{position:'absolute',bottom:18,left:24,color:p.muted,fontSize:22}}>教学快照，不执行代码；高亮表示讲解位置</div>
    </div>
    <div style={{...panel,left:1120,top:184,width:720,height:324,padding:'16px 24px',...reveal}}>
      <div style={{fontSize:24,color:p.muted}}>数组 / {scene.code!.array_name}</div>
      <div style={{display:'flex',gap:24,fontSize:22,color:p.accent,marginTop:6,minHeight:28}}>{pointers.map(v=><span key={v.name} data-pointer={v.name}>{v.name} → [{items.find(e=>e.id===v.item_id)!.key}]</span>)}</div>
      {!step?<div style={{fontSize:26,color:p.muted,marginTop:30}}>等待快照</div>:!items.length?<div style={{fontSize:26,color:p.muted,marginTop:30}}>（空数组）</div>:<div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(3,items.length)},1fr)`,gap:10,marginTop:6}}>{items.map(item=><div key={item.id} data-array-item={item.id} style={{height:items.length<=3?160:100,boxSizing:'border-box',textAlign:'center',borderRadius:legacy?12:style.card.radius,border:`${legacy?2:style.card.borderWidth}px solid ${pointers.some(v=>v.item_id===item.id)?p.accent:p.muted+'55'}`,background:style.card.outline?p.background:pointers.some(v=>v.item_id===item.id)?p.selected:p.card,padding:'4px 8px'}}><div style={{fontSize:items.length<=3?36:26,lineHeight:1.08,whiteSpace:'pre',height:items.length<=3?122:58}}>{valueText(item.value)}</div><div style={{fontSize:20,color:p.muted}}>索引 {item.key}</div></div>)}</div>}
    </div>
    <div style={{...panel,left:1120,top:528,width:720,height:164,padding:16,...reveal}}>
      <div style={{fontSize:22,color:p.muted,marginBottom:8}}>变量快照 · 非运行结果</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>{step?.variables?.map(v=><div key={v.name} style={{padding:'2px 10px 6px',background:style.card.outline?p.background:p.selected,borderRadius:legacy?8:style.card.radius}}><div style={{fontSize:20,lineHeight:1.2,color:p.muted}}>{v.name}</div><div data-variable={v.name} style={{fontSize:26,lineHeight:1.1,whiteSpace:'pre'}}>{valueText(v.value)}</div></div>)}</div>
    </div>
    <div style={{...panel,left:1120,top:712,width:720,height:190,padding:16,...reveal}}>
      <div style={{fontSize:22,color:p.muted,marginBottom:8}}>输入 / 输出 · 教学快照</div>
      <div style={{display:'flex',fontSize:24,lineHeight:1.15,minHeight:64}}><span style={{color:p.muted,width:80,flexShrink:0}}>输入</span><span style={{whiteSpace:'pre'}}>{multiline(step?.input||'（尚无输入）',22)}</span></div>
      <div style={{display:'flex',fontSize:24,lineHeight:1.15}}><span style={{color:p.muted,width:80,flexShrink:0}}>stdout</span><span data-output={step?.output??''} style={{whiteSpace:'pre',color:p.source}}>{multiline(step?.output||'（尚无输出）',22)}</span></div>
    </div>
  </div>;
}
