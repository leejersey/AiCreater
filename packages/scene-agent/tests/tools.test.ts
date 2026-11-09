import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTools,executeTool} from '../src/tools/index';
import {finishTool} from '../src/tools/finish';
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
export default function Scene({width,height,theme,timing}:{frame:number;fps:number;width:number;height:number;timing:{durationInFrames:number;cues:{start:number;end:number}[]};theme:{background:string;foreground:string;muted:string;accent:string;secondary:string}}){
 return <svg width={width} height={height}><text id="title" x={100} y={100} fill={theme.foreground} opacity={timing.cues.length?1:0}>标题</text></svg>;
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
 assert.match(out(await call('read_skill',{topic:'nope'})),/Available: craft, examples, index, kit, motion, patterns, scene-contract, visual-review/);
 const timing=out(await call('get_timing'));
 assert.match(timing,/120 frames at 30 fps \(4\.00s\)/);
 assert.match(timing,/- timing\.cues\[1\] \(b\) 60–120 \(2\.0s\): 第二句。/);
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
 assert.match(rendered,/^typecheck passed\nrendered 6\/6 frames: 0, 30, 59, 60, 90, 119\naudit of frames .*: 1 high \/ 1 medium \/ 0 low/);
 assert.match(rendered,/\[high\] label-overlap caption-a/); // the audit comes with the render, no extra turn
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

test('render_stills stops at a typecheck failure without rendering',async()=>{
 const renderer=new FakeRenderer();
 const {call}=await setup({initialSource:MINIMAL.replace('x={100}','x={"100" * theme}'),renderer});
 const result=await call('render_stills');
 assert.equal(result.isError,true);
 assert.match(out(result),/^typecheck failed/);
 assert.equal(renderer.calls.length,0);
});

test('overlaps that only happen at cue changes carry a transition hint',async()=>{
 // cue a ends at 60 and cue b starts at 60; frames 59 and 60 straddle the hand-over, 119 does not.
 const renderer=new FakeRenderer(frame=>frame===59||frame===60?[{kind:'label-overlap',target:'old-label',detail:'Overlaps new-label'}]:frame===119?[{kind:'label-overlap',target:'end-a',detail:'Overlaps end-b'}]:[]);
 const {call}=await setup({initialSource:MINIMAL,renderer});
 const report=out(await call('render_stills'));
 assert.match(report,/old-label — Overlaps new-label \(frames 59, 60\) \[at a cue change\]/);
 assert.match(report,/end-a — Overlaps end-b \(frames 119\)$/m);
 assert.match(report,/hint: .*fade the old element fully out before the new one fades in/);
});

test('edit_file accepts a unique match that differs only in indentation and re-indents the new text',async()=>{
 const source='function A(){\n  return (\n          <g>\n            <rect x="1" />\n          </g>\n  );\n}\n';
 const {workspace,call}=await setup({initialSource:source});
 const r=await call('edit_file',{path:SCENE_FILE,old:'            <g>\n              <rect x="1" />',new:'            <g id="box">\n              <rect x="2" />'});
 assert.match(out(r),/line 3 \(matched ignoring indentation\)/);
 assert.equal(await workspace.readScene(),'function A(){\n  return (\n          <g id="box">\n            <rect x="2" />\n          </g>\n  );\n}\n');
});

test('edit_file failures show the closest exact text with line numbers',async()=>{
 const {call}=await setup({initialSource:MINIMAL});
 const r=await call('edit_file',{path:SCENE_FILE,old:' return <svg width={width} height={height}><text id="title" x={999}',new:'x'});
 assert.equal(r.isError,true);
 assert.match(out(r),/Closest text in the file[\s\S]*    3   return <svg width=\{width\} height=\{height\}><text id="title" x=\{100\}/);
 assert.match(out(await call('edit_file',{path:SCENE_FILE,old:'something that is not there at all',new:'x'})),/No similar line found/);
});

test('a clean full-sample render is kept as a checkpoint and tells the model to finish',async()=>{
 const {workspace,call,context}=await setup({initialSource:MINIMAL,vision:false});
 const partial=out(await call('render_stills',{frames:[0]}));
 assert.match(partial,/without frames to check the full sample/);
 assert.equal(context.cleanCheckpoint,undefined);
 const full=out(await call('render_stills'));
 assert.match(full,/passes the final gates\. If every cue has its visual, call finish now/);
 assert.equal(await readFile(context.cleanCheckpoint!.file,'utf8'),MINIMAL);
 assert.ok(context.cleanCheckpoint!.file.startsWith(path.join(workspace.root,'checkpoints')));
});

test('unnamed elements in findings come with an id hint',async()=>{
 const renderer=new FakeRenderer(()=>[{kind:'label-overlap',target:'text[12]',detail:'Overlaps text[13]'}]);
 const {call}=await setup({initialSource:MINIMAL,renderer});
 assert.match(out(await call('render_stills')),/hint: names like text\[12\] are elements without an id/);
});

test('label findings carry the measured text and position, and how far a label is out of bounds',async()=>{
 const boxes={'text[5]':{x:300,y:960,width:220,height:40,text:'BM25 稀疏检索'},'text[7]':{x:400,y:950,width:180,height:40,text:'稠密检索'}};
 const renderer:StillRenderer={async render(source,frames,outDir){
  await mkdir(outDir,{recursive:true});const file=path.join(outDir,'f.png');await writeFile(file,'x');
  return{sourceSha256:sourceSha256(source),failures:[],frames:frames.map(frame=>({frame,file,ink:0.05,audit:{labelBoxes:boxes,labels:2,movers:0,routes:0,obstacles:0,issues:[
   {kind:'label-overlap',target:'text[5]',detail:'Overlaps text[7] (approximate axis-aligned bboxes).'},
   {kind:'label-out-of-bounds',target:'text[5]',detail:'Label exceeds 0..1920 x 0..980 caption-safe area (approximate root-coordinate bbox).'}]}}))};
 },async close(){}};
 const {call}=await setup({initialSource:MINIMAL,renderer});
 const report=out(await call('render_stills'));
 assert.match(report,/label-overlap text\[5\][^\n]*\n    measured at frame 0: text\[5\] "BM25 稀疏检索" at x 300–520, y 960–1000; text\[7\] "稠密检索" at x 400–580, y 950–990/);
 assert.match(report,/label-out-of-bounds text\[5\][^\n]*\n    measured at frame 0: text\[5\] "BM25 稀疏检索" at x 300–520, y 960–1000; out bottom by 20px \(the caption band starts at y 980\)/);
});

test('when every frame fails the report says the audit is unavailable, not clean',async()=>{
 const renderer:StillRenderer={async render(source,frames){return{sourceSha256:sourceSha256(source),frames:[],failures:frames.map(frame=>({frame,error:'inputRange must be strictly monotonically increasing'}))};},async close(){}};
 const {call,context}=await setup({initialSource:MINIMAL,renderer});
 const result=await call('render_stills');
 assert.equal(result.isError,true);
 assert.match(out(result),/audit: not available, no frame rendered/);
 assert.doesNotMatch(out(result),/0 high|no geometry findings|passes the final gates/);
 assert.equal(context.cleanCheckpoint,undefined);
});

test('a model that can see must view the final version before finish; one that cannot is not asked to',async()=>{
 const review={summary:'done',selfReview:[{item:'x',pass:true,evidence:'y'}]};
 const finish=finishTool(()=>{});
 const seeing=await setup({initialSource:MINIMAL});
 assert.match(out(await seeing.call('render_stills')),/look at it with view_frames/);
 assert.match(out(await finish.run(review,seeing.context)),/finish rejected: look at the frames of this version/);
 await seeing.call('view_frames');
 assert.match(out(await finish.run(review,seeing.context)),/finish accepted/);
 const blind=await setup({initialSource:MINIMAL,vision:false});
 assert.match(out(await blind.call('render_stills')),/call finish now/);
 assert.match(out(await finish.run(review,blind.context)),/finish accepted/);
});

test('a gate-clean version with empty-area findings is kept but the model is asked to fill the frame first',async()=>{
 class SparseRenderer extends FakeRenderer{
  async render(source:string,frames:number[],outDir:string){
   const result=await super.render(source,frames,outDir);
   return{...result,frames:result.frames.map(f=>({...f,ink:0.05,space:{rows:[300,980] as [number,number],cols:[0,100] as [number,number]}}))};
  }
 }
 const {call,context}=await setup({initialSource:MINIMAL,renderer:new SparseRenderer(),vision:false});
 const report=out(await call('render_stills'));
 assert.match(report,/\[medium\] empty-area/);
 assert.match(report,/nothing drawn in y 300–980 \(69% of the height\)/);
 assert.match(report,/passes the final gates and is kept\. Fix these medium findings before finishing: The empty-area finding/);
 assert.ok(context.cleanCheckpoint); // still a fallback: empty space never blocks the gates
});

test('colors and fonts written into the scene are reported, and asked to be fixed before finishing',async()=>{
 const source=`import React from 'react';
export default function Scene({width,height,theme,timing}:{frame:number;fps:number;width:number;height:number;timing:{durationInFrames:number;cues:{start:number;end:number}[]};theme:{foreground:string}}){
 return <svg width={width} height={height}><text id="t" x={100} y={100} fill="#ffffff" fontFamily="sans-serif" opacity={timing.cues.length?1:0}>a</text><rect id="r" x={0} y={200} width={10} height={10} fill={theme.foreground}/></svg>;
}`;
 const {call,context}=await setup({initialSource:source,vision:false});
 const report=out(await call('render_stills'));
 assert.match(report,/\[medium\] literal-style — 2 color\/font values are written into the scene/);
 assert.match(report,/#ffffff \(line 3\), sans-serif \(line 3\)/);
 assert.match(report,/Fix these medium findings before finishing: The literal-style finding/);
 assert.ok(context.cleanCheckpoint); // a style finding never blocks the gates
});
