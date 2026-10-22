import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {Internals} from 'remotion';
import {renderToStaticMarkup} from 'react-dom/server';
import {SceneGraphics} from '../src/SceneGraphics';
import {layoutElements} from '../src/layout';
import {parseProject} from '../../video-schema/src/validate';
import {imageProject} from '../../video-schema/tests/images-fixture';

test('teaching image occupies an element card with separate label and narration-driven entrance/highlight',()=>{
  const scene=parseProject(imageProject()).scenes[0];
  scene.visual_actions=[{kind:'highlight',target:'a',cue:{text_start:2,text_end:4},start_frame:30,duration_frames:12}];
  const render=(frame:number)=>renderToStaticMarkup(React.createElement(Internals.CompositionManager.Provider,{value:{compositions:[],folders:[],currentCompositionMetadata:null,currentAssetMetadata:{asset:'fixture',src:'',width:1920,height:1080,durationInFrames:100,fps:30,props:{},defaultCodec:null,defaultOutName:null,defaultVideoImageFormat:null,defaultPixelFormat:null,defaultProResProfile:null,defaultSampleRate:null},canvasContent:{type:'asset',asset:'fixture'}}},React.createElement(Internals.CanUseRemotionHooks.Provider,{value:true},React.createElement(Internals.TimelineContext.Provider,{value:{frame:{'asset:fixture':frame},isPlaying:()=>false,isInsideFreeze:false,audioAndVideoTags:{current:[]}}},React.createElement(SceneGraphics,{scene,frame,imageSources:{toolbox:'/private/toolbox.png'}})))));
  const before=render(0),shown=render(42);
  assert.match(shown,/data-teaching-image="a"/);
  assert.match(shown,/data-beat-focus="a"/);
  assert.match(shown,/flex:1 1 auto/);
  assert.doesNotMatch(shown,/height:180/);
  // Remotion attaches Img.src after hydration; actual loading is checked by the local render.
  assert.match(shown,/alt="独立项目的工具箱"/);
  assert.match(shown,/object-fit:contain/);
  assert.match(shown,/data-action-highlight="a"/);
  assert.ok(shown.includes(scene.elements[0].content));
  assert.notEqual(before,shown);
  assert.match(before,/opacity:0/);
  assert.equal(render(42),shown,'seeking is deterministic');
  assert.throws(()=>renderToStaticMarkup(React.createElement(SceneGraphics,{scene,frame:42})),/image_source/);
});
test('image and label cards fit safe zones without overlapping for one/two images and four elements',()=>{
  for(const images of [1,2]){
    const p=imageProject();
    p.scenes[0].elements.push({...p.scenes[0].elements[0],id:'c',content:'字'.repeat(40)},{...p.scenes[0].elements[0],id:'d',content:'字'.repeat(40)});
    p.scenes[0].animations.push({...p.scenes[0].animations[0],target:'c'},{...p.scenes[0].animations[0],target:'d'});
    if(images===2)p.scenes[0].images.push({...p.scenes[0].images[0],element_id:'b'});
    const scene=parseProject(p).scenes[0],boxes=layoutElements(scene);
    for(const box of boxes){
      assert.ok(box.x>=80&&box.y>=150&&box.x+box.width<=1840&&box.y+box.height<=900);
      assert.ok(box.lines.every(l=>[...l].length*box.fontSize<=box.width-32));
      if(scene.images!.some(b=>b.element_id===box.id))assert.ok(box.height>=440,'image needs object and label space');
    }
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);
    }
  }
});
