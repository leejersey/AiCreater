import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTools,executeTool} from '../src/tools/index';
import {defaultFrames,summarizeAudit} from '../src/tools/checks';
import type {ToolContext,ToolOutput} from '../src/tools/types';
import type {StillRenderer,StillsResult} from '../src/render/stills';
import {sourceSha256} from '../src/render/stills';
import {createWorkspace,SCENE_FILE} from '../src/workspace';
import {textOf} from '../src/provider/types';

const here=path.dirname(fileURLToPath(import.meta.url));
const example=path.join(here,'../../../examples/custom-scenes/reviewed-rag');
const skillDir=path.join(here,'../skill');
const capabilities={vision:true,parallelToolCalls:true,contextTokens:128000,maxOutputTokens:8192,promptCache:true,appendOnlyHistory:false};
const brief={schemaVersion:'custom-scene-brief:1',id:'demo',title:'演示',narration:'第一句。第二句。',visualGoal:'g',facts:['f'],materials:['m'],width:1920,height:1080,fps:30,durationInFrames:120};
const cues=[{id:'a',text:'第一句。',startFrame:0,endFrame:60},{id:'b',text:'第二句。',startFrame:60,endFrame:120}];
const MINIMAL=`import React from 'react';
export default function Scene({width,height,theme}:{frame:number;fps:number;width:number;height:number;theme:{background:string;foreground:string;muted:string;accent:string;secondary:string}}){
 return <svg width={width} height={height}><text id="title" x={100} y={100} fill={theme.foreground}>标题</text></svg>;
}
`;

class FakeRenderer implements StillRenderer{
 calls:{source:string;frames:number[];outDir:string}[]=[];
 constructor(private readonly issues:(frame:number)=>{kind:string;target:string;detail:string}[]=()=>[]){}
 async render(source:string,frames:number[],outDir:string):Promise<StillsResult>{
  this.calls.push({source,frames,outDir});
  const file=path.join(outDir,'x.png');
  await mkdir(outDir,{recursive:true});await writeFile(file,Buffer.from([0x89,0x50,0x4e,0x47]));
  return{sourceSha256:sourceSha256(source),failures:[],frames:frames.map(frame=>({frame,file,audit:{issues:this.issues(frame),labels:1,movers:0,routes:0,obstacles:0}}))};
 }
 async close(){}
}

async function setup(options:{initialSource?:string;renderer?:StillRenderer;vision?:boolean}={}){
 const dir=path.join(await mkdtemp(path.join(tmpdir(),'scene-agent-')),'run');
 const workspace=await createWorkspace(dir,{brief,cues,skillDir,initialSource:options.initialSource});
 const context:ToolContext={workspace,renderer:options.renderer??new FakeRenderer(),capabilities:{...capabilities,vision:options.vision??true}};
 const tools=buildTools(context.capabilities);
 let n=0;
 const call=(name:string,args:unknown={},parseError?:string)=>executeTool(tools,{id:`c${n++}`,name,arguments:args,...(parseError?{parseError}:{})},context);
 return{dir,workspace,context,tools,call};
}
const out=(o:ToolOutput)=>textOf(o.content);

test('workspace refuses escapes, writes outside Scene.tsx and planted symlinks',async()=>{
 const {dir,call}=await setup();
 for(const p of ['../x','/etc/passwd','brief.json/../../x','scene/../../x']){
  const r=await call('read_file',{path:p});assert.equal(r.isError,true,p);
 }
 assert.match(out(await call('read_file',{path:'node_modules/x'})),/not readable/);
 const w=await call('write_file',{path:'brief.json',content:'{}'});
 assert.equal(w.isError,true); // rejected by the schema enum before reaching the filesystem
 await symlink('/etc/hosts',path.join(dir,'scene/link.txt'));
 assert.match(out(await call('read_file',{path:'scene/link.txt'})),/symlinks are not allowed/);
});

test('write, read and edit Scene.tsx with exact-match semantics',async()=>{
 const {workspace,call}=await setup();
 assert.match(out(await call('edit_file',{path:SCENE_FILE,old:'a',new:'b'})),/does not exist yet/);
 assert.match(out(await call('write_file',{path:SCENE_FILE,content:MINIMAL})),/wrote scene\/Scene\.tsx/);
 assert.match(out(await call('read_file',{path:SCENE_FILE,offset:3,limit:1})),/^scene\/Scene\.tsx \(5 lines\)\n    3   return <svg/);
 assert.match(out(await call('edit_file',{path:SCENE_FILE,old:'nope',new:'x'})),/not found/);
 assert.match(out(await call('edit_file',{path:SCENE_FILE,old:'width',new:'width'})),/matches \d+ times/);
 assert.match(out(await call('edit_file',{path:SCENE_FILE,old:'标题',new:'检索'})),/1 replacement at line 3/);
 assert.match(await workspace.readScene() as string,/检索/);
 assert.equal((await call('write_file',{path:SCENE_FILE,content:'x'.repeat(64001)})).isError,true);
});

test('model mistakes become error results: unknown tool, bad schema, unparseable arguments',async()=>{
 const {call}=await setup();
 assert.match(out(await call('bash',{cmd:'ls'})),/unknown tool "bash"/);
 assert.match(out(await call('read_file',{path:1})),/invalid arguments for read_file: \/path must be string/);
 assert.match(out(await call('read_file',{path:'brief.json',extra:true})),/additionalProperty|must NOT have additional properties/);
 assert.match(out(await call('write_file','{"path":"scene/Scene.tsx","content":"…',' arguments truncated by max_tokens')),/truncated by max_tokens\. Send the arguments again/);
});

test('list_files shows only the workspace surface; skill and timing tools',async()=>{
 const {call}=await setup({initialSource:MINIMAL});
 const listing=out(await call('list_files'));
 assert.match(listing,/brief\.json/);assert.match(listing,/skill\/scene-contract\.md/);assert.match(listing,/scene\/Scene\.tsx/);
 assert.doesNotMatch(listing,/stills/);
 assert.match(out(await call('read_skill',{topic:'scene-contract'})),/# Scene contract/);
 assert.match(out(await call('read_skill',{topic:'nope'})),/Available: index, scene-contract/);
 const timing=out(await call('get_timing'));
 assert.match(timing,/120 frames at 30 fps \(4\.00s\)/);
 assert.match(timing,/- b 60–120 \(2\.0s\): 第二句。/);
});

test('typecheck reports contract violations and compiler errors by Scene.tsx line',async()=>{
 const {call}=await setup({initialSource:MINIMAL});
 assert.equal(out(await call('typecheck')),'typecheck passed');
 await call('write_file',{path:SCENE_FILE,content:MINIMAL.replace("import React from 'react';","import React from 'react';\nimport fs from 'node:fs';")});
 assert.match(out(await call('typecheck')),/contract: custom_scene_source: disallowed import/);
 await call('write_file',{path:SCENE_FILE,content:MINIMAL.replace('x={100}','x={"100" * theme}')});
 const failed=await call('typecheck');
 assert.equal(failed.isError,true);
 assert.match(out(failed),/line 3 TS\d+/);
});

test('the reviewed RAG scene passes typecheck unchanged',async()=>{
 const {call}=await setup({initialSource:await readFile(path.join(example,'Scene.tsx'),'utf8')});
 assert.equal(out(await call('typecheck')),'typecheck passed');
});

test('default frames sample every cue and stay within the cap',()=>{
 assert.deepEqual(defaultFrames(120,cues),[0,30,59,60,90,119]);
 assert.deepEqual(defaultFrames(101,[]),[0,25,50,75,100]);
 const many=Array.from({length:10},(_,i)=>({id:`c${i}`,text:'x',startFrame:i*30,endFrame:i*30+30}));
 const frames=defaultFrames(300,many);
 assert.ok(frames.length<=12&&frames[0]===0&&frames.at(-1)===299);
});

test('render_stills, audit_scene and view_frames work from the last render and refuse stale ones',async()=>{
 const renderer=new FakeRenderer(frame=>frame>=60?[{kind:'label-overlap',target:'caption-a',detail:'Overlaps caption-b (approximate axis-aligned bboxes).'},{kind:'label-route',target:'caption-c',detail:'Intersects route r1'}]:[]);
 const {call}=await setup({initialSource:MINIMAL,renderer});
 assert.match(out(await call('audit_scene')),/call render_stills first/);
 const rendered=out(await call('render_stills'));
 assert.match(rendered,/rendered 6\/6 frames: 0, 30, 59, 60, 90, 119/);
 assert.match(rendered,/2 distinct findings \(1 high\)/);
 assert.match(renderer.calls[0].outDir,/stills\/[0-9a-f]{12}$/);
 const audit=out(await call('audit_scene'));
 assert.match(audit,/1 high \/ 1 medium \/ 0 low/);
 assert.match(audit,/\[high\] label-overlap caption-a — Overlaps caption-b .* \(frames 60, 90, 119\)\n\[medium\] label-route caption-c/);
 const view=await call('view_frames',{frames:[0,60]});
 assert.deepEqual(view.content.map(p=>p.type),['text','image','text','image']);
 assert.match(out(await call('view_frames',{frames:[5]})),/were not rendered/);
 assert.match(out(await call('render_stills',{frames:[500]})),/outside 0\.\.119/);
 await call('edit_file',{path:SCENE_FILE,old:'标题',new:'新'});
 assert.match(out(await call('audit_scene')),/changed since the last render/);
});

test('render failures are reported to the model, not thrown',async()=>{
 const renderer:StillRenderer={render:async()=>{throw Error('Module not found: Error: Can\'t resolve "./missing"');},close:async()=>{}};
 const {call,context}=await setup({initialSource:MINIMAL,renderer});
 const result=await call('render_stills');
 assert.equal(result.isError,true);
 assert.match(out(result),/render failed before any frame: Module not found/);
 assert.equal(context.lastRender,undefined);
});

test('view_frames is only offered to vision models',async()=>{
 const {tools}=await setup({vision:false});
 assert.ok(!tools.some(t=>t.spec.name==='view_frames'));
});

test('audit summary merges identical findings across frames',()=>{
 const issue={kind:'missing-route',target:'mover',detail:'No route r9'};
 const summary=summarizeAudit({sourceSha256:'x',failures:[],frames:[0,10,20].map(frame=>({frame,file:'',audit:{issues:[issue],labels:0,movers:1,routes:0,obstacles:0,...(frame===20?{unsupported:true as const}:{})}}))});
 assert.equal(summary.findings.length,1);
 assert.deepEqual(summary.findings[0].frames,[0,10,20]);
 assert.deepEqual(summary.unsupportedFrames,[20]);
});
