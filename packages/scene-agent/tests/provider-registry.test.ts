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

test('the thinking config sends reasoning back on every assistant turn, with or without tool calls',async()=>{
 const models=loadModels();
 const bodies:any[]=[];
 const reply=(message:Record<string,unknown>)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',...message}}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200,headers:{'content-type':'application/json'}});
 const provider=createProvider('deepseek-flash-thinking',models,{env:{DEEPSEEK_API_KEY:'k'},transport:{fetch:async(_u,init)=>{bodies.push(JSON.parse(String(init!.body)));return reply({content:'ok',reasoning_content:'r2'});}}});
 assert.equal(provider.capabilities.appendOnlyHistory,true);
 await provider.turn({system:'s',tools:[{name:'t',description:'d',inputSchema:{type:'object'}}],messages:[
  {role:'user',content:[{type:'text',text:'go'}]},
  {role:'assistant',content:[],toolCalls:[{id:'c1',name:'t',arguments:{}}],providerState:{reasoning_content:'r0'}},
  {role:'tool',toolCallId:'c1',content:[{type:'text',text:'done'}]},
  {role:'assistant',content:[{type:'text',text:'no tools this turn'}],toolCalls:[],providerState:{reasoning_content:'r1'}},
  {role:'user',content:[{type:'text',text:'continue'}]},
 ]});
 const assistants=bodies[0].messages.filter((m:any)=>m.role==='assistant');
 assert.deepEqual(assistants.map((m:any)=>m.reasoning_content),['r0','r1']);
 assert.deepEqual(bodies[0].thinking,{type:'enabled'});
 assert.equal(bodies[0].reasoning_effort,'low');
 assert.equal(bodies[0].max_tokens,32768);
});
