import React from 'react';
import type {Scene} from '../../video-schema/src/types';
import {processFrame,processTextBoxes} from './ProcessDemonstration';
import {wrapText,type ElementBox} from './layout';
import {usePalette} from './theme';
import {MarkedText} from './GraphicContent';

export function focusFrame(scene:Scene,frame:number){
 const starts=scene.animations.map(a=>a.start_frame);
 const paced={...scene,visual_actions:scene.visual_actions?.map(a=>{
  if(a.kind!=='connect')return a;
  const next=Math.min(scene.duration_frames,...starts.filter(t=>t>a.start_frame));
  return {...a,duration_frames:Math.min(Math.max(24,a.duration_frames),next-a.start_frame)};
 })};
 const state=processFrame(paced,frame,Infinity);
 let x=state.nodes[0].x,reached=state.nodes[0].id,moving=false;
 // shortcut: follow only explicit adjacent progression; require branch-state data before animating forks.
 for(let i=1;i<=state.stageIndex;i++){
  const incoming=state.connections.filter(e=>e.from===reached&&e.to===state.nodes[i].id&&e.adjacent);
  if(incoming.length!==1)continue;
  const edge=incoming[0];x=edge.fromNode.x+(edge.toNode.x-edge.fromNode.x)*edge.progress;
  moving=edge.progress>0&&edge.progress<1;
  if(edge.progress===1)reached=edge.to;else break;
 }
 const lead=Array.from(scene.narration.text).slice(0,Math.min(...scene.elements.map(e=>e.cue.text_start))).join('').trim().replace(/[，。；：,.!?:;]+$/u,'');
 // shortcut: long introductions use a neutral object label; explicit source-bound object editing is needed before supporting longer labels.
 const text=lead&&Array.from(lead).length<=30?lead:'示意对象';
 return {...state,object:{id:`${scene.id}:case`,text,x,y:548,moving}};
}
type FocusBox=ElementBox&{kind:'object'|'stage'|'focus'|'detail'};
export function focusTextBoxes(scene:Scene,frame:number):FocusBox[]{
 const state=focusFrame(scene,frame),caption=scene.captions.find(c=>frame>=c.start_frame&&frame<c.end_frame);
 const compact=Array.from(state.object.text).length<=18;
 const boxes:FocusBox[]=[{id:state.object.id,kind:'object',x:state.object.x-170,y:338,width:340,height:116,fontSize:compact?36:28,lines:caption?.text.includes(state.object.text)?[]:wrapText(state.object.text,compact?9:10)}];
 for(const [i,n] of state.nodes.entries()){
  const e=scene.elements.find(e=>e.id===n.id)!;
  if(n.visible&&state.opacity(n.id)===1&&!caption?.text.includes(e.content))boxes.push({id:n.id,kind:'stage',x:n.x-170,y:620,width:340,height:116,fontSize:28,lines:wrapText(e.content,10)});
  if(i===state.stageIndex&&e.highlight){
   const word=Array.from(e.content).slice(e.highlight.text_start,e.highlight.text_end).join('');
   if(word&&word!==e.content)boxes.push({id:e.id,kind:'focus',x:140,y:232,width:1640,height:80,fontSize:48,lines:wrapText(word,28)});
  }
 }
 for(const b of processTextBoxes(scene,0).filter(b=>b.kind==='detail')){
  if(frame>=scene.animations.find(a=>a.target===b.id)!.start_frame)boxes.push({...b,kind:'detail'});
 }
 return boxes;
}
export function ProcessFocus({scene,frame}:{scene:Scene;frame:number}){
 const p=usePalette(),state=focusFrame(scene,frame),boxes=focusTextBoxes(scene,frame),object=boxes[0];
 const opacity=Math.max(0,Math.min(1,(frame-scene.narration.audio_start_frame)/12));
 return <div data-process-focus style={{position:'absolute',inset:0,fontFamily:'"Noto Sans SC"',color:p.text}}>
  <div style={{position:'absolute',left:140,top:158,fontSize:24,color:p.muted,letterSpacing:4}}>过程演示 / 同一对象，逐步推进</div>
  <svg width={1920} height={1080} style={{position:'absolute',inset:0}} aria-hidden="true">
   <defs><marker id={`focus-arrow-${scene.id}`} markerWidth={9} markerHeight={9} refX={8} refY={4} orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke={p.accent} strokeWidth={1.8}/></marker></defs>
   {state.connections.map(e=><path key={`${e.from}:${e.to}`} d={e.path} pathLength={1} strokeDasharray={1} strokeDashoffset={1-e.progress} opacity={e.progress>0?.45:0} fill="none" stroke={p.accent} strokeWidth={3} markerEnd={e.progress===1?`url(#focus-arrow-${scene.id})`:undefined}/>)}
   {state.nodes.map((n,i)=><g key={n.id} opacity={n.visible?i===state.stageIndex?1:.38:.15}>
    {i===state.stageIndex&&<circle cx={n.x} cy={n.y} r={49} fill={p.selected}/>}
    <circle cx={n.x} cy={n.y} r={34} fill={p.card} stroke={i===state.stageIndex?p.accent:p.muted} strokeWidth={i===state.stageIndex?3:1.5}/>
    <text x={n.x} y={n.y+10} textAnchor="middle" fontSize={28} fill={p.accent}>{i+1}</text>
   </g>)}
   <g data-focus-object={state.object.id} data-moving={state.object.moving} opacity={opacity}>
    <rect x={object.x-12} y={object.y-14} width={object.width+24} height={144} rx={12} fill={p.card} stroke={p.accent} strokeWidth={3}/>
    {!object.lines.length&&<path d={`M${state.object.x-65} ${object.y+32} H${state.object.x+65} M${state.object.x-65} ${object.y+56} H${state.object.x+45} M${state.object.x-65} ${object.y+80} H${state.object.x+15}`} stroke={p.muted} strokeWidth={3} opacity={.45}/>}
    <path d={`M${state.object.x} ${object.y+130} V${state.object.moving?548:514}`} stroke={p.accent} strokeWidth={2}/>
    {state.object.moving&&<circle cx={state.object.x} cy={548} r={5} fill={p.accent}/>}
   </g>
  </svg>
  {boxes.map(b=>{
   const e=scene.elements.find(e=>e.id===b.id),isDetail=b.kind==='detail';
   return <div key={`${b.kind}:${b.id}`} data-focus-stage={b.kind==='stage'?b.id:undefined} data-focus-text={b.kind} style={{position:'absolute',left:b.x,top:b.y,width:b.width,height:b.height,fontSize:b.fontSize,lineHeight:1.35,whiteSpace:'pre',textAlign:b.kind==='stage'||b.kind==='object'?'center':'left',opacity:b.kind==='object'?opacity:b.kind==='stage'?.48:e?state.opacity(e.id):1,color:isDetail&&e?.icon==='warning'?p.warning:b.kind==='focus'?p.accent:p.text}}>
    {isDetail?<MarkedText element={e!} lines={b.lines} color={p.accent}/>:b.lines.join('\n')}
   </div>;
  })}
 </div>;
}
