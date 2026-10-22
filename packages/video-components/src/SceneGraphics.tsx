import React from 'react';
import {Img} from 'remotion';
import type {Scene} from '../../video-schema/src/types';
import {layoutElements, flowPath, hasGraphicStyle} from './layout';
import {usePalette, useVisualStyle, isPaperSlide} from './theme';
import {entranceAtFrame,actionProgressAtFrame,visualSceneAtFrame,latestBeat,beatCamera,cameraTransform} from './motion';
import {GraphicContent} from './GraphicContent';
import {MotifDecor, motifLayout} from './motifs';
import {conceptLabels} from '../../video-schema/src/concept';
import {FunnelDiagram,isSemanticFunnel} from './FunnelDiagram';
import {TeachingDiagram} from './TeachingDiagrams';
import {demonstrationFor} from './demonstrations';
import {VectorPrimitives} from './VectorPrimitives';

// Shared by the actual video and static visual regression tests.
export function SceneGraphics({scene:original,frame,imageSources={}}:{scene:Scene;frame:number;imageSources?:Record<string,string>}){
  if(original.images?.some(b=>!imageSources[b.asset_id]))throw new Error('image_source: missing private image URL');
  const scene=visualSceneAtFrame(original,frame);
  const actions=scene.visual_actions??[],connections=actions.filter(a=>a.kind==='connect');
  const focus=actions.filter(a=>a.kind==='highlight'&&a.start_frame<=frame).at(-1);
  const focusProgress=focus?actionProgressAtFrame(focus,frame):0;
  const entered=scene.animations.filter(a=>a.start_frame<=frame).sort((a,b)=>a.start_frame-b.start_frame);
  const beat=latestBeat(scene.animations,frame);
  const beatId=focus?.target??beat?.target;
  const palette=usePalette(),style=useVisualStyle(),paper=isPaperSlide(style);
  if(scene.vector)return <VectorPrimitives scene={original} frame={frame}/>;
  const demo=scene.images?undefined:demonstrationFor(original,style);
  if(demo){const View=demo.View;return <View scene={original} frame={frame}/>;}
  if(scene.dialogue||scene.process)return <TeachingDiagram scene={original} frame={frame}/>;
  const motif = typeof scene.motif === 'string' ? scene.motif : 'default';
  const boxes = motifLayout(scene, style.layout) ?? layoutElements(scene, style.layout);
  const animations=new Map(scene.animations.map(a=>[a.target,a]));
  const state=(id:string)=>{const a=animations.get(id)!;return entranceAtFrame(frame,a.start_frame,a.duration_frames,style.entrance,a.effect);};
  if(isSemanticFunnel(scene))return <FunnelDiagram scene={original} frame={frame}/>;
  const titleOutline=scene.type==='title_reveal';
  const currentBox=boxes.find(b=>b.id===beatId);
  const previousBox=boxes.find(b=>b.id===entered.filter(a=>a.target!==beatId).at(-1)?.target);
  const since=beat?frame-(focus?.start_frame??beat.start_frame):0;
  const camera=beatCamera(currentBox,previousBox,since);
  return <div data-beat-camera={beatId||undefined} data-beat-focus={beatId} style={{position:'absolute',inset:0,...cameraTransform(camera)}}>
    <MotifDecor scene={scene} boxes={boxes} frame={frame}/>
    {scene.type==='comparison_panel'&&motif==='default'&&boxes.length>=2&&<svg width={1920} height={1080} style={{position:'absolute'}} aria-hidden="true">
      <line x1={960} y1={160} x2={960} y2={860} stroke={palette.muted} strokeWidth={2} strokeDasharray="8 10" opacity={0.55}/>
    </svg>}
    {scene.type==='flow_diagram'&&motif==='default'&&<svg width={1920} height={1080} style={{position:'absolute'}}>
      <defs><marker id={`arrow-${scene.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d={style.arrow.head==='open'?'M 0 0 L 8 4 L 0 8':'M 0 0 L 8 4 L 0 8 z'} fill={style.arrow.head==='open'?'none':palette.accent} stroke={style.arrow.head==='open'?palette.accent:undefined} strokeWidth={style.arrow.head==='open'?1.5:undefined}/>
      </marker></defs>
      {(scene.edges??[]).filter(e=>!connections.some(a=>a.target===e.from&&a.to===e.to)).map((edge,i)=>{
        const from=boxes.find(b=>b.id===edge.from)!,to=boxes.find(b=>b.id===edge.to)!;
        return <path key={`${edge.from}:${edge.to}`} d={flowPath(from,to,i,style.arrow.path)} fill="none" stroke={palette.accent} strokeWidth={style.arrow.width} opacity={Math.min(state(edge.from).opacity,state(edge.to).opacity)} markerEnd={`url(#arrow-${scene.id})`}/>;
      })}
    </svg>}
    {connections.length>0&&<svg width={1920} height={1080} style={{position:'absolute'}} aria-hidden="true">
      <defs><marker id={`action-arrow-${scene.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke={palette.accent} strokeWidth={1.5}/></marker></defs>
      {connections.map((action,i)=>{
        const from=boxes.find(b=>b.id===action.target)!,to=boxes.find(b=>b.id===action.to)!;
        const progress=actionProgressAtFrame(action,frame);
        const horizontal=Math.abs(to.x-from.x)>Math.abs(to.y-from.y);
        const right=to.x>from.x,x1=from.x+(right?from.width:0),x2=to.x+(right?0:to.width),mid=(x1+x2)/2;
        const path=horizontal?`M${x1} ${from.y+from.height/2} H${mid} V${to.y+to.height/2} H${x2}`:flowPath(from,to,i,style.arrow.path);
        return <path key={i} data-visual-connection={`${action.target}:${action.to}`} d={path} fill="none" stroke={palette.accent} strokeWidth={style.arrow.width} pathLength={1} strokeDasharray={1} strokeDashoffset={1-progress} opacity={progress>0?Math.min(state(action.target).opacity,state(action.to!).opacity):0} markerEnd={progress===1?`url(#action-arrow-${scene.id})`:undefined}/>;
      })}
    </svg>}
    {boxes.map((box,i)=>{
      const animation=animations.get(box.id)!,motion=state(box.id),element=scene.elements.find(e=>e.id===box.id)!,graphic=hasGraphicStyle(element);
      const image=scene.images?.find(b=>b.element_id===box.id);
      const accent=element.panel_style==='conclusion'?palette.accent:graphic&&element.icon==='warning'?palette.warning:graphic&&element.icon==='search'?palette.secondary:graphic?palette.source:scene.type==='comparison_panel'&&i%2?palette.secondary:palette.accent;
      const padding=scene.images?16:graphic?style.card.graphicPadding:scene.type==='flow_diagram'?style.card.flowPadding:style.card.padding;
      const outline=style.card.outline||titleOutline;
      const sticky = paper && !titleOutline && motif === 'default';
      const background=sticky?'#fff4cc':outline?palette.background:element.panel_style==='conclusion'?palette.selected:palette.card;
      const reveal=animation.effect==='draw'?`inset(0 ${(1-(motion.draw??0))*100}% 0 0)`:motion.clipPath;
      const serif=paper&&(titleOutline||element.role==='topic');
      const past=!focus&&!!beat&&box.id!==beat.target&&(animations.get(box.id)?.start_frame??Infinity)<=frame;
      const scale=(motion.scale??1)*(past?0.86:1),shiftX=motion.shiftX??0;
      const motionTransform=scale===1&&shiftX===0?`translateY(${motion.translateY}px)`:`translate(${shiftX}px, ${motion.translateY}px) scale(${scale})`;
      const borderWidth=titleOutline?Math.max(style.card.borderWidth,2):style.card.borderWidth;
      const stamp = paper && (element.source_label || element.panel_style === 'conclusion');
      return <div key={box.id} data-element={box.id} data-effect={animation.effect} data-teaching-image={image?.element_id} data-beat-past={past?box.id:undefined} data-action-highlight={focus?.target===box.id?box.id:undefined} data-entrance={style.entrance.kind} data-silhouette={scene.type} data-sticky={sticky||undefined} style={{position:'absolute',left:box.x,top:box.y,width:box.width,height:box.height,boxSizing:'border-box',padding,borderRadius:sticky?4:titleOutline?Math.max(style.card.radius,12):style.card.radius,border:`${borderWidth}px solid ${outline?accent:accent+'55'}`,background,outline:focus?.target===box.id?`3px solid ${palette.accent}`:undefined,outlineOffset:focus?.target===box.id?6:undefined,boxShadow:titleOutline?'none':sticky?'0 8px 0 rgba(0,0,0,0.08)':style.card.shadow,opacity:motion.opacity*(focus&&focus.target!==box.id?1-0.6*focusProgress:past?0.35:1),transform:`${motionTransform} rotate(${sticky?(i%2?-0.6:0.5):0}deg)`,clipPath:reveal,display:'flex',flexDirection:image?'column':undefined,gap:image?12:undefined,alignItems:image?'stretch':'center',justifyContent:image?'flex-start':'center',fontFamily:serif?'"Noto Serif SC", "Noto Sans SC"':undefined,fontWeight:serif?600:undefined}}>
        {animation.effect==='box'&&<div data-box-reveal={box.id} aria-hidden="true" style={{position:'absolute',inset:10,border:`3px solid ${accent}`,clipPath:`inset(0 ${(1-(motion.box ?? 0))*100}% 0 0)`,pointerEvents:'none'}}/>}
        {sticky&&<div data-tape aria-hidden="true" style={{position:'absolute',top:-10,left:'42%',width:64,height:18,background:'#f0d56c',opacity:0.85,transform:'rotate(-2deg)'}}/>}
        {stamp&&<div data-stamp={element.source_label||'结论'} style={{position:'absolute',top:12,right:16,padding:'2px 10px',border:`2px solid ${palette.warning}`,color:palette.warning,fontSize:18,transform:'rotate(8deg)',background:palette.background}}>{element.source_label||'结论'}</div>}
        {image&&<Img src={imageSources[image.asset_id]} alt={image.alt} style={{width:'100%',flex:'1 1 auto',minHeight:0,objectFit:'contain'}}/>}
        {scene.type==='concept'?<div data-concept-role={element.concept_role} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:style.typography.graphicGap,textAlign:'center',lineHeight:style.typography.lineHeight}}>
          <div style={{fontSize:22,color:palette.muted}}>{conceptLabels[element.concept_role!]}</div>
          <div style={{fontSize:box.fontSize,whiteSpace:'pre'}}>{box.lines.join('\n')}</div>
        </div>:graphic?<GraphicContent element={element} box={box}/>:<div style={{fontSize:box.fontSize,lineHeight:style.typography.lineHeight,textAlign:'center',whiteSpace:'pre'}}>{box.lines.join('\n')}</div>}
      </div>;
    })}
  </div>;
}
