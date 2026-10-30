import React from 'react';
import {evaluateMotion} from './motion-plan';
import type {compileTeachingMotion} from './teaching-motion';
import type {SvgNode} from './motion-assembly';
import {sceneTheme as theme} from './theme';

type Compiled=ReturnType<typeof compileTeachingMotion>;
/** Host-owned diagnostic drawing only; not a production render or visual acceptance. */
export function TeachingMotionDiagnostic({compiled,frame}:{compiled:Compiled;frame:number}){
 if(!Number.isInteger(frame)||frame<0||frame>=compiled.motion.durationInFrames)throw Error('teaching_diagnostic: invalid frame');
 const poses=evaluateMotion(compiled.motion,frame),moving=new Set(compiled.transports.map(t=>t.objectId));
 const stateAsset=(o:Compiled['objects'][number])=>{
  let state=o.asset.state;
  for(const e of compiled.schedule.events)if(e.kind==='transition'&&e.objectId===o.id&&frame>=e.endFrame-1)state=e.toState!;
  return o.states.find(a=>a.state===state)!;
 };
 const draw=(n:SvgNode,key:string):React.ReactNode=>React.createElement(n.tag,{...Object.fromEntries(Object.entries(n.attrs).map(([k,v])=>[k,(k==='fill'||k==='stroke')&&v!=='none'?theme[v as keyof typeof theme]:v])),key},n.text??n.children?.map((c,i)=>draw(c,key+'-'+i)));
 const labels=(o:Compiled['objects'][number])=>{
  const a=stateAsset(o),t=a.text;
  return <g data-label-owner={o.id} fill={theme.foreground} fontFamily='"Noto Sans SC", sans-serif' fontWeight={400} fontSize={t.size} style={{letterSpacing:0}}>
   {t.lines.map((line,i)=><text key={i} xmlSpace="preserve" style={{whiteSpace:'pre'}} x={t.box.x} y={t.box.y+t.baselineOffset+i*t.lineHeight}>{line}</text>)}
  </g>;
 };
 const fixed=compiled.objects.filter(o=>!moving.has(o.id));
 const layer=(part:'back'|'front',withLabels=false)=>fixed.map(o=>{
  const p=poses[o.id],a=stateAsset(o);
  return <g key={o.id} data-fixed-layer={part} data-layer-owner={o.id} transform={`translate(${p.x} ${p.y})`}>{a[part].map((n,i)=>draw(n,part+i))}{withLabels&&labels(o)}</g>;
 });
 return <svg xmlns="http://www.w3.org/2000/svg" width={1920} height={1080} viewBox="0 0 1920 1080" data-diagnostic="not-accepted">
  <rect width={1920} height={1080} fill={theme.background}/>
  <text x={80} y={80} fontFamily="sans-serif" fontSize={30} fill={theme.foreground}>{compiled.plan.structure+' / host motion diagnostic'}</text>
  <defs>{fixed.filter(o=>o.asset.receiving).map(o=>{const r=o.asset.receiving!;return <clipPath key={o.id} id={'motion-window-'+o.id} clipPathUnits="userSpaceOnUse"><rect x={o.initial.x+r.x} y={o.initial.y+r.y} width={r.width} height={r.height}/></clipPath>;})}</defs>
  {layer('back')}
  {compiled.objects.filter(o=>moving.has(o.id)).map(o=>{
   const p=poses[o.id],a=stateAsset(o),residency=compiled.residencies.find(r=>r.objectId===o.id&&frame>=r.startFrame&&frame<r.endFrame);
   return <g key={o.id} clipPath={residency?`url(#motion-window-${residency.receiverId})`:undefined} data-residence={residency?.receiverId}>
    <g data-object={o.id} data-presentation="payload" transform={`translate(${p.x} ${p.y})`}>{[...a.back,...a.front].map((n,i)=>draw(n,'cargo'+i))}{labels(o)}</g>
   </g>;
  })}
  {layer('front',true)}
  {compiled.schedule.events.filter(e=>['highlight','select'].includes(e.kind)&&frame>=e.startFrame&&frame<e.endFrame).map(e=>{
   const o=compiled.objects.find(o=>o.id===e.objectId)!,p=poses[o.id];return <rect key={e.id} x={p.x-5} y={p.y-5} width={o.asset.bounds.width+10} height={o.asset.bounds.height+10} fill="none" stroke={theme.secondary} strokeWidth={2}/>;
  })}
  <text x={80} y={1030} fontFamily="sans-serif" fontSize={18} fill={theme.secondary}>{'frame '+frame+' / no audio / visual acceptance pending'}</text>
 </svg>;
}
