import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBrief, checkSource} from '../src/contract';
import {parseCues} from '../src/cues';

const brief = {schemaVersion:'custom-scene-brief:1',id:'wallet',title:'上下文预算',narration:'只保留当前需要的信息。',visualGoal:'信息装入钱包并筛除无关内容。',facts:['容量有限，不指定容量数字'],materials:[],width:1920,height:1080,fps:30,durationInFrames:540};
const source = 'import React from "react"; export default function Scene({frame}:{frame:number}) {return <svg><text>{frame}</text></svg>;}';

test('brief has bounded duration and no executable or unknown fields',()=>{
  assert.equal(parseBrief(brief).narration,brief.narration);
  for(const change of [{durationInFrames:0},{fps:60},{id:'../wallet'},{narration:''},{script:'bad'}]) assert.throws(()=>parseBrief({...brief,...change}),/custom_scene/);
});
test('a standalone frame-driven TSX scene passes the source guardrails',()=>{
  assert.doesNotThrow(()=>checkSource(source));
  assert.throws(()=>checkSource('import React from "react"; function Scene(){return null}'),/export default function Scene/);
});
test('source guardrails reject outside modules, network, media, timers and malformed TSX',()=>{
  for(const code of [
    'import fs from "node:fs"; export default function S(){return null}',
    'import "./secret"; export default function S(){return null}',
    'export default function S(){fetch("https://example.com");return null}',
    'export default function S(){return <iframe src="https://example.com"/>}',
    'export default function S(){return <img src="x"/>}',
    'export default function S(){setTimeout(()=>{},2);return null}',
    'export default function S(){return <div onClick={()=>{}}/>}',
    'export default function S(){return <div>',
    'export default function S(){return import("node:fs")}',
  ]) assert.throws(()=>checkSource(code),/custom_scene_source/);
});
test('self-contained SVG paint references are allowed but external resources are not',()=>{
  assert.doesNotThrow(()=>checkSource('export default function Scene(){return <svg><defs><pattern id="grid"/></defs><rect fill="url(#grid)"/></svg>}'));
  assert.throws(()=>checkSource('export default function Scene(){return <svg><rect fill="url(https://example.com/a.svg)"/></svg>}'),/external resource/);
});
test('only the literal standard SVG namespace on an SVG element is exempt from URL checks',()=>{
  assert.doesNotThrow(()=>checkSource('export default function Scene(){return <svg xmlns="http://www.w3.org/2000/svg"/>}'));
  for(const code of [
    'export default function Scene(){return <svg xmlns="https://example.com/svg"/>}',
    'export default function Scene(){return <div xmlns="http://www.w3.org/2000/svg"/>}',
    'export default function Scene(){return <svg href="http://www.w3.org/2000/svg"/>}',
    'export default function Scene(){const address="http://www.w3.org/2000/svg";return <svg/>}',
  ])assert.throws(()=>checkSource(code),/external resource/);
});
test('cues cover the narration in order without gaps in text or overlaps in time',()=>{
  const b=parseBrief(brief);
  const cues=[{id:'cue-1',text:'只保留',startFrame:0,endFrame:100},{id:'cue-2',text:'当前需要的信息。',startFrame:100,endFrame:540}];
  assert.deepEqual(parseCues(cues,b),cues);
  for(const bad of [[cues[0]],[cues[1],cues[0]],[{...cues[0],endFrame:120},cues[1]],[cues[0],{...cues[1],id:'cue-1'}],[{...cues[0],extra:1},cues[1]]])
    assert.throws(()=>parseCues(bad,b),/cues:/);
});

test('literal colors and fonts are found wherever they are written, theme reads are not',async()=>{
 const {literalStyles}=await import('../src/contract');
 const source=`import React from 'react';
const BAD='#ef5350';const FONT="'Noto Sans SC', sans-serif";
export default function Scene({theme}:any){
 return <svg><rect fill={theme.accent} stroke="none"/><rect fill="url(#g)"/>
  <text fill="#ffffff" fontFamily={FONT}>a</text><text style={{fontFamily:'system-ui',color:'rgba(0,0,0,0.5)'}}>b</text>
  <circle fill={BAD} stroke="white"/><text fontFamily="sans-serif" fill="currentColor">c</text><g id="internal-knowledge"/></svg>;
}`;
 const found=literalStyles(source).map(f=>`${f.kind}:${f.text}`);
 assert.deepEqual(found.sort(),['color:#ef5350','color:#ffffff','color:rgba(0,0,0,0.5)','color:white',"font:'Noto Sans SC', sans-serif",'font:sans-serif','font:system-ui'].sort());
 assert.deepEqual(literalStyles(`export default function Scene({theme}:any){return <svg><text fill={theme.foreground} fontFamily={theme.fontBody}>a</text></svg>;}`),[]);
});
