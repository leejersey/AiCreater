import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as motifs from '../src/motifs';
import {SceneGraphics} from '../src/SceneGraphics';
import {intentVisualBaseline} from './intent-visual-fixture';
import {VisualStyleContext,visualStyles} from '../src/theme';
const make=()=>{const s=intentVisualBaseline().scenes[0];s.visual_actions=[{kind:'highlight' as const,target:'e1',cue:{...s.elements[1].cue},start_frame:200,duration_frames:12}];return s;};
test('semantic funnel has real contiguous trapezoid layers and bounded short/40-codepoint labels',()=>{
 assert.equal(typeof (motifs as any).funnelLayers,'function');
 for(const n of [2,3])for(const text of ['规则','长'.repeat(40),'🙂'.repeat(40)]){
  const s=make();s.elements=s.elements.slice(0,n).map(e=>({...e,content:text}));
  const layers=(motifs as any).funnelLayers(s);
  assert.equal(layers.length,n);
  for(const [i,l] of layers.entries()){
   assert.ok(l.topWidth>l.bottomWidth&&l.bottomWidth>0);
   if(i)assert.equal(layers[i-1].bottomWidth,l.topWidth);
   const b=l.label;assert.ok(b.x>=80&&b.x+b.width<=1840&&b.y>=80&&b.y+b.height<=900);
   assert.ok(b.lines.length*b.fontSize*1.35<=b.height);
   assert.ok(b.lines.every((line:string)=>Array.from(line).length*b.fontSize<=b.width));
  }
 }
});
test('new funnel connections respect the frozen style arrow shape and width',()=>{
 const s=make();s.visual_actions!.unshift({kind:'connect',target:'e0',to:'e1',cue:{...s.elements[1].cue},start_frame:200,duration_frames:12});
 for(const style of Object.values(visualStyles)){
  const html=renderToStaticMarkup(createElement(VisualStyleContext.Provider,{value:style},createElement(SceneGraphics,{scene:s,frame:300})));
  assert.match(html,new RegExp(`data-funnel-arrow="${style.arrow.head}:${style.arrow.path}:${style.arrow.width}"`));
 }
});
test('only opt-in action scenes upgrade; hidden labels, focus and backward seeking remain deterministic',()=>{
 const s=make(),before=structuredClone(s),html=(frame:number)=>renderToStaticMarkup(createElement(SceneGraphics,{scene:s,frame}));
 assert.match(html(300),/data-semantic-funnel/);assert.match(html(200),/data-action-highlight="e1"/);
 assert.match(html(0),/data-element="e0"[^>]*opacity:0/);
 assert.equal(html(199),html(199));for(const f of [350,0,250,10,199])assert.equal(html(f),html(f));
 assert.deepEqual(s,before);
 const legacy=intentVisualBaseline().scenes[0];assert.doesNotMatch(renderToStaticMarkup(createElement(SceneGraphics,{scene:legacy,frame:350})),/data-semantic-funnel/);
});
