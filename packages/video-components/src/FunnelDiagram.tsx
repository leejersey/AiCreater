import React from 'react';
import type {Scene} from '../../video-schema/src/types';
import {wrapText} from './layout';
import {MarkedText} from './GraphicContent';
import {usePalette,useVisualStyle} from './theme';
import {entranceAtFrame,actionProgressAtFrame,visualSceneAtFrame,latestBeat,beatCamera,cameraTransform} from './motion';

export const isSemanticFunnel=(scene:Scene)=>scene.motif==='funnel'&&['card_sequence','flow_diagram'].includes(scene.type)&&!!(scene.funnel||scene.visual_actions?.length)&&(scene.funnel?.layers.length??scene.elements.length)>=2&&(scene.funnel?.layers.length??scene.elements.length)<=3;

export function funnelNoteBoxes(scene:Scene){
 return (scene.funnel?.notes??[]).map((note,i)=>{const e=scene.elements.find(e=>e.id===note.element_id)!;return {...note,id:e.id,x:1220,y:326+i*190,width:540,height:130,fontSize:32,columns:16,lines:wrapText(e.content,16)};});
}
export function funnelTextBoxes(scene:Scene){return [...funnelLayers(scene).map(l=>({id:l.id,...l.label})),...funnelNoteBoxes(scene)];}

export function funnelLayers(scene:Scene){
 const elements=scene.funnel?scene.funnel.layers.map(id=>scene.elements.find(e=>e.id===id)!):scene.elements;
 const n=elements.length,side=!scene.funnel&&elements.some(e=>Array.from(e.content).length>8||e.content.includes('\n'));
 const center=side||scene.funnel?660:960,top=280,height=540,step=height/n;
 const width=(i:number)=>900-i/n*620;
 return elements.map((e,i)=>{
  const y=top+i*step,w1=width(i),w2=width(i+1),mid=(w1+w2)/2;
  const fontSize=side?36:40,columns=side?14:8;
  const label={x:side?1180:center-mid/2+20,y:y+12,width:side?600:mid-40,height:step-24,fontSize,columns,lines:wrapText(e.content,columns)};
  if(label.lines.length*fontSize*1.35>label.height)throw new Error('funnel_label_overflow');
  return {id:e.id,y,height:step,center,topWidth:w1,bottomWidth:w2,side,label,
   points:`${center-w1/2},${y} ${center+w1/2},${y} ${center+w2/2},${y+step} ${center-w2/2},${y+step}`};
 });
}

// Opt-in action scenes only; old frozen funnels keep the original card renderer.
export function FunnelDiagram({scene,frame}:{scene:Scene;frame:number}){
 const palette=usePalette(),style=useVisualStyle(),layers=funnelLayers(scene),notes=funnelNoteBoxes(scene);
 const shown=visualSceneAtFrame(scene,frame),actions=scene.visual_actions??[];
 const focus=actions.filter(a=>a.kind==='highlight'&&a.start_frame<=frame).at(-1);
 const focusProgress=focus?actionProgressAtFrame(focus,frame):0;
 const beat=latestBeat(scene.animations,frame);
 const beatId=focus?.target??beat?.target;
 const state=(id:string)=>{const a=scene.animations.find(a=>a.target===id)!;return entranceAtFrame(frame,a.start_frame,a.duration_frames,style.entrance);};
 const layerBox=(id:string|undefined)=>layers.find(l=>l.id===id)?.label;
 const camera=beatCamera(layerBox(beatId),layerBox(scene.animations.filter(a=>a.start_frame<=frame&&a.target!==beatId).at(-1)?.target),beat?frame-(focus?.start_frame??beat.start_frame):0);
 return <div data-semantic-funnel data-beat-focus={beatId} data-beat-camera={beatId||undefined} style={{position:'absolute',inset:0,...cameraTransform(camera)}}>
  <svg width={1920} height={1080} style={{position:'absolute'}} aria-hidden="true">
   <defs><marker id={`funnel-arrow-${scene.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">{style.arrow.head==='open'?<path d="M0 0 L8 4 L0 8" fill="none" stroke={palette.accent} strokeWidth={1.5}/>:<path d="M0 0 L8 4 L0 8 Z" fill={palette.accent}/>}</marker></defs>
   {layers.map((l,i)=>{
    const visible=state(l.id).opacity,active=l.id===beatId;
    return <g key={l.id} data-funnel-layer={l.id}>
     <polygon points={l.points} fill={palette.accent} fillOpacity={visible*(active?0.16:0.035)} stroke={active?palette.accent:palette.muted} strokeWidth={active?4:2} strokeOpacity={active?1:0.45}/>
     {l.side&&<g opacity={visible}>
      <text x={l.center} y={l.y+l.height/2+14} textAnchor="middle" fill={active?palette.accent:palette.muted} fontSize={38}>{i+1}</text>
      <path d={`M${l.center+(l.topWidth+l.bottomWidth)/4+12} ${l.y+l.height/2} H1140`} stroke={palette.muted} strokeWidth={2} fill="none"/>
     </g>}
    </g>;
   })}
   {actions.filter(a=>a.kind==='connect').map((a,i)=>{
    const from=layers.find(l=>l.id===a.target)!,to=layers.find(l=>l.id===a.to)!;
    const progress=actionProgressAtFrame(a,frame),lane=Math.min(from.center-from.topWidth/2,to.center-to.topWidth/2)-36-i*12;
    const y1=from.y+from.height/2,y2=to.y+to.height/2;
    const x1=from.center-(from.topWidth+from.bottomWidth)/4,x2=to.center-(to.topWidth+to.bottomWidth)/4;
    const path=style.arrow.path==='curve'?`M${x1} ${y1} C${lane} ${y1} ${lane} ${y2} ${x2} ${y2}`:`M${x1} ${y1} H${lane} V${y2} H${x2}`;
    return <path key={i} data-visual-connection={`${a.target}:${a.to}`} data-funnel-arrow={`${style.arrow.head}:${style.arrow.path}:${style.arrow.width}`} d={path} fill="none" stroke={palette.accent} strokeWidth={style.arrow.width} pathLength={1} strokeDasharray={1} strokeDashoffset={1-progress} opacity={progress>0?Math.min(state(a.target).opacity,state(a.to!).opacity):0} markerEnd={progress===1?`url(#funnel-arrow-${scene.id})`:undefined}/>;
   })}
   {notes.map(n=>{const opacity=state(n.id).opacity,y=n.y+38,target=layers.find(l=>l.id===n.target);return <g key={n.id} opacity={opacity}>
    {n.direction&&<path data-funnel-direction={n.direction} d={`M1160 ${n.direction==='up'?n.y+100:n.y-20} V${n.direction==='up'?n.y-20:n.y+100}`} stroke={palette.accent} strokeWidth={style.arrow.width} fill="none" markerEnd={`url(#funnel-arrow-${scene.id})`}/>}
    {target&&<path d={`M1190 ${y} H1140 V${target.y+target.height/2} H${target.center+(target.topWidth+target.bottomWidth)/4}`} stroke={palette.accent} strokeWidth={style.arrow.width} fill="none" opacity={state(target.id).opacity} pathLength={1} strokeDasharray={1} strokeDashoffset={1-opacity} markerEnd={opacity===1?`url(#funnel-arrow-${scene.id})`:undefined}/>}
   </g>;})}
  </svg>
  {layers.map(l=>{
   const b=l.label,e=shown.elements.find(e=>e.id===l.id)!,active=l.id===beatId;
   const past=!focus&&!!beat&&l.id!==beat.target&&state(l.id).opacity>0;
   const motion=state(l.id),opacity=motion.opacity*(focus&&!active?1-0.6*focusProgress:past?0.35:1);
   return <div key={l.id} data-element={l.id} data-action-highlight={focus?.target===l.id?l.id:undefined} style={{position:'absolute',left:b.x,top:b.y,width:b.width,height:b.height,opacity,transform:`translateY(${motion.translateY}px)`,clipPath:motion.clipPath,display:'flex',alignItems:'center',justifyContent:l.side?'flex-start':'center',color:active?palette.accent:palette.text,fontSize:b.fontSize,lineHeight:1.35,textAlign:l.side?'left':'center',whiteSpace:'pre',boxSizing:'border-box',paddingTop:e.source_label||e.panel_style?28:undefined}}>
    {(e.source_label||e.panel_style)&&<div data-conclusion={e.panel_style||undefined} data-source-label={e.source_label} style={{position:'absolute',top:0,fontSize:18,color:palette.accent}}>{e.panel_style==='conclusion'?'结论 · ':''}{e.source_label}</div>}
    {e.highlight?<span><MarkedText element={e} lines={wrapText(e.content,b.columns)} color={palette.accent}/></span>:wrapText(e.content,b.columns).join('\n')}</div>;
  })}
  {notes.map(b=>{const e=shown.elements.find(e=>e.id===b.id)!,motion=state(b.id),conclusion=e.panel_style==='conclusion';return <div key={b.id} data-funnel-note={b.id} style={{position:'absolute',left:b.x-24,top:b.y-46,width:b.width+48,height:178,opacity:motion.opacity,transform:`translateY(${motion.translateY}px)`,clipPath:motion.clipPath,border:`${conclusion?3:style.card.borderWidth}px solid ${conclusion?palette.accent:palette.muted}`,borderRadius:style.card.radius,background:conclusion?palette.selected:palette.card,boxShadow:style.card.shadow,boxSizing:'border-box'}}>
   <div data-conclusion={conclusion||undefined} data-source-label={e.source_label} style={{position:'absolute',left:24,top:12,fontSize:22,color:palette.muted}}>{conclusion?'结论':e.source_label?'稿中来源':'讲稿侧注'}{e.source_label?` · ${e.source_label}`:''}</div>
   <div data-element={b.id} style={{position:'absolute',left:24,top:46,width:b.width,height:b.height,fontSize:b.fontSize,lineHeight:1.35,color:conclusion?palette.accent:palette.text,whiteSpace:'pre'}}><MarkedText element={e} lines={wrapText(e.content,b.columns)} color={palette.accent}/></div>
  </div>;})}
  <div style={{position:'absolute',left:120,top:855,fontSize:24,color:palette.muted}}>层级示意 · 不表示数量比例</div>
 </div>;
}
