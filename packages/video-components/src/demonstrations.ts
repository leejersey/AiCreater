import type {Scene} from '../../video-schema/src/types';
import type {StyleTokens} from './theme';
import type {ElementBox} from './layout';
import {ProcessDemonstration,processTextBoxes} from './ProcessDemonstration';
import {DialogueDemonstration,dialogueTextBoxes} from './DialogueDemonstration';
import {FunnelDemonstration,funnelDemoTextBoxes} from './FunnelDemonstration';
const process={View:ProcessDemonstration,boxes:processTextBoxes},dialogue={View:DialogueDemonstration,boxes:dialogueTextBoxes},funnel={View:FunnelDemonstration,boxes:funnelDemoTextBoxes};
export function demonstrationFor(scene:Scene,style:StyleTokens){
 if(style.presentation!=='mechanism')return undefined;
 return scene.process?process:scene.dialogue?dialogue:scene.funnel?funnel:undefined;
}
export function demonstrationTextBoxes(scene:Scene,style:StyleTokens){
 const demo=demonstrationFor(scene,style);if(!demo)return undefined;
 const frames=new Set([0,scene.duration_frames-1,...scene.animations.map(a=>a.start_frame+a.duration_frames),...(scene.visual_actions??[]).map(a=>a.start_frame+a.duration_frames),...scene.captions.map(c=>c.start_frame)]);
 const boxes:ElementBox[]=[];
 for(const frame of frames)boxes.push(...demo.boxes(scene,Math.min(frame,scene.duration_frames-1)));
 return boxes;
}
