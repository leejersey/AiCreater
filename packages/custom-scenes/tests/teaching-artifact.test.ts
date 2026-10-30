import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {freezeTeachingScene,validateTeachingArtifact} from '../src/teaching-artifact';
import {TeachingScene} from '../src/teaching-scene';
import {teachingBrief as brief,teachingCues as cues,teachingExample} from './fixtures/teaching-examples';
import {designInputHash} from '../src/design-content';
import {expectedTeachingForeground,checkTeachingForeground,teachingNumericAttributeMatches,teachingPaintMatches,expectedTeachingSolids,checkTeachingSolids,teachingAncestorsVisible,teachingTitleLineMatches} from '../src/teaching-scene-audit';

test('visibility includes all ancestors rather than only the child computed opacity',()=>{
 const visible={display:'block',visibility:'visible',opacity:'1'};
 assert.equal(teachingAncestorsVisible([visible,visible]),true);
 for(const hidden of [{...visible,opacity:'0'},{...visible,display:'none'},{...visible,visibility:'hidden'},{...visible,opacity:'NaN'}])assert.equal(teachingAncestorsVisible([visible,hidden]),false);
 assert.equal(teachingAncestorsVisible([{...visible,opacity:'.96'},{...visible,opacity:'.96'}]),false);
});

test('actual paint and numeric geometry cannot disappear through CSS or nonfinite attributes',()=>{
 for(const value of [null,'',' ','NaN','Infinity','invalid'])assert.equal(teachingNumericAttributeMatches(value,0),false);
 assert.equal(teachingNumericAttributeMatches('2',2),true);
 assert.equal(teachingPaintMatches('#44ccff','rgb(68, 204, 255)','1'),true);
 for(const paint of ['none','transparent','rgba(68, 204, 255, 0)'])assert.equal(teachingPaintMatches('#44ccff',paint,'1'),false);
 assert.equal(teachingPaintMatches('#44ccff','rgb(68, 204, 255)','0'),false);
});
test('solid coverage is one-to-one, not only the total number of rectangles',async()=>{
 const artifact=await freezeTeachingScene(teachingExample('flow'),brief,cues),expected=expectedTeachingSolids(artifact);
 assert.ok(expected.length>1);assert.deepEqual(checkTeachingSolids(expected,expected),[]);
 assert.ok(checkTeachingSolids(expected,[expected[0],expected[0],...expected.slice(2)]).length);
 assert.ok(checkTeachingSolids(expected,expected.map((s,i)=>i? s:{...s,bbox:{...s.bbox,x:NaN}})).length);
});

test('frozen scene binds theme, fonts, runtime, cue track and compiled assets, not a success claim',async()=>{
 const artifact=await freezeTeachingScene(teachingExample('loop'),brief,cues);
 assert.equal(artifact.eligibility,'local-preview-only');assert.equal(artifact.accepted,false);
 assert.match(artifact.artifactSha256,/^[a-f0-9]{64}$/);
 assert.ok(artifact.binding.fonts.length>1);assert.ok(artifact.binding.runtime.length>=4);
 assert.deepEqual(await validateTeachingArtifact(JSON.parse(JSON.stringify(artifact)),artifact.artifactSha256),artifact);
 assert.ok(Object.isFrozen(artifact.compiled.objects));
});
test('unbound fallback glyphs in titles are rejected instead of using system emoji fonts',async()=>{
 const input={...brief,title:'Launch \ud83d\ude80'},plan=teachingExample('flow');plan.inputSha256=designInputHash(input,cues);
 await assert.rejects(freezeTeachingScene(plan,input,cues),/unbound.*glyph/i);
});

test('the maximum supported Chinese title wraps in a frozen header without dropping any text',async()=>{
 const input={...brief,title:'知识'.repeat(40)},plan=teachingExample('flow');plan.inputSha256=designInputHash(input,cues);
 const artifact=await freezeTeachingScene(plan,input,cues);
 assert.ok(artifact.titleLayout,'Title layout must be compiled by the host');
 assert.equal(artifact.titleLayout.lines.join(''),input.title);assert.equal(artifact.titleLayout.lines.length,2);
 assert.ok(artifact.titleLayout.size>=24);assert.ok(artifact.titleLayout.lines.length*artifact.titleLayout.lineHeight<=artifact.titleLayout.box.height);
 const layout=artifact.titleLayout,matrix={a:1,b:0,c:0,d:1,e:0,f:0};
 assert.equal(teachingTitleLineMatches(layout,1,String(layout.box.x),String(layout.box.y+layout.baselineOffset+layout.lineHeight),matrix),true);
 assert.equal(teachingTitleLineMatches(layout,1,String(layout.box.x),String(layout.box.y+layout.baselineOffset),matrix),false);
 assert.equal(teachingTitleLineMatches(layout,1,String(layout.box.x),String(layout.box.y+layout.baselineOffset+layout.lineHeight),{...matrix,f:48}),false);
 const html=renderToStaticMarkup(React.createElement(TeachingScene,{artifact,frame:0}));
 assert.equal((html.match(/data-title-line=/g)??[]).length,2);
 await validateTeachingArtifact(artifact,artifact.artifactSha256);
});
test('foreground coverage rejects missing, duplicate or unrelated paint nodes',async()=>{
 const a=await freezeTeachingScene(teachingExample('flow'),brief,cues),expected=expectedTeachingForeground(a,6);
 const actual=expected.map(e=>({id:e.id,owner:e.owner,tag:e.node.tag}));
 assert.deepEqual(checkTeachingForeground(expected,actual),[]);
 assert.ok(checkTeachingForeground(expected,[]).length);
 assert.ok(checkTeachingForeground(expected,actual.slice(1)).length);
 assert.ok(checkTeachingForeground(expected,[...actual,actual[0]]).length);
 assert.ok(checkTeachingForeground(expected,[{...actual[0],owner:'wrong'},...actual.slice(1)]).length);
});

test('tampered coordinates, labels, media bindings and acceptance cannot cross the artifact boundary',async()=>{
 const artifact=await freezeTeachingScene(teachingExample('composition'),brief,cues);
 for(const mutate of [
  (a:any)=>{a.compiled.objects[0].initial.x++;},
  (a:any)=>{a.compiled.objects[0].asset.text.lines[0]='changed';},
  (a:any)=>{a.titleLayout.lines[0]='changed';},
  (a:any)=>{a.binding.fonts[0].sha256='0'.repeat(64);},
  (a:any)=>{a.binding.runtime[0].sha256='0'.repeat(64);},
  (a:any)=>{a.accepted=true;},(a:any)=>{a.extra='unknown';},
 ]){const copy=JSON.parse(JSON.stringify(artifact));mutate(copy);await assert.rejects(validateTeachingArtifact(copy,artifact.artifactSha256),/teaching_artifact/);}
 await assert.rejects(validateTeachingArtifact(artifact,'0'.repeat(64)),/binding/);
});

test('the actual renderer exposes every owner, solid and active route exactly once for DOM auditing',async()=>{
 const artifact=await freezeTeachingScene(teachingExample('loop'),brief,cues);
 for(const frame of [0,6,20,29,30,53,90,119]){
  const html=renderToStaticMarkup(React.createElement(TeachingScene,{artifact,frame}));
  const ids=[...html.matchAll(/data-teaching-object="([^"]+)"/g)].map(m=>m[1]).sort();
  assert.deepEqual(ids,artifact.compiled.objects.map(o=>o.id).sort());
  const active=artifact.compiled.transports.filter(t=>frame>=t.startFrame&&frame<t.endFrame);
  assert.equal((html.match(/data-follow-path=/g)??[]).length,active.length);
  assert.equal((html.match(/data-route="true"/g)??[]).length,active.length);
  assert.ok(html.includes('data-solid-owner='));assert.ok(!html.includes('visual acceptance pending'));
 }
});

test('all state-specific labels and compact cargo retain their exact text in the real drawing',async()=>{
 const plan=teachingExample('filter');plan.objects.forEach((o,i)=>{o.label='\u5bf9\u8c61'+i;});
 const artifact=await freezeTeachingScene(plan,brief,cues);
 const html=renderToStaticMarkup(React.createElement(TeachingScene,{artifact,frame:119}));
 for(const o of plan.objects)assert.ok(html.includes(o.label));
 assert.equal((html.match(/data-teaching-object="paper"/g)??[]).length,1);
 assert.match(html,/data-residence="keep"/);
 assert.throws(()=>renderToStaticMarkup(React.createElement(TeachingScene,{artifact,frame:120})),/invalid frame/);
});
