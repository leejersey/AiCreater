import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTimeouts} from '../src/render-timeout';

test('single-chapter rendering keeps the existing cancellation budgets',()=>{
 assert.deepEqual(renderTimeouts(886),{cancelMs:570000,childMs:600000});
});
test('a full course gets a duration-scaled budget below the export worker lease',()=>{
 assert.deepEqual(renderTimeouts(7985),{cancelMs:1597000,childMs:1627000});
 const longest=renderTimeouts(30*60*60);
 assert.deepEqual(longest,{cancelMs:1710000,childMs:1740000});
 assert(longest.childMs<1800000);
});
test('invalid durations cannot disable or overflow cancellation',()=>{
 for(const value of [0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>renderTimeouts(value),/duration/);
});
