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
