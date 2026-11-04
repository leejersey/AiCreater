import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runLoop} from '../src/loop';
import {ProviderError,textOf,type Capabilities,type Provider,type StopReason,type ToolCall,type TurnRequest,type TurnResult} from '../src/provider/types';
import {sourceSha256,type StillRenderer,type StillsResult} from '../src/render/stills';
import {createWorkspace,SCENE_FILE,Workspace} from '../src/workspace';

const skillDir=path.join(path.dirname(fileURLToPath(import.meta.url)),'../skill');
const capabilities:Capabilities={vision:false,parallelToolCalls:true,contextTokens:128000,maxOutputTokens:8192,promptCache:true,appendOnlyHistory:false};
const brief={schemaVersion:'custom-scene-brief:1',id:'demo',title:'演示',narration:'第一句。第二句。',visualGoal:'g',facts:['f'],materials:['m'],width:1920,height:1080,fps:30,durationInFrames:120};
const cues=[{id:'a',text:'第一句。',startFrame:0,endFrame:60},{id:'b',text:'第二句。',startFrame:60,endFrame:120}];
const scene=(y:number)=>`import React from 'react';
export default function Scene({width,height,theme}:{frame:number;fps:number;width:number;height:number;theme:{background:string;foreground:string;muted:string;accent:string;secondary:string}}){
 return <svg width={width} height={height}><text id="title" x={100} y={${y}} fill={theme.foreground}>标题</text></svg>;
}
`;

// Reports a caption-safe violation whenever the title sits at y=1040, like the real audit does.
class FakeRenderer implements StillRenderer{
 renders=0;
 async render(source:string,frames:number[],outDir:string):Promise<StillsResult>{
  this.renders++;
  await mkdir(outDir,{recursive:true});
  const file=path.join(outDir,'f.png');await writeFile(file,'png');
  const issues=source.includes('y={1040}')?[{kind:'label-out-of-bounds',target:'title',detail:'Label exceeds 0..1920 x 0..980 caption-safe area'}]:[];
  const ink=source.includes('opacity={0}')?0:0.05; // a scene drawn fully transparent renders as background only
  return{sourceSha256:sourceSha256(source),failures:[],frames:frames.map(frame=>({frame,file,ink,audit:{issues,labels:1,movers:0,routes:0,obstacles:0}}))};
 }
 async close(){}
}

type Step=ToolCall[]|{text?:string;calls?:ToolCall[];stop?:StopReason;outputTokens?:number}|Error;
let ids=0;
const call=(name:string,args:unknown={},parseError?:string):ToolCall=>({id:`t${ids++}`,name,arguments:args,...(parseError?{parseError}:{})});
const review=[{item:'每个节拍都有画面变化',pass:true,evidence:'title appears at frame 0'}];

// Replays a fixed script and records what the loop sent back after each turn.
class ScriptedProvider implements Provider{
 readonly name='scripted';
 readonly capabilities=capabilities;
 requests:TurnRequest[]=[];
 constructor(private readonly steps:Step[]){}
 async turn(request:TurnRequest):Promise<TurnResult>{
  this.requests.push(structuredClone({...request,signal:undefined}));
  const step=this.steps.shift();
  if(!step)throw Error('script exhausted');
  if(step instanceof Error)throw step;
  const s=Array.isArray(step)?{calls:step}:step;
  const toolCalls=s.calls??[];
  return{message:{role:'assistant',content:s.text?[{type:'text',text:s.text}]:[],toolCalls},stop:s.stop??(toolCalls.length?'tool_use':'end_turn'),
   usage:{inputTokens:1000,outputTokens:s.outputTokens??100,cachedInputTokens:600},raw:{step:this.requests.length}};
 }
 lastToolText(){return this.requests.at(-1)!.messages.filter(m=>m.role==='tool').map(m=>textOf(m.content));}
}

async function setup(initialSource?:string){
 const dir=path.join(await mkdtemp(path.join(tmpdir(),'scene-agent-loop-')),'run');
 return{workspace:await createWorkspace(dir,{brief,cues,skillDir,initialSource}),renderer:new FakeRenderer()};
}
const budget={maxTurns:15,maxOutputTokensTotal:100000};

test('full loop: write a broken scene, see the audit, fix it, finish passes the gates',async()=>{
 const {workspace,renderer}=await setup();
 const provider=new ScriptedProvider([
  [call('get_timing'),call('read_skill',{topic:'scene-contract'})],
  [call('write_file',{path:SCENE_FILE,content:scene(1040)})],
  [call('typecheck'),call('render_stills')],
  [call('audit_scene')],
  [call('finish',{summary:'done',selfReview:review})], // rejected: high finding remains
  [call('edit_file',{path:SCENE_FILE,old:'y={1040}',new:'y={140}'})],
  [call('render_stills'),call('audit_scene')],
  [call('finish',{summary:'title inside the safe area',selfReview:review})],
 ]);
 const result=await runLoop({provider,workspace,renderer,budget});
 assert.equal(result.status,'passed');
 assert.equal(result.turns,8);
 assert.deepEqual(result.usage,{inputTokens:8000,outputTokens:800,cachedInputTokens:4800});
 assert.equal(result.finish?.summary,'title inside the safe area');
 assert.deepEqual(result.finish?.gates.checks.map(c=>[c.gate,c.passed]),[['scene-exists',true],['contract',true],['typecheck',true],['render',true],['audit',true]]);
 assert.equal(result.sceneSha256,sourceSha256(scene(140)));
 // What the model saw along the way.
 const seen=provider.requests.map(r=>r.messages.filter(m=>m.role==='tool').at(-1)).map(m=>m?textOf(m.content):'');
 assert.match(seen[4],/\[high\] label-out-of-bounds title/);
 assert.match(seen[5],/finish rejected[\s\S]*✗ audit: label-out-of-bounds title/);
 assert.equal(provider.requests[0].tools.at(-1)!.name,'finish');
 assert.ok(!provider.requests[0].tools.some(t=>t.name==='view_frames'));
 assert.match(textOf(provider.requests[0].messages[0].content),/Narration \(fixed, do not change it\): 第一句。第二句。/);
 // Files on disk.
 const saved=JSON.parse(await readFile(path.join(workspace.root,'result.json'),'utf8'));
 assert.equal(saved.status,'passed');
 const lines=(await readFile(path.join(workspace.root,'transcript.jsonl'),'utf8')).trim().split('\n').map(l=>JSON.parse(l));
 assert.deepEqual([lines[0].type,lines.at(-1).type],['start','result']);
 assert.equal(lines.filter(l=>l.type==='turn').length,8);
});

test('the gate renders the full default sample even if the model rendered a subset',async()=>{
 const {workspace,renderer}=await setup(scene(140));
 const provider=new ScriptedProvider([[call('render_stills',{frames:[0]})],[call('finish',{summary:'s',selfReview:review})]]);
 const result=await runLoop({provider,workspace,renderer,budget});
 assert.equal(result.status,'passed');
 assert.equal(renderer.renders,2);
 assert.match(result.finish!.gates.checks.find(c=>c.gate==='render')!.detail,/6 frames rendered/);
});

test('bad arguments are fed back and the model can recover',async()=>{
 const {workspace,renderer}=await setup();
 const provider=new ScriptedProvider([
  [call('write_file','{"path":"scene/Scene.tsx","content":"impo','arguments are not valid JSON: Unterminated string'),call('nope')],
  [call('write_file',{path:SCENE_FILE,content:scene(140)})],
  [call('finish',{summary:'s',selfReview:review})],
 ]);
 const result=await runLoop({provider,workspace,renderer,budget});
 assert.equal(result.status,'passed');
 const feedback=provider.requests[1].messages.filter(m=>m.role==='tool');
 assert.match(textOf(feedback[0].content),/not valid JSON[\s\S]*Send the arguments again/);
 assert.match(textOf(feedback[1].content),/unknown tool "nope"/);
 assert.ok(feedback.every(m=>m.role==='tool'&&m.isError));
});

test('turn budget stops the run and warns two turns ahead',async()=>{
 const {workspace,renderer}=await setup(scene(1040));
 const provider=new ScriptedProvider(Array.from({length:4},()=>[call('render_stills')]));
 const result=await runLoop({provider,workspace,renderer,budget:{maxTurns:4,maxOutputTokensTotal:100000}});
 assert.deepEqual([result.status,result.reason,result.turns],['stopped','budget_turns',4]);
 assert.match(textOf(provider.requests[2].messages.at(-1)!.content),/2 turns left/);
});

test('output token budget stops the run',async()=>{
 const {workspace,renderer}=await setup();
 const provider=new ScriptedProvider([{calls:[call('get_timing')],outputTokens:600},{calls:[call('get_timing')],outputTokens:600}]);
 const result=await runLoop({provider,workspace,renderer,budget:{maxTurns:10,maxOutputTokensTotal:1000}});
 assert.deepEqual([result.reason,result.turns,result.usage.outputTokens],['budget_tokens',2,1200]);
});

test('replies without tool calls get nudged, then the run stops',async()=>{
 const {workspace,renderer}=await setup();
 const provider=new ScriptedProvider([{text:'I think it is done.'},{text:'Done.'},{text:'Really done.'}]);
 const result=await runLoop({provider,workspace,renderer,budget});
 assert.deepEqual([result.status,result.reason,result.turns],['stopped','no_finish',3]);
 assert.match(textOf(provider.requests[1].messages.at(-1)!.content),/call finish/);
});

test('two truncated turns in a row stop the run; the first gets a smaller-edits hint',async()=>{
 const {workspace,renderer}=await setup();
 const truncated={calls:[call('write_file','{"path":"scene/Scene.tsx","content":"…','arguments truncated by max_tokens')],stop:'max_tokens' as const};
 const provider=new ScriptedProvider([{stop:'max_tokens'},truncated]);
 const result=await runLoop({provider,workspace,renderer,budget});
 assert.deepEqual([result.reason,result.turns],['max_tokens',2]);
 assert.match(textOf(provider.requests[1].messages.at(-1)!.content),/smaller changes with edit_file/);
});

test('a scene that stops changing is reported as stalled',async()=>{
 const {workspace,renderer}=await setup(scene(1040));
 const provider=new ScriptedProvider(Array.from({length:10},()=>[call('audit_scene')]));
 const result=await runLoop({provider,workspace,renderer,budget});
 assert.deepEqual([result.reason,result.turns],['stalled',6]);
});

test('provider errors map to stop reasons and still write result.json',async()=>{
 const cases:[Error,string,string][]=[
  [new ProviderError('auth','Insufficient Balance',402),'stopped','provider_auth'],
  [new ProviderError('unavailable','HTTP 503',503),'stopped','provider_unavailable'],
  [new ProviderError('request','HTTP 400: bad tool schema',400),'failed','provider_request: HTTP 400: bad tool schema'],
 ];
 for(const [error,status,reason] of cases){
  const {workspace,renderer}=await setup();
  const result=await runLoop({provider:new ScriptedProvider([error]),workspace,renderer,budget});
  assert.deepEqual([result.status,result.reason,result.turns],[status,reason,1]);
  assert.equal(JSON.parse(await readFile(path.join(workspace.root,'result.json'),'utf8')).reason,reason);
 }
});

test('refusals and aborts stop the run',async()=>{
 const a=await setup();
 assert.equal((await runLoop({provider:new ScriptedProvider([{stop:'refusal'}]),...a,budget})).reason,'refusal');
 const b=await setup();
 const controller=new AbortController();controller.abort();
 const aborted=await runLoop({provider:new ScriptedProvider([]),...b,budget,signal:controller.signal});
 assert.deepEqual([aborted.reason,aborted.turns],['aborted',0]);
});

test('a run that ends without finish falls back to its last gate-clean version, marked as a harness decision',async()=>{
 const {workspace,renderer}=await setup(scene(140));
 const provider=new ScriptedProvider([[call('render_stills')],[call('edit_file',{path:SCENE_FILE,old:'y={140}',new:'y={1040}'})],[call('get_timing')]]);
 const result=await runLoop({provider,workspace,renderer,budget:{maxTurns:3,maxOutputTokensTotal:100000}});
 assert.deepEqual([result.status,result.reason,result.finish?.by],['passed','checkpoint','harness']);
 assert.deepEqual(result.finish?.selfReview,[]);
 assert.equal(result.finish?.gates.sourceSha256,sourceSha256(scene(140)));
 assert.equal(await workspace.readScene(),scene(140)); // the regressed edit is replaced by the clean version
 assert.equal(result.cleanCheckpoint,undefined);
});

test('a provider outage after a gate-clean version keeps that version; before one, the run stops',async()=>{
 const {workspace,renderer}=await setup(scene(140));
 const provider=new ScriptedProvider([[call('render_stills')],new ProviderError('unavailable','HTTP 503: Service is too busy',503)]);
 const result=await runLoop({provider,workspace,renderer,budget});
 assert.deepEqual([result.status,result.reason,result.finish?.by],['passed','checkpoint','harness']);
 assert.match(result.finish!.summary,/provider_unavailable/);
 const early=await setup(scene(140));
 const none=await runLoop({provider:new ScriptedProvider([new ProviderError('unavailable','HTTP 503',503)]),...early,budget});
 assert.deepEqual([none.status,none.reason],['stopped','provider_unavailable']);
});

test('without any clean version the run still stops honestly',async()=>{
 const {workspace,renderer}=await setup(scene(1040));
 const provider=new ScriptedProvider([[call('render_stills')],[call('get_timing')]]);
 const result=await runLoop({provider,workspace,renderer,budget:{maxTurns:2,maxOutputTokensTotal:100000}});
 assert.deepEqual([result.status,result.reason,result.finish],['stopped','budget_turns',undefined]);
});

test('two clean checks in a row bring a firm request to finish',async()=>{
 const {workspace,renderer}=await setup();
 const provider=new ScriptedProvider([[call('write_file',{path:SCENE_FILE,content:scene(140)})],[call('get_timing')],[call('get_timing')],[call('finish',{summary:'s',selfReview:review})]]);
 const result=await runLoop({provider,workspace,renderer,budget});
 assert.equal(result.finish?.by,'model');
 const pushes=(i:number)=>provider.requests[i].messages.filter(m=>m.role==='user'&&/passed the final gates on \d+ checks in a row/.test(textOf(m.content))).length;
 assert.deepEqual([pushes(1),pushes(2),pushes(3)],[0,1,2]);
});

test('edits are checked automatically in the same turn, and an explicit re-render reuses that result',async()=>{
 const {workspace,renderer}=await setup();
 const provider=new ScriptedProvider([
  [call('write_file',{path:SCENE_FILE,content:scene(1040)})],
  [call('render_stills')], // same source as the automatic check: no second render
  [call('get_timing')],    // no change: no automatic check
 ]);
 const result=await runLoop({provider,workspace,renderer,budget:{maxTurns:3,maxOutputTokensTotal:100000}});
 assert.equal(result.turns,3);
 const afterWrite=provider.requests[1].messages.find(m=>m.role==='user'&&textOf(m.content).startsWith('Automatic check'))!;
 assert.match(textOf(afterWrite.content),/^Automatic check of your changes \(render_stills\):\ntypecheck passed[\s\S]*\[high\] label-out-of-bounds title/);
 assert.equal(renderer.renders,1);
 const autoChecks=(i:number)=>provider.requests[i].messages.filter(m=>m.role==='user'&&textOf(m.content).startsWith('Automatic check')).length;
 assert.equal(autoChecks(2),1); // the explicit render_stills turn did not add another automatic check
});

test('a scene that renders nothing cannot finish, even with no geometry findings',async()=>{
 const {workspace,renderer}=await setup(scene(140).replace('<svg width={width} height={height}>','<svg width={width} height={height} opacity={0}>'));
 const provider=new ScriptedProvider([[call('finish',{summary:'rich animation',selfReview:review})],[call('get_timing')]]);
 const result=await runLoop({provider,workspace,renderer,budget:{maxTurns:2,maxOutputTokensTotal:100000}});
 assert.equal(result.status,'stopped');
 const rejection=textOf(provider.requests[1].messages.filter(m=>m.role==='tool').at(-1)!.content);
 assert.match(rejection,/finish rejected[\s\S]*✗ audit: blank-frame frame \(frames 30, 90\)/);
});

test('calls after an accepted finish in the same reply do not run, so the gated version is what passes',async()=>{
 const {workspace,renderer}=await setup(scene(140));
 const provider=new ScriptedProvider([[call('finish',{summary:'s',selfReview:review}),call('edit_file',{path:SCENE_FILE,old:'y={140}',new:'y={1040}'}),call('get_timing')]]);
 const result=await runLoop({provider,workspace,renderer,budget});
 assert.equal(result.status,'passed');
 assert.equal(await workspace.readScene(),scene(140));
 assert.equal(result.sceneSha256,result.finish?.gates.sourceSha256);
});

test('a revision run opens with the person\'s feedback and asks for edits to the existing file',async()=>{
 const {initialMessage}=await import('../src/prompt');
 const {workspace}=await setup(scene(140));
 const plain=initialMessage(workspace.brief);
 const revised=initialMessage(workspace.brief,{feedback:'  把流程图画大一些 '});
 assert.match(plain,/Begin with get_timing and read_skill/);
 assert.doesNotMatch(plain,/This is a revision/);
 assert.match(revised,/This is a revision[\s\S]*\n\n把流程图画大一些\n\n[\s\S]*with edit_file[\s\S]*do not rewrite the file/);
 assert.doesNotMatch(revised,/Begin with get_timing and read_skill/);
});

test('the workspace keeps the course theme and the first message describes it',async()=>{
 const {initialMessage}=await import('../src/prompt');
 const {builtinThemes}=await import('../../scene-themes/src/index');
 const paper=builtinThemes().get('paper-press')!;
 const dir=path.join(await mkdtemp(path.join(tmpdir(),'scene-agent-theme-')),'run');
 const workspace=await createWorkspace(dir,{brief,cues,skillDir,theme:paper});
 assert.equal(workspace.theme.id,'paper-press');
 assert.equal((await Workspace.open(dir)).theme.id,'paper-press');
 const message=initialMessage(workspace.brief,undefined,workspace.theme);
 assert.match(message,/Course theme: 纸刊 \(paper-press\), a light theme/);
 assert.match(message,/corner radius 8 \(theme.radius\)/);
 assert.match(message,/Every color and font comes from the theme prop/);
 assert.doesNotMatch(message,/#efe7d6/); // colors stay in the prop, not in the text
 // A workspace from before themes was drawn in the default theme.
 const {workspace:old}=await setup();
 await rm(path.join(old.root,'theme.json'));
 assert.equal((await Workspace.open(old.root)).theme.id,'blueprint');
});
