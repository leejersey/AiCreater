import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as motion from '../src/motion';
import {SceneGraphics} from '../src/SceneGraphics';
import {intentVisualBaseline} from './intent-visual-fixture';

function scene(){const s=intentVisualBaseline().scenes[0];s.visual_actions=[
 {kind:'highlight',target:'e1',cue:{...s.elements[1].cue},start_frame:200,duration_frames:12},
 {kind:'update',target:'e0',source:'e2',cue:{...s.elements[2].cue},start_frame:250,duration_frames:12},
];return s;}
test('frame-only updates never anticipate speech and are reversible without source mutation',()=>{
 const s=scene(),before=structuredClone(s);
 assert.equal(motion.visualSceneAtFrame(s,249).elements[0].content,s.elements[0].content);
 assert.equal(motion.visualSceneAtFrame(s,250).elements[0].content,s.elements[2].content);
 for(const frame of [300,0,250,199,400,249]){
  assert.deepEqual(motion.visualSceneAtFrame(s,frame),motion.visualSceneAtFrame(s,frame));
 }
 assert.deepEqual(s,before);assert.equal(motion.visualSceneAtFrame(s,0).elements[0].content,before.elements[0].content);
});
test('actual graphics use speech-gated focus and updated labels, while legacy markup remains stable',()=>{
 const s=scene();const html=(frame:number)=>renderToStaticMarkup(createElement(SceneGraphics,{scene:s,frame}));
 assert.doesNotMatch(html(199),/data-action-highlight/);assert.match(html(200),/data-action-highlight="e1"/);
 assert.notEqual(html(249),html(250));assert.equal(html(199),html(199));
 const legacy=intentVisualBaseline().scenes[0],empty={...legacy,visual_actions:[]};
 assert.equal(renderToStaticMarkup(createElement(SceneGraphics,{scene:legacy,frame:300})),renderToStaticMarkup(createElement(SceneGraphics,{scene:empty,frame:300})));
});
