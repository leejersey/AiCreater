// Claude adapter on the official SDK. Streams each turn (large write_file inputs) and keeps history append-only.
import Anthropic from '@anthropic-ai/sdk';
import {ProviderError,type Capabilities,type ContentPart,type Provider,type StopReason,type ToolCall,type TurnRequest,type TurnResult} from './types';

import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
type CreateParams=Beta.MessageCreateParamsNonStreaming;

export type AnthropicConfig={
 name:string;
 model:string;
 apiKey:string;
 capabilities:Capabilities;
 effort?:'low'|'medium'|'high'|'xhigh'|'max';
 fallbacks?:'default'; // server-side refusal fallback (Claude API only)
 baseUrl?:string;
 timeoutMs?:number;
 retries?:number;
};

// The subset of the SDK client the adapter uses; tests inject a fake.
export type AnthropicClientLike={beta:{messages:{stream(params:CreateParams,options?:{signal?:AbortSignal}):{finalMessage():Promise<Beta.BetaMessage>}}}};

const FALLBACK_BETA='server-side-fallback-2026-07-01';

export class AnthropicProvider implements Provider{
 readonly name:string;
 readonly capabilities:Capabilities;
 private readonly client:AnthropicClientLike;
 constructor(private readonly config:AnthropicConfig,client?:AnthropicClientLike){
  this.name=config.name;this.capabilities=config.capabilities;
  this.client=client??new Anthropic({apiKey:config.apiKey,baseURL:config.baseUrl,maxRetries:config.retries??2,timeout:config.timeoutMs??600000}) as unknown as AnthropicClientLike;
 }

 async turn(request:TurnRequest):Promise<TurnResult>{
  const params=buildParams(request,this.config);
  let message:Beta.BetaMessage;
  try{message=await this.client.beta.messages.stream(params,{signal:request.signal}).finalMessage();}
  catch(error){throw mapError(error,request.signal);}
  return fromMessage(message);
 }
}

export function buildParams(request:TurnRequest,config:AnthropicConfig):CreateParams{
 const cache=config.capabilities.promptCache?{cache_control:{type:'ephemeral' as const}}:{};
 return{
  model:config.model,
  max_tokens:Math.min(request.maxOutputTokens??config.capabilities.maxOutputTokens,config.capabilities.maxOutputTokens),
  system:[{type:'text',text:request.system}],
  // eager_input_streaming lets large file writes stream; the loop validates every input before running a tool.
  tools:request.tools.map(t=>({name:t.name,description:t.description,input_schema:t.inputSchema as Beta.BetaTool.InputSchema,eager_input_streaming:true})),
  messages:toWire(request.messages),
  ...cache, // automatic caching of the growing prefix
  ...(config.effort?{output_config:{effort:config.effort}}:{}),
  ...(config.fallbacks?{fallbacks:config.fallbacks,betas:[FALLBACK_BETA]}:{}),
 };
}

function blocks(parts:ContentPart[]):(Beta.BetaTextBlockParam|Beta.BetaImageBlockParam)[]{
 return parts.map(p=>p.type==='text'?{type:'text',text:p.text}:{type:'image',source:{type:'base64',media_type:p.mediaType,data:p.data}});
}

export function toWire(messages:TurnRequest['messages']):Beta.BetaMessageParam[]{
 const out:Beta.BetaMessageParam[]=[];
 for(const message of messages){
  if(message.role==='assistant'){
   // Echo the original content (thinking blocks included) unchanged; rebuild only when there is none.
   const original=message.providerState as Beta.BetaContentBlockParam[]|undefined;
   out.push({role:'assistant',content:original??[
    ...blocks(message.content),
    ...message.toolCalls.map(c=>({type:'tool_use' as const,id:c.id,name:c.name,input:c.parseError?{}:(c.arguments as Record<string,unknown>)})),
   ]});
   continue;
  }
  const content:Beta.BetaContentBlockParam[]=message.role==='user'?blocks(message.content):
   [{type:'tool_result',tool_use_id:message.toolCallId,content:message.content.length?blocks(message.content):[{type:'text',text:'(no output)'}],...(message.isError?{is_error:true}:{})}];
  // All tool results of one assistant turn go back in a single user message.
  const previous=out.at(-1);
  if(message.role==='tool'&&previous?.role==='user'&&Array.isArray(previous.content)&&previous.content.every(b=>b.type==='tool_result'))(previous.content as Beta.BetaContentBlockParam[]).push(...content);
  else out.push({role:'user',content});
 }
 return out;
}

const STOPS:Partial<Record<string,StopReason>>={tool_use:'tool_use',end_turn:'end_turn',max_tokens:'max_tokens',refusal:'refusal'};

export function fromMessage(message:Beta.BetaMessage):TurnResult{
 const stop=STOPS[message.stop_reason??'']??'other';
 const content:ContentPart[]=[];
 const toolCalls:ToolCall[]=[];
 for(const block of message.content){
  if(block.type==='text'&&block.text)content.push({type:'text',text:block.text});
  else if(block.type==='tool_use')toolCalls.push({id:block.id,name:block.name,arguments:block.input,...(stop==='max_tokens'?{parseError:'arguments truncated by max_tokens'}:{})});
 }
 const usage=message.usage;
 return{
  message:{role:'assistant',content,toolCalls,providerState:message.content},
  stop,
  usage:{inputTokens:usage.input_tokens+(usage.cache_creation_input_tokens??0),outputTokens:usage.output_tokens,cachedInputTokens:usage.cache_read_input_tokens??0},
  raw:message,
 };
}

function mapError(error:unknown,signal?:AbortSignal):ProviderError{
 if(error instanceof ProviderError)return error;
 if(signal?.aborted||error instanceof Anthropic.APIUserAbortError)return new ProviderError('aborted','request aborted');
 if(error instanceof Anthropic.AuthenticationError||error instanceof Anthropic.PermissionDeniedError)return new ProviderError('auth',error.message.slice(0,300),error.status);
 if(error instanceof Anthropic.RateLimitError||error instanceof Anthropic.InternalServerError||error instanceof Anthropic.APIConnectionError)
  return new ProviderError('unavailable',error.message.slice(0,300),'status' in error?error.status as number:undefined);
 if(error instanceof Anthropic.APIError)return new ProviderError(error.status===402?'auth':'request',error.message.slice(0,300),error.status);
 return new ProviderError('response',error instanceof Error?error.message.slice(0,300):'unknown error');
}
