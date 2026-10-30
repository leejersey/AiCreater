import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chapterPresentation,videoProgress,parseVisualJobs,type VisualJob} from '../lib/visual-workbench';
import {VisualTaskProgress} from '../app/VisualWorkbench';
const job=(change:Partial<VisualJob>={}):VisualJob=>({id:'j',project_id:'p',scene_id:'s',kind:'preview',state:'running',created_at:'2026-10-28T01:00:00Z',result:{},...change});
test('running preview hides old approval candidates instead of displaying contradictory actions',()=>{
 const source=job({id:'source',kind:'generate',state:'succeeded',result:{sha256:'a'.repeat(64),source:'export {}'}});
 const p=chapterPresentation([job(),source]);assert.equal(p.active?.id,'j');assert.equal(p.pending,undefined);
});
test('real job phases and submit elapsed time are exposed without inventing percent',()=>{
 const now=Date.parse('2026-10-28T01:01:10Z');
 assert.equal(videoProgress(job(),now).step,3);assert.equal(videoProgress(job(),now).elapsed,'已等待 1分10秒');
 assert.equal(videoProgress(job({kind:'generate'}),now).step,1);
 assert.equal(videoProgress(job({state:'queued'}),now).label,'等待执行');
 assert.equal(videoProgress(job({created_at:undefined}),now).elapsed,undefined);
 assert.match(videoProgress(job({state:'failed',error:'画面越界'}),now).detail,/画面越界/);
});
test('in-flight feedback shows a live indicator, cancel and refresh, not fake completion or approval',()=>{
 const html=renderToStaticMarkup(React.createElement(VisualTaskProgress,{job:job(),now:Date.parse('2026-10-28T01:01:10Z'),updatedAt:Date.parse('2026-10-28T01:01:09Z'),disabled:false,onCancel:()=>{},onRefresh:()=>{}}));
 assert.match(html,/<progress/);assert.doesNotMatch(html,/<progress[^>]*value=/);assert.match(html,/取消任务/);assert.match(html,/刷新状态/);assert.match(html,/1分10秒/);assert.match(html,/最近更新/);
});
test('job creation timestamps survive parsing and malformed timestamps are refused',()=>{
 const raw=job();assert.equal(parseVisualJobs({jobs:[raw]},'p')[0].created_at,raw.created_at);
 assert.throws(()=>parseVisualJobs({jobs:[{...raw,created_at:'not-a-time'}]},'p'));
});
