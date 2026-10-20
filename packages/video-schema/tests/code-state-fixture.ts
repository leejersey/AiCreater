import {readFileSync} from 'node:fs';
import {validProject} from './fixture';

export function codeStateProject(){
  const p=validProject(),s=JSON.parse(readFileSync(new URL('../../../examples/lessons/code-state.json',import.meta.url),'utf8')).scenes[0];
  return {...p,scenes:[{...s,narration:{...s.narration,audio_asset_id:'audio1',audio_start_frame:6},duration_frames:72,animations:s.elements.map((e:{id:string},i:number)=>({target:e.id,effect:'fade_slide',start_frame:6+i*9,duration_frames:4})),captions:[{text:'教学快照示例',start_frame:6,end_frame:66}]}]};
}
