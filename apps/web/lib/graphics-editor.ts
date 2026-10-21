import type {DraftScene} from './editor';
import type {Scene} from '../../../packages/video-schema/src/types';
import {diagramErrors} from '../../../packages/video-schema/src/diagrams';
import {visualActionErrors,type DraftVisualAction} from '../../../packages/video-schema/src/visual-actions';
export const graphicKeys=['motif','funnel','dialogue','process','visual_actions'] as const;
export type Graphics=Pick<Scene,'motif'|'funnel'|'dialogue'|'process'>&{visual_actions?:DraftVisualAction[]};
export function graphicsText(scene:DraftScene):string{
 const g=Object.fromEntries(graphicKeys.filter(k=>scene[k]!==undefined).map(k=>[k,scene[k]]));
 if(g.visual_actions)g.visual_actions=(g.visual_actions as DraftVisualAction[]).map(a=>{const {start_frame,duration_frames,...rest}=a as DraftVisualAction&{start_frame?:number;duration_frames?:number};return rest;});
 return JSON.stringify(g);
}
export function readGraphics(text:string){
 const g=JSON.parse(text),ids=(v:unknown)=>Array.isArray(v)&&v.length<=6&&v.every(x=>typeof x==='string');
 if(!g||typeof g!=='object'||Array.isArray(g)||Object.keys(g).some(k=>!graphicKeys.includes(k as typeof graphicKeys[number])||g[k]===null))throw new Error('图形配置含未知字段。');
 if(g.funnel&&(!ids(g.funnel.layers)||!Array.isArray(g.funnel.notes)||g.funnel.notes.length>3||g.funnel.notes.some((n:{element_id?:string;target?:string;direction?:string})=>!n||typeof n.element_id!=='string'||n.target!==undefined&&typeof n.target!=='string'||n.direction!==undefined&&typeof n.direction!=='string')))throw new Error('漏斗分组格式错误。');
 if(g.dialogue&&(!ids(g.dialogue.messages)||typeof g.dialogue.state!=='string'||g.dialogue.context_messages!==undefined&&!ids(g.dialogue.context_messages))||g.process&&(!ids(g.process.stages)||!ids(g.process.details)))throw new Error('图形分组格式错误。');
 if(g.visual_actions&&(!Array.isArray(g.visual_actions)||g.visual_actions.length>12||g.visual_actions.some((a:DraftVisualAction)=>!a||typeof a.target!=='string'||!a.cue||!['highlight','connect','update'].includes(a.kind))))throw new Error('动作格式错误。');
 return g;
}
export function graphicsPatch(scene:DraftScene,text:string):Graphics{
 const g=readGraphics(text);
 if(g.visual_actions){
  if(!Array.isArray(g.visual_actions))throw new Error('动作须是列表。');
  g.visual_actions=g.visual_actions.map((a:DraftVisualAction)=>{
   if(!a||typeof a!=='object'||!a.cue||Object.keys(a).some(k=>!['kind','target','to','source','cue'].includes(k)))throw new Error('动作只能设置类型、现有步骤与原稿范围，不能设置帧数。');
   const cue={...a.cue};for(const k of ['text_start','text_end'] as const){const n=cue[k];if(typeof n==='string'&&/^\d+$/.test(n))cue[k]=Number(n);else if(!Number.isSafeInteger(n))throw new Error('动作触发范围须填写非负整数。');}
   return {...a,cue};
  });
 }
 const candidate={...scene};for(const k of graphicKeys)delete candidate[k];Object.assign(candidate,g);
 const errors=[...diagramErrors(candidate),...visualActionErrors(candidate,false)];
 if(g.motif!==undefined&&!['default','means_row','dialogue_split','funnel','schematic'].includes(g.motif))throw new Error('未知图形。');
 if(errors.length)throw new Error('图形或动作无效：'+errors.map(e=>`${e.path}: ${e.message}`).join('；'));
 return g;
}
