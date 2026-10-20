import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {conceptProject} from '../../video-schema/tests/concept-fixture';
import {parseProject} from '../../video-schema/src/validate';
import {layoutElements} from '../src/layout';
import {SceneGraphics} from '../src/SceneGraphics';
import {PaletteContext,VisualStyleContext,visualStyles,validateVisualStyle,palettes} from '../src/theme';

test('concept has a distinct definition anchor and source-ordered supports in every local style',()=>{
  const project=parseProject(conceptProject()),scene=project.scenes[0],before=structuredClone(project);
  for(const [id,style] of Object.entries(visualStyles)){
    assert.doesNotThrow(()=>validateVisualStyle(project,id));
    const boxes=layoutElements(scene,style.layout),definition=boxes[0];
    assert.ok(definition.width>boxes[1].width);assert.ok(definition.fontSize>boxes[1].fontSize);
    assert.ok(boxes.slice(1).every(b=>b.y>=definition.y+definition.height));
    assert.deepEqual(boxes.map(b=>b.id),scene.elements.map(e=>e.id));
  }
  assert.deepEqual(project,before);
});
test('all concept role counts and maximum labels fit real role-label/padding geometry',()=>{
  for(const style of Object.values(visualStyles))for(let count=1;count<=6;count++)for(let definitionIndex=0;definitionIndex<count;definitionIndex++){
    const scene=parseProject(conceptProject()).scenes[0];
    scene.elements=Array.from({length:count},(_,i)=>({...scene.elements[0],id:`e${i}`,concept_role:i===definitionIndex?'definition':'feature',content:'概'.repeat(40)}));
    const boxes=layoutElements(scene,style.layout);
    assert.equal(boxes.length,count);assert.equal(new Set(boxes.map(b=>b.id)).size,count);
    const anchor=boxes.find(b=>b.id===`e${definitionIndex}`)!;
    assert.ok(boxes.every(b=>b===anchor||b.width<anchor.width));
    for(const [i,b] of boxes.entries()){
      assert.ok(b.x>=80&&b.x+b.width<=1840&&b.y>=140&&b.y+b.height<=910);
      const height=(b.lines.length*b.fontSize+22)*style.typography.lineHeight+style.typography.graphicGap;
      assert.ok(height<=b.height-2*(style.card.padding+style.card.borderWidth),`${count}/${definitionIndex}/${b.id}/${height}`);
      for(const a of boxes.slice(i+1))assert.ok(b.x+b.width<=a.x||a.x+a.width<=b.x||b.y+b.height<=a.y||a.y+a.height<=b.y);
    }
  }
});
test('actual concept renderer labels roles, preserves cue visibility and supports deterministic seek',()=>{
  const project=parseProject(conceptProject()),scene=project.scenes[0];
  const render=(style:typeof visualStyles.legacy,frame:number)=>renderToStaticMarkup(React.createElement(PaletteContext.Provider,{value:palettes.tech_explainer},React.createElement(VisualStyleContext.Provider,{value:style},React.createElement(SceneGraphics,{scene,frame}))));
  const white=render(visualStyles.whiteboard,60),minimal=render(visualStyles.minimal,60);
  for(const label of ['定义','特征','例证','总结'])assert.ok(white.includes(label));
  assert.match(white,/data-concept-role="definition"/);assert.notEqual(white,minimal);
  assert.equal(render(visualStyles.whiteboard,16),render(visualStyles.whiteboard,16));
  const early=render(visualStyles.legacy,6);assert.equal((early.match(/opacity:0;/g)??[]).length,4);
  assert.match(render(visualStyles.minimal,13),/data-concept-role="definition"/);
});
