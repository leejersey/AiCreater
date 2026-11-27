import test from 'node:test';
import assert from 'node:assert/strict';
import {elapsed,estimateText,finished,type Task} from '../lib/tasks';

const task=(id:string,state:Task['state']):Task=>({id,kind:'voice',state,label:'配音',title:'课',href:'/courses/p',created_at:null,started_at:null,ended_at:null});

test('a task is announced once, when it goes from queued or running to an end',()=>{
 assert.deepEqual(finished([task('a','running'),task('b','queued')],[task('a','succeeded'),task('b','running')]).map(t=>t.id),['a']);
 assert.deepEqual(finished([task('a','succeeded')],[task('a','succeeded')]),[]);
 assert.deepEqual(finished([],[task('c','failed')]),[]);   // ended before the tray first looked
});

test('elapsed time and the cost hint read plainly',()=>{
 assert.equal(elapsed(new Date(1000).toISOString(),46_000),'45 秒');
 assert.equal(elapsed(new Date(0).toISOString(),190_000),'3 分钟');
 assert.equal(estimateText({samples:0,tokens:null,cny:null}),'');
 assert.match(estimateText({samples:4,tokens:12000,cny:0.0123}),/最近 4 次同类调用平均约 ¥0\.012（1\.2 万 token）/);
 assert.match(estimateText({samples:2,tokens:800,cny:null}),/800 token（在 \.env 配置/);
});
