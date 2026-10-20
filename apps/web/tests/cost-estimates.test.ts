import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseEstimate,formatEstimate,confirmEstimate} from '../lib/cost-estimates';

const quote={status:'estimated',currency:'CNY',minimum_cny:.0018,maximum_cny:.0018,
  quantity:{calls:1,reused_jobs:0,characters:6,input_tokens_min:0,input_tokens_max:0,output_tokens_max:0},
  prices_checked_on:'2026-10-15',sources:['https://docs.volcengine.com/docs/DoubaoVoice/Billinginstructions-21?lang=zh'],notes:['参考价，不是扣费上限']};
test('strict quotes preserve small nonzero prices and sources, reject false free or bad values',()=>{
  assert.ok(parseEstimate(quote));assert.match(formatEstimate(parseEstimate(quote)),/0\.0018/);
  assert.match(formatEstimate(parseEstimate(quote)),/6.*字符/);assert.match(formatEstimate(parseEstimate(quote)),/2026-10-15/);
  assert.match(formatEstimate(parseEstimate(quote)),/https:\/\/docs.volcengine.com/);
  for(const value of [{...quote,minimum_cny:-1},{...quote,maximum_cny:NaN},{...quote,status:'no_new_call'},
    {...quote,currency:'USD'},{...quote,sources:['https://evil.example']},{...quote,quantity:{...quote.quantity,calls:true}},
    {...quote,maximum_cny:0},{...quote,status:['estimated']},{...quote,minimum_cny:0,maximum_cny:0},{...quote,prices_checked_on:'2026-02-30'},{...quote,notes:'raw-error'}])assert.equal(parseEstimate(value),null);
  assert.match(formatEstimate(null),/暂无法估算/);assert.doesNotMatch(formatEstimate(null),/¥0/);
  assert.match(formatEstimate(parseEstimate({...quote,status:'unknown',minimum_cny:null,maximum_cny:null})),/暂无法估算/);
});
test('reused tasks and local work explicitly distinguish new calls from existing future charges',()=>{
  const result=parseEstimate({...quote,status:'no_new_call',minimum_cny:0,maximum_cny:0,quantity:{...quote.quantity,calls:0,reused_jobs:1}});
  assert.match(formatEstimate(result),/新增调用/);assert.match(formatEstimate(result),/复用.*1/);
});
test('cancelled quote confirmation sends only readonly estimate, never submits or dispatches',async()=>{
  const seen:{url:string;init?:RequestInit}[]=[];let prompt='';
  const fetcher=async(url:string,init?:RequestInit)=>{seen.push({url,init});return new Response(JSON.stringify(quote),{status:200});};
  const accepted=await confirmEstimate('本章配音','/estimate',{operation:'voice'},()=>true,{fetcher,confirm:s=>{prompt=s;return false;}});
  assert.equal(accepted,false);assert.equal(seen.length,1);assert.equal(seen[0].init?.method,'POST');assert.equal(seen[0].init?.cache,'no-store');
  assert.match(prompt,/本章配音/);assert.match(prompt,/0\.0018/);assert.match(prompt,/继续/);
});
test('old API, invalid payload and aborted estimate remain unknown, explicit consent still required',async()=>{
  for(const fetcher of [async()=>new Response('',{status:404}),async()=>new Response('{}',{status:200}),async()=>{throw new Error('secret raw network failure');}]){
    let prompt='';assert.equal(await confirmEstimate('配音','/estimate',undefined,()=>true,{fetcher,confirm:s=>{prompt=s;return true;}}),true);
    assert.match(prompt,/暂无法估算/);assert.doesNotMatch(prompt,/secret|¥0/);
  }
});
test('revision conflict and changed context cannot open a paid confirmation',async()=>{
  let confirmed=0;const confirm=()=>{confirmed++;return true;};
  await assert.rejects(()=>confirmEstimate('配音','/estimate',{},()=>true,{confirm,fetcher:async()=>new Response('',{status:409})}),/版本/);
  assert.equal(await confirmEstimate('配音','/estimate',{},()=>false,{confirm,fetcher:async()=>new Response(JSON.stringify(quote))}),false);
  assert.equal(confirmed,0);
});
test('quote fetch has bounded timeout; timeout is not a free result',async()=>{
  let aborted=false,prompt='';
  const fetcher=(_url:string,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
    init?.signal?.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));});
  });
  assert.equal(await confirmEstimate('配音','/estimate',{},()=>true,{fetcher,timeoutMs:10,confirm:s=>{prompt=s;return false;}}),false);
  assert.equal(aborted,true);assert.match(prompt,/暂无法估算/);
});
