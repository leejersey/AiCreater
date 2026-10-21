import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SceneGraphics} from '../src/SceneGraphics';
import {diagramBoxes} from '../src/TeachingDiagrams';
import {parseProject} from '../../video-schema/src/validate';
import {intentVisualBaseline} from './intent-visual-fixture';
import {interactiveExamples,failureBranch} from './interactive-fixture';
const html=(s:ReturnType<typeof interactiveExamples>[number],frame:number)=>renderToStaticMarkup(createElement(SceneGraphics,{scene:s,frame}));
const project=()=>({...intentVisualBaseline(),scenes:interactiveExamples()});
test('explicit dialogue and process bindings pass the canonical schema',()=>{assert.equal(parseProject(project()).scenes.length,2);});
test('unknown, duplicated, missing and invented bindings are rejected',()=>{
 const cases:[number,(s:any)=>void][]=[
  [0,s=>s.dialogue.state='missing'],
  [0,s=>s.dialogue.messages.push('e0')],
  [0,s=>s.dialogue.messages.pop()],
  [0,s=>s.elements[1].content='并不存在的消息'],
  [1,s=>s.process.stages.push('e0')],
  [1,s=>s.edges.push({from:'e0',to:'e4'})],
 ];
 for(const [index,mutate] of cases){const p=project();mutate(p.scenes[index]);assert.throws(()=>parseProject(p));}
});
test('dialogue has real message and state regions, updates only at cue, and preserves history',()=>{
 const s=interactiveExamples()[0],before=structuredClone(s),at=s.visual_actions![1].start_frame;
 assert.match(html(s,at-1),/data-dialogue-state="e0"/);
 assert.doesNotMatch(html(s,at-1),/data-previous-state/);
 assert.match(html(s,at),/data-previous-state="等待消息"/);
 assert.match(html(s,at),/data-state-value="取消订单"/);
 assert.match(html(s,at),/data-dialogue-message="e2"/);
 assert.match(html(s,s.animations[1].start_frame-1),/data-dialogue-message="e1" style="[^"]*opacity:0/);
 const end=html(s,350);html(s,0);assert.equal(html(s,350),end);assert.deepEqual(s,before);
});
test('process has stages, inert parameter excerpts and speech-gated connections',()=>{
 const s=interactiveExamples()[1],at=s.visual_actions!.find(a=>a.kind==='connect')!.start_frame;
 assert.match(html(s,350),/data-process-stage="e3"/);
 assert.match(html(s,350),/data-process-detail="e4"/);
 assert.match(html(s,350),/不执行真实工具/);
 assert.doesNotMatch(html(s,at-1),/data-visible-connection="e0:e1"/);
 assert.match(html(s,at+12),/data-visible-connection="e0:e1"/);
});
test('explicit failure branches stay source-bound and draw both paths without executing them',()=>{
 const s=failureBranch();parseProject({...intentVisualBaseline(),scenes:[s]});
 const output=html(s,350);assert.match(output,/data-visible-connection="e1:e2"/);assert.match(output,/data-visible-connection="e1:e3"/);assert.match(output,/data-icon="warning"/);
 assert.match(output,/校验失败就拒绝执行/);assert.match(output,/不执行真实工具/);
});
test('legacy motifs remain byte-for-byte markup compatible without the explicit opt-in',()=>{
 const s=intentVisualBaseline().scenes[1],copy=structuredClone(s);
 assert.equal(html(s,350),html(copy,350));assert.doesNotMatch(html(s,350),/data-dialogue-message/);
});

test('bounded long Chinese and emoji fit the exact renderer text rectangles',()=>{
 for(const s of interactiveExamples()){
  for(const e of s.elements)e.content='🙂'.repeat(s.dialogue?.state===e.id?16:s.process?.stages.includes(e.id)?24:40);
  for(const b of diagramBoxes(s)!){
   assert.ok(b.x>=120&&b.x+b.width<=1800&&b.y>=200&&b.y+b.height<=870);
   assert.ok(b.lines.length*b.fontSize*1.35<=b.height);
  }
 }
});
test('three message bubbles leave room for their tails and the caption legend',()=>{
 const s=interactiveExamples()[0];s.elements.push({...s.elements[2],id:'e3'});s.dialogue!.messages.push('e3');s.animations.push({...s.animations[2],target:'e3'});
 const rectangles=[...html(s,350).matchAll(/data-dialogue-message="[^"]+" style="[^"]*?top:(\d+)px;[^"]*?height:(\d+)px/g)].map(m=>({top:Number(m[1]),height:Number(m[2])}));
 assert.equal(rectangles.length,3);
 rectangles.forEach((r,i)=>{if(i)assert.ok(r.top-rectangles[i-1].top-rectangles[i-1].height>=12);assert.ok(r.top+r.height+12<=886);});
});
test('failure excerpts reuse the existing warning glyph and remain inert text',()=>{
 const s=interactiveExamples()[1];s.elements[5].icon='warning';s.elements[4].content='<script>alert(1)</script>';
 const output=html(s,350);
 assert.match(output,/data-icon="warning"/);assert.match(output,/&lt;script&gt;/);assert.doesNotMatch(output,/<script>/);
});
