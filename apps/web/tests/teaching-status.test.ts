import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TeachingStatus,TeachingVideo} from '../app/TeachingWorkbench';
import {parseTeachingTask} from '../lib/teaching-workbench';
test('cached plan never displays completed video or a fake percent',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const task=parseTeachingTask({id,project_id:id,scene_id:id,base_revision:1,created_at:'2026-10-29T00:00:00Z',snapshot_sha256:'a'.repeat(64),state:'active',max_requests:2,requests_used:0,calls:[],generation_mode:'teaching-plan',stage:'artifact-cached',message:'画面数据已保存，尚未渲染视频。',current:true,timing_mode:'draft',can_run:false,video_ready:false,accepted:false,execution:'not-run'},id);
 const html=renderToStaticMarkup(React.createElement(TeachingStatus,{task}));
 assert.match(html,/尚未渲染视频/);assert.match(html,/0 \/ 2/);assert.doesNotMatch(html,/视频已完成|100%|<video/);
});
test('only checked preview gets a player and scoped download; historical video is labelled',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const task=parseTeachingTask({id,project_id:id,scene_id:id,base_revision:1,created_at:'2026-10-29T00:00:00Z',snapshot_sha256:'a'.repeat(64),state:'active',max_requests:2,requests_used:0,calls:[],generation_mode:'teaching-plan',stage:'stale',message:'输入变化',current:false,timing_mode:'draft',can_run:false,can_render:false,video_ready:true,accepted:false,execution:'succeeded',render:{id,state:'succeeded',artifact_sha256:'b'.repeat(64),error_code:null,video_ready:true,accepted:false}},id);
 const html=renderToStaticMarkup(React.createElement(TeachingVideo,{task,projectId:id,historical:true}));
 assert.match(html,/<video/);assert.match(html,/历史版本/);assert.match(html,/无声预览/);assert.match(html,/download=true/);assert.doesNotMatch(html,/已验收|整课完成/);
 assert.equal(renderToStaticMarkup(React.createElement(TeachingVideo,{task:{...task,video_ready:false,render:null,execution:'not-run'},projectId:id})), '');
});
