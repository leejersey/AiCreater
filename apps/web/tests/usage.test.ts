import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseUsageRecords} from '../lib/usage';
import {UsageRecords,UsageRecordsView} from '../app/UsageRecords';
const observation={version:1,kind:'voice',state:'reported',quantity:{input_tokens:null,output_tokens:null,cache_hit_tokens:null,cache_miss_tokens:null,submitted_characters:3000},prices:{checked_on:'2026-10-15',currency:'CNY',model:'seed-tts-2.0',rates:{per_10000:'3'},sources:['https://docs.volcengine.com/docs/DoubaoVoice/Billinginstructions-21?lang=zh']},reference:{minimum_cny:.9,maximum_cny:.9}};
const payload={summary:{attempts:2,known:1,unknown:1,historical_unknown:1,minimum_cny:.9,maximum_cny:.9},items:[{job_id:'j',attempt_id:'a',number:1,kind:'voice',state:'failed',started_at:'2026-10-15T00:00:00Z',ended_at:null,usage:observation},{job_id:'old',attempt_id:'b',number:1,kind:'voice',state:'succeeded',started_at:'2026-10-15T00:00:00Z',ended_at:null,usage:null}]};
test('usage parser rejects false totals/invalid amounts and drops raw provider details',()=>{
  const result=parseUsageRecords({...payload,secret:'private'});assert.equal(result.summary.unknown,1);assert.doesNotMatch(JSON.stringify(result),/private/);
  for(const value of [null,{...payload,summary:{...payload.summary,unknown:0}},{...payload,summary:{...payload.summary,minimum_cny:NaN}},
    {...payload,items:[{...payload.items[0],usage:{...observation,reference:{minimum_cny:-1,maximum_cny:.9}}}]},
    {...payload,items:[{...payload.items[0],number:true}]}])assert.throws(()=>parseUsageRecords(value));
});
test('history separates known failed attempt from historical unknown, never calls subtotal a bill',()=>{
  const html=renderToStaticMarkup(createElement(UsageRecordsView,{data:parseUsageRecords(payload),checking:false,error:'',onRefresh(){}}));
  const unknown={summary:{attempts:1,known:0,unknown:1,historical_unknown:1,minimum_cny:0,maximum_cny:0},items:[payload.items[1]]};
  const unknownHTML=renderToStaticMarkup(createElement(UsageRecordsView,{data:parseUsageRecords(unknown),checking:false,error:'',onRefresh(){}}));
  assert.match(unknownHTML,/暂无可核价记录/);assert.doesNotMatch(unknownHTML,/¥0/);
  assert.match(html,/已记录部分/);assert.match(html,/0\.9/);assert.match(html,/3000/);assert.match(html,/待核实/);assert.match(html,/历史/);assert.match(html,/failed/);assert.match(html,/2026-10-15/);assert.match(html,/不是账单/);assert.match(html,/失败.*取消/);
});
test('refresh/error hide stale amounts; tiny reference amounts are not silently zero',()=>{
  for(const state of [{checking:true,error:''},{checking:false,error:'失败'}]){
    const html=renderToStaticMarkup(createElement(UsageRecordsView,{...state,data:parseUsageRecords(payload),onRefresh(){}}));
    assert.doesNotMatch(html,/3000|0\.9|2026-10-15/);assert.match(html,/读取中|读取失败/);
  }
  const tiny={summary:{attempts:1,known:1,unknown:0,historical_unknown:0,minimum_cny:.000001,maximum_cny:.000001},items:[{...payload.items[0],usage:{...observation,reference:{minimum_cny:.000001,maximum_cny:.000001}}}]};
  assert.match(renderToStaticMarkup(createElement(UsageRecordsView,{data:parseUsageRecords(tiny),checking:false,error:'',onRefresh(){}})),/0\.000001/);
});
test('SSR usage panel never submits requests or claims old API is free',()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
  try{assert.match(renderToStaticMarkup(createElement(UsageRecords,{projectId:'p'})),/读取中/);assert.equal(calls,0);}
  finally{globalThis.fetch=original;}
});
