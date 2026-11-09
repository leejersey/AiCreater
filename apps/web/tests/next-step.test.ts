import test from 'node:test';
import assert from 'node:assert/strict';
import {nextStep,parseVisualJobs} from '../lib/visual-workbench';

const scene=(state:string,ready=false)=>({id:'s1',project_id:'p',revision:3,state,scene:{id:'c1',narration:{text:'一句话。',...(ready?{audio_asset_id:'a',audio_start_frame:6}:{})},
 ...(ready?{duration_frames:90,captions:[{text:'一句话。',start_frame:6,end_frame:80}]}:{})}}) as any;
const agent=(extra:Record<string,unknown>)=>parseVisualJobs({jobs:[{id:'a1',project_id:'p',scene_id:'s1',kind:'agent',current:true,input_summary:{model:'m',max_turns:25},...extra}]},'p');
const passed={state:'succeeded',result:{status:'passed',turns:5,requests_dispatched:5,finish_by:'model',usage:{outputTokens:1},sha256:'a'.repeat(64),video:'video.mp4',srt:'video.srt',frames:['stills/frame-1.png']}};
const opts={isLast:false,allConfirmed:false,projectBusy:false};

test('each chapter state has exactly one next step',()=>{
 assert.equal(nextStep(scene('needs_voice'),[],[],opts).key,'voice');
 assert.equal(nextStep(scene('needs_timing'),[],[],opts).key,'retime');
 assert.equal(nextStep(scene('ready',true),[],[],opts).key,'generate');
 assert.equal(nextStep(scene('ready',true),agent({state:'failed',result:null}),[],opts).label,'重新生成视频（付费）');
 assert.equal(nextStep(scene('ready',true),agent({state:'running',result:null}),[],opts).key,'wait');
 assert.equal(nextStep(scene('ready',true),agent(passed),[],opts).key,'confirm');
 const accepted=agent({...passed,result:{...passed.result,accepted:true}});
 assert.equal(nextStep(scene('ready',true),accepted,[],opts).key,'next');
 assert.equal(nextStep(scene('ready',true),accepted,[],{...opts,isLast:true,allConfirmed:true}).key,'export');
 assert.equal(nextStep(scene('ready',true),accepted,[],{...opts,isLast:true}).key,'done');
 assert.equal(nextStep(scene('needs_voice'),[],[],{...opts,projectBusy:true}).key,'wait');
 assert.equal(nextStep(scene('needs_voice'),[],[{job_id:'v',scene_id:'s1',kind:'voice',state:'running',base_revision:3} as any],opts).key,'wait');
});

test('a failure offers the action that fixes it',async()=>{
 const {failureAction}=await import('../lib/visual-workbench');
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const {VisualTaskProgress}=await import('../app/VisualWorkbench');
 const failed=(error_code:string,llm='account')=>parseVisualJobs({jobs:[{id:'a1',project_id:'p',scene_id:'s1',kind:'agent',state:'failed',error:'失败',error_code,result:null,
  input_summary:{model:'m',max_turns:25,llm:{source:llm,model:'qwen-plus'}}}]},'p')[0];
 assert.equal(failureAction(failed('agent_provider_auth'))?.href,'/account');
 assert.match(failureAction(failed('agent_provider_auth','env'))!.label,/DEEPSEEK_API_KEY/);
 assert.equal(failureAction(failed('agent_llm_changed'))?.action,'restart');
 assert.equal(failureAction(failed('stale'))?.action,'refresh');
 assert.equal(failureAction(failed('agent_budget_turns')),undefined);
 const html=renderToStaticMarkup(createElement(VisualTaskProgress,{job:failed('agent_provider_destination'),now:0,updatedAt:0,disabled:false,onCancel(){},onRefresh(){}}));
 assert.match(html,/<a class="primary-link" href="\/account">去个人中心检查 Base URL<\/a>/);
 assert.throws(()=>parseVisualJobs({jobs:[{id:'x',project_id:'p',scene_id:'s1',kind:'agent',state:'failed',error_code:'Bad Code',result:null,input_summary:{model:'m',max_turns:25}}]},'p'));
});

test('a feedback note names the moment and the sentence narrated then',async()=>{
 const {momentNote}=await import('../lib/visual-workbench');
 const captions=[{text:'先读代码。',start_frame:6,end_frame:60},{text:' 再修改文件。',start_frame:60,end_frame:150}];
 assert.equal(momentNote(2.5,captions),'【00:02，口播「再修改文件。」处】');
 assert.equal(momentNote(0.5,captions),'【00:00，口播「先读代码。」处】');
 assert.equal(momentNote(75,captions),'【01:15，口播「再修改文件。」处】'); // after the last caption: the last one
 assert.equal(momentNote(1,undefined),'【00:01 处】');
});

test('review mode plays the chapter waiting for confirmation with its actions and keys',async()=>{
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const {ReviewMode}=await import('../app/VisualWorkbench');
 const [job]=agent(passed);
 const html=renderToStaticMarkup(createElement(ReviewMode,{projectId:'p',items:[{index:2,row:scene('ready',true),job}],disabled:false,onAccept:async()=>{},onRevise(){},onClose(){}}));
 for(const text of ['连续审片 · 第 3 章（1/1）','确认此版本（Enter）','在当前画面提意见','按意见修改（付费）','跳过（J）','上一章（K）','autoPlay'.toLowerCase()])assert.ok(html.toLowerCase().includes(text.toLowerCase()),text);
 assert.match(html,/src="\/api\/projects\/p\/visual\/a1\/files\/video.mp4"/);
 assert.match(renderToStaticMarkup(createElement(ReviewMode,{projectId:'p',items:[],disabled:false,onAccept:async()=>{},onRevise(){},onClose(){}})),/没有待确认的章节/);
});

test('the course pipeline confirmation lists what may be voiced and generated, and the cost',async()=>{
 const {autopilotConfirmation}=await import('../lib/visual-workbench-actions');
 const plan={revision:4,chapters:[{scene_id:'a',index:0,steps:['agent']},{scene_id:'b',index:1,steps:['voice','agent']}],
  voice:{status:'estimated',maximum_cny:0.01,quantity:{characters:20}},agent:{chapters:2,max_turns_each:25,max_turns_total:50},llm:{source:'env',model:'deepseek-flash'}} as any;
 const c=autopilotConfirmation(plan);
 assert.equal(c.title,'整课自动生成 2 章（付费）');
 const m=String(c.message);
 assert.match(m,/配音 1 章（第 2 章）：约 ¥0.01（火山 TTS 公开价，20 字）/);
 assert.match(m,/生成视频 2 章：每章最多 25 轮模型调用，合计最多 50 轮（服务端 DeepSeek，开启思考）/);
 assert.match(m,/失败的章节不重试/);
 assert.match(String(autopilotConfirmation({...plan,chapters:[plan.chapters[0]],voice:null}).message),/无需配音/);
});

test('costs read in yuan where prices are known and in tokens otherwise',async()=>{
 const {costSummary}=await import('../app/VisualWorkbench');
 const {visualAgentAction}=await import('../lib/visual-workbench-actions');
 const base={voice:{characters:1000,cny:0.3},agent:{server:{input:80000,cached_input:60000,output:20000,cny:null},own_model:{input:0,output:0}},
  prices:{deepseek_configured:false},next_agent:{max_output_tokens:300000,max_output_cny:null}};
 assert.equal(costSummary(base as any),'已用：配音 ¥0.30 · Agent 输入 8.0 万（缓存 6.0 万）/ 输出 2.0 万 token');
 assert.match(costSummary({...base,agent:{...base.agent,server:{...base.agent.server,cny:0.23}}} as any),/（约 ¥0.23）$/);
 assert.match(String(visualAgentAction('s',1,{configured:false,model:'m',cap:{tokens:300000,cny:2.4}}).confirmation.message),/输出最多 30 万 token（输出部分最多约 ¥2.4，输入按实际用量另计）/);
 assert.match(String(visualAgentAction('s',1,{configured:true,model:'qwen',cap:{tokens:300000,cny:2.4}}).confirmation.message),/输出最多 30 万 token，按你的服务商计费/);
});
