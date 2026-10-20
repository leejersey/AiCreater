import {test} from 'node:test';
import assert from 'node:assert/strict';
import {API,request} from '../lib/editor';

test('implicit bodyless GET receives a five-second default signal',async t=>{
  const controller=new AbortController();let deadlines=0;
  t.mock.method(AbortSignal,'timeout',(ms:number)=>{assert.equal(ms,5000);deadlines++;return controller.signal;});
  t.mock.method(globalThis,'fetch',async(_input:unknown,init:RequestInit)=>{assert.equal(init.signal,controller.signal);assert.equal(init.method,undefined);assert.equal(init.body,undefined);return Response.json([]);});
  assert.deepEqual(await request('/api/projects'),[]);assert.equal(deadlines,1);
});

test('caller-owned read signal is preserved instead of receiving a second deadline',async t=>{
  const controller=new AbortController();
  t.mock.method(AbortSignal,'timeout',()=>{throw new Error('caller owns deadline');});
  t.mock.method(globalThis,'fetch',async(_input:unknown,init:RequestInit)=>{assert.equal(init.signal,controller.signal);return Response.json({});});
  assert.deepEqual(await request('/api/projects/p',undefined,'GET',controller.signal),{});
});

test('write submissions never acquire an automatic timeout or retry',async t=>{
  let calls=0;t.mock.method(AbortSignal,'timeout',()=>{throw new Error('must not time out a submitted mutation');});
  t.mock.method(globalThis,'fetch',async(_input:unknown,init:RequestInit)=>{calls++;assert.equal(init.signal,undefined);assert.notEqual(init.body,undefined);return Response.json({ok:true});});
  await request('/api/jobs/j/cancel',{});await request('/api/scenes/s',{expected_revision:1},'PATCH');await request('/api/custom',null);
  assert.equal(calls,3);
});

test('default read deadline rejects once without resubmitting the GET',async t=>{
  let calls=0;t.mock.method(AbortSignal,'timeout',()=>AbortSignal.abort(new DOMException('Read timeout','TimeoutError')));
  t.mock.method(globalThis,'fetch',async(_input:unknown,init:RequestInit)=>{calls++;init.signal?.throwIfAborted();return Response.json({});});
  await assert.rejects(request('/api/projects'),{name:'TimeoutError'});assert.equal(calls,1);
});

test('read request forwards AbortSignal without a mutation body',async t=>{
  const controller=new AbortController();let calls=0;
  t.mock.method(globalThis,'fetch',async(input:unknown,init:RequestInit)=>{
    calls++;assert.equal(input,API+'/api/projects/p/jobs');assert.equal(init.signal,controller.signal);
    assert.equal(init.method,undefined);assert.equal(init.body,undefined);
    return Response.json([{job_id:'j'}]);
  });
  assert.deepEqual(await request('/api/projects/p/jobs',undefined,'GET',controller.signal),[{job_id:'j'}]);assert.equal(calls,1);
});

test('abortable mutation preserves explicit method and JSON payload',async t=>{
  const controller=new AbortController();
  t.mock.method(globalThis,'fetch',async(_input:unknown,init:RequestInit)=>{
    assert.equal(init.signal,controller.signal);assert.equal(init.method,'PATCH');
    assert.equal(init.body,JSON.stringify({expected_revision:3}));assert.deepEqual(init.headers,{'Content-Type':'application/json'});
    return Response.json({revision:4});
  });
  assert.deepEqual(await request('/api/scenes/s',{expected_revision:3},'PATCH',controller.signal),{revision:4});
});

test('preaborted signal rejects at native fetch instead of making a request',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(request('http://127.0.0.1:8000/abort-check',undefined,'GET',controller.signal),{name:'AbortError'});
});

test('optional signal preserves conflict validation and never retries',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({message:'conflict'},{status:409});});
  await assert.rejects(request('/api/scenes/s',{expected_revision:3},'PATCH',new AbortController().signal),{cause:409,message:/输入已保留/});
  assert.equal(calls,1);
});
