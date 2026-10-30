import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDesign,designHash,buildDesignPrompt,buildScenePrompt} from '../src/design';

const raw=()=>({schemaVersion:'visual-design:1',brief:{schemaVersion:'custom-scene-brief:1',id:'states',title:'状态',narration:'空。满。',visualGoal:'解释变化',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60},cues:[{id:'a',text:'空。',startFrame:0,endFrame:30},{id:'b',text:'满。',startFrame:30,endFrame:60}],thesis:'同一物体改变状态',metaphor:'套筒',objects:[{id:'sleeve',meaning:'提示',appearance:'有开口的套筒',x:400,y:300,width:300,height:200,kind:'solid',states:[{id:'empty',appearance:'空套筒'},{id:'filled',appearance:'装有问题与片段的同一套筒'}]}],beats:[{cueId:'a',focus:'sleeve',action:'装入',changes:[{objectId:'sleeve',from:'空',to:'装满',fromState:'empty',toState:'filled'}]},{cueId:'b',focus:'sleeve',action:'搬运',changes:[{objectId:'sleeve',from:'装满',to:'搬运到终点',fromState:'filled',toState:'filled'}]}],composition:'留出标签区域',palette:'blueprint',avoid:['重复实体'],acceptance:['保持身份']});

test('declared states and transitions round-trip and bind the design hash',()=>{
 const d=parseDesign(raw());assert.equal(d.objects[0].states?.[1].id,'filled');
 assert.equal(d.beats[0].changes[0].toState,'filled');
 assert.equal(designHash(d),designHash(parseDesign(JSON.parse(JSON.stringify(d)))));
 const changed=raw();changed.objects[0].states[1].appearance='同一套筒已封口';
 assert.notEqual(designHash(d),designHash(parseDesign(changed)));
});
test('unknown, partial and undeclared state references are rejected',()=>{
 const unknown=raw();unknown.beats[0].changes[0].toState='missing';
 assert.throws(()=>parseDesign(unknown),/state/);
 const partial:any=raw();delete partial.beats[0].changes[0].fromState;
 assert.throws(()=>parseDesign(partial),/state/);
 const missing:any=raw();delete missing.objects[0].states;
 assert.throws(()=>parseDesign(missing),/state/);
 const omitted:any=raw();delete omitted.beats[0].changes[0].fromState;delete omitted.beats[0].changes[0].toState;
 assert.throws(()=>parseDesign(omitted),/state/);
});
test('state lists are bounded and unique, and transitions cannot reset across beats',()=>{
 const duplicate=raw();duplicate.objects[0].states[1].id='empty';
 assert.throws(()=>parseDesign(duplicate),/duplicate/);
 const many=raw();many.objects[0].states=Array.from({length:9},(_,i)=>({id:`state-${i}`,appearance:'形态'}));
 assert.throws(()=>parseDesign(many),/states.*1\.\.8/);
 const reset=raw();reset.beats[1].changes[0].fromState='empty';
 assert.throws(()=>parseDesign(reset),/state.*continuity/);
});
test('legacy text-only changes remain readable without synthesizing state fields',()=>{
 const old:any=raw();delete old.objects[0].states;
 for(const b of old.beats)for(const c of b.changes){delete c.fromState;delete c.toState;}
 const d=parseDesign(old);assert.equal(Object.hasOwn(d.objects[0],'states'),false);
 assert.equal(Object.hasOwn(d.beats[0].changes[0],'fromState'),false);
 assert.equal(designHash(d),designHash(old));
});
test('design and code prompts specify structured states, continuity, and independent labels',()=>{
 const d=parseDesign(raw());
 for(const prompt of [buildDesignPrompt(d.brief,d.cues),buildScenePrompt(d)]){
  assert.match(prompt,/fromState/);assert.match(prompt,/toState/);assert.match(prompt,/kind="label"/);
 }
});
