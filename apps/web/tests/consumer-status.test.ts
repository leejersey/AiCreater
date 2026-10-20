import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseConsumerStatus} from '../lib/consumers';
import {ConsumerStatus,ConsumerStatusView} from '../app/ConsumerStatus';

const checked={checked_at:'2026-10-15T00:00:00+00:00',code:'checked',queues:{workflow:{state:'detected',responders:1},render:{state:'not_detected',responders:0}}};
test('metadata parser accepts fixed states and discards arbitrary worker details',()=>{
  assert.deepEqual(parseConsumerStatus({...checked,worker_name:'private'}),checked);
  assert.throws(()=>parseConsumerStatus(null));
  for(const value of [{...checked,checked_at:'bad'},{...checked,code:'wrong'},
    {...checked,queues:{}},{...checked,queues:{...checked.queues,workflow:{state:'detected',responders:0}}},
    {...checked,code:'inspection_failed'},
    {...checked,queues:{...checked.queues,render:{state:'not_detected',responders:-1}}}])assert.throws(()=>parseConsumerStatus(value));
});
test('status distinguishes detected, absent response and failure without claiming executable readiness',()=>{
  const data=parseConsumerStatus(checked);
  const html=renderToStaticMarkup(createElement(ConsumerStatusView,{data,checking:false,error:'',onRefresh:()=>{}}));
  assert.match(html,/workflow/);assert.match(html,/render/);assert.match(html,/检测到响应/);assert.match(html,/未检测到响应/);
  assert.match(html,/上次检查/);assert.match(html,/2026-10-15/);assert.match(html,/不代表离线/);assert.match(html,/不自动启动/);
  assert.doesNotMatch(html,/消费者就绪|一定执行/);
  const unknown=parseConsumerStatus({...checked,code:'inspection_failed',queues:{workflow:{state:'unknown',responders:0},render:{state:'unknown',responders:0}}});
  assert.match(renderToStaticMarkup(createElement(ConsumerStatusView,{data:unknown,checking:false,error:'',onRefresh:()=>{}})),/检查失败/);
});
test('refresh and error states never leave previous positive observations visible',()=>{
  for(const state of [{checking:true,error:''},{checking:false,error:'本地检测失败'}]){
    const html=renderToStaticMarkup(createElement(ConsumerStatusView,{...state,data:parseConsumerStatus(checked),onRefresh:()=>{}}));
    assert.doesNotMatch(html,/检测到响应/);assert.doesNotMatch(html,/2026-10-15/);
    assert.match(html,/检查中|检查失败/);
  }
});
test('SSR performs no broker or browser request',()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('unexpected request');};
  try{const html=renderToStaticMarkup(createElement(ConsumerStatus));assert.match(html,/检查中/);assert.equal(calls,0);}
  finally{globalThis.fetch=original;}
});
