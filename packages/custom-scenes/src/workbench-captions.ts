import type {Cue} from './cues';
import {assemblyCaptionLines} from './assembly-captions';
export type WorkbenchCaption={text:string;start_frame:number;end_frame:number};
// Match Python str.isspace(), including its C0 separators but excluding BOM.
export const normalizeCaptionText=(text:string)=>text.replace(/[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/gu,'');

/** Design beats may group consecutive measured subtitles, never split or retime them. */
export function assertCaptionCueBinding(captions:WorkbenchCaption[],cues:Cue[],narration:string,duration:number):void{
 if(!Array.isArray(captions)||!captions.length||captions.length>1000)throw Error('workbench: invalid captions');
 let previousEnd=0;
 for(const caption of captions){
  if(!caption||typeof caption.text!=='string'||!normalizeCaptionText(caption.text)||caption.text.length>4000||!Number.isInteger(caption.start_frame)||!Number.isInteger(caption.end_frame)||caption.start_frame<previousEnd||caption.end_frame<=caption.start_frame||caption.end_frame>duration)throw Error('workbench: invalid measured caption');
  previousEnd=caption.end_frame;
 }
 if(captions.map(c=>normalizeCaptionText(c.text)).join('')!==normalizeCaptionText(narration))throw Error('workbench: caption narration mismatch');
 let index=0;
 for(const cue of cues){
  const target=normalizeCaptionText(cue.text);let covered='';
  if(!target||captions[index]?.start_frame!==cue.startFrame)throw Error('workbench: design cue start mismatch');
  while(index<captions.length&&covered.length<target.length){covered+=normalizeCaptionText(captions[index++].text);if(!target.startsWith(covered))throw Error('workbench: design cue text mismatch');}
  if(covered!==target||captions[index-1]?.end_frame!==cue.endFrame)throw Error('workbench: design cue boundary mismatch');
 }
 if(index!==captions.length)throw Error('workbench: uncovered measured captions');
}
export function workbenchCaptionLines(text:string):string[]{
 const explicit=text.split(/\r\n|[\r\n\u2028\u2029]/);
 if(explicit.length===1)return assemblyCaptionLines(text);
 if(explicit.length>2||explicit.some(line=>Array.from(line).length>48))throw Error('workbench: caption exceeds two-line safe area');
 if(explicit.some(line=>/^[，。！？：；、,.!?;:」』”’）》】]+$/u.test(line.trim())))return assemblyCaptionLines(explicit.join(''));
 return explicit;
}

/** Display-only unions preserve measured input and never bridge a pause. */
export function workbenchDisplayCaptions(captions:WorkbenchCaption[]):WorkbenchCaption[]{
 const result:WorkbenchCaption[]=[];
 for(const cue of captions){
  const previous=result.at(-1),tail=normalizeCaptionText(cue.text);
  const shortTail=/^[\p{Script=Han}，。！？：；、」』”’）》】]{1,2}$/u.test(tail);
  if(previous&&previous.end_frame===cue.start_frame&&cue.end_frame-cue.start_frame<=15&&shortTail&&!/[\r\n\u2028\u2029]/u.test(previous.text+cue.text)&&
   !/[。！？.!?][」』”’）》】]*$/u.test(previous.text.trim())&&Array.from(previous.text+cue.text).length<=96){
   previous.text+=cue.text;previous.end_frame=cue.end_frame;
  }else result.push({...cue});
 }
 return result;
}
