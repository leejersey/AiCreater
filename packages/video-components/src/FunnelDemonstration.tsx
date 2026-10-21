import React from 'react';
import type {Scene,Element} from '../../video-schema/src/types';
import {wrapText,type ElementBox} from './layout';
import {actionProgressAtFrame,entranceAtFrame} from './motion';
import {usePalette} from './theme';
import {MarkedText} from './GraphicContent';

export function funnelFrame(scene:Scene,frame:number){
 if(!scene.funnel)throw new Error('funnel_demo_requires_funnel');
 const starts=new Map(scene.animations.map(a=>[a.target,a])),get=(id:string)=>scene.elements.find(e=>e.id===id)!;
 const layers=scene.funnel.layers.map((id,i)=>{const n=scene.funnel!.layers.length,top=680-i/n*440,bottom=680-(i+1)/n*440,y=300+i*480/n,h=480/n,a=starts.get(id)!;return {id,y,height:h,cy:y+h/2,top,bottom,right:560+(top+bottom)/4,visible:frame>=a.start_frame,opacity:entranceAtFrame(frame,a.start_frame,a.duration_frames).opacity,points:`${560-top/2},${y} ${560+top/2},${y} ${560+bottom/2},${y+h} ${560-bottom/2},${y+h}`};});
 const current=layers.reduce((last,l,i)=>l.visible?i:last,-1),text=scene.narration.text,chars=Array.from(text);
 let cursor=0;
 const captions=scene.captions.flatMap(c=>{const at=text.indexOf(c.text,cursor);if(at<0)return [];cursor=at+c.text.length;const clean=c.text.replace(/^[\s，。；：、]+|[\s，。；：、]+$/gu,'');if(!clean)return [];const start=Array.from(text.slice(0,at+c.text.indexOf(clean))).length;return [{...c,start,end:start+Array.from(clean).length,clean}];});
 const conditions=layers.slice(1).flatMap((l,i)=>{const lo=get(layers[i].id).cue.text_end,hi=get(l.id).cue.text_start;const parts=captions.filter(c=>c.start>=lo&&c.end<=hi&&c.start_frame<=frame);return parts.length?[{target:l.id,text:parts.map(c=>c.clean).join('，')}]:[];});
 const connections=(scene.visual_actions??[]).filter(a=>a.kind==='connect').flatMap(a=>{const from=layers.find(l=>l.id===a.target),to=layers.find(l=>l.id===a.to);if(!from||!to)return [];const progress=from.visible&&to.visible?actionProgressAtFrame(a,frame):0;return [{from:a.target,to:a.to!,progress,points:[[from.right+8,from.cy],[1000,from.cy],[1000,to.cy],[to.right+8,to.cy]]}];});
 const transfers=connections.filter(c=>c.progress>0&&c.progress<1).map(c=>{const lengths=c.points.slice(1).map((p,i)=>Math.hypot(p[0]-c.points[i][0],p[1]-c.points[i][1]));let d=c.progress*lengths.reduce((a,b)=>a+b,0),i=0;while(i<lengths.length-1&&d>lengths[i])d-=lengths[i++];const t=lengths[i]?d/lengths[i]:0;return {...c,x:c.points[i][0]+(c.points[i+1][0]-c.points[i][0])*t,y:c.points[i][1]+(c.points[i+1][1]-c.points[i][1])*t};});
 const notes=scene.funnel.notes.map(n=>{const a=starts.get(n.element_id)!;return {...n,visible:frame>=a.start_frame,opacity:entranceAtFrame(frame,a.start_frame,a.duration_frames).opacity};});
 return {layers,current,condition:conditions.at(-1),connections,transfers,notes,intro:chars.slice(0,Math.min(...scene.elements.map(e=>e.cue.text_start))).join('').trim()};
}
type Box=ElementBox&{kind:'layer'|'hero'|'condition'|'note'|'intro';element?:Element};
export function funnelDemoTextBoxes(scene:Scene,frame:number):Box[]{
 const s=funnelFrame(scene,frame),get=(id:string)=>scene.elements.find(e=>e.id===id)!;
 const box=(id:string,kind:Box['kind'],text:string,x:number,y:number,width:number,height:number,fontSize:number,columns:number,element?:Element):Box=>({id,kind,x,y,width,height,fontSize,lines:wrapText(text,columns),element});
 const boxes=s.layers.map(l=>box(l.id,'layer',get(l.id).content,560-(l.top+l.bottom)/4+20,l.y+20,(l.top+l.bottom)/2-40,l.height-40,28,Math.min(20,Math.floor(((l.top+l.bottom)/2-40)/28)),get(l.id)));
 if(s.current>=0){const e=get(s.layers[s.current].id);boxes.push(box(e.id,'hero',e.content,1110,350,650,150,44,14,e));}
 else boxes.push(box('__intro','intro',s.intro,220,310,1480,160,48,30));
 if(s.condition)boxes.push(box('__condition','condition',s.condition.text,1110,244,650,90,30,20));
 const noteLayouts=[[140,844,900,84,30,28],[1110,544,650,184,36,16],[1110,750,650,166,30,20]];
 for(const [i,n] of s.notes.entries()){
  const e=get(n.element_id),[x,y,width,height,size,columns]=noteLayouts[i];
  boxes.push(box(e.id,'note',e.content,x,y,width,height,size,columns,e));
 }
 return boxes;
}

// Prototype-only: positions show processing order, never traffic volume or execution results.
export function FunnelDemonstration({scene,frame}:{scene:Scene;frame:number}){
 const p=usePalette(),s=funnelFrame(scene,frame),boxes=funnelDemoTextBoxes(scene,frame);
 return <div data-funnel-demonstration style={{position:'absolute',inset:0,color:p.text,fontFamily:'"Noto Sans SC"'}}>
  <div style={{position:'absolute',left:140,top:158,fontSize:24,color:p.muted}}>分层演示 / 从原稿看进入下一层的条件</div>
  {s.condition&&<div style={{position:'absolute',left:1110,top:212,fontSize:20,color:p.muted}}>原稿衔接 · {s.current>=0&&s.layers[s.current].id===s.condition.target?'当前层':'下一层'}</div>}
  <svg width={1920} height={1080} style={{position:'absolute'}} aria-hidden="true">
   <defs><marker id={`funnel-demo-${scene.id}`} markerWidth={8} markerHeight={8} refX={7} refY={4} orient="auto"><path d="M0 0 L8 4 L0 8" stroke={p.accent} fill="none" strokeWidth={1.5}/></marker></defs>
   {s.layers.map((l,i)=><polygon key={l.id} points={l.points} fill={p.accent} fillOpacity={l.opacity*(i===s.current ? .16 : .025)} stroke={i===s.current?p.accent:p.muted} strokeWidth={i===s.current?3:1.5} strokeOpacity={l.visible?1:.2}/>) }
   {s.connections.map(c=><path key={`${c.from}:${c.to}`} d={c.points.map((p,i)=>`${i?'L':'M'}${p.join(' ')}`).join(' ')} pathLength={1} strokeDasharray={1} strokeDashoffset={1-c.progress} opacity={c.progress>0?1:0} stroke={p.accent} strokeWidth={3} fill="none" markerEnd={c.progress===1?`url(#funnel-demo-${scene.id})`:undefined}/>)}
   {s.transfers.map(c=><circle key={`${c.from}:${c.to}`} cx={c.x} cy={c.y} r={9} fill={p.accent} opacity={Math.min(1,c.progress*4,(1-c.progress)*4)}/>)}
  </svg>
  {boxes.map(b=>{const layer=s.layers.find(l=>l.id===b.id),note=s.notes.find(n=>n.element_id===b.id),opacity=b.kind==='layer'?layer!.opacity:b.kind==='hero'?s.layers[s.current].opacity:b.kind==='note'?note!.opacity:b.kind==='intro'?Math.min(1,Math.max(0,(frame-scene.narration.audio_start_frame)/12)):1;if(!opacity)return null;return <div key={`${b.kind}:${b.id}`} data-funnel-demo-text={b.kind} style={{position:'absolute',left:b.x,top:b.y,width:b.width,height:b.height,fontSize:b.fontSize,lineHeight:1.35,whiteSpace:'pre',opacity,color:b.kind==='condition'?p.muted:b.kind==='note'&&b.element?.icon==='warning'?p.warning:b.kind==='hero'?p.accent:p.text,textAlign:b.kind==='layer'?'center':'left',display:b.kind==='layer'?'flex':undefined,alignItems:'center',justifyContent:'center'}}>
   {b.element?<span><MarkedText element={b.element} lines={b.lines} color={p.accent}/></span>:b.lines.join('\n')}
  </div>;})}
 </div>;
}
