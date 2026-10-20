import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Scene} from '../src/types';
import {parseProject} from '../src/validate';
import {manualConceptElements} from '../../../apps/web/lib/editor';
const draft=JSON.parse(readFileSync('examples/lessons/general.json','utf8')) as {scenes:Scene[]};
test('general teaching examples preserve the complete manuscript, roles and explicit relationships',()=>{
 assert.deepEqual(draft.scenes.map(s=>s.type),['concept','flow_diagram','comparison_panel']);
 assert.equal(readFileSync('examples/lessons/general.txt','utf8').trim().split(/\n\s*\n/).join(''),draft.scenes.map(s=>s.narration.text).join(''));
 for(const scene of draft.scenes){
  const text=[...scene.narration.text];let offset=0;
  for(const e of scene.elements){assert.equal(e.cue.text_start,offset);assert.ok(e.cue.text_end<=text.length);offset=e.cue.text_end;}
  assert.equal(offset,text.length);
  const excerpts=scene.elements.map(e=>text.slice(e.cue.text_start,e.cue.text_end).join(''));
  assert.equal(excerpts.join(''),scene.narration.text);
  assert.ok(excerpts.every(e=>e.endsWith('。')),'sample segment boundaries must be sentences, not cut words');
  if(scene.type==='concept')assert.deepEqual(manualConceptElements(scene.narration.text,scene.elements).map(e=>({content:e.content,concept_role:e.concept_role,cue:e.cue})),scene.elements.map(e=>({content:e.content,concept_role:e.concept_role,cue:e.cue})));
  const duration=scene.elements.length*60+12;
  parseProject({schema_version:'1.0',theme:'light_teaching',video_config:{width:1920,height:1080,fps:30,language:'zh-CN'},assets:[{id:'a',type:'audio',storage_key:'test.wav',checksum:'0'.repeat(64),duration_ms:(duration-12)/30*1000}],scenes:[{...scene,duration_frames:duration,narration:{...scene.narration,audio_asset_id:'a',audio_start_frame:6},captions:excerpts.map((text,i)=>({text,start_frame:6+i*60,end_frame:6+(i+1)*60})),animations:scene.elements.map((e,i)=>({target:e.id,effect:'fade_slide',start_frame:6+i*60,duration_frames:12}))}]});
 }
});
