import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import demo from '../../../examples/demo.json';
import type {DraftScene,SceneRow} from '../lib/editor';
import * as changes from '../lib/version-changes';
import * as candidateUI from '../app/CandidateReview';

test('candidate response validates metadata and scene ownership without rewriting saved drafts',()=>{
  assert.equal(typeof candidateUI.parseCandidates,'function');
  const {row,candidate}=fixture(),data=[candidate],before=structuredClone(data);
  assert.equal(candidateUI.parseCandidates(data,row.id),data);
  assert.deepEqual(data,before);
  assert.deepEqual(candidateUI.parseCandidates([],row.id),[]);
});

test('candidate response rejects wrong-owner, duplicate and malformed envelopes',()=>{
  assert.equal(typeof candidateUI.parseCandidates,'function');
  const {row,candidate}=fixture();
  for(const data of [null,{},[null],[candidate,candidate],[{...candidate,id:''}],[{...candidate,scene_id:'other'}],[{...candidate,base_revision:0}],[{...candidate,base_revision:1.5}],[{...candidate,accepted:'false'}],[{id:'c',scene_id:row.id,base_revision:1,accepted:false}]]){
    assert.throws(()=>candidateUI.parseCandidates(data,row.id),/候选列表/);
  }
});

test('historical malformed draft remains read-only inspectable rather than silently dropped',()=>{
  assert.equal(typeof candidateUI.parseCandidates,'function');
  const {row,candidate}=fixture();const data=[{...candidate,draft:null}];
  assert.equal(candidateUI.parseCandidates(data,row.id),data);
});

test('candidate list starts loading with refresh disabled and no stale accept controls',()=>{
  assert.equal(typeof candidateUI.CandidateList,'function');
  const {row}=fixture();
  const html=renderToStaticMarkup(createElement(candidateUI.CandidateList,{row,busy:false,dirty:false,refreshToken:'',onAccept:()=>{}}));
  assert.match(html,/aria-label="候选分镜"/);assert.match(html,/正在读取候选/);
  assert.match(html,/<button type="button" disabled="">刷新候选列表<\/button>/);
  assert.doesNotMatch(html,/确认接受|暂无候选/);
});

function fixture(){
  const row:SceneRow={id:'database-row',revision:4,state:'ready',scene:structuredClone(demo.scenes[0]) as DraftScene};
  const candidate={id:'candidate',scene_id:row.id,base_revision:row.revision,accepted:false,draft:structuredClone(row.scene)};
  return {row,candidate};
}

test('candidate uses shared teaching comparison with exact saved and proposed values, without mutation',()=>{
  assert.equal(typeof changes.sceneTeachingChanges,'function');
  const {row,candidate}=fixture();candidate.draft.narration.text='新口播';candidate.draft.code={language:'python',source:'print(1)'};
  const before=structuredClone({row,candidate});
  const result=changes.sceneTeachingChanges(row.scene,candidate.draft);
  assert.deepEqual(result.changes,['口播','代码']);
  assert.equal(result.values?.[0].before,row.scene.narration.text);assert.equal(result.values?.[0].after,'新口播');
  assert.deepEqual({row,candidate},before);
});

test('comparison detects steps and connections, ignoring derived audio and object key order',()=>{
  assert.equal(typeof changes.sceneTeachingChanges,'function');
  const {row,candidate}=fixture();
  Object.assign(candidate.draft,{duration_frames:1,animations:[],captions:[]});candidate.draft.narration.audio_asset_id='changed_audio';
  candidate.draft.elements[0]=Object.fromEntries(Object.entries(candidate.draft.elements[0]).reverse()) as DraftScene['elements'][number];
  assert.deepEqual(changes.sceneTeachingChanges(row.scene,candidate.draft),{changes:[]});
  candidate.draft.elements[0].content+='修改';candidate.draft.edges=[{from:'a',to:'b'}];
  assert.deepEqual(changes.sceneTeachingChanges(row.scene,candidate.draft).changes,['步骤','连线']);
});

test('candidate review shows readable proposed narration, field changes and complete read-only JSON',async()=>{
  const {CandidateReview}=await import('../app/CandidateReview');
  const {row,candidate}=fixture();candidate.draft.narration.text='<script>新口播</script>';candidate.draft.elements[0].content+='候选';
  const html=renderToStaticMarkup(createElement(CandidateReview,{row,candidate,busy:false,dirty:false,onAccept:()=>{}}));
  assert.match(html,/已保存 r4 → 候选/);assert.match(html,/口播、步骤/);
  assert.match(html,/&lt;script&gt;新口播&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);
  assert.match(html,/完整候选JSON（只读）/);assert.match(html,/<button type="button">确认接受<\/button>/);
  assert.match(html,/当前已保存值/);assert.match(html,/候选值/);
});

test('unchanged teaching content does not claim new audio or require automatic generation',async()=>{
  const {CandidateReview}=await import('../app/CandidateReview');
  const {row,candidate}=fixture();
  const html=renderToStaticMarkup(createElement(CandidateReview,{row,candidate,busy:false,dirty:false,onAccept:()=>{}}));
  assert.match(html,/本摘要覆盖的教学字段无变化/);assert.match(html,/不含未保存输入/);
  assert.match(html,/配音、字幕或时轴/);
});

test('accepted, stale, different-scene, dirty and busy candidates cannot be accepted',async()=>{
  const {CandidateReview}=await import('../app/CandidateReview');
  const {row,candidate}=fixture();
  for(const override of [{accepted:true},{base_revision:3},{scene_id:'other-row'},{draft:{...candidate.draft,id:'other-dsl'}}]){
    const html=renderToStaticMarkup(createElement(CandidateReview,{row,candidate:{...candidate,...override},busy:false,dirty:false,onAccept:()=>{}}));
    assert.match(html,/<button[^>]*disabled/);
  }
  for(const flags of [{busy:true,dirty:false},{busy:false,dirty:true}]){
    const html=renderToStaticMarkup(createElement(CandidateReview,{row,candidate,...flags,onAccept:()=>{}}));
    assert.match(html,/<button[^>]*disabled/);
  }
  const stale=renderToStaticMarkup(createElement(CandidateReview,{row,candidate:{...candidate,base_revision:3},busy:false,dirty:false,onAccept:()=>{}}));
  assert.match(stale,/已过期/);assert.match(stale,/当前 r4/);
});

test('malformed historical candidate cannot crash review or enable acceptance',async()=>{
  const {CandidateReview}=await import('../app/CandidateReview');
  for(const malformed of [{narration:undefined},{narration:{text:{bad:true}}},{elements:null},{elements:[{id:'bad',content:'bad',cue:null}]}]){
    const {row,candidate}=fixture();Object.assign(candidate.draft,malformed);
    const html=renderToStaticMarkup(createElement(CandidateReview,{row,candidate,busy:false,dirty:false,onAccept:()=>{}}));
    assert.match(html,/无法比较/);assert.match(html,/完整候选JSON（只读）/);assert.match(html,/<button[^>]*disabled/);
  }
});
