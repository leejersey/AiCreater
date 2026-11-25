import test from 'node:test';
import assert from 'node:assert/strict';
import {openBlocks,orderedItems,reviewSummary,type ReviewItem,type ReviewState} from '../lib/review';

const item=(id:string,severity:ReviewItem['severity']):ReviewItem=>({id,kind:'claim',severity,section_id:'s1',section:'第 1 章',text:id,detail:''});
const result=(items:ReviewItem[])=>({level:'block' as const,hash:'h',items,claims:[],counts:{claims:0,sourced:0,secondhand:0,unsourced:0,evidence:0},at:''});
const state=(patch:Partial<ReviewState>):ReviewState=>({required:true,result:null,overrides:{},current:true,level:null,evidence:2,...patch});

test('blocking items come first, confirmed ones after the open ones, then reminders and suggestions',()=>{
 const items=[item('i','info'),item('w','warn'),item('b1','block'),item('b2','block')];
 assert.deepEqual(orderedItems(items,{b1:{note:'ok',at:''}}).map(i=>i.id),['b2','b1','w','i']);
 assert.equal(openBlocks({result:result(items),overrides:{b1:{note:'ok',at:''}}}),1);
});

test('the review button says what stands between the course and voicing',()=>{
 assert.deepEqual(reviewSummary(null),{label:'内容审核',tone:'idle'});
 assert.deepEqual(reviewSummary(state({required:false})),{label:'内容审核',tone:'idle'});
 assert.deepEqual(reviewSummary(state({})),{label:'内容审核 · 未运行',tone:'block'});
 assert.equal(reviewSummary(state({result:result([item('b','block')]),level:'block'})).label,'内容审核 · 1 条阻断');
 assert.equal(reviewSummary(state({result:result([item('b','block')]),current:false})).tone,'block');
 assert.deepEqual(reviewSummary(state({result:result([item('b','block')]),overrides:{b:{note:'ok',at:''}},level:'warn'})),{label:'内容审核 · 有提醒',tone:'warn'});
 assert.deepEqual(reviewSummary(state({result:result([]),level:'pass'})),{label:'内容审核 · 通过',tone:'ok'});
});
