import React from 'react';
import type {Scene,Element} from '../../video-schema/src/types';
import {wrapText,type ElementBox} from './layout';
import {usePalette} from './theme';
import {GraphicIcon,MarkedText} from './GraphicContent';
import {actionProgressAtFrame} from './motion';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
export function processFrame(scene:Scene,frame:number){
 if(!scene.process)throw new Error('process_demo_requires_process');
 const starts=new Map(scene.animations.map(a=>[a.target,a]));
 const opacity=(id:string)=>{const a=starts.get(id)!;return ease((frame-a.start_frame)/a.duration_frames);};
 const stageIndex=scene.process.stages.reduce((current,id,i)=>frame>=starts.get(id)!.start_frame?i:current,-1);
 const summary=ease((frame-Math.max(...scene.animations.map(a=>a.start_frame))-18)/18),laneY=548-108*summary;
 const nodes=scene.process.stages.map((id,i)=>({id,x:290+i*1320/(scene.process!.stages.length-1),y:laneY,visible:frame>=starts.get(id)!.start_frame,opacity:opacity(id)}));
 const connections=(scene.edges??[]).map((edge,i)=>{
  const from=nodes.find(n=>n.id===edge.from)!,to=nodes.find(n=>n.id===edge.to)!;
  const action=scene.visual_actions?.find(a=>a.kind==='connect'&&a.target===edge.from&&a.to===edge.to);
  const progress=action?actionProgressAtFrame(action,frame):opacity(edge.to);
  const adjacent=Math.abs(nodes.indexOf(from)-nodes.indexOf(to))===1,sign=to.x>from.x?1:-1;
  const path=adjacent?`M${from.x+36*sign} ${laneY} H${to.x-42*sign}`:`M${from.x} ${laneY-36} C${from.x} ${laneY-140} ${to.x} ${laneY-140} ${to.x} ${laneY-36}`;
  return {...edge,fromNode:from,toNode:to,progress:from.visible&&to.visible?progress:0,index:i,adjacent,sign,path};
 });
 const transfers=connections.filter(e=>e.progress>0&&e.progress<1).map(e=>{const t=e.progress,u=1-t;return {...e,
  x:e.adjacent?e.fromNode.x+36*e.sign+(e.toNode.x-42*e.sign-e.fromNode.x-36*e.sign)*t:e.fromNode.x+(e.toNode.x-e.fromNode.x)*(3*t*t-2*t*t*t),
  y:e.adjacent?laneY:laneY-36-312*u*t};});
 return {stageIndex,summary,nodes,connections,transfers,opacity};
}
type DemoBox=ElementBox&{kind:'stage'|'hero'|'detail'|'intro';columns:number;element?:Element};
export function processTextBoxes(scene:Scene,frame:number):DemoBox[]{
 const state=processFrame(scene,frame),element=(id:string)=>scene.elements.find(e=>e.id===id)!;
 const make=(id:string,kind:DemoBox['kind'],content:string,x:number,y:number,width:number,height:number,fontSize:number,columns:number,source?:Element):DemoBox=>({id,kind,x,y,width,height,fontSize,columns,lines:wrapText(content,columns),element:source});
 const boxes=state.nodes.map(n=>make(n.id,'stage',element(n.id).content,n.x-170,n.y+72,340,116,28,10,element(n.id)));
 if(state.stageIndex>=0){const e=element(scene.process!.stages[state.stageIndex]);boxes.push(make(e.id,'hero',e.content,430,306-44*state.summary,1320,136,46,20,e));}
 else{const lead=Array.from(scene.narration.text).slice(0,Math.min(...scene.elements.map(e=>e.cue.text_start))).join('').trim();boxes.push(make('__lead','intro',lead,220,306,1480,160,48,30));}
 for(const [i,id] of scene.process!.details.entries()){const e=element(id);boxes.push(make(id,'detail',e.content,180,(i?802:745)-70*state.summary,1560,i?126:50,i?44:32,i?32:40,e));}
 return boxes;
}

// Prototype-only: all content/cues come from the Scene, no business execution or invented parameters.
export function ProcessDemonstration({scene,frame}:{scene:Scene;frame:number}){
 const p=usePalette(),state=processFrame(scene,frame),boxes=processTextBoxes(scene,frame);
 const hero=boxes.find(b=>b.kind==='hero'||b.kind==='intro')!;
 const lead=Array.from(scene.narration.text).slice(0,Math.min(...scene.elements.map(e=>e.cue.text_start))).join('').trim();
 const current=hero.element,heroOpacity=current?state.opacity(current.id):ease((frame-scene.narration.audio_start_frame)/12);
 const nodeStyle={fontFamily:'"Noto Sans SC"',fontWeight:400};
 return <div data-process-demonstration data-demo-mode={state.summary>0?'overview':state.stageIndex<0?'establish':'advance'} style={{position:'absolute',inset:0,color:p.text,...nodeStyle}}>
  <div style={{position:'absolute',left:140,top:158,fontSize:24,color:p.muted,letterSpacing:4}}>过程演示 <span style={{letterSpacing:0}}> / 从原稿看机制</span></div>
  {state.stageIndex>=0&&<div style={{position:'absolute',left:220,top:220,fontSize:28,color:p.muted}}>{lead}</div>}
  {current?.icon&&<div style={{position:'absolute',left:250,top:hero.y+20,color:p.accent,opacity:heroOpacity,transform:'scale(2.6)',transformOrigin:'top left'}}><GraphicIcon icon={current.icon}/></div>}
  <div data-demo-hero style={{position:'absolute',left:hero.x,top:hero.y,width:hero.width,height:hero.height,fontSize:hero.fontSize,lineHeight:1.35,whiteSpace:'pre',opacity:heroOpacity,transform:`translateY(${12*(1-heroOpacity)}px)`}}>{current?<MarkedText element={current} lines={hero.lines} color={p.accent}/>:hero.lines.join('\n')}</div>
  <svg width={1920} height={1080} style={{position:'absolute',inset:0}} aria-hidden="true">
   <defs><marker id={`demo-arrow-${scene.id}`} markerWidth={9} markerHeight={9} refX={8} refY={4} orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke={p.accent} strokeWidth={1.8}/></marker></defs>
   {state.connections.map(e=><path key={`${e.from}:${e.to}`} d={e.path} pathLength={1} strokeDasharray={1} strokeDashoffset={1-e.progress} opacity={e.progress>0?.8:0} fill="none" stroke={p.accent} strokeWidth={3} markerEnd={e.progress===1?`url(#demo-arrow-${scene.id})`:undefined}/>)}
   {state.nodes.map((n,i)=>{const active=i===state.stageIndex;return <g key={n.id}>
    {active&&<circle cx={n.x} cy={n.y} r={49} fill={p.selected} opacity={.8}/>}
    <circle cx={n.x} cy={n.y} r={34} fill={n.visible?p.card:p.background} stroke={active?p.accent:p.muted} strokeWidth={active?3:1.5} opacity={n.visible?1:.25}/>
    <text x={n.x} y={n.y+10} textAnchor="middle" fontSize={28} fill={active?p.accent:p.muted} opacity={n.visible?1:.35}>{i+1}</text>
   </g>;})}
   {state.transfers.map(e=><g key={`${e.from}:${e.to}`} data-demo-transfer={`${e.from}:${e.to}`} opacity={Math.min(1,e.progress*4,(1-e.progress)*4)} transform={`translate(${e.x} ${e.y})`}>
    <rect x={-20} y={-27} width={40} height={54} rx={5} fill={p.card} stroke={p.accent} strokeWidth={3}/><path d="M-11 -10 H11 M-11 0 H11 M-11 10 H4" stroke={p.accent} strokeWidth={2.5}/>
   </g>)}
  </svg>
  {boxes.filter(b=>b.kind==='stage').map((b,i)=>state.nodes[i].visible&&<div key={b.id} data-demo-stage={b.id} style={{position:'absolute',left:b.x,top:b.y,width:b.width,height:b.height,fontSize:b.fontSize,lineHeight:1.35,textAlign:'center',whiteSpace:'pre',opacity:state.opacity(b.id)*(i===state.stageIndex?1:.68),color:i===state.stageIndex?p.accent:p.text}}>{b.lines.join('\n')}</div>)}
  {boxes.filter(b=>b.kind==='detail').map(b=>frame>=scene.animations.find(a=>a.target===b.id)!.start_frame&&<div key={b.id} data-demo-detail={b.id} style={{position:'absolute',left:b.x,top:b.y,width:b.width,height:b.height,fontSize:b.fontSize,lineHeight:1.35,whiteSpace:'pre',opacity:state.opacity(b.id),color:b.element?.icon==='warning'?p.warning:b.fontSize>32?p.accent:p.muted}}>
   <span style={{position:'absolute',left:-40,top:4,width:4,height:36,background:b.element?.icon==='warning'?p.warning:p.accent}}/>
   <MarkedText element={b.element!} lines={b.lines} color={p.accent}/>
  </div>)}
 </div>;
}
