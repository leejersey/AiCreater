import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseVisualJobs,latestAgentJob,visualAgentBody,videoTaskStatus} from '../lib/visual-workbench';
import {visualAgentAction} from '../lib/visual-workbench-actions';
import {VisualAgentPanel} from '../app/VisualWorkbench';
import * as visual from '../lib/visual-workbench';

const passed={id:'a1',project_id:'p',scene_id:'s',kind:'agent',state:'succeeded',current:true,
 input_summary:{model:'deepseek-flash-thinking',max_turns:25,fingerprint:'f'},
 result:{status:'passed',turns:6,requests_dispatched:6,finish_by:'model',model:'deepseek-flash-thinking',usage:{inputTokens:70000,outputTokens:19309,cachedInputTokens:66000},
  sha256:'c'.repeat(64),frames:['stills/frame-30.png','stills/frame-90.png'],video:'video.mp4',srt:'video.srt'}};

test('agent jobs parse with their turn budget and a passed result',()=>{
 const [job]=parseVisualJobs({jobs:[passed]},'p');
 assert.deepEqual(job.agent,{model:'deepseek-flash-thinking',max_turns:25});
 assert.deepEqual(job.result?.agent,{status:'passed',turns:6,finish_by:'model',output_tokens:19309});
 assert.equal(job.result?.requests_dispatched,6); // above the two-request cap of the older generators
 assert.equal(job.result?.video,'video.mp4');
 assert.equal(videoTaskStatus(job),'Agent 视频已生成');
 const [queued]=parseVisualJobs({jobs:[{...passed,state:'queued',result:null}]},'p');
 assert.equal(queued.result,null);
 const [stopped]=parseVisualJobs({jobs:[{...passed,state:'failed',error:'Agent 未在轮数上限内完成通过检查的画面；运行记录已保留，未自动重试。',result:{requests_dispatched:25}}]},'p');
 assert.equal(stopped.result?.requests_dispatched,25);
});

test('agent responses that break the contract are rejected',()=>{
 const bad=[
  {...passed,input_summary:{...passed.input_summary,model:'Bad Model!'}},
  {...passed,input_summary:{...passed.input_summary,max_turns:26}},
  {...passed,result:{...passed.result,turns:30,requests_dispatched:30}},
  {...passed,result:{...passed.result,requests_dispatched:5}},
  {...passed,result:{...passed.result,status:'stopped'}},
  {...passed,result:{...passed.result,video:undefined}},
  {...passed,result:{...passed.result,frames:[]}},
  {...passed,state:'failed',result:{requests_dispatched:26}},
 ];
 for(const job of bad)assert.throws(()=>parseVisualJobs({jobs:[job]},'p'),/视觉任务响应无效/,JSON.stringify(job).slice(0,120));
 // Older kinds keep their two-request cap and may not claim a turn budget.
 const generate={id:'g',project_id:'p',scene_id:'s',kind:'generate',state:'failed',input_summary:{},result:{requests_dispatched:3}};
 assert.throws(()=>parseVisualJobs({jobs:[generate]},'p'),/视觉任务响应无效/);
 assert.throws(()=>parseVisualJobs({jobs:[{...generate,result:null,input_summary:{max_turns:25}}]},'p'),/视觉任务响应无效/);
});

test('the agent action asks for a capped, paid confirmation',()=>{
 assert.deepEqual(visualAgentBody('s',3),{scene_id:'s',expected_revision:3,confirmed:true,max_turns:25});
 assert.throws(()=>visualAgentBody('bad id',3));
 const action=visualAgentAction('s',3);
 assert.equal(action.path,'/agent');
 assert.equal(action.confirmation.variant,'warning');
 assert.match(String(action.confirmation.message),/最多 25 轮模型调用/);
 assert.match(action.confirmation.confirmText??'',/确认最多 25 轮付费调用/);
});

test('the agent panel shows the result, the media and a re-run button',()=>{
 const [job]=parseVisualJobs({jobs:[passed]},'p');
 assert.equal(latestAgentJob([job])?.id,'a1');
 const html=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',job,now:0,updatedAt:0,disabled:false,canStart:true,onStart(){},onRefresh(){},onCancel(){}}));
 assert.match(html,/Agent 已自检并通过检查 · 6 轮/);
 assert.match(html,/<video[^>]+src="\/api\/projects\/p\/visual\/a1\/files\/video.mp4"/);
 assert.match(html,/Agent 重新生成（付费）/);
 const blocked=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',now:0,updatedAt:0,disabled:false,canStart:false,onStart(){},onRefresh(){},onCancel(){}}));
 assert.match(blocked,/需要先完成本章配音与实测对齐/);
 assert.match(blocked,/disabled=""/);
});

test('a passed agent video can be accepted once, and the panel says when it is',()=>{
 const [job]=parseVisualJobs({jobs:[passed]},'p');
 assert.ok(visual.canAcceptAgent(job));
 const open=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',job,now:0,updatedAt:0,disabled:false,canStart:true,onStart(){},onRefresh(){},onCancel(){},onAccept(){}}));
 assert.match(open,/确认此版本/);
 const [accepted]=parseVisualJobs({jobs:[{...passed,result:{...passed.result,accepted:true}}]},'p');
 const done=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',job:accepted,now:0,updatedAt:0,disabled:false,canStart:true,onStart(){},onRefresh(){},onCancel(){},onAccept(){}}));
 assert.match(done,/已确认此版本 · 可用于整课导出/);
 assert.doesNotMatch(done,/<button[^>]*>.*确认此版本<\/button>/);
 assert.ok(!visual.canAcceptAgent({...job,current:false}));
});

test('another configured model parses, and the panel names the version export will use',()=>{
 const [other]=parseVisualJobs({jobs:[{...passed,input_summary:{...passed.input_summary,model:'claude-sonnet'}}]},'p');
 assert.equal(other.agent?.model,'claude-sonnet');
 const [older]=parseVisualJobs({jobs:[{...passed,id:'old',created_at:'2026-11-01T10:00:00Z',result:{...passed.result,accepted:true}}]},'p');
 const [newer]=parseVisualJobs({jobs:[{...passed,id:'new',state:'failed',created_at:'2026-11-01T11:00:00Z',result:{requests_dispatched:3}}]},'p');
 assert.equal(visual.exportedVersion([newer,older])?.id,'old');
 const html=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',job:newer,exported:older,now:0,updatedAt:0,disabled:false,canStart:true,onStart(){},onRefresh(){},onCancel(){}}));
 assert.match(html,/整课导出将使用：更早确认的 Agent 版本/);
 const none=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',job:newer,now:0,updatedAt:0,disabled:false,canStart:true,onStart(){},onRefresh(){},onCancel(){}}));
 assert.match(none,/整课导出将使用：暂无已确认的版本/);
});
