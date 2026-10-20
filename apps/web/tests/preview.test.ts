import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as stepUI from '../app/SceneEditor';
import assert from 'node:assert/strict';
import * as editor from '../lib/editor';
import {exportIssues} from '../lib/course';
import demo from '../../../examples/demo.json';
import {getVisualStyle} from '../../../packages/video-components/src/theme';
import type {VideoProject} from '../../../packages/video-schema/src/types';

function project(): editor.Project {
  const {scenes,...config}=structuredClone(demo) as VideoProject;
  return {id:'p',title:'preview',revision:1,source_text:'',config,
    scenes:scenes.map((scene,index)=>({id:`row-${index}`,revision:1,state:'ready',scene}))};
}

test('complete course preview retains every scene and original order',()=>{
  assert.equal(typeof editor.previewVideo,'function');
  const p=project();
  assert.deepEqual(editor.previewVideo(p,p.scenes[1].id),editor.readyVideo(p));
});

test('unfinished course can preview its selected ready scene without permitting export',()=>{
  assert.equal(typeof editor.previewVideo,'function');
  const p=project();p.scenes[0].state='needs_voice';
  const before=structuredClone(p), selected=p.scenes[1];
  const preview=editor.previewVideo(p,selected.id);
  assert.deepEqual(preview?.scenes,[selected.scene]);
  assert.deepEqual(preview?.assets,p.config.assets);
  assert.equal(editor.readyVideo(p),null);
  assert.ok(exportIssues(p,false).some(issue=>issue.sceneId===p.scenes[0].id&&issue.code==='needs_voice'));
  assert.deepEqual(p,before);
});

test('pending selection does not show a different chapter or stale audio',()=>{
  assert.equal(typeof editor.previewVideo,'function');
  for(const state of ['needs_voice','needs_timing']){
    const p=project();p.scenes[0].state=state;
    assert.equal(editor.previewVideo(p,p.scenes[0].id),null);
    assert.equal(editor.previewVideo(p,'removed'),null);
  }
  const p=project();p.scenes=[];
  assert.equal(editor.previewVideo(p,''),null);
});

test('chapter preview retains frozen scene data and strips render-only metadata from DSL',()=>{
  assert.equal(typeof editor.previewVideo,'function');
  const p=project();p.scenes[0].state='needs_voice';p.config.visual_style={id:'whiteboard',tokens:getVisualStyle('whiteboard')};
  const preview=editor.previewVideo(p,p.scenes[1].id)!;
  assert.equal('visual_style' in preview,false);
  assert.deepEqual(preview.scenes[0],p.scenes[1].scene);
});

test('chapter seek uses cumulative frame durations, not character or cue offsets',()=>{
  assert.equal(typeof editor.sceneStartFrame,'function');
  const video=structuredClone(demo) as VideoProject;
  video.scenes=video.scenes.slice(0,3);
  video.scenes[0].duration_frames=31;video.scenes[1].duration_frames=67;
  assert.equal(editor.sceneStartFrame(video,video.scenes[0].id),0);
  assert.equal(editor.sceneStartFrame(video,video.scenes[1].id),31);
  assert.equal(editor.sceneStartFrame(video,video.scenes[2].id),98);
  assert.equal(editor.sceneStartFrame(video,'removed'),null);
});

test('single chapter preview starts at its own zero and rejects missing timing',()=>{
  assert.equal(typeof editor.previewVideo,'function');assert.equal(typeof editor.sceneStartFrame,'function');
  const p=project();p.scenes[0].state='needs_voice';const selected=p.scenes[1];
  const preview=editor.previewVideo(p,selected.id)!;
  assert.notEqual(selected.id,selected.scene.id);
  assert.equal(editor.sceneStartFrame(preview,selected.scene.id),0);
  selected.scene.duration_frames=undefined;
  assert.equal(editor.previewVideo(p,selected.id),null);
});

test('step seek uses saved animation start plus chapter offset, without adding audio padding twice',()=>{
  assert.equal(typeof editor.stepStartFrame,'function');
  const video=structuredClone(demo) as VideoProject;
  video.scenes[0].duration_frames=31;
  const scene=video.scenes[1];scene.animations[0].start_frame=18;
  assert.equal(editor.stepStartFrame(video,scene.id,scene.animations[0].target),49);
  assert.equal(editor.stepStartFrame(video,video.scenes[0].id,video.scenes[0].animations[0].target),video.scenes[0].animations[0].start_frame);
});

test('single chapter step seek uses local frames and DSL IDs, not database row IDs',()=>{
  assert.equal(typeof editor.stepStartFrame,'function');
  const p=project();p.scenes[0].state='needs_voice';
  const selected=p.scenes[1],preview=editor.previewVideo(p,selected.id)!;
  const animation=preview.scenes[0].animations[0];
  assert.equal(editor.stepStartFrame(preview,selected.scene.id,animation.target),animation.start_frame);
  assert.equal(editor.stepStartFrame(preview,selected.id,animation.target),null);
});

test('step seek fails closed for removed scenes, missing animations and dangling targets',()=>{
  assert.equal(typeof editor.stepStartFrame,'function');
  const video=structuredClone(demo) as VideoProject,scene=video.scenes[0];
  assert.equal(editor.stepStartFrame(video,'removed',scene.elements[0].id),null);
  assert.equal(editor.stepStartFrame(video,scene.id,'removed'),null);
  scene.animations=[];
  assert.equal(editor.stepStartFrame(video,scene.id,scene.elements[0].id),null);
  scene.animations=[{target:'removed',effect:'fade_slide',start_frame:1,duration_frames:18}];
  assert.equal(editor.stepStartFrame(video,scene.id,'removed'),null);
});

test('step seek rejects invalid saved frame without changing timing or cue data',()=>{
  assert.equal(typeof editor.stepStartFrame,'function');
  for(const frame of [-1,.5,NaN,Infinity]){
    const video=structuredClone(demo) as VideoProject,scene=video.scenes[0];scene.animations[0].start_frame=frame;
    const before=structuredClone(video);
    assert.equal(editor.stepStartFrame(video,scene.id,scene.animations[0].target),null);
    assert.deepEqual(video,before);
  }
  const video=structuredClone(demo) as VideoProject,scene=video.scenes[0];
  scene.animations[0].start_frame=scene.duration_frames;
  assert.equal(editor.stepStartFrame(video,scene.id,scene.animations[0].target),null);
  scene.animations[0].start_frame=0;
  assert.equal(editor.stepStartFrame(video,scene.id,scene.animations[0].target),0);
});

test('step navigation offers accessible non-submit controls for saved ready steps',()=>{
  const p=project(),row=p.scenes[0];
  assert.equal(typeof stepUI.PreviewSteps,'function');
  const html=renderToStaticMarkup(createElement(stepUI.PreviewSteps,{row,video:editor.readyVideo(p),busy:false,dirty:false,onSeek:()=>{}}));
  assert.match(html,/aria-label="步骤预览定位"/);
  assert.match(html,/<button type="button"[^>]*>[\s\S]*?定位步骤1<\/button>/);
  assert.doesNotMatch(html,/<button[^>]*disabled/);
  assert.match(html,/已保存/);
});

test('dirty, busy, pending and missing-timing steps cannot seek stale preview',()=>{
  assert.equal(typeof stepUI.PreviewSteps,'function');
  const p=project(),row=p.scenes[0],video=editor.readyVideo(p)!;
  for(const flags of [{busy:true,dirty:false},{busy:false,dirty:true}]){
    const html=renderToStaticMarkup(createElement(stepUI.PreviewSteps,{row,video,...flags,onSeek:()=>{}}));
    assert.match(html,/<button[^>]*disabled/);
  }
  for(const state of ['needs_voice','needs_timing']){
    const html=renderToStaticMarkup(createElement(stepUI.PreviewSteps,{row:{...row,state},video:null,busy:false,dirty:false,onSeek:()=>{}}));
    assert.match(html,/<button[^>]*disabled/);
  }
  video.scenes[0].animations=[];
  const html=renderToStaticMarkup(createElement(stepUI.PreviewSteps,{row,video,busy:false,dirty:false,onSeek:()=>{}}));
  assert.match(html,/<button[^>]*disabled/);
});
