import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkSource} from '../../custom-scenes/src/contract';
import {SourceTypecheckError,typecheckSource} from '../../custom-scenes/src/files';
import {currentKit,usesKit} from '../../custom-scenes/src/kit';
import {createWorkspace,KIT_FILE,WorkspaceError} from '../src/workspace';
import {buildTools,executeTool} from '../src/tools/index';
import {textOf} from '../src/provider/types';

const here=path.dirname(fileURLToPath(import.meta.url));
const skill=(name:string)=>readFile(path.join(here,'../skill',name+'.md'),'utf8');
const PROPS='{frame:number;fps:number;width:number;height:number;timing:{durationInFrames:number;cues:{start:number;end:number}[]};theme:{background:string;surface:string;surface2:string;foreground:string;muted:string;faint:string;rule:string;accent:string;accentSoft:string;secondary:string;positive:string;negative:string;fontDisplay:string;fontBody:string;fontMono:string;radius:number;ruleWidth:number;ruleDash:string;dark:boolean}}';
const brief={schemaVersion:'custom-scene-brief:1',id:'demo',title:'演示',narration:'第一句。第二句。',visualGoal:'g',facts:['f'],materials:['m'],width:1920,height:1080,fps:30,durationInFrames:120};

/** The example scene in skill/kit.md, with its props type spelled out. */
async function docExample(){
 const block=(await skill('kit')).split('## Example')[1].match(/```tsx\n([\s\S]*?)```/)![1];
 return block.replace('SceneProps',PROPS);
}

test('a scene may import the kit, and nothing else beside react and remotion',()=>{
 const scene=(from:string)=>`import React from 'react';import {Box} from '${from}';export default function Scene(){return <svg/>;}`;
 checkSource(scene('./kit'));
 for(const from of ['./kit.tsx','../kit','./other','kit'])assert.throws(()=>checkSource(scene(from)),/disallowed import/);
 assert.throws(()=>checkSource(`import './kit';export default function Scene(){return <svg/>;}`),/disallowed import/);
 assert.equal(usesKit(scene('./kit')),true);
 assert.equal(usesKit(`import React from 'react';export default function Scene(){return <svg/>;}`),false);
});

test('the example in the kit guide passes the contract and the type check with the current kit',async()=>{
 const source=await docExample();
 checkSource(source);
 await typecheckSource(source);
});

test('a scene is type-checked against the kit copy it is given',async()=>{
 const source=await docExample();
 // A kit without Box: the scene no longer compiles against it.
 const kit=(await currentKit()).replace('export function Box(','function Box(');
 await assert.rejects(typecheckSource(source,kit),(e:unknown)=>e instanceof SourceTypecheckError&&/Box/.test(e.message));
 await assert.rejects(typecheckSource(source.replace('title="索引"','title={1}'),undefined),SourceTypecheckError);
});

test('every part the kit exports is documented in the kit guide',async()=>{
 const doc=await skill('kit'),kit=await currentKit();
 const exported=[...kit.matchAll(/^export function (\w+)/gm)].map(m=>m[1]);
 assert.ok(exported.length>=14);
 for(const name of exported)assert.match(doc,new RegExp('`'+name+'[`(]'),`${name} is not in skill/kit.md`);
 assert.match(await skill('index'),/`kit`/);
 assert.match(await skill('scene-contract'),/'\.\/kit'/);
});

test('a run freezes the kit in its workspace: readable, not writable, and kept when the repository kit changes',async()=>{
 const dir=path.join(await mkdtemp(path.join(tmpdir(),'scene-kit-')),'run');
 const workspace=await createWorkspace(dir,{brief,skillDir:path.join(here,'../skill'),kit:'export const frozen=1;\n'});
 assert.equal(workspace.kit,'export const frozen=1;\n');
 assert.equal(await readFile(path.join(workspace.root,KIT_FILE),'utf8'),'export const frozen=1;\n');
 assert.equal(KIT_FILE,'scene/kit.tsx');
 assert.equal((await workspace.resolve(KIT_FILE,'read')).relative,KIT_FILE);
 await assert.rejects(workspace.resolve(KIT_FILE,'write'),WorkspaceError);
 const fresh=await createWorkspace(path.join(path.dirname(dir),'run2'),{brief,skillDir:path.join(here,'../skill')});
 assert.equal(fresh.kit,await currentKit());
});

test('the model finds the kit where the import points: listed and readable as scene/kit.tsx',async()=>{
 const dir=path.join(await mkdtemp(path.join(tmpdir(),'scene-kit-')),'run');
 const workspace=await createWorkspace(dir,{brief,skillDir:path.join(here,'../skill')});
 const capabilities={vision:false,parallelToolCalls:true,contextTokens:128000,maxOutputTokens:8192,promptCache:true,appendOnlyHistory:false};
 const context={workspace,renderer:{render:async()=>{throw Error('no render');},close:async()=>{}},capabilities};
 const tools=buildTools(capabilities);
 const call=async(name:string,args:unknown)=>textOf((await executeTool(tools,{id:'c',name,arguments:args},context as never)).content);
 assert.match(await call('list_files',{}),/scene\/kit\.tsx/);
 assert.match(await call('read_file',{path:'scene/kit.tsx'}),/export function Box/);
 assert.match(await call('write_file',{path:'scene/kit.tsx',content:'x'}),/only scene\/Scene\.tsx is writable|path must be equal to one of the allowed values/);
});

test('advanced kit components compile against the kit contract and render cleanly with audit attributes',async()=>{
 const scene=`import React from 'react';
import {Badge, MetricCard, Terminal, Timeline, CompareCard, QuoteCard, SpeechBubble, win} from './kit';
export default function Scene({frame, theme, timing}: ${PROPS}) {
  const p = win(frame, timing.cues[0].start, 18, timing.cues[0].end);
  return <svg width={1920} height={1080} viewBox="0 0 1920 1080">
    <Badge id="b1" x={200} y={100} text="实测" theme={theme} progress={p}/>
    <MetricCard id="m1" x={400} y={300} w={360} h={200} label="准确率" value={92} suffix="%" delta="+35%" theme={theme} lit progress={p}/>
    <Terminal id="t1" x={1200} y={300} w={600} h={240} lines={['$ npm run dev', 'ready']} highlightLine={1} theme={theme} progress={p}/>
    <Timeline id="tl1" x={260} y={620} length={1400} steps={[{label:'召回'},{label:'重排',note:'核心'}]} activeIndex={1} theme={theme} progress={p}/>
    <CompareCard id="c1" x={960} y={400} w={900} h={360} leftTitle="纯向量" leftItems={['漏关键词']} rightTitle="混合检索" rightItems={['召回更稳']} theme={theme} progress={p}/>
    <QuoteCard id="q1" x={960} y={450} w={900} h={240} lines={['切分比模型更关键']} author="实测结论" theme={theme} progress={p}/>
    <SpeechBubble id="sb1" x={500} y={450} w={480} h={160} speaker="常见误区" lines={['换更大模型就行？']} side="left" tone="negative" theme={theme} progress={p}/>
  </svg>;
}`;
 checkSource(scene);
 await typecheckSource(scene);
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const kit=await import('../../scene-kit/kit');
 const theme={background:'#0b1020',surface:'#141c30',surface2:'#1c2640',foreground:'#f3f6ff',muted:'#94a3b8',faint:'#475569',rule:'#2c3858',accent:'#38bdf8',accentSoft:'rgba(56,189,248,0.16)',secondary:'#f59e0b',positive:'#34d399',negative:'#f87171',fontDisplay:'sans-serif',fontBody:'sans-serif',fontMono:'monospace',radius:12,ruleWidth:2,ruleDash:'6 4',dark:true};
 const html=renderToStaticMarkup(createElement('svg',null,
  createElement(kit.Badge,{id:'b1',x:200,y:100,text:'实测',theme,progress:0.8}),
  createElement(kit.MetricCard,{id:'m1',x:400,y:300,w:360,h:200,label:'准确率',value:92,suffix:'%',delta:'+35%',theme,lit:true,progress:1}),
  createElement(kit.Terminal,{id:'t1',x:1200,y:300,w:600,h:240,lines:['$ npm run dev','ready'],highlightLine:1,theme,progress:0.6}),
  createElement(kit.Timeline,{id:'tl1',x:260,y:620,length:1400,steps:[{label:'召回'},{label:'重排',note:'核心'}],activeIndex:1,theme,progress:1}),
  createElement(kit.CompareCard,{id:'c1',x:960,y:400,w:900,h:360,leftTitle:'纯向量',leftItems:['漏关键词'],rightTitle:'混合检索',rightItems:['召回更稳'],theme,progress:1}),
  createElement(kit.QuoteCard,{id:'q1',x:960,y:450,w:900,h:240,lines:['切分比模型更关键'],author:'实测结论',theme,progress:1}),
  createElement(kit.SpeechBubble,{id:'sb1',x:500,y:450,w:480,h:160,speaker:'常见误区',lines:['换更大模型就行？'],side:'left',tone:'negative',theme,progress:1}),
 ));
 assert.match(html,/data-object/);
 assert.match(html,/data-obstacle/);
 assert.match(html,/data-route/);
 assert.match(html,/92%/);
 assert.match(html,/VS/);
});
