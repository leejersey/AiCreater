import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validProject} from './fixture';
import {parseProject} from '../src/validate';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {timelineBoxes, TimelineLesson} from '../../video-components/src/TimelineLesson';
function scene() {
 const p=validProject();
 return parseProject({...p,scenes:[{...p.scenes[0],type:'execution_timeline',timeline:{duration_ms:200,lanes:[{id:'a',label:'甲'},{id:'b',label:'乙'}]},elements:p.scenes[0].elements.map((e,i)=>({...e,event:{lane_id:i?'b':'a',start_ms:0,end_ms:100,phase:i?'wait':'execute'}}))}]}).scenes[0];
}
test('timeline cue visibility is seek safe and boundary exact',()=>{
 const s=scene();
 assert.equal(timelineBoxes(s,5).length,0);
 assert.deepEqual(timelineBoxes(s,6).map(b=>b.id),['a']);
 assert.deepEqual(timelineBoxes(s,36).map(b=>b.id),['a','b']);
 assert.deepEqual(timelineBoxes(s,35).map(b=>b.id),['a']);
 assert.equal(timelineBoxes(s,0).length,0);
});
test('axis ticks do not collide with title or measurement disclaimer',()=>{
 const html=renderToStaticMarkup(React.createElement(TimelineLesson,{scene:scene(),frame:36}));
 assert.match(html,/top:270px/);
});
test('illustrative geometry is independent of voice frames',()=>{
 const s=scene(), boxes=timelineBoxes(s,36);
 assert.equal(boxes[0].width,400);
 assert.equal(boxes[1].width,400);
 assert.notEqual(boxes[0].y,boxes[1].y);
 assert.deepEqual(timelineBoxes(s,60),boxes);
});
test('tiny intervals stay accurate, use marker, stay inside safe area',()=>{
 const s=scene();s.timeline!.duration_ms=3600000;s.elements[0].event!.end_ms=1;
 const box=timelineBoxes(s,6)[0];
 assert.ok(box.short);assert.ok(box.width<1);
 assert.ok(box.x>=340&&box.x+box.width<=1140);
 assert.ok(box.y>=280&&box.y+70<920);
});
