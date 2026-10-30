import test from 'node:test';
import assert from 'node:assert/strict';
import {workbenchCaptionLines,workbenchDisplayCaptions} from '../src/workbench-captions';
import {workbenchSrt} from '../src/workbench';

test('display joins a contiguous short CJK tail without changing measured input',()=>{
 const raw=[{text:'检索、增强和生',start_frame:94,end_frame:221},{text:'成。',start_frame:221,end_frame:230}];
 const before=JSON.stringify(raw);
 assert.deepEqual(workbenchDisplayCaptions(raw),[{text:'检索、增强和生成。',start_frame:94,end_frame:230}]);
 assert.equal(JSON.stringify(raw),before);
});
test('display never merges across a gap, a completed sentence or a long tail',()=>{
 for(const raw of [
  [{text:'生',start_frame:0,end_frame:10},{text:'成。',start_frame:11,end_frame:19}],
  [{text:'完成。',start_frame:0,end_frame:10},{text:'好。',start_frame:10,end_frame:19}],
  [{text:'生',start_frame:0,end_frame:10},{text:'成。',start_frame:10,end_frame:40}],
 ])assert.deepEqual(workbenchDisplayCaptions(raw),raw);
});
test('punctuation-only explicit line is reflowed but intentional lines remain',()=>{
 assert.deepEqual(workbenchCaptionLines('相关文档片段\n。'),['相关文档片段。']);
 assert.deepEqual(workbenchCaptionLines('第一行\n第二行'),['第一行','第二行']);
 assert.throws(()=>workbenchCaptionLines('一\n二\n三'),/two-line/);
});
test('display does not merge English words or overflow the two-line budget',()=>{
 const english=[{text:'hello',start_frame:0,end_frame:10},{text:'AI',start_frame:10,end_frame:19}];
 assert.deepEqual(workbenchDisplayCaptions(english),english);
 const full=[{text:'字'.repeat(96),start_frame:0,end_frame:10},{text:'成。',start_frame:10,end_frame:19}];
 assert.deepEqual(workbenchDisplayCaptions(full),full);
 const explicit=[{text:'字\n'+'字'.repeat(48),start_frame:0,end_frame:10},{text:'成。',start_frame:10,end_frame:19}];
 assert.deepEqual(workbenchDisplayCaptions(explicit),explicit);
});
test('SRT uses the same display grouping and union boundaries as the player',()=>{
 const manifest={durationInFrames:230,chapters:[{from:0,scene:{captions:[{text:'生',start_frame:94,end_frame:221},{text:'成。',start_frame:221,end_frame:230}]}}]};
 assert.equal(workbenchSrt(manifest as Parameters<typeof workbenchSrt>[0]),'1\n00:00:03,133 --> 00:00:07,667\n生成。\n\n');
});
