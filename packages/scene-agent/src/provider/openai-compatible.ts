// Chat Completions adapter for OpenAI-compatible APIs (DeepSeek, Qwen, Kimi, GLM, OpenAI, ...).
import {ProviderError,textOf,type Capabilities,type ContentPart,type ImagePart,type Provider,type StopReason,type ToolCall,type TurnRequest,type TurnResult} from './types';

export type OpenAICompatibleConfig={
 name:string;
 baseUrl:string;            // e.g. https://api.deepseek.com — `/chat/completions` is appended
 model:string;
 apiKey:string;
 capabilities:Capabilities;
 extraBody?:Record<string,unknown>; // vendor switches, e.g. {thinking:{type:'disabled'}}
 echoReasoning?:boolean;    // send `reasoning_content` back on assistant turns when the vendor requires it
 timeoutMs?:number;
 retries?:number;
};
export type Transport={fetch?:typeof fetch;sleep?:(ms:number)=>Promise<void>};

const MAX_RESPONSE_BYTES=4*1024*1024;
const RETRYABLE=new Set([408,409,429,500,502,503,504]);

export class OpenAICompatibleProvider implements Provider{
 readonly name:string;
 readonly capabilities:Capabilities;
 constructor(private readonly config:OpenAICompatibleConfig,private readonly transport:Transport={}){
  this.name=config.name;this.capabilities=config.capabilities;
 }

 async turn(request:TurnRequest):Promise<TurnResult>{
  const body={
   model:this.config.model,
   messages:toWire(request,this.config),
   ...(request.tools.length?{tools:request.tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.inputSchema}}))}:{}),
   max_tokens:Math.min(request.maxOutputTokens??this.capabilities.maxOutputTokens,this.capabilities.maxOutputTokens),
   stream:false,
   ...this.config.extraBody,
  };
  const raw=await this.post(body,request.signal);
  return fromWire(raw);
 }

 private async post(body:unknown,signal?:AbortSignal):Promise<unknown>{
  const doFetch=this.transport.fetch??fetch;
  const sleep=this.transport.sleep??(ms=>new Promise(r=>setTimeout(r,ms)));
  const retries=this.config.retries??2;
  const url=this.config.baseUrl.replace(/\/+$/,'')+'/chat/completions';
  let last:ProviderError=new ProviderError('unavailable','no attempt made');
  let retryAfter:number|undefined;
  for(let attempt=0;attempt<=retries;attempt++){
   if(attempt>0)await sleep(Math.min(retryAfter??1000*2**(attempt-1),30000));
   retryAfter=undefined;
   if(signal?.aborted)throw new ProviderError('aborted','request aborted');
   let response:Response;
   try{
    const timeout=AbortSignal.timeout(this.config.timeoutMs??180000);
    response=await doFetch(url,{method:'POST',redirect:'error',
     headers:{'content-type':'application/json',authorization:'Bearer '+this.config.apiKey},
     body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,timeout]):timeout});
   }catch(error){
    if(signal?.aborted)throw new ProviderError('aborted','request aborted');
    last=new ProviderError('unavailable','transport: '+(error instanceof Error?error.name:'error'));continue;
   }
   const text=await readBounded(response);
   if(response.ok){
    try{return JSON.parse(text);}catch{throw new ProviderError('response','response body is not JSON',response.status);}
   }
   const detail=errorDetail(text);
   if([401,402,403].includes(response.status))throw new ProviderError('auth',`HTTP ${response.status}: ${detail}`,response.status);
   if(!RETRYABLE.has(response.status))throw new ProviderError('request',`HTTP ${response.status}: ${detail}`,response.status);
   const header=Number(response.headers.get('retry-after'));
   retryAfter=Number.isFinite(header)&&header>0?header*1000:undefined;
   last=new ProviderError('unavailable',`HTTP ${response.status}: ${detail}`,response.status);
  }
  throw last;
 }
}

async function readBounded(response:Response):Promise<string>{
 const length=Number(response.headers.get('content-length'));
 if(length>MAX_RESPONSE_BYTES)throw new ProviderError('response','response too large',response.status);
 const text=await response.text();
 if(Buffer.byteLength(text)>MAX_RESPONSE_BYTES)throw new ProviderError('response','response too large',response.status);
 return text;
}

// Vendor error bodies are short JSON; keep only the message so keys or prompts are never echoed.
function errorDetail(text:string):string{
 try{const value=JSON.parse(text);const message=value?.error?.message??value?.message;if(typeof message==='string')return message.slice(0,300);}catch{}
 return 'no error message';
}

const dataUrl=(p:ImagePart)=>`data:${p.mediaType};base64,${p.data}`;
function userContent(parts:ContentPart[]):unknown{
 if(parts.every(p=>p.type==='text'))return textOf(parts);
 return parts.map(p=>p.type==='text'?{type:'text',text:p.text}:{type:'image_url',image_url:{url:dataUrl(p)}});
}

export function toWire(request:TurnRequest,config:Pick<OpenAICompatibleConfig,'echoReasoning'|'capabilities'>):unknown[]{
 const out:unknown[]=[{role:'system',content:request.system}];
 // Chat Completions tool messages are text-only; images from a run of tool results follow as one user message.
 let pendingImages:ImagePart[]=[];
 const flush=()=>{if(pendingImages.length){out.push({role:'user',content:[{type:'text',text:'Images returned by the tool calls above:'},...pendingImages.map(p=>({type:'image_url',image_url:{url:dataUrl(p)}}))]});pendingImages=[];}};
 for(const message of request.messages){
  if(message.role!=='tool')flush();
  if(message.role==='user')out.push({role:'user',content:userContent(message.content)});
  else if(message.role==='assistant'){
   // Chat Completions rejects an assistant message with neither content nor tool calls; a turn cut off while
   // reasoning produces exactly that, and its reasoning must still be echoed, so keep it with a placeholder.
   const wire:Record<string,unknown>={role:'assistant',content:textOf(message.content)||(message.toolCalls.length?null:'(no output: the reply was cut off)')};
   if(message.toolCalls.length)wire.tool_calls=message.toolCalls.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:typeof c.arguments==='string'&&c.parseError?c.arguments:JSON.stringify(c.arguments)}}));
   const reasoning=(message.providerState as {reasoning_content?:unknown}|undefined)?.reasoning_content;
   if(config.echoReasoning&&typeof reasoning==='string')wire.reasoning_content=reasoning;
   out.push(wire);
  }else{
   const text=textOf(message.content);
   out.push({role:'tool',tool_call_id:message.toolCallId,content:message.isError?`ERROR: ${text}`:text||'(no text output)'});
   if(config.capabilities.vision)pendingImages.push(...message.content.filter((p):p is ImagePart=>p.type==='image'));
  }
 }
 flush();
 return out;
}

const STOPS:Record<string,StopReason>={tool_calls:'tool_use',function_call:'tool_use',stop:'end_turn',length:'max_tokens',content_filter:'refusal'};

export function fromWire(raw:unknown):TurnResult{
 const data=raw as {choices?:unknown;usage?:Record<string,unknown>};
 if(!Array.isArray(data?.choices)||data.choices.length<1)throw new ProviderError('response','response has no choices');
 const choice=data.choices[0] as {finish_reason?:string;message?:Record<string,unknown>};
 const message=choice?.message;
 if(!message||message.role!=='assistant')throw new ProviderError('response','first choice is not an assistant message');
 let stop=STOPS[choice.finish_reason??'']??'other';
 const truncated=stop==='max_tokens';
 const toolCalls:ToolCall[]=(Array.isArray(message.tool_calls)?message.tool_calls:[]).map((call:any,index:number)=>{
  const id=typeof call?.id==='string'&&call.id?call.id:`call_${index}`;
  const name=String(call?.function?.name??'');
  const args=call?.function?.arguments;
  if(typeof args!=='string')return{id,name,arguments:args??{},...(truncated?{parseError:'arguments truncated by max_tokens'}:{})};
  try{return{id,name,arguments:args.trim()?JSON.parse(args):{},...(truncated?{parseError:'arguments truncated by max_tokens'}:{})};}
  catch(error){return{id,name,arguments:args,parseError:truncated?'arguments truncated by max_tokens':'arguments are not valid JSON: '+(error as Error).message};}
 });
 if(toolCalls.length&&stop==='end_turn')stop='tool_use';
 const content=typeof message.content==='string'&&message.content?[{type:'text' as const,text:message.content}]:[];
 const reasoning=message.reasoning_content;
 const usage=data.usage??{};
 const cached=Number(usage.prompt_cache_hit_tokens??(usage.prompt_tokens_details as {cached_tokens?:unknown}|undefined)?.cached_tokens??0);
 return{
  message:{role:'assistant',content,toolCalls,...(typeof reasoning==='string'?{providerState:{reasoning_content:reasoning}}:{})},
  stop,
  usage:{inputTokens:Number(usage.prompt_tokens??0),outputTokens:Number(usage.completion_tokens??0),cachedInputTokens:cached},
  raw,
 };
}

