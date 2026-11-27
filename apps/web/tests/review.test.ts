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

test('the gate reason: only for a required review that is missing, stale or still blocked',async()=>{
 const {reviewBlock}=await import('../lib/review');
 assert.equal(reviewBlock(null),null);assert.equal(reviewBlock(state({required:false})),null);
 assert.match(reviewBlock(state({}))!,/先通过内容审核/);
 assert.match(reviewBlock(state({result:result([]),current:false}))!,/口播改过了/);
 assert.match(reviewBlock(state({result:result([item('b','block')])}))!,/1 条阻断/);
 assert.equal(reviewBlock(state({result:result([item('b','block')]),overrides:{b:{note:'ok',at:''}}})),null);
});

test('a review_required conflict keeps the server message instead of the generic conflict advice',async()=>{
 const {request}=await import('../lib/editor');
 const original=globalThis.fetch;
 globalThis.fetch=(async()=>new Response(JSON.stringify({code:'review_required',message:'内容审核还有 2 条阻断项'}),{status:409})) as typeof fetch;
 try{await assert.rejects(request('/api/scenes/s/voice',{}),(e:Error)=>e.message==='内容审核还有 2 条阻断项'&&e.cause==='review_required');}
 finally{globalThis.fetch=original;}
});
