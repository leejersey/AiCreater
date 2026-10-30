import test from 'node:test';
import assert from 'node:assert/strict';
import {chapterPresentation,type VisualJob} from '../lib/visual-workbench';
import {visualRepairVideoAction,visualPreviewAction} from '../lib/visual-workbench-actions';
const source:VisualJob={id:'g',project_id:'p',scene_id:'s',kind:'generate',state:'succeeded',current:true,result:{sha256:'a'.repeat(64),source:'export {}'}};
const checked:VisualJob={...source,id:'v',kind:'preview',result:{sha256:'a'.repeat(64),geometry:{status:'failed'},frames:['stills/frame-0.png']}};
test('failed check selects programmatic repair rather than repeating source execution',()=>{
 assert.equal(chapterPresentation([checked,source]).repairTarget?.id,'v');
 const action=visualRepairVideoAction(checked);assert.equal(action.path,'/v/repair-video');assert.deepEqual(action.body,{confirmed:true,max_requests:1});
 assert.match(String(action.confirmation.message),/检查报告/);assert.match(String(action.confirmation.message),/1 次/);
 for(const patch of [{current:false},{state:'failed'},{result:{...checked.result,geometry:{status:'passed'}}}])assert.throws(()=>visualRepairVideoAction({...checked,...patch} as VisualJob));
});
test('automatic repair needs explicit paid authorization, default advanced check remains free',()=>{
 assert.equal(visualPreviewAction(source).body.auto_repair_requests,undefined);
 const action=visualPreviewAction(source,true);assert.equal(action.body.auto_repair_requests,1);
 assert.match(String(action.confirmation.message),/付费/);assert.match(String(action.confirmation.message),/新源码.*审批/);
});
test('a consumed repair allowance is not offered again after that repair fails',()=>{
 const repair:VisualJob={...source,id:'repair',kind:'repair',state:'failed',operation:'quality-repair',repair_preview_id:'v',result:{requests_dispatched:1}};
 const p=chapterPresentation([repair,checked,source]);assert.equal(p.repairTarget,undefined);assert.equal(p.pending,undefined);assert.equal(p.repairStopped,true);
});
