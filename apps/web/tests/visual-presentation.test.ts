import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chapterPresentation,videoTaskStatus,videoProgress,type VisualJob} from '../lib/visual-workbench';
import {VisualMedia,VisualHistoryEntry} from '../app/VisualWorkbench';
const job=(id:string,change:Partial<VisualJob>={}):VisualJob=>({id,project_id:'p',scene_id:'s',kind:'preview',state:'succeeded',current:true,result:{sha256:'a'.repeat(64),video:'video.mp4',frames:['stills/frame-0.png'],geometry:{status:'passed'}},...change});
test('failure feedback does not duplicate the no-retry suffix',()=>{
 const progress=videoProgress(job('failed',{state:'failed',error:'执行失败，未自动重试。'}));
 assert.equal(progress.detail.match(/未自动重试/g)?.length,1);
});
test('latest design failure does not inherit an unrelated old picture-repair stopped status',()=>{
 const latest=job('design-failed',{kind:'generate',state:'failed',result:{requests_dispatched:1}});
 const source=job('source',{kind:'generate',result:{source:'export {}',sha256:'b'.repeat(64)}});
 const preview=job('failed-preview',{result:{sha256:'b'.repeat(64),geometry:{status:'failed'}}});
 const repair=job('old-repair',{kind:'repair',state:'failed',operation:'quality-repair',repair_preview_id:'failed-preview',result:{requests_dispatched:1}});
 const presentation=chapterPresentation([latest,repair,preview,source]);
 assert.equal(presentation.designRepairTarget?.id,'design-failed');
 assert.equal(presentation.repairStopped,false);assert.equal(presentation.pending,undefined);
 const compileFailure={...latest,result:{requests_dispatched:2}};
 const compiled=chapterPresentation([compileFailure,repair,preview,source]);
 assert.equal(compiled.repairStopped,false);assert.equal(compiled.repairTarget,undefined);assert.equal(compiled.pending,undefined);
});
test('one current playable video survives a newer failed check; stale videos are not current',()=>{
 const failed=job('failed',{result:{sha256:'b'.repeat(64),geometry:{status:'failed'},frames:['stills/frame-0.png']}});
 const video=job('video'),old=job('old',{current:false});
 const p=chapterPresentation([failed,video,old]);assert.equal(p.video?.id,'video');assert.equal(p.latest?.id,'failed');
 assert.equal(chapterPresentation([old]).video,undefined);
 assert.equal(videoTaskStatus(failed),'视频未生成：画面检查未通过');
});
test('pending executable candidate is distinct from an already rendered source hash',()=>{
 const source=job('source',{kind:'generate',result:{source:'export {}',sha256:'a'.repeat(64)}});
 assert.equal(chapterPresentation([source]).pending?.id,'source');
 assert.equal(chapterPresentation([job('video'),source]).pending,undefined);
 assert.equal(chapterPresentation([job('video'),source]).editable?.id,'source');
 assert.match(videoTaskStatus(source),/待生成视频/);
});
test('normal media shows only the player and downloads; diagnostics and history are closed',()=>{
 const j=job('video');
 const html=renderToStaticMarkup(React.createElement(VisualMedia,{projectId:'p',job:j}));
 assert.equal((html.match(/<video /g)??[]).length,1);assert.doesNotMatch(html,/<img /);
 const diagnostic=renderToStaticMarkup(React.createElement(VisualMedia,{projectId:'p',job:j,diagnostics:true}));assert.match(diagnostic,/<img /);
 const history=renderToStaticMarkup(React.createElement(VisualHistoryEntry,{job:j},React.createElement('video',{src:'private-history.mp4'})));
 assert.match(history,/<summary/);assert.doesNotMatch(history,/<video|open=""/);
});
