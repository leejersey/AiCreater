import test from 'node:test';
import assert from 'node:assert/strict';
import {AnthropicProvider} from '../src/provider/anthropic';
import {OpenAICompatibleProvider} from '../src/provider/openai-compatible';
import {createProvider,loadModels,parseModels} from '../src/provider/registry';
import {ProviderError} from '../src/provider/types';

test('bundled models.json is valid and builds both adapters from env keys',()=>{
 const models=loadModels();
 assert.ok(models['deepseek-flash']&&models['claude-sonnet']);
 const env={DEEPSEEK_API_KEY:'sk-a',ANTHROPIC_API_KEY:'sk-b'};
 const deepseek=createProvider('deepseek-flash',models,{env});
 assert.ok(deepseek instanceof OpenAICompatibleProvider);
 assert.equal(deepseek.capabilities.vision,false);
 const claude=createProvider('claude-sonnet',models,{env,anthropicClient:{beta:{messages:{stream:()=>{throw Error('unused');}}}}});
 assert.ok(claude instanceof AnthropicProvider);
 assert.equal(claude.capabilities.appendOnlyHistory,true);
});

test('missing keys and unknown models fail before any request',()=>{
 const models=loadModels();
 assert.throws(()=>createProvider('deepseek-flash',models,{env:{DEEPSEEK_API_KEY:'  '}}),(e:unknown)=>e instanceof ProviderError&&e.code==='auth'&&/DEEPSEEK_API_KEY/.test(e.message));
 assert.throws(()=>createProvider('gpt-x',models,{env:{}}),/unknown model "gpt-x"/);
});

test('config validation names the broken field',()=>{
 const good=loadModels()['deepseek-flash'];
 assert.throws(()=>parseModels({m:{...good,adapter:'grpc'}}),/models.m: adapter/);
 assert.throws(()=>parseModels({m:{...good,baseUrl:'http://insecure'}}),/baseUrl must be an https URL/);
 assert.throws(()=>parseModels({m:{...good,capabilities:{...good.capabilities,vision:'yes'}}}),/capabilities.vision/);
 assert.throws(()=>parseModels({m:{...good,budget:{maxTurns:0,maxOutputTokensTotal:1}}}),/budget.maxTurns/);
});
