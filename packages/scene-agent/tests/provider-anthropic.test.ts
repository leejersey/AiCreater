import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import {AnthropicProvider,buildParams,toWire,type AnthropicClientLike,type AnthropicConfig} from '../src/provider/anthropic';
import {ProviderError,type TurnRequest} from '../src/provider/types';

const capabilities={vision:true,parallelToolCalls:true,contextTokens:1000000,maxOutputTokens:32000,promptCache:true,appendOnlyHistory:true};
const config:AnthropicConfig={name:'claude-sonnet',model:'claude-sonnet-5-5',apiKey:'sk-ant-test',capabilities,effort:'medium',fallbacks:'default'};
const request:TurnRequest={system:'sys',messages:[{role:'user',content:[{type:'text',text:'hi'}]}],
 tools:[{name:'write_file',description:'write',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path']}}]};

function fake(reply:()=>any){
 const seen:any[]=[];
 const client:AnthropicClientLike={beta:{messages:{stream:(params:any)=>{seen.push(params);return{finalMessage:async()=>reply()};}}}};
 return{client,seen};
}
const message=(content:any[],stop='tool_use')=>({id:'m',type:'message',role:'assistant',model:'claude-sonnet-5-5',content,stop_reason:stop,
 usage:{input_tokens:10,output_tokens:5,cache_creation_input_tokens:200,cache_read_input_tokens:900}});

test('request carries caching, effort, fallbacks, streamed tool input and the token cap',()=>{
 const params=buildParams({...request,maxOutputTokens:999999},config) as any;
 assert.equal(params.model,'claude-sonnet-5-5');
 assert.equal(params.max_tokens,32000);
 assert.deepEqual(params.cache_control,{type:'ephemeral'});
 assert.deepEqual(params.output_config,{effort:'medium'});
 assert.equal(params.fallbacks,'default');
 assert.deepEqual(params.betas,['server-side-fallback-2026-07-01']);
 assert.equal(params.tools[0].eager_input_streaming,true);
 assert.equal(params.thinking,undefined);
 const plain=buildParams(request,{...config,effort:undefined,fallbacks:undefined}) as any;
 assert.equal(plain.betas,undefined);assert.equal(plain.output_config,undefined);
});

test('parses tool use, usage and keeps the raw content for append-only echo',async()=>{
 const content=[{type:'thinking',thinking:'',signature:'sig'},{type:'text',text:'writing'},{type:'tool_use',id:'t1',name:'write_file',input:{path:'scene/Scene.tsx'}}];
 const {client,seen}=fake(()=>message(content));
 const result=await new AnthropicProvider(config,client).turn(request);
 assert.equal(seen.length,1);
 assert.equal(result.stop,'tool_use');
 assert.deepEqual(result.message.content,[{type:'text',text:'writing'}]);
 assert.deepEqual(result.message.toolCalls,[{id:'t1',name:'write_file',arguments:{path:'scene/Scene.tsx'}}]);
 assert.deepEqual(result.usage,{inputTokens:210,outputTokens:5,cachedInputTokens:900});
 const wire=toWire([...request.messages,result.message]);
 assert.equal(wire[1].content,content); // thinking block and signature echoed unchanged
});

test('max_tokens marks tool input as truncated; refusal and pause map to stop reasons',async()=>{
 const truncated=await new AnthropicProvider(config,fake(()=>message([{type:'tool_use',id:'t1',name:'write_file',input:{path:'a'}}],'max_tokens')).client).turn(request);
 assert.match(truncated.message.toolCalls[0].parseError!,/truncated/);
 assert.equal((await new AnthropicProvider(config,fake(()=>message([],'refusal')).client).turn(request)).stop,'refusal');
 assert.equal((await new AnthropicProvider(config,fake(()=>message([],'pause_turn')).client).turn(request)).stop,'other');
});

test('tool results of one turn share a single user message, with images and error flags',()=>{
 const wire=toWire([
  {role:'user',content:[{type:'text',text:'go'}]},
  {role:'assistant',content:[],toolCalls:[{id:'a',name:'view_frames',arguments:{}},{id:'b',name:'edit_file',arguments:'{bad',parseError:'x'}]},
  {role:'tool',toolCallId:'a',content:[{type:'image',mediaType:'image/png',data:'AAAA'}]},
  {role:'tool',toolCallId:'b',content:[],isError:true},
  {role:'user',content:[{type:'text',text:'next'}]},
 ]) as any[];
 assert.equal(wire.length,4);
 assert.deepEqual(wire[1].content[1],{type:'tool_use',id:'b',name:'edit_file',input:{}});
 assert.equal(wire[2].content.length,2);
 assert.equal(wire[2].content[0].content[0].source.data,'AAAA');
 assert.equal(wire[2].content[1].is_error,true);
 assert.equal(wire[3].content[0].text,'next');
});

test('SDK errors map to provider error codes',async()=>{
 const headers=new Headers();
 const cases:[unknown,string][]=[
  [new Anthropic.AuthenticationError(401,{},'bad key',headers),'auth'],
  [new Anthropic.PermissionDeniedError(403,{},'denied',headers),'auth'],
  [new Anthropic.RateLimitError(429,{},'slow down',headers),'unavailable'],
  [new Anthropic.InternalServerError(529,{},'overloaded',headers),'unavailable'],
  [new Anthropic.APIConnectionError({message:'reset'}),'unavailable'],
  [new Anthropic.BadRequestError(400,{},'bad schema',headers),'request'],
  [new Anthropic.APIUserAbortError(),'aborted'],
 ];
 for(const [error,code] of cases){
  const client:AnthropicClientLike={beta:{messages:{stream:()=>({finalMessage:async()=>{throw error;}})}}};
  await assert.rejects(new AnthropicProvider(config,client).turn(request),(e:unknown)=>e instanceof ProviderError&&e.code===code);
 }
});
