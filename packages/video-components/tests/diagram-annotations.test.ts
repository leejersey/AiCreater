import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SceneGraphics} from '../src/SceneGraphics';
import * as funnel from '../src/FunnelDiagram';
import {parseProject} from '../../video-schema/src/validate';
import {intentVisualBaseline} from './intent-visual-fixture';
import {annotatedFunnel} from './annotated-funnel-fixture';
import {interactiveExamples} from './interactive-fixture';
const html=(s:ReturnType<typeof annotatedFunnel>,frame:number)=>renderToStaticMarkup(createElement(SceneGraphics,{scene:s,frame}));
test('annotated funnel partitions layers and independent notes, rejecting invalid or fabricated groups',()=>{
 const s=annotatedFunnel();parseProject({...intentVisualBaseline(),scenes:[s]});
 assert.equal(funnel.funnelLayers(s).length,3);
 for(const mutate of [(x:any)=>x.funnel.notes[0].element_id='bad',(x:any)=>x.funnel.notes[0].element_id='e0',(x:any)=>x.funnel.notes[0].target='bad',(x:any)=>x.funnel.notes[0].direction='left',(x:any)=>x.funnel.notes.pop(),(x:any)=>x.elements[4].content='编造的成本',(x:any)=>x.type='comparison_panel']){
  const copy=structuredClone(s);mutate(copy);assert.throws(()=>parseProject({...intentVisualBaseline(),scenes:[copy]}));
 }
});
test('long note boxes fit the safe area without reducing body type, and directions are explicit',()=>{
 const s=annotatedFunnel();s.funnel!.notes[0].direction='up';assert.match(html(s,350),/data-funnel-direction="up"/);
 for(const e of s.elements.slice(3))e.content='长🙂'.repeat(20);
 for(const b of funnel.funnelNoteBoxes(s)){assert.equal(b.fontSize,32);assert.ok(b.x+b.width<=1840&&b.y+b.height<855);assert.ok(b.lines.length*b.fontSize*1.35<=b.height);}
});
test('notes directions and conclusions follow their own source cues and survive rewind without mutation',()=>{
 const s=annotatedFunnel(),before=structuredClone(s),start=s.animations.at(-1)!.start_frame;
 assert.equal(s.funnel!.notes[0].direction,'down');assert.equal(s.funnel!.notes[1].direction,'down');
 assert.match(html(s,350),/data-funnel-direction="down"/);
 assert.match(html(s,start-1),/data-funnel-note="e5"[^>]*opacity:0/);
 assert.match(html(s,350),/data-conclusion/);assert.match(html(s,350),/<mark/);
 for(const f of [350,0,start,100,start-1])assert.equal(html(s,f),html(s,f));assert.deepEqual(s,before);
});
test('new dialogue and process layouts reuse highlight, literal source tag and conclusion styling',()=>{
 for(const s of interactiveExamples()){
  const e=s.elements.at(-1)!;e.highlight={text_start:0,text_end:2};e.source_label=e.content.slice(0,2);e.panel_style='conclusion';
  parseProject({...intentVisualBaseline(),scenes:[s]});assert.match(html(s,350),/data-conclusion/);assert.match(html(s,350),/<mark/);assert.match(html(s,350),/data-source-label/);
 }
});
