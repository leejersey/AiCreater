import React from 'react';
import type {Scene} from '../../video-schema/src/types';
import {wrapText,type ElementBox} from './layout';
import {GraphicIcon,MarkedText} from './GraphicContent';
import {usePalette,useVisualStyle} from './theme';
import {actionProgressAtFrame,entranceAtFrame,visualSceneAtFrame} from './motion';

type DiagramBox=ElementBox & {kind:'message'|'state'|'stage'|'detail';columns:number};
// The exact same text rectangles are used by rendering and font-capacity checks.
export function diagramBoxes(scene:Scene):DiagramBox[]|null{
 const box=(id:string,kind:DiagramBox['kind'],x:number,y:number,width:number,height:number,fontSize:number,columns:number):DiagramBox=>({id,kind,x,y,width,height,fontSize,columns,lines:wrapText(scene.elements.find(e=>e.id===id)!.content,columns)});
 if(scene.dialogue){const results=new Set(scene.dialogue.context_messages===undefined?[]:(scene.visual_actions??[]).filter(a=>a.kind==='update').map(a=>a.source));return [
  ...scene.dialogue.messages.filter(id=>!results.has(id)).map((id,i)=>box(id,'message',166+(i%2)*70,350+i*194,678,130,32,18)),
  box(scene.dialogue.state,'state',1160,568,560,150,44,12),
 ];}
 if(scene.process){
  const n=scene.process.stages.length,width=(1640-(n-1)*80)/n;
  return [
   ...scene.process.stages.map((id,i)=>box(id,'stage',164+i*(width+80),374,width-48,140,32,Math.min(20,Math.floor((width-48)/32)))),
   ...scene.process.details.map((id,i)=>{const w=(1640-40*(scene.process!.details.length-1))/Math.max(1,scene.process!.details.length);return box(id,'detail',164+i*(w+40),690,w-48,120,30,Math.min(30,Math.floor((w-48)/30)));}),
  ];
 }
 return null;
}

export function TeachingDiagram({scene,frame}:{scene:Scene;frame:number}){
 const palette=usePalette(),style=useVisualStyle(),boxes=diagramBoxes(scene)!;
 const shown=visualSceneAtFrame(scene,frame),actions=scene.visual_actions??[];
 const state=(id:string)=>{const a=scene.animations.find(a=>a.target===id)!;return entranceAtFrame(frame,a.start_frame,a.duration_frames,style.entrance);};
 const focus=actions.filter(a=>a.kind==='highlight'&&a.start_frame<=frame).at(-1);
 const updates=scene.dialogue?actions.filter(a=>a.kind==='update'&&a.target===scene.dialogue!.state&&a.start_frame<=frame):[];
 const previous=updates.length?(updates.length>1?scene.elements.find(e=>e.id===updates.at(-2)!.source)!.content:scene.elements.find(e=>e.id===scene.dialogue!.state)!.content):undefined;
 const connections=[...actions.filter(a=>a.kind==='connect').map(a=>({from:a.target,to:a.to!,progress:actionProgressAtFrame(a,frame)})),...(scene.edges??[]).filter(e=>!actions.some(a=>a.kind==='connect'&&a.target===e.from&&a.to===e.to)).map(e=>({...e,progress:Math.min(state(e.from).opacity,state(e.to).opacity)}))];
 const rect=(b:DiagramBox)=>b.kind==='state'?{x:1120,y:300,width:640,height:540}:b.kind==='message'?{x:b.x-26,y:b.y-50,width:b.width+52,height:182}:b.kind==='stage'?{x:b.x-24,y:320,width:b.width+48,height:200}:{x:b.x-24,y:620,width:b.width+48,height:210};
 return <div data-teaching-diagram={scene.dialogue?'dialogue':'process'} style={{position:'absolute',inset:0}}>
  <div style={{position:'absolute',left:140,top:220,fontSize:36,color:palette.text}}>{scene.dialogue?'对话消息':'处理阶段'}</div>
  {scene.dialogue&&<div style={{position:'absolute',left:1120,top:220,fontSize:36,color:palette.text}}>上下文与状态</div>}
  <svg width={1920} height={1080} style={{position:'absolute'}} aria-hidden="true">
   <defs><marker id={`diagram-arrow-${scene.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d={style.arrow.head==='open'?'M0 0 L8 4 L0 8':'M0 0 L8 4 L0 8 Z'} fill={style.arrow.head==='open'?'none':palette.accent} stroke={style.arrow.head==='open'?palette.accent:undefined} strokeWidth={1.5}/></marker></defs>
   {connections.map((edge,i)=>{
    const from=rect(boxes.find(b=>b.id===edge.from)!),to=rect(boxes.find(b=>b.id===edge.to)!);
    const right=from.x<to.x,x1=from.x+(right?from.width:0),x2=to.x+(right?0:to.width),y1=from.y+from.height/2,y2=to.y+to.height/2,mid=(x1+x2)/2;
    const distant=scene.process&&Math.abs(x2-x1)>100;
    const d=distant?`M${x1} ${y1} H${x1+24} V${275-i*12} H${x2-24} V${y2} H${x2}`:style.arrow.path==='curve'?`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`:`M${x1} ${y1} H${mid} V${y2} H${x2}`;
    const opacity=edge.progress>0?Math.min(state(edge.from).opacity,state(edge.to).opacity):0;
    return <path key={i} data-visible-connection={opacity>0?`${edge.from}:${edge.to}`:undefined} d={d} fill="none" stroke={palette.accent} strokeWidth={style.arrow.width} pathLength={1} strokeDasharray={1} strokeDashoffset={1-edge.progress} opacity={opacity} markerEnd={edge.progress===1?`url(#diagram-arrow-${scene.id})`:undefined}/>;
   })}
  </svg>
  {boxes.map((b,i)=>{
   const motion=state(b.id),r=rect(b),element=shown.elements.find(e=>e.id===b.id)!,value=element.content,active=focus?.target===b.id;
   return <React.Fragment key={b.id}>
    <div data-dialogue-message={b.kind==='message'?b.id:undefined} data-dialogue-state={b.kind==='state'?b.id:undefined} data-process-stage={b.kind==='stage'?b.id:undefined} data-process-detail={b.kind==='detail'?b.id:undefined} style={{position:'absolute',left:r.x,top:r.y,width:r.width,height:r.height,boxSizing:'border-box',border:`${active||element.panel_style?3:style.card.borderWidth}px solid ${active||element.panel_style?palette.accent:palette.muted}`,borderRadius:b.kind==='message'?18:style.card.radius,background:element.panel_style==='conclusion'?palette.selected:palette.card,opacity:motion.opacity,transform:`translateY(${motion.translateY}px)`,clipPath:motion.clipPath,boxShadow:style.card.shadow}}>
     {b.kind==='message'&&<svg width={24} height={12} style={{position:'absolute',left:16,bottom:-12}} aria-hidden="true"><path d="M0 0 L14 0 L0 10 Z" fill={palette.card} stroke={palette.muted} strokeWidth={style.card.borderWidth}/></svg>}
    </div>
    <div data-conclusion={element.panel_style||undefined} data-source-label={element.source_label} style={{position:'absolute',left:r.x+24,top:r.y+14,fontSize:element.source_label?20:22,color:palette.muted,opacity:motion.opacity}}>{element.panel_style==='conclusion'?'结论 · ':''}{element.source_label??(b.kind==='message'?(scene.dialogue!.context_messages===undefined?`讲稿消息 ${scene.dialogue!.messages.indexOf(b.id)+1}`:scene.dialogue!.context_messages.includes(b.id)?'前文消息':'当前消息'):b.kind==='state'?'当前状态 · 讲稿示意':b.kind==='stage'?`阶段 ${i+1}`:`讲稿片段 ${scene.process!.details.indexOf(b.id)+1}`)}</div>
    {element.icon&&<div style={{position:'absolute',left:r.x+r.width-56,top:r.y+12,color:element.icon==='warning'?palette.warning:palette.accent,opacity:motion.opacity}}><GraphicIcon icon={element.icon}/></div>}
    {b.kind==='state'&&previous!==undefined&&<div data-previous-state={previous} style={{position:'absolute',left:1160,top:420,width:560,fontSize:32,lineHeight:1.35,color:palette.muted,whiteSpace:'pre',opacity:motion.opacity,textDecoration:'line-through'}}>{wrapText(previous,16).join('\n')}</div>}
    {b.kind==='state'&&<div style={{position:'absolute',left:1160,top:520,fontSize:24,color:palette.muted,opacity:motion.opacity}}>{previous!==undefined?'更新后':'初始状态'}</div>}
    <div data-element={b.id} data-state-value={b.kind==='state'?value:undefined} style={{position:'absolute',left:b.x,top:b.y,width:b.width,height:b.height,fontSize:b.fontSize,lineHeight:1.35,color:element.icon==='warning'?palette.warning:active||b.kind==='state'?palette.accent:palette.text,whiteSpace:'pre',opacity:motion.opacity,transform:`translateY(${motion.translateY}px)`,clipPath:motion.clipPath}}><MarkedText element={element} lines={wrapText(value,b.columns)} color={palette.accent}/></div>
   </React.Fragment>;
  })}
  <div style={{position:'absolute',left:140,top:886,fontSize:22,color:palette.muted}}>{scene.dialogue?'对话与状态均为讲稿示意 · 不代表真实推理结果':'流程与参数仅为讲稿示意 · 不执行真实工具'}</div>
 </div>;
}
