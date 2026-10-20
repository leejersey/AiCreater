import {validProject,codeProject} from '../../video-schema/tests/fixture';
import {codeStateProject} from '../../video-schema/tests/code-state-fixture';
import {chartProject} from '../../video-schema/tests/chart-fixture';
import {conceptProject} from '../../video-schema/tests/concept-fixture';
import {parseProject} from '../../video-schema/src/validate';
import type {Scene} from '../../video-schema/src/types';

// Synthetic timing/data for visual tests, never a measured or spoken course.
export function dedicatedScenes():Scene[]{
  const p=validProject(),base=p.scenes[0];
  const states=['array','object','stack'].map(kind=>({...base,type:'state_diagram',structure:{kind,name:'教学结构'},elements:base.elements.map((e,i)=>({...e,items:Array.from({length:6},(_,j)=>({id:`i${j}`,key:String(j),value:'值'.repeat(16)})),active_item_ids:[`i${i}`]}))}));
  const timeline={...base,type:'execution_timeline',timeline:{duration_ms:200,lanes:[{id:'a',label:'任务甲'},{id:'b',label:'任务乙'}]},elements:base.elements.map((e,i)=>({...e,event:{lane_id:i?'b':'a',start_ms:0,end_ms:i?100:1,phase:i?'wait':'execute'}}))};
  const charts=['bar','line','proportion','matrix'].map(kind=>({...chartProject(kind).scenes[0],narration:base.narration,duration_frames:base.duration_frames,captions:base.captions}));
  return [codeProject().scenes[0],codeStateProject().scenes[0],...states,timeline,...charts].map((s,i)=>parseProject({...p,scenes:[{...s,id:`dedicated${i}`}]}).scenes[0]);
}
export function mixedProject(){
  const p=validProject(),base=p.scenes[0];
  const generic=['title_reveal','card_sequence','flow_diagram','comparison_panel'].map(type=>({...base,type,...(type==='title_reveal'?{elements:base.elements.slice(0,1),animations:base.animations.slice(0,1)}:{}),...(type==='flow_diagram'?{edges:[{from:'a',to:'b'}]}:{})}));
  return parseProject({...p,scenes:[...generic,conceptProject().scenes[0],...dedicatedScenes()].map((s,i)=>({...s,id:`mixed${i}`}))});
}
