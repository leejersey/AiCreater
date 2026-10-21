import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {interactiveExamples} from './interactive-fixture';
import {DialogueDemonstration,dialogueFrame} from '../src/DialogueDemonstration';
import {TeachingDiagram,diagramBoxes} from '../src/TeachingDiagrams';
import {diagramErrors} from '../../video-schema/src/diagrams';
import {graphicsText,graphicsPatch,readGraphics} from '../../../apps/web/lib/graphics-editor';
const scene=()=>structuredClone(interactiveExamples()[0]);
test('explicit no-context labels the first input current; old scenes retain their historical label',()=>{
 const s=scene(),html=()=>renderToStaticMarkup(React.createElement(DialogueDemonstration,{scene:s,frame:350}));
 assert.match(html(),/前文片段/);s.dialogue!.context_messages=[];assert.match(html(),/当前片段/);assert.doesNotMatch(html(),/前文片段/);
 const first=dialogueFrame(s,350).messages[0];assert.ok(first);assert.equal(diagramErrors(s).length,0);
 const normal=renderToStaticMarkup(React.createElement(TeachingDiagram,{scene:s,frame:350}));assert.match(normal,/当前消息/);
 const result=s.visual_actions!.find(a=>a.kind==='update')!.source;assert.ok(!diagramBoxes(s)!.some(b=>b.id===result));
});
test('context IDs cannot point at state, result, unknown or all remaining evidence',()=>{
 const s=scene(),messages=dialogueFrame(s,350).messages.map(m=>m.id),result=s.visual_actions!.find(a=>a.kind==='update')!.source!;
 for(const contexts of [[s.dialogue!.state],[result],['missing'],[...messages]]){s.dialogue!.context_messages=contexts;assert.ok(diagramErrors(s).length);}
 s.dialogue!.context_messages=[];s.visual_actions!.push({kind:'connect',target:result,to:s.dialogue!.state,cue:s.elements.find(e=>e.id===result)!.cue,start_frame:300,duration_frames:12});assert.ok(diagramErrors(s).length);
});
test('new context role survives existing graphics drafts; malformed arrays rejected',()=>{
 const s=scene();s.dialogue!.context_messages=[];const patch=graphicsPatch(s,graphicsText(s));assert.deepEqual(patch.dialogue!.context_messages,[]);
 assert.throws(()=>readGraphics(JSON.stringify({dialogue:{messages:['e0'],state:'e1',context_messages:'e0'}})));
});
