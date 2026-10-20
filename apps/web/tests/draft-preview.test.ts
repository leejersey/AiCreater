import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PreviewSteps} from '../app/SceneEditor';
import * as editor from '../lib/editor';
import demo from '../../../examples/demo.json';
import type {VideoProject} from '../../../packages/video-schema/src/types';

function project():editor.Project {
  const {scenes:_,...config}=structuredClone(demo as VideoProject);
  return {id:'p',title:'意图识别',revision:1,source_text:'🙂甲乙丙',config,scenes:[{id:'s',revision:1,state:'needs_voice',scene:{id:'s',type:'concept',narration:{text:'🙂甲乙丙'},elements:[
    {id:'a',content:'甲',concept_role:'definition',cue:{text_start:1,text_end:2}},
    {id:'b',content:'乙',concept_role:'feature',cue:{text_start:2,text_end:3}},
    {id:'c',content:'丙',concept_role:'summary',cue:{text_start:3,text_end:4}},
  ]}}]};
}

test('silent draft projects cue-driven animations without audio assets or persistent edits',()=>{
  const p=project(),before=structuredClone(p),video=editor.draftPreviewVideo(p,'s');
  assert.ok(video);assert.deepEqual(p,before);assert.deepEqual(video.assets,[]);
  const scene=video.scenes[0];assert.equal(scene.type,'concept');assert.equal(scene.narration.audio_asset_id,'');assert.deepEqual(scene.captions,[]);
  assert.deepEqual(scene.elements,p.scenes[0].scene.elements);assert.equal(scene.animations.length,3);
  assert.ok(scene.animations.every((a,i)=>a.start_frame>=6&&a.start_frame+a.duration_frames<scene.duration_frames&&(!i||a.start_frame>scene.animations[i-1].start_frame)));
  assert.equal(editor.readyVideo(p),null);assert.equal(editor.canPreview(p.scenes[0]),false);
  assert.deepEqual(editor.draftPreviewVideo(p,'s'),video);
});

test('only the selected pending scene gets temporary timing; stale audio is never reused',()=>{
  const p=project();p.scenes.push({...structuredClone(p.scenes[0]),id:'other',scene:{...structuredClone(p.scenes[0].scene),id:'other'}});
  p.scenes[0].state='needs_timing';p.scenes[0].scene.narration.audio_asset_id='old-recording';
  const video=editor.draftPreviewVideo(p,'s');assert.ok(video);assert.equal(video.scenes.length,1);assert.equal(video.scenes[0].id,'s');assert.equal(video.scenes[0].narration.audio_asset_id,'');
  assert.equal(editor.draftPreviewVideo(p,'missing'),null);assert.equal(editor.draftPreviewVideo({...p,scenes:[]},'s'),null);
  p.scenes[0].state='ready';assert.equal(editor.draftPreviewVideo(p,'s'),null);
});

test('long narration and adjacent late cues remain bounded, ordered and seekable',()=>{
  const p=project();p.scenes[0].scene.narration.text='🙂'+'甲'.repeat(3999);
  p.scenes[0].scene.elements.forEach((e,i)=>{e.cue={text_start:3997+i,text_end:3998+i};});
  const video=editor.draftPreviewVideo(p,'s');assert.ok(video);const s=video.scenes[0];assert.ok(s.duration_frames<=1000);
  for(const a of s.animations)assert.equal(editor.stepStartFrame(video,'s',a.target),a.start_frame);
  assert.ok(s.animations.every((a,i)=>!i||a.start_frame>s.animations[i-1].start_frame));
});

test('overlapping cues keep source order, stable ties and original layout order',()=>{
  const p=project(),row=p.scenes[0];row.scene.type='card_sequence';
  row.scene.elements.forEach((e,i)=>{e.cue={text_start:i===2?0:1,text_end:3};});
  const before=structuredClone(row.scene),s=editor.draftPreviewVideo(p,'s')!.scenes[0];
  assert.deepEqual(s.elements,before.elements);assert.deepEqual(row.scene,before);
  assert.deepEqual(s.animations.map(a=>a.target),['c','a','b']);
  assert.ok(s.animations.every((a,i)=>!i||a.start_frame>=s.animations[i-1].start_frame+12));
});

test('invalid code-point cue bounds cannot create NaN timelines or a draft player',()=>{
  for(const cue of [{text_start:0,text_end:5},{text_start:-1,text_end:2},{text_start:2,text_end:2},{text_start:NaN,text_end:3}]){
    const p=project();p.scenes[0].scene.elements[0].cue=cue;assert.equal(editor.draftPreviewVideo(p,'s'),null);
  }
});

test('temporary step seeking is explicitly labelled and keeps unsaved/busy protections',()=>{
  const p=project(),row=p.scenes[0],video=editor.draftPreviewVideo(p,'s');
  const props={row,video,busy:false,dirty:false,onSeek:()=>{}};
  assert.match(renderToStaticMarkup(createElement(PreviewSteps,props)),/disabled/);
  const draft=renderToStaticMarkup(createElement(PreviewSteps,{...props,draftPreview:true}));
  assert.match(draft,/临时/);assert.doesNotMatch(draft,/disabled/);
  assert.match(renderToStaticMarkup(createElement(PreviewSteps,{...props,draftPreview:true,dirty:true})),/disabled/);
  assert.match(renderToStaticMarkup(createElement(PreviewSteps,{...props,draftPreview:true,busy:true})),/disabled/);
});

test('formal ready previews remain unchanged and do not become draft views',()=>{
  const {scenes,...config}=structuredClone(demo as VideoProject);
  const p:editor.Project={id:'p',title:'t',revision:1,source_text:'',config,scenes:scenes.map(scene=>({id:scene.id,revision:1,state:'ready',scene}))};
  assert.deepEqual(editor.previewVideo(p,scenes[0].id),demo);assert.equal(editor.draftPreviewVideo(p,scenes[0].id),null);
});
