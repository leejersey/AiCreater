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
 const html=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',job,now:0,updatedAt:0,disabled:false,onStart(){},onRefresh(){},onCancel(){}}));
 assert.match(html,/Agent 已自检并通过检查 · 6 轮/);
 assert.match(html,/<video[^>]+src="\/api\/projects\/p\/visual\/a1\/files\/video.mp4"/);
 assert.match(html,/Agent 重新生成（付费）/);
 const blocked=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',now:0,updatedAt:0,disabled:false,blockedReason:'先完成第 1 步：添加配音。',onStart(){},onRefresh(){},onCancel(){}}));
 assert.match(blocked,/先完成第 1 步：添加配音。/);
 assert.match(blocked,/disabled=""/);
});

test('a passed agent video can be accepted once, and the panel says when it is',()=>{
 const [job]=parseVisualJobs({jobs:[passed]},'p');
 assert.ok(visual.canAcceptAgent(job));
 const open=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',job,now:0,updatedAt:0,disabled:false,onStart(){},onRefresh(){},onCancel(){},onAccept(){}}));
 assert.match(open,/确认此版本/);
 const [accepted]=parseVisualJobs({jobs:[{...passed,result:{...passed.result,accepted:true}}]},'p');
 const done=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',job:accepted,now:0,updatedAt:0,disabled:false,onStart(){},onRefresh(){},onCancel(){},onAccept(){}}));
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
 const html=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',job:newer,exported:older,now:0,updatedAt:0,disabled:false,onStart(){},onRefresh(){},onCancel(){}}));
 assert.match(html,/整课导出将使用：更早确认的版本/);
 const none=renderToStaticMarkup(createElement(VisualAgentPanel,{projectId:'p',job:newer,now:0,updatedAt:0,disabled:false,onStart(){},onRefresh(){},onCancel(){}}));
 assert.match(none,/整课导出将使用：暂无已确认的版本/);
});

const row=(id:string,state:string,ready:boolean)=>({id,state,revision:1,scene:{narration:{text:'x',...(ready?{audio_asset_id:'a'}:{})},duration_frames:ready?60:undefined,captions:ready?[{text:'x',start_frame:0,end_frame:60}]:undefined}}) as any;
test('chapter status follows voice, running, review and confirmation; batch takes only chapters still to generate',()=>{
 const rows=[row('a','needs_voice',false),row('b','needs_timing',false),row('c','ready',true),row('d','ready',true),row('e','ready',true),row('f','ready',true)];
 const job=(over:Record<string,unknown>)=>parseVisualJobs({jobs:[{...passed,...over}]},'p')[0];
 const jobs=[job({id:'r',scene_id:'d',state:'running',result:null}),job({id:'v',scene_id:'e'}),job({id:'k',scene_id:'f',result:{...passed.result,accepted:true}})];
 assert.deepEqual(rows.map(r=>visual.chapterStatus(r,jobs).label),['待配音','待对齐','待生成','生成中','待确认','已确认']);
 assert.deepEqual(visual.agentBatchScenes(rows,jobs).map(r=>r.id),['c']);
});

test('Agent stills skip the boundary frames; the running Agent stage shows as progress detail',()=>{
 const frames=['f0','f1','f2','f3','f4','f5'];
 assert.deepEqual(visual.reviewFrames(frames),['f1','f3','f4']);
 assert.deepEqual(visual.reviewFrames(['f0','f1','f2']),['f0','f1','f2']);
 const [running]=parseVisualJobs({jobs:[{...passed,state:'running',stage:'第 3 轮 · 检查发现 2 个需修正的问题',result:null}]},'p');
 assert.match(visual.videoProgress(running,0).detail,/第 3 轮 · 检查发现 2 个需修正的问题/);
});

test('the parser checks ownership, kinds and media names, and the job list only has Agent and export jobs',()=>{
 for(const bad of [{...passed,project_id:'other'},{...passed,state:'ready'},{...passed,kind:'preview'},{...passed,kind:'generate'},
  {...passed,result:{...passed.result,frames:['/private/file.png']}},{...passed,result:{...passed.result,video:'https://evil.test/a'}}])
  assert.throws(()=>parseVisualJobs({jobs:[bad]},'p'),/视觉任务响应无效/);
 assert.throws(()=>parseVisualJobs({jobs:[passed,passed]},'p'));
 const [exported]=parseVisualJobs({jobs:[{id:'e',project_id:'p',scene_id:null,kind:'export',state:'succeeded',input_summary:{chapter_count:8},result:{video:'video.mp4',srt:'video.srt',provider_response:'SECRET'}}]},'p');
 assert.equal(videoTaskStatus(exported),'整课视频已导出');
 assert.doesNotMatch(JSON.stringify(exported),/SECRET/);
 assert.equal(visual.visualFileUrl('p','j','stills/frame-10.png'),'/api/projects/p/visual/j/files/stills/frame-10.png');
 for(const name of ['../video.mp4','stills/../../x','//evil','source.tsx','stills/frame-1.png?x','design.json'])assert.throws(()=>visual.visualFileUrl('p','j',name));
});

test('only measured audio with captions unlocks generation; voice and timing actions follow the current jobs',()=>{
 const ready={id:'s',revision:2,state:'ready',scene:{duration_frames:30,narration:{text:'口播',audio_asset_id:'a'},captions:[{text:'口播',start_frame:6,end_frame:20}]}} as any;
 assert.equal(visual.measuredReady(ready),true);
 assert.equal(visual.measuredReady({...ready,state:'needs_timing'}),false);
 assert.equal(visual.measuredReady({...ready,scene:{...ready.scene,captions:[]}}),false);
 assert.equal(visual.measuredReady({...ready,scene:{...ready.scene,narration:{text:'口播'}}}),false);
 const row={id:'s',revision:2,state:'needs_voice',scene:{narration:{text:'口播'}}} as any;
 const job={job_id:'voice-job',kind:'voice',scene_id:'s',base_revision:2,state:'failed',progress:0,error:{message:'失败',retryable:true}} as any;
 assert.equal(visual.sceneAudioActions(row,[job]).voicePath,'/api/jobs/voice-job/retry');
 assert.equal(visual.sceneAudioActions(row,[{...job,state:'succeeded'}]).voicePath,'/api/scenes/s/voice');
 for(const state of ['queued','running'])assert.equal(visual.sceneAudioActions(row,[job,{...job,state}]).voiceBlocked,true);
 assert.equal(visual.sceneAudioActions(row,[{...job,state:'running',base_revision:1}]).voiceBlocked,false);
 const timed={id:'s',revision:2,state:'needs_timing',scene:{narration:{text:'口播',audio_asset_id:'audio'}}} as any;
 assert.equal(visual.sceneAudioActions(timed,[]).timingBlocked,false);
 assert.equal(visual.sceneAudioActions(timed,[{job_id:'t',kind:'timing',scene_id:'s',base_revision:2,state:'queued',progress:0} as any]).timingBlocked,true);
});

test('untrusted errors are reduced to fixed messages',()=>{
 assert.doesNotMatch(visual.visualError(new Error('/private/key provider response')),/private|provider/);
 assert.match(visual.visualError(new Error('conflict',{cause:409})),/版本/);
});
