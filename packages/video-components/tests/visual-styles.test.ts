import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {palettes,PaletteContext} from '../src/theme';
import {GraphicContent} from '../src/GraphicContent';
import {CodeLesson} from '../src/CodeLesson';
import {parseProject} from '../../video-schema/src/validate';
import {codeProject,validProject} from '../../video-schema/tests/fixture';
import {layoutElements} from '../src/layout';

test('graphic SVG, labels and code use all three palettes; strings never become HTML',()=>{
  const scene=parseProject(validProject()).scenes[0];
  const element={...scene.elements[0],content:'<规则>',icon:'document' as const,step:1,highlight:{text_start:1,text_end:3},source_label:'规则',panel_style:'conclusion' as const};
  scene.elements=[element];const box=layoutElements(scene)[0];
  for(const theme of ['tech_multicolor','light_teaching','color_infographic'] as const){
    const html=renderToStaticMarkup(React.createElement(PaletteContext.Provider,{value:palettes[theme]},React.createElement(GraphicContent,{element,box})));
    assert.match(html,/data-icon="document"/);assert.match(html,/data-conclusion/);assert.match(html,/&lt;/);assert.match(html,/&gt;/);assert.match(html,/<mark/);assert.match(html,/稿中来源/);
    const code=renderToStaticMarkup(React.createElement(PaletteContext.Provider,{value:palettes[theme]},React.createElement(CodeLesson,{scene:parseProject(codeProject()).scenes[0],frame:20})));
    assert.ok(code.includes(palettes[theme].card));assert.ok(code.includes(palettes[theme].accent));assert.ok(!code.includes('#182a43'));
  }
});
test('new theme text and semantic labels meet 4.5:1 contrast on their surfaces',()=>{
  const luminance=(hex:string)=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  for(const theme of ['tech_multicolor','light_teaching','color_infographic'] as const){
    const p=palettes[theme];
    for(const surface of [p.background,p.card])for(const color of [p.text,p.muted,p.source,p.secondary,p.accent,p.warning])assert.ok(contrast(color,surface)>=4.5,`${theme}: ${color} on ${surface}`);
    assert.ok(contrast(p.accent,p.selected)>=4.5);assert.ok(contrast(p.captionText,p.caption)>=4.5);
  }
});
test('legacy color and layout are exact, plain elements do not get decorative labels',()=>{
  assert.equal(palettes.tech_explainer.background,'#101a2c');assert.equal(palettes.tech_explainer.accent,'#69e3c4');
  const boxes=layoutElements(parseProject(validProject()).scenes[0]);assert.equal(boxes[0].fontSize,36);assert.equal(boxes[0].height,260);assert.equal('graphicFlow' in boxes[0],false);
});
