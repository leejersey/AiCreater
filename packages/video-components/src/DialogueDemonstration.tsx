import React from 'react';
import type {Scene,Element} from '../../video-schema/src/types';
import {wrapText,type ElementBox} from './layout';
import {usePalette} from './theme';
import {MarkedText} from './GraphicContent';
import {actionProgressAtFrame,entranceAtFrame} from './motion';

export function dialogueFrame(scene:Scene,frame:number){
 if(!scene.dialogue)throw new Error('dialogue_demo_requires_dialogue');
 const starts=new Map(scene.animations.map(a=>[a.target,a])),elements=new Map(scene.elements.map(e=>[e.id,e]));
 const visible=(id:string)=>frame>=starts.get(id)!.start_frame;
 const opacity=(id:string)=>{const a=starts.get(id)!;return entranceAtFrame(frame,a.start_frame,a.duration_frames).opacity;};
 const stateId=scene.dialogue.state,stateVisible=visible(stateId),initial=elements.get(stateId)!;
 const updates=(scene.visual_actions??[]).filter(a=>a.kind==='update'&&a.target===stateId).sort((a,b)=>a.start_frame-b.start_frame);
 const applied=updates.filter(a=>a.start_frame<=frame&&stateVisible&&visible(a.source!));
 const latest=applied.at(-1),source=latest?elements.get(latest.source!)!:initial;
 const previous=latest?(applied.length>1?elements.get(applied.at(-2)!.source!)!.content:initial.content):undefined;
 const updateSources=new Set(updates.map(a=>a.source));
 const messages=scene.dialogue.messages.filter(id=>!updateSources.has(id)).map((id,i)=>({id,index:i,x:190,y:350+i*164,width:700,height:94})).filter(m=>visible(m.id));
 const connections=(scene.visual_actions??[]).filter(a=>a.kind==='connect').map(a=>{
  const from=messages.find(m=>m.id===a.target),to=messages.find(m=>m.id===a.to),progress=visible(a.target)&&visible(a.to!)?actionProgressAtFrame(a,frame):0;
  const point=(id:string,m:typeof from)=>id===stateId?{x:1110,y:530}:m?{x:m.x+m.width+24,y:m.y+40}:null;
  const p=point(a.target,from),q=point(a.to!,to);
  return {from:a.target,to:a.to!,progress:p&&q?progress:0,p,q};
 });
 const transfers=connections.filter(e=>e.progress>0&&e.progress<1).map(e=>{const t=e.progress,u=1-t,p=e.p!,q=e.q!,mid=(p.x+q.x)/2;return {...e,x:u*u*u*p.x+3*u*u*t*mid+3*u*t*t*mid+t*t*t*q.x,y:u*u*u*p.y+3*u*u*t*p.y+3*u*t*t*q.y+t*t*t*q.y};});
 const tailStart=Math.max(...scene.elements.map(e=>e.cue.text_end)),boundaryParts:string[]=[];
 let cursor=0;
 for(const c of scene.captions){
  const at=scene.narration.text.indexOf(c.text,cursor);if(at<0)continue;
  cursor=at+c.text.length;
  if(Array.from(scene.narration.text.slice(0,at)).length>=tailStart&&c.start_frame<=frame)boundaryParts.push(c.text);
 }
 const boundary=boundaryParts.join('');
 return {messages,stateVisible,stateId,value:source.content,element:source,previous,updateProgress:latest?actionProgressAtFrame(latest,frame):0,connections,transfers,boundary,opacity};
}
type DialogueBox=ElementBox&{columns:number;kind:'message'|'state'|'previous'|'boundary';element?:Element;index?:number};
export function dialogueTextBoxes(scene:Scene,frame:number):DialogueBox[]{
 const state=dialogueFrame(scene,frame),make=(id:string,kind:DialogueBox['kind'],content:string,x:number,y:number,width:number,height:number,fontSize:number,columns:number,element?:Element):DialogueBox=>({id,kind,x,y,width,height,fontSize,columns,lines:wrapText(content,columns),element});
 const boxes:DialogueBox[]=state.messages.map(m=>({...make(m.id,'message',scene.elements.find(e=>e.id===m.id)!.content,m.x,m.y,m.width,m.height,34,20),index:m.index}));
 if(state.stateVisible)boxes.push(make(state.stateId,'state',state.value,1160,480,580,164,44,12,state.element));
 if(state.previous!==undefined)boxes.push(make('__previous','previous',state.previous,1160,350,580,90,30,16));
 if(state.boundary)boxes.push(make('__boundary','boundary',state.boundary,190,836,1550,82,30,48));
 return boxes;
}

// Prototype-only: source excerpts and explicit actions, never inferred business outcomes.
export function DialogueDemonstration({scene,frame}:{scene:Scene;frame:number}){
 const p=usePalette(),state=dialogueFrame(scene,frame),boxes=dialogueTextBoxes(scene,frame);
 return <div data-dialogue-demonstration style={{position:'absolute',inset:0,color:p.text,fontFamily:'"Noto Sans SC"'}}>
  <div style={{position:'absolute',left:140,top:158,fontSize:24,color:p.muted,letterSpacing:4}}>上下文演示 <span style={{letterSpacing:0}}> / 从原稿看关联</span></div>
  <svg width={1920} height={1080} style={{position:'absolute',inset:0}} aria-hidden="true">
   <defs><marker id={`dialogue-demo-arrow-${scene.id}`} markerWidth={9} markerHeight={9} refX={8} refY={4} orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke={p.accent} strokeWidth={1.8}/></marker></defs>
   {state.connections.map((c,i)=>c.p&&c.q&&<path key={i} d={`M${c.p.x} ${c.p.y} C${(c.p.x+c.q.x)/2} ${c.p.y} ${(c.p.x+c.q.x)/2} ${c.q.y} ${c.q.x} ${c.q.y}`} fill="none" stroke={p.accent} strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1-c.progress} opacity={c.progress>0?.7:0} markerEnd={c.progress===1?`url(#dialogue-demo-arrow-${scene.id})`:undefined}/>)}
   {state.transfers.map((t,i)=><circle key={i} data-dialogue-transfer cx={t.x} cy={t.y} r={8} fill={p.accent} opacity={Math.min(1,t.progress*4,(1-t.progress)*4)}/>)}
  </svg>
  {boxes.map(b=>{
   const isState=b.kind==='state',message=b.kind==='message',opacity=message?state.opacity(b.id):isState?(state.previous===undefined?state.opacity(state.stateId):state.updateProgress):1;
   return <React.Fragment key={`${b.kind}:${b.id}`}>
    {message&&<><div style={{position:'absolute',left:b.x-24,top:b.y-42,width:b.width+48,height:142,borderRadius:18,background:p.card,border:`1.5px solid ${p.muted}`,opacity:state.opacity(b.id)}}/><div style={{position:'absolute',left:b.x,top:b.y-30,fontSize:20,color:p.muted,opacity:state.opacity(b.id)}}>{scene.dialogue!.context_messages===undefined?(b.index===0?'前文片段':'当前片段'):scene.dialogue!.context_messages.includes(b.id)?'前文片段':'当前片段'} · 原稿</div></>}
    {isState&&<><div style={{position:'absolute',left:1120,top:270,width:640,height:460,borderLeft:`3px solid ${p.accent}`,background:p.selected,opacity:state.opacity(state.stateId)*.45}}/><div style={{position:'absolute',left:1160,top:290,fontSize:24,color:p.muted,opacity:state.opacity(state.stateId)}}>关联判断 · 讲稿示意</div><div style={{position:'absolute',left:1160,top:446,fontSize:22,color:p.muted,opacity:state.opacity(state.stateId)}}>{state.previous===undefined?'尚待上下文':'关联后'}</div></>}
    {b.kind==='previous'&&<div style={{position:'absolute',left:b.x,top:b.y-28,fontSize:20,color:p.muted}}>关联前</div>}
    {b.kind==='boundary'&&<div style={{position:'absolute',left:b.x,top:b.y-30,fontSize:20,color:p.warning}}>原稿边界</div>}
    <div data-dialogue-demo-text={b.kind} style={{position:'absolute',left:b.x,top:b.y,width:b.width,height:b.height,fontSize:b.fontSize,lineHeight:1.35,whiteSpace:'pre',opacity:b.kind==='previous'?.65:opacity,color:isState?p.accent:b.kind==='boundary'?p.warning:p.text,transform:message?`translateY(${10*(1-state.opacity(b.id))}px)`:undefined}}>{b.element?<MarkedText element={b.element} lines={b.lines} color={p.accent}/>:b.lines.join('\n')}</div>
   </React.Fragment>;
  })}
 </div>;
}
