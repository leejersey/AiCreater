import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {getVisualStyle,validateVisualStyle,VisualStyleContext,visualStyles} from '../src/theme';
import {SceneGraphics} from '../src/SceneGraphics';
import {demonstrationFor,demonstrationTextBoxes} from '../src/demonstrations';
import {interactiveExamples} from './interactive-fixture';import {annotatedFunnel} from './annotated-funnel-fixture';
import {parseProject} from '../../video-schema/src/validate';import {validProject} from '../../video-schema/tests/fixture';
const scenes=()=>[annotatedFunnel(),...interactiveExamples()];
const html=(scene:ReturnType<typeof scenes>[number],style:ReturnType<typeof getVisualStyle>)=>renderToStaticMarkup(React.createElement(VisualStyleContext.Provider,{value:style},React.createElement(SceneGraphics,{scene,frame:350})));
test('mechanism mode is opt-in; frozen ID not an editable label selects its execution contract',()=>{
 const style=getVisualStyle('mechanism');assert.equal(style.presentation,'mechanism');assert.equal(validateVisualStyle(undefined,undefined,{id:'mechanism',tokens:visualStyles.mechanism}).presentation,'mechanism');
 const disguised={...visualStyles.whiteboard,label:visualStyles.mechanism.label};assert.equal(validateVisualStyle(undefined,'whiteboard',{id:'whiteboard',tokens:disguised}).presentation,undefined);
 assert.throws(()=>validateVisualStyle(undefined,'mechanism',{id:'paper_slide',tokens:visualStyles.paper_slide}),/mismatch/);
 const renamed={id:'whiteboard' as const,tokens:{...visualStyles.whiteboard,label:'机制演示'}};
 assert.equal(validateVisualStyle(undefined,undefined,renamed).presentation,undefined);
 assert.throws(()=>validateVisualStyle(undefined,undefined,{id:'mechanism',tokens:{...visualStyles.mechanism,presentation:'mechanism'}}),/visual_style/i);
});
test('all three mechanisms use the real SceneGraphics route only when selected',()=>{
 for(const [i,s] of scenes().entries()){
  const before=structuredClone(s),mode=getVisualStyle('mechanism'),marker=['data-funnel-demonstration','data-dialogue-demonstration','data-process-demonstration'][i];
  assert.ok(demonstrationFor(s,mode));assert.match(html(s,mode),new RegExp(marker));
  for(const old of ['legacy','paper_slide','whiteboard','minimal']){const style=getVisualStyle(old);assert.equal(demonstrationFor(s,style),undefined);assert.doesNotMatch(html(s,style),new RegExp(marker));}
  assert.deepEqual(s,before);
 }
});
test('unbound templates keep their normal renderer and no data is rewritten',()=>{
 const s=parseProject(validProject()).scenes[0];assert.equal(demonstrationFor(s,getVisualStyle('mechanism')),undefined);assert.equal(demonstrationTextBoxes(s,getVisualStyle('mechanism')),undefined);assert.doesNotMatch(html(s,getVisualStyle('mechanism')),/data-(?:funnel|dialogue|process)-demonstration/);
});
test('real preflight sees all frame-dependent text including updated values and notes',()=>{
 for(const s of scenes()){const boxes=demonstrationTextBoxes(s,getVisualStyle('mechanism'))!;assert.ok(boxes.length>s.elements.length);for(const b of boxes)assert.ok(b.lines.length*b.fontSize*1.35<=b.height,`${s.id}/${b.id}`);}
});
