import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVisualJobs,canAcceptPreview,type VisualJob} from '../lib/visual-workbench';
import {visualGenerateAction,visualAlignDraftAction} from '../lib/visual-workbench-actions';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {VisualJobStatus,VisualGenerationModeSelect} from '../app/VisualWorkbench';
test('draft generation is explicitly estimated and paid but does not require voice',()=>{
 const a=visualGenerateAction('s',1,'source',true);
 assert.equal(a.body.timing_mode,'draft');assert.match(String(a.confirmation.message),/估时/);
 assert.throws(()=>visualGenerateAction('s',1,'host-components',true));
});
test('draft timing marker survives parsing and cannot be accepted',()=>{
 const j={id:'j',project_id:'p',scene_id:'s',kind:'preview',state:'succeeded',current:true,input_summary:{timing_mode:'draft'},result:{sha256:'a'.repeat(64),geometry:{status:'passed'},frames:['stills/frame-0.png'],video:'video.mp4',srt:'video.srt'}};
 const parsed=parseVisualJobs({jobs:[j]},'p')[0];assert.equal(parsed.timing_mode,'draft');assert.equal(canAcceptPreview(parsed),false);
 assert.throws(()=>parseVisualJobs({jobs:[{...j,input_summary:{timing_mode:'unknown'}}]},'p'));
});
test('alignment is free and binds an exact current draft hash without executing source',()=>{
 const j:VisualJob={id:'j',project_id:'p',scene_id:'s',kind:'generate',state:'succeeded',current:true,timing_mode:'draft',result:{sha256:'a'.repeat(64),source:'export {}'}};
 const a=visualAlignDraftAction(j);assert.equal(a.path,'/j/align');assert.deepEqual(a.body,{confirmed:true,sha256:'a'.repeat(64)});
 assert.match(String(a.confirmation.message),/不调用模型/);
 for(const patch of [{current:false},{timing_mode:undefined},{state:'failed'}])assert.throws(()=>visualAlignDraftAction({...j,...patch} as VisualJob));
});
test('draft status and source-only selector are explicit in rendered controls',()=>{
 const j:VisualJob={id:'j',project_id:'p',scene_id:'s',kind:'generate',state:'succeeded',timing_mode:'draft',result:{}};
 const status=renderToStaticMarkup(React.createElement(VisualJobStatus,{job:j}));assert.match(status,/估时草稿.*无声.*不可验收/);
 const controls=renderToStaticMarkup(React.createElement(VisualGenerationModeSelect,{value:'source',onChange:()=>{},disabled:false,sourceOnly:true}));
 assert.equal((controls.match(/disabled=""/g)??[]).length,3);
});
