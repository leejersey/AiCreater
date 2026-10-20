import React from 'react';
import type {Scene} from '../../video-schema/src/types';
import {layoutElements, flowPath, hasGraphicStyle} from './layout';
import {usePalette, useVisualStyle, isPaperSlide} from './theme';
import {entranceAtFrame} from './motion';
import {GraphicContent} from './GraphicContent';
import {MotifDecor, motifLayout} from './motifs';
import {conceptLabels} from '../../video-schema/src/concept';

// Shared by the actual video and static visual regression tests.
export function SceneGraphics({scene,frame}:{scene:Scene;frame:number}){
  const palette=usePalette(),style=useVisualStyle(),paper=isPaperSlide(style);
  const motif = typeof scene.motif === 'string' ? scene.motif : 'default';
  const boxes = motifLayout(scene, style.layout) ?? layoutElements(scene, style.layout);
  const animations=new Map(scene.animations.map(a=>[a.target,a]));
  const state=(id:string)=>{const a=animations.get(id)!;return entranceAtFrame(frame,a.start_frame,a.duration_frames,style.entrance);};
  const titleOutline=scene.type==='title_reveal';
  return <>
    <MotifDecor scene={scene} boxes={boxes} frame={frame}/>
    {scene.type==='comparison_panel'&&motif==='default'&&boxes.length>=2&&<svg width={1920} height={1080} style={{position:'absolute'}} aria-hidden="true">
      <line x1={960} y1={160} x2={960} y2={860} stroke={palette.muted} strokeWidth={2} strokeDasharray="8 10" opacity={0.55}/>
    </svg>}
    {scene.type==='flow_diagram'&&motif==='default'&&<svg width={1920} height={1080} style={{position:'absolute'}}>
      <defs><marker id={`arrow-${scene.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d={style.arrow.head==='open'?'M 0 0 L 8 4 L 0 8':'M 0 0 L 8 4 L 0 8 z'} fill={style.arrow.head==='open'?'none':palette.accent} stroke={style.arrow.head==='open'?palette.accent:undefined} strokeWidth={style.arrow.head==='open'?1.5:undefined}/>
      </marker></defs>
      {(scene.edges??[]).map((edge,i)=>{
        const from=boxes.find(b=>b.id===edge.from)!,to=boxes.find(b=>b.id===edge.to)!;
        return <path key={`${edge.from}:${edge.to}`} d={flowPath(from,to,i,style.arrow.path)} fill="none" stroke={palette.accent} strokeWidth={style.arrow.width} opacity={Math.min(state(edge.from).opacity,state(edge.to).opacity)} markerEnd={`url(#arrow-${scene.id})`}/>;
      })}
    </svg>}
    {boxes.map((box,i)=>{
      const motion=state(box.id),element=scene.elements.find(e=>e.id===box.id)!,graphic=hasGraphicStyle(element);
      const accent=element.panel_style==='conclusion'?palette.accent:graphic&&element.icon==='warning'?palette.warning:graphic&&element.icon==='search'?palette.secondary:graphic?palette.source:scene.type==='comparison_panel'&&i%2?palette.secondary:palette.accent;
      const padding=graphic?style.card.graphicPadding:scene.type==='flow_diagram'?style.card.flowPadding:style.card.padding;
      const outline=style.card.outline||titleOutline;
      const sticky = paper && !titleOutline && motif === 'default';
      const background=outline?palette.background:element.panel_style==='conclusion'?palette.selected:palette.card;
      const borderWidth=titleOutline?Math.max(style.card.borderWidth,2):style.card.borderWidth;
      const stamp = paper && (element.source_label || element.panel_style === 'conclusion');
      return <div key={box.id} data-element={box.id} data-entrance={style.entrance.kind} data-silhouette={scene.type} data-sticky={sticky||undefined} style={{position:'absolute',left:box.x,top:box.y,width:box.width,height:box.height,boxSizing:'border-box',padding,borderRadius:sticky?4:titleOutline?Math.max(style.card.radius,12):style.card.radius,border:`${borderWidth}px solid ${outline?accent:accent+'55'}`,background,boxShadow:titleOutline?'none':sticky?'0 8px 0 rgba(0,0,0,0.08)':style.card.shadow,opacity:motion.opacity,transform:`translateY(${motion.translateY}px) rotate(${sticky?(i%2?-0.6:0.5):0}deg)`,clipPath:motion.clipPath,display:'flex',alignItems:'center',justifyContent:'center'}}>
        {sticky&&<div data-tape aria-hidden="true" style={{position:'absolute',top:-10,left:'42%',width:64,height:18,background:'#f0d56c',opacity:0.85,transform:'rotate(-2deg)'}}/>}
        {stamp&&<div data-stamp={element.source_label||'结论'} style={{position:'absolute',top:12,right:16,padding:'2px 10px',border:`2px solid ${palette.warning}`,color:palette.warning,fontSize:18,transform:'rotate(8deg)',background:palette.background}}>{element.source_label||'结论'}</div>}
        {scene.type==='concept'?<div data-concept-role={element.concept_role} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:style.typography.graphicGap,textAlign:'center',lineHeight:style.typography.lineHeight}}>
          <div style={{fontSize:22,color:palette.muted}}>{conceptLabels[element.concept_role!]}</div>
          <div style={{fontSize:box.fontSize,whiteSpace:'pre'}}>{box.lines.join('\n')}</div>
        </div>:graphic?<GraphicContent element={element} box={box}/>:<div style={{fontSize:box.fontSize,lineHeight:style.typography.lineHeight,textAlign:'center',whiteSpace:'pre'}}>{box.lines.join('\n')}</div>}
      </div>;
    })}
  </>;
}
