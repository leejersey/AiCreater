import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import demo from '../../../examples/demo.json';
import type {VideoProject} from '../../../packages/video-schema/src/types';
import {request, reviewKey, videoDocument, draftPreviewVideo, type Job, type Project} from '../lib/editor';
import * as course from '../lib/course';
import {CourseOverview} from '../app/CourseOverview';
import * as courseUI from '../app/CourseOverview';

function project(): Project {
  const {scenes, ...config} = structuredClone(demo) as VideoProject;
  return {id: 'p', title: 'course', revision: 3, source_text: '', config,
    scenes: scenes.map(scene => ({id: scene.id, revision: 2, state: 'ready', scene}))};
}
function voice(row: Project['scenes'][number], state: string): Job {
  return {job_id: 'job', scene_id: row.id, kind: 'voice', state, progress: 0, base_revision: row.revision};
}

test('course headings show escaped saved chapter title and retain state and revision',()=>{
  const p=project();p.scenes[0].scene.elements[0].content='<img src=x onerror=alert(1)>🙂';
  const html=renderToStaticMarkup(createElement(CourseOverview,{project:p,jobs:[],reviews:new Set<string>(),dirty:false,busy:false,onSelect:()=>{},onReview:()=>{},onSubmit:()=>{},onTiming:()=>{}}));
  assert.match(html,/<strong>第1章 · &lt;img src=x onerror=alert\(1\)&gt;🙂/);
  assert.match(html,/可导出/);assert.match(html,/待确认/);assert.match(html,/r2/);assert.doesNotMatch(html,/<img src=x/);
});

test('saved manuscript preserves Unicode and whitespace and escapes markup',()=>{
  assert.equal(typeof courseUI.SavedManuscript,'function');
  const p=project();p.source_text='第一段🙂\n\n  <script>alert(1)</script>\n末段';
  const html=renderToStaticMarkup(createElement(courseUI.SavedManuscript,{project:p}));
  assert.match(html,/已保存全文（只读）/);assert.match(html,/role="region" aria-label="已保存全文"/);
  assert.ok(html.includes('第一段🙂\n\n  &lt;script&gt;alert(1)&lt;/script&gt;\n末段'));
  assert.doesNotMatch(html,/<script>/);assert.match(html,/不是最初提交稿/);assert.match(html,/不含未保存输入/);
});

test('Markdown archive stays separate from spoken script and renderer metadata',()=>{
  const p=project();p.source_text='口播原文。';
  p.config.manuscript={markdown:'## [s1] 标题\n### 画面素材\n<script>not executable</script>'};
  p.config.teaching_style='popular';
  const html=renderToStaticMarkup(createElement(courseUI.SavedManuscript,{project:p}));
  assert.match(html,/原始 Markdown/);assert.match(html,/只读存档/);assert.match(html,/不随章节口播编辑更新/);
  assert.match(html,/&lt;script&gt;not executable&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);
  assert.equal('manuscript' in videoDocument(p),false);
  assert.equal('teaching_style' in videoDocument(p),false);
  p.scenes[0].state='needs_voice';
  const preview=draftPreviewVideo(p,p.scenes[0].id);assert.ok(preview);
  assert.equal('manuscript' in preview,false);
  assert.equal('teaching_style' in preview,false);assert.equal(p.source_text,'口播原文。');
});
test('empty saved manuscript never invents text from chapters',()=>{
  assert.equal(typeof courseUI.SavedManuscript,'function');
  const p=project(),html=renderToStaticMarkup(createElement(courseUI.SavedManuscript,{project:p}));
  assert.match(html,/暂无已保存全文/);assert.ok(!html.includes(p.scenes[0].scene.narration.text));
});

test('saved manuscript offers explicit copy of saved text without changing document or exposing config',()=>{
  assert.equal(typeof courseUI.SavedManuscript,'function');
  const p=project();p.source_text='😀'.repeat(3999)+'末';const before=structuredClone(p);
  const html=renderToStaticMarkup(createElement(courseUI.SavedManuscript,{project:p}));
  assert.ok(html.includes(p.source_text));assert.doesNotMatch(html,/<(?:input|textarea|form)[ >]/);
  assert.deepEqual(p,before);assert.ok(!html.includes(JSON.stringify(p.config)));
});

test('saved manuscript copy button is explicit, enabled for content and mentions system clipboard',()=>{
  const p=project();p.source_text='  保存稿🙂\n原样保留  ';
  const html=renderToStaticMarkup(createElement(courseUI.SavedManuscript,{project:p}));
  assert.match(html,/<button type="button">复制已保存全文<\/button>/);assert.match(html,/系统剪贴板/);assert.ok(html.includes(p.source_text));
});

test('empty saved manuscript disables copy without inferring text from scenes',()=>{
  const p=project(),html=renderToStaticMarkup(createElement(courseUI.SavedManuscript,{project:p}));
  assert.match(html,/<button type="button" disabled="">复制已保存全文<\/button>/);assert.ok(!html.includes(p.scenes[0].scene.narration.text));
});

test('request preserves HTTP status for unsupported batch route without retry',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(JSON.stringify({detail:'Not Found'}),{status:404});});
  await assert.rejects(request('/api/projects/p/timing',{confirmed:true}),{cause:404});assert.equal(calls,1);
});

test('batch timing selects only reviewed saved pending rows with audio, independent of voice jobs',()=>{
  const p=project();p.scenes[0].state='needs_timing';p.scenes[1].state='needs_voice';
  const keys=new Set(p.scenes.map(reviewKey)),before=structuredClone(p);
  assert.deepEqual(course.batchTimingScenes(p,keys,keys,false),[{scene_id:p.scenes[0].id,expected_revision:2}]);
  assert.deepEqual(course.batchTimingScenes(p,keys,keys,true),[]);
  assert.deepEqual(course.batchTimingScenes(p,new Set(),keys,false),[]);
  assert.deepEqual(course.batchTimingScenes(p,keys,new Set(),false),[]);assert.deepEqual(p,before);
  p.scenes[0].revision++;assert.deepEqual(course.batchTimingScenes(p,keys,keys,false),[]);
  p.scenes[0].revision--;delete p.scenes[0].scene.narration.audio_asset_id;
  assert.deepEqual(course.batchTimingScenes(p,keys,keys,false),[]);
});

test('batch timing controls are independent, accessible and disabled while dirty',()=>{
  const p=project();p.scenes[0].state='needs_timing';
  const html=renderToStaticMarkup(createElement(CourseOverview,{project:p,jobs:[],reviews:new Set(p.scenes.map(reviewKey)),dirty:true,busy:false,onSelect:()=>{},onReview:()=>{},onSubmit:()=>{},onTiming:()=>{}}));
  assert.match(html,/选择已确认待对齐章节/);assert.match(html,/disabled=""[^>]*>批量本地对齐/);
  assert.match(html,/选择第1章批量本地对齐/);assert.match(html,/失败不自动重试/);
});

test('batch selection requires manual review of saved revision and never revoices valid audio', () => {
  const p = project();
  p.scenes[0].state = 'needs_voice'; p.scenes[1].state = 'needs_timing';
  const reviews = new Set(p.scenes.map(reviewKey));
  const selected = new Set(p.scenes.map(reviewKey));
  assert.deepEqual(course.batchVoiceScenes(p, [], reviews, selected, false), [{scene_id: p.scenes[0].id, expected_revision: 2}]);
  assert.deepEqual(course.batchVoiceScenes(p, [], reviews, selected, true), []);
  assert.deepEqual(course.batchVoiceScenes(p, [], new Set(), selected, false), []);
  assert.deepEqual(course.batchVoiceScenes(p, [], reviews, new Set(), false), []);
  p.scenes[0].revision++;
  assert.deepEqual(course.batchVoiceScenes(p, [], reviews, selected, false), []);
});

test('existing current jobs including terminal states require explicit single-scene handling', () => {
  const p = project(); p.scenes[0].state = 'needs_voice';
  const row = p.scenes[0], keys = new Set([reviewKey(row)]);
  for (const state of ['queued', 'running', 'failed', 'cancelled', 'succeeded']) {
    const job = voice(row, state);
    assert.equal(course.currentVoiceJob(row, [job]), job);
    assert.deepEqual(course.batchVoiceScenes(p, [job], keys, keys, false), []);
  }
  const old = {...voice(row, 'failed'), base_revision: 1};
  assert.equal(course.currentVoiceJob(row, [old]), undefined);
  assert.equal(course.currentVoiceJob(row, [{...voice(row, 'queued'), kind: 'timing'}]), undefined);
  assert.equal(course.batchVoiceScenes(p, [old], keys, keys, false).length, 1);
});

test('export blockers locate pending scenes, dirty input and missing audio without altering draft', () => {
  const p = project(), original = structuredClone(p);
  assert.deepEqual(course.exportIssues(p, false), []);
  assert.ok(course.exportIssues(p, true).some(e => /保存/.test(e.message)));
  assert.ok(course.exportIssues({...p, scenes: []}, false).some(e => /分镜/.test(e.message)));
  assert.deepEqual(p, original);
  p.scenes[0].state = 'needs_voice'; p.scenes[1].state = 'needs_timing';
  const issues = course.exportIssues(p, false);
  assert.ok(issues.some(e => e.sceneId === p.scenes[0].id && /配音/.test(e.message)));
  assert.ok(issues.some(e => e.sceneId === p.scenes[1].id && /时间轴/.test(e.message)));
  p.scenes[0].state = 'ready'; p.scenes[0].scene.narration.audio_asset_id = 'missing';
  assert.ok(course.exportIssues(p, false).some(e => e.sceneId === p.scenes[0].id && e.code === 'missing_asset'));
  p.scenes[0].state = 'needs_voice'; p.scenes[1].state = 'ready';
  p.scenes[1].scene.narration.audio_asset_id = 'missing';
  assert.ok(course.exportIssues(p, false).some(e => e.sceneId === p.scenes[1].id && e.code === 'missing_asset'));
});

test('export checks reuse schema for caption layout and aggregate duration limits', () => {
  const p = project();
  const scene = p.scenes[0].scene as VideoProject['scenes'][number];
  scene.captions[0].text = '长'.repeat(45);
  assert.ok(course.exportIssues(p, false).some(e => e.sceneId === p.scenes[0].id && /布局/.test(e.message)));
  const long = project();
  for (const row of long.scenes) row.scene.duration_frames = 4501;
  assert.ok(course.exportIssues(long, false).some(e => e.code === 'duration_limit'));
});

test('course overview presents confirmation, reuse, failures and navigable export blockers', () => {
  const p = project(); p.scenes[0].state = 'needs_voice'; p.scenes[1].state = 'needs_timing';
  const before = structuredClone(p);
  const html = renderToStaticMarkup(createElement(CourseOverview, {
    project: p, jobs: [voice(p.scenes[0], 'failed')], reviews: new Set<string>(), dirty: true, busy: false,
    onSelect: () => {}, onReview: () => {}, onSubmit: () => {}, onTiming: () => {},
  }));
  assert.match(html, /整课制作/); assert.match(html, /待确认/); assert.match(html, /待对齐/);
  assert.match(html, /保留原音频/); assert.match(html, /失败 1/); assert.match(html, /显式重试/);
  assert.match(html, /导出前检查/); assert.match(html, /定位第1章/);
  assert.match(html, /disabled=""[^>]*>批量配音/);
  assert.match(html, /有未保存的修改，请先保存。/);
  assert.deepEqual(p, before);
});

test('unconfirmed chapters explain why batch voice cannot be selected', () => {
  const p = project();
  p.scenes[0].state = 'needs_voice';
  const html = renderToStaticMarkup(createElement(CourseOverview, {
    project: p, jobs: [], reviews: new Set<string>(), dirty: false, busy: false,
    onSelect: () => {}, onReview: () => {}, onSubmit: () => {}, onTiming: () => {},
  }));
  assert.match(html, /disabled=""[^>]*\/>选择第1章批量配音/);
  assert.match(html, /请先展开「核对口播与步骤」，勾选已核对。/);
});
