import type {Scene} from '../../video-schema/src/types';
import {intentVisualBaseline} from './intent-visual-fixture';
export function annotatedFunnel():Scene{
 const s=intentVisualBaseline().scenes[0],text='在这个示例中，先过规则，再到小模型，最后到大模型。能力提高，成本提高，总结逐层升级。';
 const labels=['规则','小模型','大模型','能力提高','成本提高','逐层升级'];
 s.narration.text=text;
 s.elements=labels.map((content,i)=>{const start=Array.from(text.slice(0,text.indexOf(content))).length;return {id:`e${i}`,content,cue:{text_start:start,text_end:start+Array.from(content).length},...(i===5?{panel_style:'conclusion' as const,highlight:{text_start:0,text_end:4}}:{})};});
 Object.assign(s,{funnel:{layers:['e0','e1','e2'],notes:[{element_id:'e3',direction:'down'},{element_id:'e4',direction:'down'},{element_id:'e5',target:'e2'}]}});
 s.animations=s.elements.map(e=>({target:e.id,effect:'fade_slide',start_frame:6+Math.floor(e.cue.text_start/Array.from(text).length*330),duration_frames:12}));
 s.visual_actions=s.elements.slice(0,3).map(e=>({kind:'highlight',target:e.id,cue:{...e.cue},start_frame:s.animations.find(a=>a.target===e.id)!.start_frame,duration_frames:12}));
 const chars=Array.from(text);s.captions=[];for(let i=0;i<chars.length;i+=22)s.captions.push({text:chars.slice(i,i+22).join(''),start_frame:6+Math.floor(i/chars.length*360),end_frame:6+Math.floor(Math.min(chars.length,i+22)/chars.length*360)});
 return s;
}
