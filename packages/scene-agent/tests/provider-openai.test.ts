import test from 'node:test';
import assert from 'node:assert/strict';
import {OpenAICompatibleProvider,fromWire,toWire,type OpenAICompatibleConfig} from '../src/provider/openai-compatible';
import {ProviderError,type TurnRequest} from '../src/provider/types';

const capabilities={vision:false,parallelToolCalls:true,contextTokens:128000,maxOutputTokens:8192,promptCache:true,appendOnlyHistory:false};
const config:OpenAICompatibleConfig={name:'deepseek-flash',baseUrl:'https://api.deepseek.com/',model:'deepseek-v4-flash',apiKey:'sk-test-key',capabilities,extraBody:{thinking:{type:'disabled'}}};
const request:TurnRequest={system:'sys',messages:[{role:'user',content:[{type:'text',text:'hi'}]}],
 tools:[{name:'write_file',description:'write',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path']}}]};
const json=(status:number,body:unknown,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
const completion=(message:Record<string,unknown>,finish='stop')=>({choices:[{finish_reason:finish,message:{role:'assistant',...message}}],usage:{prompt_tokens:100,completion_tokens:20,prompt_cache_hit_tokens:64}});

test('sends tools, vendor switches and the capped token limit; parses tool calls and usage',async()=>{
 const calls:{url:string;body:any;headers:any}[]=[];
 const provider=new OpenAICompatibleProvider(config,{fetch:async(url,init)=>{
  calls.push({url:String(url),body:JSON.parse(String(init!.body)),headers:init!.headers});
  return json(200,completion({content:'',tool_calls:[{id:'c1',type:'function',function:{name:'write_file',arguments:'{"path":"scene/Scene.tsx"}'}}]},'tool_calls'));
 }});
 const result=await provider.turn({...request,maxOutputTokens:999999});
 assert.equal(calls[0].url,'https://api.deepseek.com/chat/completions');
 assert.equal(calls[0].headers.authorization,'Bearer sk-test-key');
 assert.equal(calls[0].body.max_tokens,8192);
 assert.deepEqual(calls[0].body.thinking,{type:'disabled'});
 assert.equal(calls[0].body.tools[0].function.name,'write_file');
 assert.deepEqual(calls[0].body.messages,[{role:'system',content:'sys'},{role:'user',content:'hi'}]);
 assert.equal(result.stop,'tool_use');
 assert.deepEqual(result.message.toolCalls,[{id:'c1',name:'write_file',arguments:{path:'scene/Scene.tsx'}}]);
 assert.deepEqual(result.usage,{inputTokens:100,outputTokens:20,cachedInputTokens:64});
});

test('invalid tool arguments are kept with a parse error instead of failing the turn',()=>{
 const result=fromWire(completion({content:null,tool_calls:[{id:'c1',function:{name:'edit_file',arguments:'{"path":"a", "old":“x”}'}}]},'tool_calls'));
 assert.equal(result.stop,'tool_use');
 assert.equal(result.message.toolCalls[0].arguments,'{"path":"a", "old":“x”}');
 assert.match(result.message.toolCalls[0].parseError!,/not valid JSON/);
});

test('truncated turns mark every tool call so the loop never runs partial input',()=>{
 const result=fromWire(completion({content:'',tool_calls:[{id:'c1',function:{name:'write_file',arguments:'{"path":"scene/Scene.tsx","content":"impo'}}]},'length'));
 assert.equal(result.stop,'max_tokens');
 assert.match(result.message.toolCalls[0].parseError!,/truncated/);
});

test('tool calls reported with finish_reason stop still count as tool use',()=>{
 const result=fromWire(completion({content:'ok',tool_calls:[{id:'c1',function:{name:'typecheck',arguments:''}}]},'stop'));
 assert.equal(result.stop,'tool_use');
 assert.deepEqual(result.message.toolCalls[0].arguments,{});
});

test('retries rate limits and 5xx with backoff, then succeeds',async()=>{
 const statuses=[429,503];const sleeps:number[]=[];
 const provider=new OpenAICompatibleProvider(config,{sleep:async ms=>{sleeps.push(ms);},fetch:async()=>{
  const status=statuses.shift();
  return status?json(status,{error:{message:'busy'}},status===429?{'retry-after':'3'}:{}):json(200,completion({content:'done'}));
 }});
 const result=await provider.turn(request);
 assert.equal(result.stop,'end_turn');
 assert.deepEqual(sleeps,[3000,2000]);
});

test('gives up after the retry budget with an unavailable error',async()=>{
 let attempts=0;
 const provider=new OpenAICompatibleProvider(config,{sleep:async()=>{},fetch:async()=>{attempts++;return json(500,{error:{message:'down'}});}});
 await assert.rejects(provider.turn(request),(e:unknown)=>e instanceof ProviderError&&e.code==='unavailable'&&e.status===500);
 assert.equal(attempts,3);
});

test('auth and balance failures stop immediately and never echo the key',async()=>{
 for(const status of [401,402,403]){
  let attempts=0;
  const provider=new OpenAICompatibleProvider(config,{sleep:async()=>{},fetch:async()=>{attempts++;return json(status,{error:{message:'Insufficient Balance'}});}});
  await assert.rejects(provider.turn(request),(e:unknown)=>e instanceof ProviderError&&e.code==='auth'&&!e.message.includes('sk-test-key'));
  assert.equal(attempts,1);
 }
});

test('other 4xx are request errors and are not retried',async()=>{
 let attempts=0;
 const provider=new OpenAICompatibleProvider(config,{sleep:async()=>{},fetch:async()=>{attempts++;return json(400,{error:{message:'bad tool schema'}});}});
 await assert.rejects(provider.turn(request),(e:unknown)=>e instanceof ProviderError&&e.code==='request'&&/bad tool schema/.test(e.message));
 assert.equal(attempts,1);
});

test('network errors retry; caller aborts do not',async()=>{
 let attempts=0;
 const flaky=new OpenAICompatibleProvider(config,{sleep:async()=>{},fetch:async()=>{if(attempts++===0)throw new TypeError('fetch failed');return json(200,completion({content:'ok'}));}});
 assert.equal((await flaky.turn(request)).stop,'end_turn');
 const controller=new AbortController();controller.abort();
 await assert.rejects(flaky.turn({...request,signal:controller.signal}),(e:unknown)=>e instanceof ProviderError&&e.code==='aborted');
});

test('non-JSON or empty responses are response errors',async()=>{
 const provider=new OpenAICompatibleProvider(config,{fetch:async()=>new Response('<html>',{status:200})});
 await assert.rejects(provider.turn(request),(e:unknown)=>e instanceof ProviderError&&e.code==='response');
 assert.throws(()=>fromWire({choices:[]}),/no choices/);
});

test('history round-trips: tool calls, errors, reasoning echo and tool images',()=>{
 const messages:TurnRequest['messages']=[
  {role:'user',content:[{type:'text',text:'go'}]},
  {role:'assistant',content:[],toolCalls:[{id:'c1',name:'render_stills',arguments:{frames:[0]}},{id:'c2',name:'edit_file',arguments:'{bad',parseError:'x'}],providerState:{reasoning_content:'think'}},
  {role:'tool',toolCallId:'c1',content:[{type:'text',text:'rendered'},{type:'image',mediaType:'image/png',data:'AAAA'}]},
  {role:'tool',toolCallId:'c2',content:[{type:'text',text:'arguments are not valid JSON'}],isError:true},
  {role:'user',content:[{type:'text',text:'continue'}]},
 ];
 const wire=toWire({...request,messages},{echoReasoning:true,capabilities:{...capabilities,vision:true}}) as any[];
 assert.equal(wire[2].reasoning_content,'think');
 assert.equal(wire[2].tool_calls[0].function.arguments,'{"frames":[0]}');
 assert.equal(wire[2].tool_calls[1].function.arguments,'{bad');
 assert.deepEqual(wire[3],{role:'tool',tool_call_id:'c1',content:'rendered'});
 assert.equal(wire[4].content,'ERROR: arguments are not valid JSON');
 assert.equal(wire[5].role,'user');
 assert.equal(wire[5].content[1].image_url.url,'data:image/png;base64,AAAA');
 assert.equal(wire[6].content,'continue');
 const textOnly=toWire({...request,messages},{echoReasoning:false,capabilities}) as any[];
 assert.equal(textOnly[2].reasoning_content,undefined);
 assert.equal(textOnly.length,6); // no image message for non-vision models
});
