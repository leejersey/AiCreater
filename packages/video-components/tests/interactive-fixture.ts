import {intentVisualBaseline} from './intent-visual-fixture';
import type {Scene} from '../../video-schema/src/types';

// Independently authored teaching examples; never real tool invocations.
export function interactiveExamples():Scene[]{
 const base=intentVisualBaseline().scenes[0];
 const make=(id:string,text:string,labels:string[]):Scene=>{
  const chars=Array.from(text),elements=labels.map((content,i)=>{const start=Array.from(text.slice(0,text.indexOf(content))).length;return {id:`e${i}`,content,cue:{text_start:start,text_end:start+Array.from(content).length}};});
  return {...base,id,narration:{...base.narration,text},elements,animations:elements.map(e=>({target:e.id,effect:'fade_slide',start_frame:6+Math.floor(e.cue.text_start/chars.length*330),duration_frames:12})),captions:Array.from({length:Math.ceil(chars.length/22)},(_,i)=>({text:chars.slice(i*22,i*22+22).join(''),start_frame:6+Math.floor(i*22/chars.length*360),end_frame:6+Math.floor(Math.min(chars.length,i*22+22)/chars.length*360)}))};
 };
 const dialogue=make('dialogue','初始意图是等待消息。用户选择订单A，再说取消订单，此时意图更新为取消订单。',['等待消息','订单A','取消订单']);
 Object.assign(dialogue,{motif:'dialogue_split',dialogue:{messages:['e1','e2'],state:'e0'}});
 dialogue.visual_actions=[{kind:'connect',target:'e1',to:'e0',cue:dialogue.elements[1].cue,start_frame:dialogue.animations[1].start_frame,duration_frames:12},{kind:'update',target:'e0',source:'e2',cue:dialogue.elements[2].cue,start_frame:dialogue.animations[2].start_frame,duration_frames:12}];
 const process=make('process','模型先提出调用，工具名和参数以取消订单A为例。程序校验参数与权限，校验失败就拒绝执行；只有通过后才执行工具，并等待真实结果。',['提出调用','校验参数与权限','执行工具','真实结果','取消订单A','校验失败就拒绝执行']);
 Object.assign(process,{type:'flow_diagram',motif:'default',process:{stages:['e0','e1','e2','e3'],details:['e4','e5']},edges:[{from:'e0',to:'e1'},{from:'e1',to:'e2'},{from:'e2',to:'e3'}]});
 process.visual_actions=process.elements.slice(0,4).flatMap((e,i)=>[...(i?[{kind:'connect' as const,target:`e${i-1}`,to:e.id,cue:e.cue,start_frame:process.animations[i].start_frame,duration_frames:12}]:[]),{kind:'highlight' as const,target:e.id,cue:e.cue,start_frame:process.animations[i].start_frame,duration_frames:12}]);
 return [dialogue,process];
}

export function failureBranch():Scene{
 const s=interactiveExamples()[1];
 for(const [index,content] of [[2,'校验失败就拒绝执行'],[3,'通过后才执行工具']] as const){
  const text=s.narration.text,start=Array.from(text.slice(0,text.indexOf(content))).length;
  s.elements[index]={...s.elements[index],content,cue:{text_start:start,text_end:start+Array.from(content).length},...(index===2?{icon:'warning' as const}:{})};
 }
 s.edges=[{from:'e0',to:'e1'},{from:'e1',to:'e2'},{from:'e1',to:'e3'}];
 s.visual_actions=[];
 s.animations=s.elements.map(e=>({target:e.id,effect:'fade_slide',start_frame:6+Math.floor(e.cue.text_start/Array.from(s.narration.text).length*330),duration_frames:12}));
 return s;
}
