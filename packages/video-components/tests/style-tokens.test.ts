import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as theme from '../src/theme';
import {layoutElements, flowPath} from '../src/layout';
import {entranceAtFrame} from '../src/motion';
import {parseProject} from '../../video-schema/src/validate';
import {validProject,codeProject} from '../../video-schema/tests/fixture';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SceneGraphics} from '../src/SceneGraphics';

const spacious={columnGap:64,rowGap:40,flowRowGap:24};
const compact={columnGap:24,rowGap:16,flowRowGap:8};

test('style is independently selectable without changing the palette; unknown IDs are rejected',()=>{
  const getStyle=theme.getVisualStyle;
  assert.equal(getStyle(),getStyle('legacy'));
  assert.notDeepEqual(getStyle('whiteboard'),getStyle('minimal'));
  for(const bad of ['unknown','__proto__','',null,{},42])assert.throws(()=>getStyle(bad),/invalid_visual_style/);
});
test('legacy soft-template coordinates keep silhouette contracts after vertical-flow redesign',()=>{
  const scene=parseProject(validProject()).scenes[0];
  scene.elements=Array.from({length:6},(_,i)=>({id:`e${i}`,content:'概念',cue:{text_start:2,text_end:4}}));scene.edges=[];
  const coordinates=()=>layoutElements(scene).map(({x,y,width,height})=>[x,y,width,height]);
  scene.type='card_sequence';
  assert.deepEqual(coordinates(),[[148,220,520,240],[700,220,520,240],[1252,220,520,240],[148,492,520,240],[700,492,520,240],[1252,492,520,240]]);
  scene.type='comparison_panel';
  assert.deepEqual(coordinates(),[[80,184,864,208],[976,184,864,208],[80,416,864,208],[976,416,864,208],[80,648,864,208],[976,648,864,208]]);
  scene.type='flow_diagram';
  assert.deepEqual(coordinates(),[114,242,370,498,626,754].map(y=>[510,y,900,112]));
  scene.elements[0].icon='idea';
  // Dense metadata cannot fit six vertical nodes; use two rows instead of clipping it.
  const graphic=coordinates();
  assert.equal(new Set(graphic.map(([x])=>x)).size,3);
  assert.equal(graphic[0][2],520);
  assert.ok(graphic[3][1]>=graphic[0][1]+graphic[0][3]);
  assert.ok(graphic.every(([,y,,h])=>y>=80&&y+h<=900));
  scene.type='card_sequence';assert.deepEqual(coordinates().at(-1),[1252,552,520,300]);
  scene.type='title_reveal';assert.deepEqual(coordinates()[0],[200,320,1520,320]);
  assert.deepEqual(entranceAtFrame(12,6,12),{opacity:0.875,translateY:3});
});
test('same content has genuinely different grid spacing without changing the project',()=>{
  const project=parseProject(validProject()), original=structuredClone(project), scene=project.scenes[0];
  const wide=layoutElements(scene,spacious),tight=layoutElements(scene,compact);
  assert.notDeepEqual(wide,tight,'layout currently ignores style');
  assert.equal(wide[1].x-wide[0].x-wide[0].width,64);
  assert.equal(tight[1].x-tight[0].x-tight[0].width,24);
  assert.deepEqual(project,original);
});
test('both styles keep six plain/graphic cards and flow nodes in safe bounds',()=>{
  for(const {layout} of Object.values(theme.visualStyles).filter(s=>s!==theme.visualStyles.legacy))for(const type of ['card_sequence','flow_diagram','comparison_panel'] as const)for(const graphic of [false,true]){
    const scene=parseProject(validProject()).scenes[0];scene.type=type;
    scene.elements=Array.from({length:6},(_,i)=>({id:`e${i}`,content:'概念解释',cue:{text_start:2,text_end:4},...(graphic?{icon:'idea' as const}:{})}));
    scene.edges=[];
    const boxes=layoutElements(scene,layout);
    for(const b of boxes)assert.ok(b.x>=80&&b.y>=80&&b.x+b.width<=1840&&b.y+b.height<=900,`${type}: ${JSON.stringify(b)}`);
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`${type}/${graphic}/${JSON.stringify(layout)}: ${a.id},${b.id}`);
    }
  }
});
test('maximum-length new-style labels fit vertically inside real padding and borders',()=>{
  for(const style of Object.values(theme.visualStyles).filter(s=>s!==theme.visualStyles.legacy&&s!==theme.visualStyles.paper_slide))for(const type of ['title_reveal','card_sequence','flow_diagram','comparison_panel'] as const)for(const graphic of [false,true]){
    const scene=parseProject(validProject()).scenes[0];scene.type=type;
    // Vertical graphic flow keeps fewer nodes so icon chrome fits the safe band.
    const count=type==='title_reveal'?1:type==='flow_diagram'&&graphic?3:6;
    scene.elements=Array.from({length:count},(_,i)=>({id:`e${i}`,content:'概'.repeat(type==='title_reveal'?30:40),cue:{text_start:2,text_end:4},...(graphic?{icon:'idea' as const}:{})}));
    if(type==='flow_diagram')scene.edges=scene.elements.slice(0,-1).map((e,i)=>({from:e.id,to:scene.elements[i+1].id}));
    for(const box of layoutElements(scene,style.layout)){
      const padding=graphic?style.card.graphicPadding:type==='flow_diagram'?style.card.flowPadding:style.card.padding;
      const height=box.lines.length*box.fontSize*style.typography.lineHeight+(graphic?64+2*style.typography.graphicGap:0);
      assert.ok(height<=box.height-2*(padding+style.card.borderWidth),`${type}/${graphic}/${box.id}: ${height} vs ${box.height}`);
    }
  }
});
test('curved arrows differ from legacy orthogonal routing with the same endpoints',()=>{
  const scene=parseProject(validProject()).scenes[0];scene.type='flow_diagram';scene.edges=[{from:'a',to:'b'}];
  const [a,b]=layoutElements(scene);
  const old=flowPath(a,b,0),curved=flowPath(a,b,0,'curve');
  assert.notEqual(old,curved);assert.match(curved,/ C /);assert.match(old,/ H /);
});
test('registry presets use existing rendering mechanisms and unknown/unsupported styles fail closed',()=>{
  for(const [id,style] of Object.entries(theme.visualStyles)){
    assert.ok(['wipe','slide'].includes(style.entrance.kind),id);
    assert.ok(['curve','orthogonal'].includes(style.arrow.path),id);
    assert.ok(['open','filled'].includes(style.arrow.head),id);
    for(const value of Object.values(style.layout))assert.ok(Number.isFinite(value)&&value>=0,id);
  }
  const project=parseProject(codeProject());
  assert.doesNotThrow(()=>theme.validateVisualStyle(project));
  assert.doesNotThrow(()=>theme.validateVisualStyle(project,'whiteboard'));
  assert.doesNotThrow(()=>theme.validateVisualStyle(project,'minimal'));
  assert.throws(()=>theme.validateVisualStyle({...project,scenes:[{...project.scenes[0],type:'future'}]} as any,'minimal'),/visual_style_not_supported/);
});
test('actual scene markup differs in shape, layout, arrow and motion even with identical palette',()=>{
  const project=parseProject(validProject()),original=structuredClone(project),scene=project.scenes[0];
  scene.type='flow_diagram';scene.edges=[{from:'a',to:'b'}];
  const frozen=structuredClone(scene);
  const html=(id:theme.VisualStyleId,frame=12)=>renderToStaticMarkup(React.createElement(theme.PaletteContext.Provider,{value:theme.palettes.tech_explainer},React.createElement(theme.VisualStyleContext.Provider,{value:theme.getVisualStyle(id)},React.createElement(SceneGraphics,{scene,frame}))));
  const whiteboard=html('whiteboard'),minimal=html('minimal');
  assert.notEqual(whiteboard,minimal);
  assert.match(whiteboard,/border-radius:2px/);assert.match(minimal,/border-radius:28px/);
  assert.match(whiteboard,/data-entrance="wipe"/);assert.match(whiteboard,/clip-path:inset/);
  assert.match(minimal,/data-entrance="slide"/);assert.match(minimal,/translateY\([^0]/);
  assert.match(whiteboard,/ C /);assert.match(minimal,/ H /);
  assert.match(whiteboard,/fill="none" stroke=/);assert.match(minimal,/L 0 8 z/);
  assert.equal(html('whiteboard'),html('whiteboard'));
  assert.match(html('legacy'),/border-radius:20px/);
  assert.deepEqual(scene,frozen);assert.deepEqual(project.assets,original.assets);
});
test('whiteboard wipe and minimal slide use the original cue interval and support random seek',()=>{
  const wipe={kind:'wipe',distance:0},slide={kind:'slide',distance:12};
  const at=(frame:number)=>entranceAtFrame(frame,6,12,wipe);
  assert.deepEqual(at(5),{opacity:0,translateY:0,clipPath:'inset(0 100% 0 0)'});
  assert.deepEqual(at(18),{opacity:1,translateY:0,clipPath:'inset(0 0% 0 0)'});
  assert.deepEqual(at(999),at(18));assert.deepEqual(at(12),at(12));
  assert.notDeepEqual(at(12),entranceAtFrame(12,6,12,slide));
  assert.equal(entranceAtFrame(12,6,12,slide).translateY,entranceAtFrame(12,6,12).translateY/2);
});
