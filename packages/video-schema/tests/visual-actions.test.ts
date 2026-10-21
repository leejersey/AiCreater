import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {validateProject} from '../src/validate';
import {intentVisualBaseline} from '../../video-components/tests/intent-visual-fixture';

export function actionProject(){
 const p=intentVisualBaseline();p.scenes=p.scenes.slice(0,1);const s=p.scenes[0];
 s.visual_actions=[
  {kind:'connect',target:'e0',to:'e1',cue:{...s.elements[1].cue},start_frame:s.animations[1].start_frame+12,duration_frames:10},
  {kind:'highlight',target:'e1',cue:{...s.elements[1].cue},start_frame:s.animations[1].start_frame+12,duration_frames:10},
  {kind:'update',target:'e0',source:'e2',cue:{...s.elements[2].cue},start_frame:s.animations[2].start_frame+12,duration_frames:10},
 ];return p;
}
function pythonErrors(input:unknown){
 const r=spawnSync('.venv/bin/python',['packages/video-schema/validate.py','-'],{input:JSON.stringify(input),encoding:'utf8'});
 assert.ok(r.status===0||r.status===1,r.stderr);return JSON.parse(r.stdout).validation_errors as {code:string}[];
}
test('three bounded actions and legacy scenes validate in TS and Python',()=>{
 for(const p of [intentVisualBaseline(),actionProject()]){
  assert.deepEqual(validateProject(p),[]);assert.deepEqual(pythonErrors(p),[]);
 }
});
test('invalid action references, source cues, ordering and frame ranges are rejected in both validators',()=>{
 const cases:[string,(a:any[],s:any)=>void][]=[
  ['missing target',a=>a[0].target='absent'],['self line',a=>a[0].to='e0'],
  ['missing state source',a=>a[2].source='absent'],['unspoken update',a=>a[2].cue={...a[0].cue}],
  ['reverse source',a=>a.reverse()],['out of text',a=>a[0].cue.text_end=9999],
  ['frame before entrance',a=>a[0].start_frame=6],['past audio',a=>a[0].start_frame=360],
  ['wrong action shape',a=>a[1].source='e0'],['code not allowed',a=>a[0].script='alert(1)'],
  ['unknown kind',a=>a[0].kind='eval'],['too many actions',(a,s)=>s.visual_actions=Array.from({length:13},()=>a[1])],
  ['no early node references',a=>a[0].cue={text_start:0,text_end:1}],
 ];
 for(const [name,mutate] of cases){const p=actionProject(),s=p.scenes[0];mutate(s.visual_actions as any[],s);
  assert.ok(validateProject(p).length,name);assert.ok(pythonErrors(p).length,name);
 }
});
