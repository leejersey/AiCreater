import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ContextScene from '../../../examples/custom-scenes/generated-context/Scene';
import LoopScene from '../../../examples/custom-scenes/generated-loop/Scene';
import LoopV2Scene from '../../../examples/custom-scenes/generated-loop-v2/Scene';
import {parseDesign,reviewFrames} from '../src/design';
import {checkSource,sceneTheme,parseArtifact,sourceHash} from '../src/contract';

for(const [name,Scene] of [['context',ContextScene],['loop',LoopScene],['loop-v2',LoopV2Scene]] as const){
 test(`retained generated ${name} scene is seek-safe across measured cue boundaries`,()=>{
  const design=parseDesign(JSON.parse(readFileSync(new URL(`../../../examples/custom-scenes/generated-${name}/design.json`,import.meta.url),'utf8')));
  checkSource(readFileSync(new URL(`../../../examples/custom-scenes/generated-${name}/Scene.tsx`,import.meta.url),'utf8'));
  const render=(frame:number)=>renderToStaticMarkup(React.createElement(Scene,{frame,fps:30,width:1920,height:1080,theme:sceneTheme}));
  const frames=reviewFrames(design);for(const frame of [...frames].reverse()){assert.equal(render(frame),render(frame));assert.doesNotMatch(render(frame),/NaN|Infinity/);}
  assert.notEqual(render(0),render(design.brief.durationInFrames-1));
 });
}
test('generated examples appear alongside the unchanged manual reference in Studio',()=>{
 const source=readFileSync(new URL('../../../apps/renderer/src/custom-lab.tsx',import.meta.url),'utf8');
 assert.match(source,/id="GeneratedContext"/);assert.match(source,/id="GeneratedLoop"/);assert.match(source,/id="CustomWallet"/);
 assert.match(source,/id="GeneratedLoopV2"/);
});
test('new-topic validation preview retains the exact unmodified model source',()=>{
 const root=new URL('../../../examples/custom-scenes/generated-loop-v2/',import.meta.url);
 const design=parseDesign(JSON.parse(readFileSync(new URL('design.json',root),'utf8')));
 const source=readFileSync(new URL('Scene.tsx',root),'utf8');
 const provenance=JSON.parse(readFileSync(new URL('provenance.json',root),'utf8'));
 const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'hash check',source});
 assert.equal(sourceHash(artifact),provenance.sourceSha256);assert.deepEqual(provenance.manualRepairs,[]);
});
