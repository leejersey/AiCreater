import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estimateDuration, reviewKey, formSteps, updateStep} from '../../../apps/web/lib/editor';
import type {Project, SceneRow} from '../../../apps/web/lib/editor';
const row = (text='甲乙'): SceneRow => ({id:'scene-1',revision:1,state:'needs_voice',scene:{id:'s',type:'card_sequence',narration:{text},elements:[{id:'e',content:'内容',cue:{text_start:0,text_end:1}}]}});
const project = (scenes:SceneRow[],source_text='甲乙'): Project => ({id:'p',title:'课程',revision:1,source_text,config:{} as Project['config'],scenes});
test('duration uses Unicode codepoints and ignores whitespace',()=>{
 const d=estimateDuration(project([],'甲 😀\n'));
 assert.equal(d.min,2*60/300);assert.equal(d.max,2*60/200);assert.equal(d.exact,false);
});
test('ready duration uses frames, not illustrative milliseconds',()=>{
 const r=row();r.state='ready';r.scene.duration_frames=60;r.scene.timeline={duration_ms:3600000,lanes:[{id:'a',label:'任务'}]};
 assert.deepEqual(estimateDuration(project([r])),{min:2,max:2,exact:true});
});
test('mixed duration adds actual plus estimated voice and padding',()=>{
 const r=row();r.state='ready';r.scene.duration_frames=60;
 assert.deepEqual(estimateDuration(project([r,row('甲乙丙丁戊')])),{min:3.4,max:3.9,exact:false});
});
test('review identity changes with revision or scene, not object instance',()=>{
 const r=row();assert.equal(reviewKey(r),reviewKey({...r}));assert.notEqual(reviewKey(r),reviewKey({...r,revision:2}));assert.notEqual(reviewKey(r),reviewKey({...r,id:'other'}));
});
test('form edits preserve cue, identity and specialized data',()=>{
 const e={...row().scene.elements[0],items:[{id:'i',key:'0',value:'2'}],active_item_ids:['i'],event:{lane_id:'a',start_ms:0,end_ms:1,phase:'wait'}};
 const original=JSON.stringify([e]);const updated=formSteps(updateStep(original,0,{content:'新文字'}))[0];
 assert.deepEqual(updated,{...e,content:'新文字'});assert.equal(JSON.parse(original)[0].content,'内容');
});
test('invalid JSON and unsafe form shapes are rejected, not rewritten',()=>{
 for(const text of ['bad','[null]','[1]',JSON.stringify([{...row().scene.elements[0],variables:[null]}]),JSON.stringify([{...row().scene.elements[0],code_lines:['1']}])])assert.throws(()=>formSteps(text));
});
test('form operations reject invalid indices, line selection and excess variables',()=>{
 const text=JSON.stringify(row().scene.elements);
 assert.throws(()=>updateStep(text,4,{content:'x'}));
 for(const lines of [[0],[17],[1,1],[1.5]])assert.throws(()=>updateStep(text,0,{code_lines:lines}));
 assert.throws(()=>updateStep(text,0,{variables:Array.from({length:4},()=>({name:'n',value:'1'}))}));
 assert.throws(()=>updateStep(text,0,{id:'changed'} as never));
});
