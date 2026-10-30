import React from 'react';
import {evaluateMotion} from './motion-plan';
import type {TeachingArtifact} from './teaching-artifact';
import type {SvgNode} from './motion-assembly';

export function TeachingScene({artifact,frame}:{artifact:TeachingArtifact;frame:number}){
 const compiled=artifact.compiled,t=artifact.binding.theme,prefix='scene-'+artifact.artifactSha256.slice(0,12),title=artifact.titleLayout;
 if(!Number.isInteger(frame)||frame<0||frame>=compiled.motion.durationInFrames)throw Error('teaching_scene: invalid frame');
 const poses=evaluateMotion(compiled.motion,frame),moving=new Set(compiled.transports.map(e=>e.objectId));
 const asset=(o:typeof compiled.objects[number])=>{
  let state=o.asset.state;
  for(const e of compiled.schedule.events)if(e.kind==='transition'&&e.objectId===o.id&&frame>=e.endFrame-1)state=e.toState!;
  return o.states.find(s=>s.state===state)!;
 };
 const draw=(n:SvgNode,key:string,owner:string,front=false):React.ReactNode=>React.createElement(n.tag,{...Object.fromEntries(Object.entries(n.attrs).map(([k,v])=>[k,(k==='fill'||k==='stroke')&&v!=='none'?t[v as keyof typeof t]:v])),key,...(front?{'data-occluder-owner':owner,'data-occluder-id':owner+'-'+key}:{})},n.text??n.children?.map((c,i)=>draw(c,key+'-'+i,owner,front)));
 const label=(o:typeof compiled.objects[number])=>{const a=asset(o),r=a.text;return <g data-label-owner={o.id} fontFamily='"Noto Sans SC", sans-serif' fontWeight={400} fontSize={r.size} fill={t.foreground} style={{letterSpacing:0}}>{r.lines.map((line,i)=><text key={i} xmlSpace="preserve" style={{whiteSpace:'pre'}} x={r.box.x} y={r.box.y+r.baselineOffset+i*r.lineHeight}>{line}</text>)}</g>;};
 const fixed=compiled.objects.filter(o=>!moving.has(o.id));
 const active=compiled.transports.flatMap((e,i)=>frame>=e.startFrame&&frame<e.endFrame?[{...e,routeId:prefix+'-route-'+i}]:[]);
 const routeFor=(id:string)=>active.find(e=>e.objectId===id)?.routeId;
 return <svg xmlns="http://www.w3.org/2000/svg" width={1920} height={1080} viewBox="0 0 1920 1080" data-teaching-scene={artifact.artifactSha256}>
  <rect width={1920} height={1080} fill={t.background}/>
  <g fontFamily='"Noto Sans SC", sans-serif' fontWeight={400} fontSize={title.size} fill={t.foreground} data-scene-title="true" style={{letterSpacing:0}}>{title.lines.map((line,i)=><text key={i} data-title-line={i} xmlSpace="preserve" style={{whiteSpace:'pre'}} x={title.box.x} y={title.box.y+title.baselineOffset+i*title.lineHeight}>{line}</text>)}</g>
  <defs>{fixed.filter(o=>o.asset.receiving).map(o=>{const r=o.asset.receiving!;return <clipPath key={o.id} id={prefix+'-window-'+o.id} clipPathUnits="userSpaceOnUse"><rect x={o.initial.x+r.x} y={o.initial.y+r.y} width={r.width} height={r.height}/></clipPath>;})}</defs>
  {fixed.map(o=>{const p=poses[o.id],a=asset(o);return <g key={o.id} data-layer-owner={o.id} transform={`translate(${p.x} ${p.y})`}>{a.back.map((n,i)=>draw(n,'back'+i,o.id))}</g>;})}
  {active.map(e=>{
   const actions=compiled.intent.objects.find(o=>o.id===e.objectId)!.actions;
   const move=[...actions].reverse().find(a=>a.kind==='move'&&frame>=a.startFrame&&frame<=a.endFrame);
   const p=poses[e.objectId],start=move&&move.kind==='move'?evaluateMotion(compiled.motion,move.startFrame)[e.objectId]:p;
   return <path key={e.routeId} id={e.routeId} data-route="true" d={`M ${start.x} ${start.y} L ${p.x} ${p.y}`} fill="none" stroke={t.muted} strokeWidth={2} strokeLinecap="round"/>;
  })}
  {compiled.objects.filter(o=>moving.has(o.id)).map(o=>{
   const p=poses[o.id],a=asset(o),res=compiled.residencies.find(r=>r.objectId===o.id&&frame>=r.startFrame&&frame<r.endFrame);
   return <g key={o.id} data-residence={res?.receiverId} clipPath={res?`url(#${prefix}-window-${res.receiverId})`:undefined}>
    <g data-teaching-object={o.id} data-component-state={a.state} data-follow-path={routeFor(o.id)} transform={`translate(${p.x} ${p.y})`}>
     {[...a.back,...a.front].map((n,i)=>draw(n,'cargo'+i,o.id))}{label(o)}
    </g>
   </g>;
  })}
  {fixed.map(o=>{const p=poses[o.id],a=asset(o);return <g key={o.id} data-teaching-object={o.id} data-component-state={a.state} transform={`translate(${p.x} ${p.y})`}>
   {a.front.map((n,i)=>draw(n,'front'+i,o.id,true))}
   {a.solids.map((b,i)=><rect key={'solid'+i} {...b} data-solid-owner={o.id} data-solid-id={o.id+'-'+i} fill="none" stroke="none"/>)}{label(o)}
  </g>;})}
  {compiled.schedule.events.filter(e=>['highlight','select'].includes(e.kind)&&frame>=e.startFrame&&frame<e.endFrame).map(e=>{
   const o=compiled.objects.find(o=>o.id===e.objectId)!,p=poses[o.id];return <rect key={e.id} x={p.x-5} y={p.y-5} width={o.asset.bounds.width+10} height={o.asset.bounds.height+10} fill="none" stroke={t.secondary} strokeWidth={2}/>;
  })}
 </svg>;
}
