import test from 'node:test';
import assert from 'node:assert/strict';
import {graphicsText,graphicsPatch} from '../lib/graphics-editor';
import {annotatedFunnel} from '../../../packages/video-components/tests/annotated-funnel-fixture';
import {writeDraft,readDraft} from '../lib/drafts';
test('graphics form removes derived timing, validates source bindings and never mutates scenes',()=>{
 const s=annotatedFunnel(),before=structuredClone(s),raw=graphicsText(s),g=graphicsPatch(s,raw);
 assert.deepEqual(g.funnel,s.funnel);assert.ok(g.visual_actions?.every(a=>!('start_frame'in a)));assert.deepEqual(s,before);
 const bad=JSON.parse(raw);bad.funnel.layers[0]='missing';assert.throws(()=>graphicsPatch(s,JSON.stringify(bad)));
 bad.funnel=s.funnel;bad.visual_actions[0].cue.text_start='';assert.throws(()=>graphicsPatch(s,JSON.stringify(bad)));
 assert.throws(()=>graphicsPatch(s,'{"execute":"tool"}'));assert.throws(()=>graphicsPatch(s,'{'));
 const changed=JSON.parse(raw);changed.visual_actions[0].cue.text_start=String(changed.visual_actions[0].cue.text_start);assert.deepEqual(graphicsPatch(s,JSON.stringify(changed)),g);
});
test('unfinished graphics and old drafts survive local persistence without silently discarding fields',()=>{
 const scope={kind:'scene' as const,projectId:'p',sceneId:'s'},data={text:'原稿',code:'',steps:'[]',edges:[],rawStates:{},graphics:'{unfinished'};
 let value:string|null=null;const storage={getItem:()=>value,setItem:(_k:string,v:string)=>{value=v;},removeItem:()=>{value=null;}};
 writeDraft(storage,scope,1,data,null);assert.equal(readDraft(value,scope)?.data.graphics,data.graphics);
 const {graphics:unfinished,...old}=data;assert.equal(unfinished,data.graphics);value=null;writeDraft(storage,scope,1,old,null);assert.equal(readDraft(value,scope)?.data.graphics,undefined);
});
