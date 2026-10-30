import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Scene from '../../../examples/custom-scenes/generated-context/Scene';
import {sceneTheme,parseBrief,parseArtifact,sourceHash} from '../src/contract';
import {buildDesignPrompt,buildScenePrompt,parseDesign,designHash,reviewScene} from '../src/design';
import {readFileSync} from 'node:fs';

const design=()=>parseDesign(JSON.parse(readFileSync(new URL('../../../examples/custom-scenes/generated-context/design.json',import.meta.url),'utf8')));
const render=(frame:number)=>renderToStaticMarkup(React.createElement(Scene,{frame,fps:30,width:1920,height:1080,theme:sceneTheme}));
test('wallet is recognisable on the first frame and papers sit behind its foreground pocket',()=>{
 const first=render(0);assert.match(first,/data-wallet="body"/);assert.match(first,/data-wallet="clasp"/);
 const last=render(772);assert.ok(last.indexOf('data-paper="code"')<last.indexOf('data-wallet="body"'));
 assert.match(last,/data-paper="code" data-location="wallet"/);assert.match(last,/data-paper="task" data-location="wallet"/);
 for(const id of ['noise-a','noise-b','extra'])assert.match(last,new RegExp(`data-paper="${id}" data-location="removed"`));
 assert.doesNotMatch(last,/CAPACITY|capTicks|入口有闸/);
});
test('measured narration keeps the crowded state before selection and settles before the tail pause',()=>{
 assert.match(render(500),/data-capacity="blocked"/);
 assert.match(render(620),/data-filter="active"/);
 assert.match(render(742),/data-stage="filtered"/);
 assert.match(render(742),/data-filter="idle"/);
});
test('generation prompts carry object recognition, occlusion and first/middle/final review rules',()=>{
 const d=design();
 for(const prompt of [buildDesignPrompt(d.brief,d.cues),buildScenePrompt(d)]){
  assert.match(prompt,/occlusion/i);assert.match(prompt,/first frame/i);assert.match(prompt,/silhouette/i);
 }
 assert.match(buildScenePrompt(d),/data-follow-path/);assert.match(buildScenePrompt(d),/data-obstacle/);
 assert.doesNotMatch(buildDesignPrompt(d.brief,d.cues),/Mark node silhouettes with data-obstacle/);
});
test('a visual pass needs actual opening, middle and final frame observations',()=>{
 const d=design(),brief=parseBrief(d.brief);
 const a=parseArtifact({schemaVersion:'custom-scene:1',brief,rationale:'quality review',source:'export default function Scene(){return <svg/>}'});
 const r={schemaVersion:'visual-review:1',sha256:sourceHash(a),designSha256:designHash(d),verdict:'pass',evidence:[{frame:0,observation:'钱包可识别'}],feedback:'关系清楚'};
 assert.throws(()=>reviewScene(r,a,d),/opening_middle_final/);
 assert.doesNotThrow(()=>reviewScene({...r,evidence:[...r.evidence,{frame:400,observation:'文件在口袋之后'},{frame:772,observation:'无关信息在袋外'}]},a,d));
});
