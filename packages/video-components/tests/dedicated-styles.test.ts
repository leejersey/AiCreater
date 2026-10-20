import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {dedicatedScenes,mixedProject} from './dedicated-fixture';
import {CodeLesson} from '../src/CodeLesson';
import {StateLesson,stateBoxes} from '../src/StateLesson';
import {TimelineLesson,timelineBoxes} from '../src/TimelineLesson';
import {DataChart} from '../src/DataChart';
import {PaletteContext,VisualStyleContext,palettes,getVisualStyle,validateVisualStyle,type VisualStyleId} from '../src/theme';
import type {Scene} from '../../video-schema/src/types';
const components={code_walkthrough:CodeLesson,state_diagram:StateLesson,execution_timeline:TimelineLesson,data_chart:DataChart};
const scenes=dedicatedScenes();
const html=(scene:Scene,frame:number,id:VisualStyleId='legacy')=>renderToStaticMarkup(React.createElement(PaletteContext.Provider,{value:palettes.tech_explainer},React.createElement(VisualStyleContext.Provider,{value:getVisualStyle(id)},React.createElement(components[scene.type as keyof typeof components],{scene,frame}))));
const baseline=JSON.parse(readFileSync(new URL('./dedicated-legacy.json',import.meta.url),'utf8'));
for(const [i,s] of scenes.entries()){
  test(`legacy dedicated ${i}/${s.type} exact before-change SSR`,()=>{
    for(const f of [5,6,10,24,60])assert.equal(createHash('sha256').update(html(s,f)).digest('hex'),baseline[`${i}-${f}`]);
  });
  test(`dedicated ${i}/${s.type} has real non-color style differences`,()=>{
    const frozen=structuredClone(s),white=html(s,60,'whiteboard'),minimal=html(s,60,'minimal');
    assert.match(white,/border-radius:2px|rx="2"/);assert.match(minimal,/border-radius:28px|rx="28"/);
    assert.notEqual(white.replace(/#[0-9a-f]+/gi,''),minimal.replace(/#[0-9a-f]+/gi,''));
    assert.notEqual(white,html(s,60));assert.notEqual(minimal,html(s,60));
    assert.deepEqual(s,frozen);assert.ok(!/NaN|Infinity/.test(white+minimal));
  });
}
test('all nine mixed types supported; unknown style/type still fail closed',()=>{
  const p=mixedProject();assert.equal(new Set(p.scenes.map(s=>s.type)).size,9);
  for(const id of ['whiteboard','minimal'])assert.doesNotThrow(()=>validateVisualStyle(p,id));
  assert.throws(()=>validateVisualStyle(p,'unknown'),/invalid_visual_style/);
  assert.throws(()=>validateVisualStyle({...p,scenes:[{...p.scenes[0],type:'future'}]} as any,'whiteboard'),/visual_style_not_supported/);
});
test('new styles reveal current snapshots only, random seek never retains future values',()=>{
  for(const original of scenes.slice(0,5)){
    const s=structuredClone(original),last=s.elements.at(-1)!,start=s.animations.find(a=>a.target===last.id)!.start_frame;
    if(s.code)last.output='FUTURE_OUTPUT';else last.items![0].value='FUTURE_VALUE';
    for(const id of ['legacy','whiteboard','minimal'] as const){
      assert.doesNotMatch(html(s,5,id),/FUTURE_OUTPUT|FUTURE_VALUE/);
      assert.doesNotMatch(html(s,start-1,id),/FUTURE_OUTPUT|FUTURE_VALUE/);
      assert.match(html(s,60,id),/FUTURE_OUTPUT|FUTURE_VALUE/);
      const first=html(s,start+1,id);html(s,60,id);assert.equal(html(s,start+1,id),first);
      assert.doesNotMatch(html(s,5,id),/FUTURE_OUTPUT|FUTURE_VALUE/);
    }
    assert.notEqual(html(s,start+1,'whiteboard'),html(s,start+1,'minimal'));
    assert.match(html(s,start+1,'whiteboard'),/clip-path:inset/);
  }
});
test('new timeline reveals without translating or altering millisecond geometry',()=>{
  const s=scenes[5];assert.equal(timelineBoxes(s,5).length,0);
  assert.deepEqual(timelineBoxes(s,60).map(b=>[b.x,b.y,b.width,b.short]),[[340,300,4,true],[340,460,400,false]]);
  for(const id of ['whiteboard','minimal'] as const){
    const h=html(s,37,id);assert.match(h,/left:340px;top:460px;width:400px/);
    assert.doesNotMatch(h,/translateY/);assert.match(h,/dashed/);assert.match(h,/实线：执行/);
    assert.doesNotMatch(html(s,5,id),/data-timeline-event/);
  }
});
test('outlined timeline retains a non-color current-event marker',()=>{
  for(const id of ['whiteboard','minimal'] as const){
    const h=html(scenes[5],60,id);
    assert.match(h,/outline:2px solid/);assert.match(h,/双框：当前/);
    assert.equal((h.match(/outline-offset:3px/g)??[]).length,1);
    assert.doesNotMatch(h,/clip-path/, 'completed reveal must not crop the outer current marker');
  }
});
test('new charts preserve zero, proportion segments, matrix scale and future-value gates',()=>{
  for(const id of ['legacy','whiteboard','minimal'] as const){
    const bar=structuredClone(scenes[6]);bar.chart!.data[0].values=[0];assert.match(html(bar,60,id),/<rect[^>]*y="770"[^>]*height="0"/);
    assert.doesNotMatch(html(scenes[6],10,id),/>20<\/tspan>/);
    const prop=scenes[8],end=Math.max(...prop.animations.map(a=>a.start_frame+a.duration_frames));
    assert.doesNotMatch(html(prop,end-1,id),/合计/);const p=html(prop,60,id);
    assert.match(p,/合计 30/);assert.match(p,/width="546\.6666666666666"/);assert.match(p,/width="1093\.3333333333333"/);
    const matrix=html(scenes[9],60,id);assert.match(matrix,/固定色阶/);assert.match(matrix,/opacity="0\.35"/);assert.match(matrix,/>3<\/tspan>/);
    assert.doesNotMatch(matrix,/NaN|Infinity/);
  }
});
test('state empty and max-six layouts retain safe geometry and non-color markers',()=>{
  for(const source of scenes.slice(2,5))for(const id of ['legacy','whiteboard','minimal'] as const){
    const h=html(source,60,id);assert.match(h,/当前/);if(source.structure!.kind==='stack')assert.match(h,/TOP/);
    for(const b of stateBoxes(source.structure!.kind,source.elements[1].items!)){assert.ok(b.y+b.height<=920);assert.ok(b.x+b.width<=1180);}
    const empty=structuredClone(source);for(const e of empty.elements){e.items=[];e.active_item_ids=[];}
    assert.match(html(empty,60,id),/空数组|空对象|空栈/);
  }
});
