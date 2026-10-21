import type {Scene, VisualAction} from './types';

export type DraftVisualAction = Pick<VisualAction,'kind'|'target'|'to'|'source'|'cue'> & Partial<Pick<VisualAction,'start_frame'|'duration_frames'>>;
type ActionScene = Pick<Scene,'type'|'elements'> & {narration:{text:string};visual_actions?:DraftVisualAction[];animations?:Scene['animations'];duration_frames?:number;edges?:Scene['edges']};

// Shared by final validation and the view-only draft projection; no rendering or side effects.
export function visualActionErrors(scene:ActionScene,timed=true){
 const errors:{path:string;code:string;message:string}[]=[];
 const fail=(i:number,code:string,message:string)=>errors.push({path:`/visual_actions/${i}`,code,message});
 const actions=scene.visual_actions??[],chars=Array.from(scene.narration.text);
 if(!Array.isArray(actions)||actions.length>12)return [{path:'/visual_actions',code:'action_limit',message:'At most 12 visual actions'}];
 if(actions.length&&!['card_sequence','flow_diagram','comparison_panel'].includes(scene.type))return [{path:'/visual_actions',code:'action_scene',message:'Actions require a supported graphics scene'}];
 const elements=new Map(scene.elements.map(e=>[e.id,e])),starts=new Map((scene.animations??[]).map(a=>[a.target,a.start_frame]));
 let previousCue=-1,previousFrame=-1;
 const updates=new Set<string>();
 actions.forEach((a,i)=>{
  if(!a||!['connect','highlight','update'].includes(a.kind)||!a.cue||!Number.isSafeInteger(a.cue.text_start)||!Number.isSafeInteger(a.cue.text_end)){
   fail(i,'action_shape','Known kind and integer source cue required');return;
  }
  const {text_start:start,text_end:end}=a.cue,target=elements.get(a.target),to=a.to?elements.get(a.to):undefined,source=a.source?elements.get(a.source):undefined;
  if(!target||a.kind==='connect'&&(!to||a.to===a.target)||a.kind==='update'&&(!source||a.source===a.target))fail(i,'action_reference','Distinct existing element references required');
  if((a.kind==='connect')!==(a.to!==undefined)||(a.kind==='update')!==(a.source!==undefined))fail(i,'action_shape','Only connect has to; only update has source');
  if(start<0||start>=end||end>chars.length||!chars.slice(start,end).join('').trim())fail(i,'action_cue','Action requires nonblank original text');
  if(start<previousCue)fail(i,'action_order','Actions must follow source order');previousCue=start;
  for(const e of [target,...(a.kind==='connect'?[to]:[])])if(e&&e.role!=='topic'&&e.cue.text_start>start)fail(i,'action_early','Action precedes its visible target');
  if(a.kind==='update'&&source){
   if(Array.from(source.content).length>16||!chars.slice(start,end).join('').includes(source.content))fail(i,'action_state','Updated state must be a literal source excerpt of at most 16 code points');
   const key=`${a.target}:${start}`;if(updates.has(key))fail(i,'action_conflict','Two updates cannot write the same target at one source position');updates.add(key);
  }
  if(timed){
   const frame=a.start_frame!,duration=a.duration_frames!;
   if(!Number.isSafeInteger(frame)||!Number.isSafeInteger(duration)||frame<6||duration<1||duration>60||frame+duration>(scene.duration_frames??0)-6)fail(i,'action_frames','Action must fit the audio interval');
   if(frame<previousFrame)fail(i,'action_order','Action frames must follow source order');previousFrame=frame;
   for(const id of [a.target,...(a.kind==='connect'?[a.to!]:[])])if(starts.has(id)&&frame<starts.get(id)!)fail(i,'action_early','Action precedes target entrance');
  }
 });return errors;
}
