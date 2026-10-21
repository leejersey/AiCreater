import assert from 'node:assert/strict';import test from 'node:test';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import * as focus from '../src/ProcessFocus';import {interactiveExamples} from './interactive-fixture';import {getVisualStyle,validateVisualStyle,visualStyles} from '../src/theme';import {demonstrationFor} from '../src/demonstrations';
const api=()=>{assert.equal(typeof focus.focusFrame,'function');return focus;};
const scene=()=>structuredClone(interactiveExamples()[1]);
test('active full sentence is not repeated as hero and stage while caption carries it',()=>{
 const s=scene(),at=s.animations[0].start_frame+12;s.captions=[{text:s.elements[0].content,start_frame:at-12,end_frame:at+30}];
 const boxes=api().focusTextBoxes(s,at);assert.ok(!boxes.some((b:any)=>b.id===s.elements[0].id));
 const html=renderToStaticMarkup(createElement(api().ProcessFocus,{scene:s,frame:at}));assert.doesNotMatch(html,/data-demo-hero/);
});
test('one source-derived object retains identity, follows explicit adjacent edges and never invents absent transport',()=>{
 const s=scene(),a=s.visual_actions!.find(a=>a.kind==='connect')!,before=structuredClone(s);
 const first=api().focusFrame(s,a.start_frame-1).object,middle=api().focusFrame(s,a.start_frame+18).object;
 assert.equal(first.id,middle.id);assert.equal(first.text,middle.text);assert.ok(middle.x>first.x);assert.equal(middle.moving,true);
 s.edges=[];s.visual_actions=[];assert.equal(api().focusFrame(s,350).object.x,api().focusFrame(s,0).object.x);
 s.edges=before.edges;s.visual_actions=before.visual_actions;assert.deepEqual(s,before);
});
test('paced transfer stays within the next source event and conclusion holds the diagram still',()=>{
 const s=scene(),a=s.visual_actions!.find(a=>a.kind==='connect')!;
 assert.equal(api().focusFrame(s,a.start_frame+18).object.moving,true);
 const nodes=api().focusFrame(s,410).nodes;assert.ok(nodes.every((n:any)=>n.y===548));
 const copy=structuredClone(s);copy.animations[2].start_frame=a.start_frame+16;
 assert.equal(api().focusFrame(copy,a.start_frame+16).connections[0].progress,1);
});
test('focus can be frozen without changing old mechanism tokens and is shared with other scene renderers',()=>{
 const old={id:'mechanism',tokens:structuredClone(visualStyles.mechanism)};const s=scene();
 assert.equal(demonstrationFor(s,validateVisualStyle(undefined,'mechanism',old))?.View.name,'ProcessDemonstration');
 const style=getVisualStyle('mechanism_focus');assert.equal(demonstrationFor(s,style)?.View.name,'ProcessFocus');
 assert.equal(validateVisualStyle(undefined,'mechanism_focus',{id:'mechanism_focus',tokens:{...visualStyles.mechanism,label:'机制演示·聚焦'}}).presentation,'mechanism_focus');
});
test('source gate, seek and readable bounds survive focus choreography without changing data',()=>{
 const s=scene(),before=structuredClone(s),at=s.animations[1].start_frame;
 const html=(f:number)=>renderToStaticMarkup(createElement(api().ProcessFocus,{scene:s,frame:f}));
 assert.doesNotMatch(html(at-1),new RegExp(`data-focus-stage="${s.elements[1].id}"`));
 const end=html(350);html(0);assert.equal(html(350),end);assert.deepEqual(s,before);
 for(const f of [0,100,230,350,410])for(const b of api().focusTextBoxes(s,f)){assert.ok(b.x>=120&&b.x+b.width<=1800&&b.y>=200&&b.y+b.height<=936);assert.ok(b.fontSize>=28&&b.lines.length*b.fontSize*1.35<=b.height);}
});
