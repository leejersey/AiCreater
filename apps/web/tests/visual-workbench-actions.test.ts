import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmVisualAction,visualGenerateAction,visualRepairAction,visualPreviewAction,visualTransferAction,visualTransferPreviewAction,visualAutomaticTransferAction} from '../lib/visual-workbench-actions';
import type {VisualJob} from '../lib/visual-workbench';
import * as actions from '../lib/visual-workbench-actions';

test('free layout proposal cancels without submission and uses only the confirmed endpoint',async()=>{
 const parent:VisualJob={id:'failed',project_id:'p',scene_id:'s',kind:'generate',state:'failed',generation_mode:'source',result:{requests_dispatched:1}};
 const action=actions.visualProposeLayoutAction(parent),sent:unknown[]=[];
 assert.match(String(action.confirmation.message),/不调用模型/);assert.match(String(action.confirmation.message),/仅标签纵向/);
 await confirmVisualAction(action,async()=>false,async(...args)=>{sent.push(args);});assert.equal(sent.length,0);
 await confirmVisualAction(action,async()=>true,async(...args)=>{sent.push(args);});
 assert.deepEqual(sent,[['/failed/propose-layout',{confirmed:true}]]);
 for(const change of [{current:false},{stage:'stale'},{kind:'repair'},{generation_mode:'host-components'},{result:{requests_dispatched:2}}])assert.throws(()=>actions.visualProposeLayoutAction({...parent,...change} as VisualJob));
});
test('layout adoption captures both hashes before confirmation and permits exactly one nonexecuting source request',async()=>{
 const candidate:VisualJob={id:'proposal',project_id:'p',scene_id:'s',kind:'propose-layout',state:'succeeded',generation_mode:'source',result:{generation_mode:'source',requests_dispatched:0,execution:'not_run',technical:'passed',visual:'pending',production_adopted:false,diagnostic:true,design_sha256:'a'.repeat(64),original_design_sha256:'b'.repeat(64),layout_sha256:'c'.repeat(64),design:{},moves:[{objectId:'label',from:{x:1,y:2},to:{x:1,y:3}}],unresolved:[],layout_preflight:'passed'}};
 const action=actions.visualApplyLayoutAction(candidate),sent:unknown[]=[];
 for(const pattern of [/1 次.*代码模型/,/复用.*设计.*配音/,/不.*重试/,/旧稿保留/,/新源码.*哈希.*不执行/])assert.match(String(action.confirmation.message),pattern);
 assert.throws(()=>visualPreviewAction(candidate));assert.throws(()=>visualRepairAction(candidate,'fix'));
 await confirmVisualAction(action,async()=>false,async(...args)=>{sent.push(args);});assert.equal(sent.length,0);
 candidate.result!.design_sha256='d'.repeat(64);candidate.result!.layout_sha256='e'.repeat(64);
 await confirmVisualAction(action,async options=>{assert.match(options.detail!,/a{64}/);assert.match(options.detail!,/c{64}/);return true;},async(...args)=>{sent.push(args);});
 assert.deepEqual(sent,[['/proposal/apply-layout',{confirmed:true,max_requests:1,design_sha256:'a'.repeat(64),layout_sha256:'c'.repeat(64)}]]);
 for(const change of [{current:false},{stage:'stale'},{state:'failed'},{kind:'generate'},{result:{...candidate.result,layout_preflight:'failed'}},{result:{...candidate.result,moves:[]}},{result:{...candidate.result,layout_sha256:'bad'}}])assert.throws(()=>actions.visualApplyLayoutAction({...candidate,...change} as VisualJob));
});

test('free recovery confirms zero model execution and preserves failed job; cancellation submits nothing',async()=>{
 const parent:VisualJob={id:'failed',project_id:'p',scene_id:'s',kind:'generate',state:'failed',generation_mode:'source',result:{requests_dispatched:2}};
 const action=actions.visualRecoverSourceAction(parent),sent:unknown[]=[];
 assert.match(String(action.confirmation.message),/不调用模型/);assert.match(String(action.confirmation.message),/不执行/);assert.match(String(action.confirmation.message),/不替换原失败/);
 await confirmVisualAction(action,async()=>false,async(...args)=>{sent.push(args);});assert.equal(sent.length,0);
 await confirmVisualAction(action,async()=>true,async(...args)=>{sent.push(args);});
 assert.deepEqual(sent,[['/failed/recover-source',{confirmed:true}]]);
 for(const change of [{current:false},{stage:'stale'},{state:'succeeded'},{generation_mode:'host-components'},{result:{requests_dispatched:1}}])assert.throws(()=>actions.visualRecoverSourceAction({...parent,...change} as VisualJob));
});
test('recovery adoption is exactly one paid source revision with frozen hashes, never preview',async()=>{
 const candidate:VisualJob={id:'recovered',project_id:'p',scene_id:'s',kind:'recover-source',state:'succeeded',generation_mode:'source',result:{sha256:'a'.repeat(64),design_sha256:'b'.repeat(64),recovery_sha256:'c'.repeat(64),source:'export {}',design:{},requests_dispatched:0,execution:'not_run',technical:'passed',visual:'pending',production_adopted:false,diagnostic:true,generation_mode:'source'}};
 const action=actions.visualRepairSourceAction(candidate,'  fix source  '),sent:unknown[]=[];
 for(const text of [/复用冻结设计/,/最多 1 次源码模型/,/不重新配音/,/不自动重试/,/旧稿保留/,/新源码.*审批.*执行/])assert.match(String(action.confirmation.message),text);
 assert.throws(()=>visualPreviewAction(candidate));assert.throws(()=>visualRepairAction(candidate,'fix'));
 await confirmVisualAction(action,async()=>false,async(...args)=>{sent.push(args);});assert.equal(sent.length,0);
 candidate.result!.sha256='d'.repeat(64);candidate.result!.recovery_sha256='e'.repeat(64);
 await confirmVisualAction(action,async options=>{assert.match(options.detail!,/a{64}/);assert.match(options.detail!,/c{64}/);return true;},async(...args)=>{sent.push(args);});
 assert.deepEqual(sent,[['/recovered/repair-source',{confirmed:true,max_requests:1,feedback:'fix source',sha256:'a'.repeat(64),recovery_sha256:'c'.repeat(64)}]]);
 for(const change of [{current:false},{stage:'stale'},{state:'failed'},{kind:'generate'},{generation_mode:'host-motion'},{result:{...candidate.result,sha256:'bad'}},{result:{...candidate.result,recovery_sha256:'bad'}},{result:{...candidate.result,requests_dispatched:1}}])assert.throws(()=>actions.visualRepairSourceAction({...candidate,...change} as VisualJob,'fix'));
 for(const feedback of ['   ','x'.repeat(8001)])assert.throws(()=>actions.visualRepairSourceAction(candidate,feedback));
});

const job:VisualJob={id:'parent',project_id:'p',scene_id:'s',kind:'generate',state:'failed',current:true,generation_mode:'host-intent',result:{requests_dispatched:2}};
test('component generation confirms component choice and action data and submits only after approval',async()=>{
 const action=visualGenerateAction('s',4,'host-components'),sent:unknown[]=[];
 assert.match(String(action.confirmation.message),/宿主组件绘图/);
 assert.match(String(action.confirmation.message),/组件选择与动作数据/);
 await confirmVisualAction(action,async()=>false,async(...args)=>{sent.push(args);});
 assert.equal(sent.length,0);
 await confirmVisualAction(action,async()=>true,async(...args)=>{sent.push(args);});
 assert.deepEqual(sent,[['/generate',{scene_id:'s',expected_revision:4,confirmed:true,max_requests:2,generation_mode:'host-components'}]]);
});
test('component repairs and design revisions inherit the parent mode and describe the right data',async()=>{
 for(const kind of ['generate','repair'] as const)for(const count of [1,2]){
  const parent:VisualJob={...job,kind,generation_mode:'host-components',result:{requests_dispatched:count}};
  const action=visualRepairAction(parent,'  fix components  '),revision=kind==='generate'&&count===1;
  assert.match(String(action.confirmation.message),/沿用父任务的宿主组件绘图模式/);
  assert.match(String(action.confirmation.message),/组件选择与动作数据/);
  assert.match(String(action.confirmation.message),/不自动重试或切换模式/);
  assert.match(String(action.confirmation.message),/新源码仍须重新审批/);
  assert.equal(action.path,revision?'/parent/revise-design':'/parent/repair');
  assert.deepEqual(action.body,{confirmed:true,max_requests:revision?2:1,feedback:'fix components'});
  let calls=0;
  await confirmVisualAction(action,async()=>false,async()=>{calls++;});assert.equal(calls,0);
  await confirmVisualAction(action,async()=>true,async()=>{calls++;});assert.equal(calls,1);
 }
});
test('cancelled paid confirmation never submits and affirmative generation submits once',async()=>{
 const action=visualGenerateAction('s',4,'host-intent'),sent:unknown[]=[];
 assert.equal(await confirmVisualAction(action,async()=>false,async(...args)=>{sent.push(args);}),false);
 assert.equal(sent.length,0);
 assert.equal(await confirmVisualAction(action,async options=>{assert.match(String(options.message),/动作意图/);return true;},async(...args)=>{sent.push(args);}),true);
 assert.deepEqual(sent,[['/generate',{scene_id:'s',expected_revision:4,confirmed:true,max_requests:2,generation_mode:'host-intent'}]]);
});
test('repair and design revision derive budgets only from the parent job mode',async()=>{
 for(const count of [1,2]){
  const action=visualRepairAction({...job,result:{requests_dispatched:count}},'  fix  ');
  let submitted:unknown;
  await confirmVisualAction(action,async options=>{assert.match(String(options.message),/动作意图/);return true;},async(path,body)=>{submitted={path,body};});
  assert.deepEqual(submitted,{path:count===1?'/parent/revise-design':'/parent/repair',body:{confirmed:true,max_requests:count===1?2:1,feedback:'fix'}});
  assert.equal('generation_mode' in action.body,false);
 }
});
test('newly repaired source cannot preview without approval of its exact captured hash',async()=>{
 const sha='a'.repeat(64),repaired:VisualJob={...job,id:'new',kind:'repair',state:'succeeded',result:{sha256:sha,source:'export default function Scene(){return null;}'}};
 const action=visualPreviewAction(repaired),sent:unknown[]=[];
 await confirmVisualAction(action,async()=>false,async(...args)=>{sent.push(args);});assert.equal(sent.length,0);
 repaired.result!.sha256='b'.repeat(64);
 await confirmVisualAction(action,async options=>{assert.match(options.detail!,new RegExp(sha));return true;},async(...args)=>{sent.push(args);});
 assert.deepEqual(sent,[['/new/preview',{confirmed:true,sha256:sha}]]);
 assert.throws(()=>visualPreviewAction({...repaired,result:{sha256:'bad',source:'text'}}));
});

test('offline transfer confirmation never contains paid budget or execution approval',async()=>{
 const action=visualTransferAction('s',4,{design:{},roles:{}}),sent:unknown[]=[];
 assert.match(String(action.confirmation.message),/不调用模型/);assert.match(String(action.confirmation.message),/不执行/);
 await confirmVisualAction(action,async()=>false,async(...args)=>{sent.push(args);});assert.equal(sent.length,0);
 await confirmVisualAction(action,async()=>true,async(...args)=>{sent.push(args);});
 assert.deepEqual(sent,[['/prepare-transfer',{scene_id:'s',expected_revision:4,confirmed:true,design:{},roles:{}}]]);
 assert.throws(()=>visualTransferAction('s',4,{design:{},roles:{},execute:true}));
});

test('transfer execution approval captures the exact source hash and diagnostic-only scope',async()=>{
 const candidate:VisualJob={id:'candidate',project_id:'p',scene_id:'s',kind:'prepare-transfer',state:'succeeded',current:true,result:{sha256:'a'.repeat(64),source:'export {}',binding_sha256:'b'.repeat(64)}};
 const action=visualTransferPreviewAction(candidate),sent:unknown[]=[];
 assert.equal(action.path,'/candidate/preview-transfer');assert.match(String(action.confirmation.message),/诊断/);assert.match(String(action.confirmation.message),/不是安全沙箱/);
 await confirmVisualAction(action,async()=>false,async(...args)=>{sent.push(args);});assert.equal(sent.length,0);
 candidate.result!.sha256='c'.repeat(64);
 await confirmVisualAction(action,async options=>{assert.match(options.detail!,/a{64}/);return true;},async(...args)=>{sent.push(args);});
 assert.deepEqual(sent,[['/candidate/preview-transfer',{confirmed:true,sha256:'a'.repeat(64)}]]);
 assert.throws(()=>visualTransferPreviewAction({...candidate,current:false}));
 assert.throws(()=>visualTransferPreviewAction({...candidate,kind:'generate'}));
});
test('automatic RAG recipe is an explicitly confirmed free bounded action, not a model request',async()=>{
 const action=visualAutomaticTransferAction('s',4),sent:unknown[]=[];
 assert.match(String(action.confirmation.message),/RAG/);assert.match(String(action.confirmation.message),/固定/);assert.match(String(action.confirmation.message),/不调用模型/);
 await confirmVisualAction(action,async()=>true,async(...args)=>{sent.push(args);});
 assert.deepEqual(sent,[['/auto-transfer',{scene_id:'s',expected_revision:4,confirmed:true,preset:'rag-augmentation:1'}]]);
});
