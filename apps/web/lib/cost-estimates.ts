const sources=new Set(['https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  'https://docs.volcengine.com/docs/DoubaoVoice/Billinginstructions-21?lang=zh']);
const quantityKeys=['calls','reused_jobs','characters','input_tokens_min','input_tokens_max','output_tokens_max'] as const;
type Quantities=Record<typeof quantityKeys[number],number>;
export type CostEstimate={status:'estimated'|'unknown'|'no_new_call';currency:'CNY';minimum_cny:number|null;maximum_cny:number|null;
  quantity:Quantities;prices_checked_on:string;sources:string[];notes:string[]};
export function parseEstimate(value:unknown):CostEstimate|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>,q=v.quantity as Record<string,unknown>;
  if(typeof v.status!=='string'||!['estimated','unknown','no_new_call'].includes(v.status)||v.currency!=='CNY'||!q||typeof q!=='object'||Array.isArray(q))return null;
  if(quantityKeys.some(k=>typeof q[k]!=='number'||!Number.isSafeInteger(q[k])||Number(q[k])<0||Number(q[k])>10000000)||Number(q.calls)>20||Number(q.reused_jobs)>20||Number(q.input_tokens_min)>Number(q.input_tokens_max))return null;
  const amount=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1000000;
  if(v.status==='unknown') {if(v.minimum_cny!==null||v.maximum_cny!==null)return null;}
  else if(!amount(v.minimum_cny)||!amount(v.maximum_cny)||Number(v.minimum_cny)>Number(v.maximum_cny))return null;
  if(v.status==='no_new_call'&&(v.minimum_cny!==0||v.maximum_cny!==0||q.calls!==0))return null;
  if(v.status==='estimated'&&(q.calls===0||v.maximum_cny===0))return null;
  if(typeof v.prices_checked_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.prices_checked_on))return null;
  const date=new Date(v.prices_checked_on);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==v.prices_checked_on)return null;
  if(!Array.isArray(v.sources)||v.sources.length>2||v.sources.some(s=>typeof s!=='string'||!sources.has(s)))return null;
  if(!Array.isArray(v.notes)||v.notes.length>16||v.notes.some(s=>typeof s!=='string'||s.length>1000))return null;
  return v as unknown as CostEstimate;
}
function amount(value:number){return value.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');}
export function formatEstimate(quote:CostEstimate|null):string{
  if(!quote)return '暂无法估算（不等于0元）：估价接口不可用或返回不受支持的数据。';
  const q=quote.quantity;
  const fee=quote.status==='unknown'?'暂无法估算（不等于0元）':quote.status==='no_new_call'?'本次登记不新增调用费：¥0（旧任务未来执行的费用未包含）':
    `本次调用参考费：约¥${amount(quote.minimum_cny!)}${quote.maximum_cny===quote.minimum_cny?'':'–'+amount(quote.maximum_cny!)}`;
  const quantities=[`新增调用${q.calls}次`,`复用任务${q.reused_jobs}个`,q.characters?`口播${q.characters}字符`:'',
    q.input_tokens_max?`输入约${q.input_tokens_min}–${q.input_tokens_max} token`:'',q.output_tokens_max?`输出设置最多${q.output_tokens_max} token`:''].filter(Boolean).join('；');
  return [fee,quantities,`公开参考价核对日：${quote.prices_checked_on}`,...quote.notes,...quote.sources].join('\n');
}
type Options={fetcher?:(url:string,init?:RequestInit)=>Promise<Response>;confirm?:(message:string)=>boolean|Promise<boolean>;timeoutMs?:number};
export async function confirmEstimate(title:string,url:string,body:unknown,isCurrent:()=>boolean,options:Options={}):Promise<boolean>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),options.timeoutMs??5000);
  let quote:CostEstimate|null=null,conflict=false;
  try{
    const response=await(options.fetcher??fetch)(url,{method:body===undefined?'GET':'POST',cache:'no-store',signal:controller.signal,
      ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    if(response.status===409)conflict=true;
    else if(response.ok)quote=parseEstimate(await response.json());
  }catch{/* Estimates are advisory; failed requests are unknown, never free. */}
  finally{clearTimeout(timer);}
  if(conflict)throw new Error('项目或章节版本已变化，请重新载入后估价。');
  if(!isCurrent())return false;
  const confirmed=await (options.confirm??(message=>window.confirm(message)))(`${title}\n\n${formatEstimate(quote)}\n\n仅估价，不是扣费硬上限；调用付费服务及显式重试可能再次计费。继续？`);
  return confirmed&&isCurrent();
}
