type Quantity={input_tokens:number|null;output_tokens:number|null;cache_hit_tokens:number|null;cache_miss_tokens:number|null;submitted_characters:number|null};
type Observation={version:1;kind:string;state:'pending'|'submitted'|'reported'|'local';quantity:Quantity;prices:{checked_on:string;currency:'CNY';model:string;sources:string[]};reference:{minimum_cny:number|null;maximum_cny:number|null}};
export type UsageRecords={summary:{attempts:number;known:number;unknown:number;historical_unknown:number;minimum_cny:number;maximum_cny:number};items:{job_id:string;attempt_id:string;number:number;kind:string;state:string;started_at:string;ended_at:string|null;usage:Observation|null}[]};
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid usage metadata');return value as Record<string,unknown>;};
const count=(value:unknown):number=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw Error('Invalid usage counter');return value;};
const money=(value:unknown):number=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Invalid reference amount');return value;};
const text=(value:unknown):string=>{if(typeof value!=='string'||!value||value.length>200)throw Error('Invalid metadata text');return value;};
const time=(value:unknown):string=>{const result=text(value);if(!Number.isFinite(Date.parse(result)))throw Error('Invalid observation date');return result;};
function observation(value:unknown,kind:string):Observation|null{
  if(value===null)return null;
  const row=object(value),q=object(row.quantity),price=object(row.prices),ref=object(row.reference);
  if(row.version!==1||row.kind!==kind||!['pending','submitted','reported','local'].includes(String(row.state))||price.currency!=='CNY')throw Error('Unknown observation');
  const quantity=Object.fromEntries(['input_tokens','output_tokens','cache_hit_tokens','cache_miss_tokens','submitted_characters'].map(key=>[key,q[key]===null?null:count(q[key])])) as Quantity;
  const minimum=ref.minimum_cny===null?null:money(ref.minimum_cny),maximum=ref.maximum_cny===null?null:money(ref.maximum_cny);
  if((minimum===null)!==(maximum===null)||minimum!==null&&maximum!==null&&minimum>maximum)throw Error('Invalid reference range');
  if(['pending','submitted'].includes(String(row.state))&&minimum!==null)throw Error('Unconfirmed fee cannot be known');
  if(row.state==='local'&&(minimum!==0||maximum!==0||!['render','timing'].includes(kind)))throw Error('Invalid local fee');
  const checked=time(price.checked_on);if(!/^\d{4}-\d{2}-\d{2}$/.test(checked))throw Error('Invalid price date');
  if(!Array.isArray(price.sources)||!price.sources.every(url=>{if(typeof url!=='string')return false;try{const parsed=new URL(url);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.port&&['api-docs.deepseek.com','docs.volcengine.com'].includes(parsed.hostname);}catch{return false;}}))throw Error('Invalid price source');
  return {version:1,kind,state:row.state as Observation['state'],quantity,prices:{checked_on:checked,currency:'CNY',model:text(price.model),sources:price.sources as string[]},reference:{minimum_cny:minimum,maximum_cny:maximum}};
}
export function parseUsageRecords(value:unknown):UsageRecords{
  const root=object(value),s=object(root.summary);
  if(!Array.isArray(root.items))throw Error('Missing attempt history');
  const items=root.items.map(value=>{const row=object(value),kind=text(row.kind),state=text(row.state),number=count(row.number);
    if(!['generate','regenerate','voice','timing','render'].includes(kind)||!['running','succeeded','failed','cancelled'].includes(state)||number<1)throw Error('Invalid attempt');
    return {job_id:text(row.job_id),attempt_id:text(row.attempt_id),number,kind,state,started_at:time(row.started_at),ended_at:row.ended_at===null?null:time(row.ended_at),usage:observation(row.usage,kind)};
  });
  const summary={attempts:count(s.attempts),known:count(s.known),unknown:count(s.unknown),historical_unknown:count(s.historical_unknown),minimum_cny:money(s.minimum_cny),maximum_cny:money(s.maximum_cny)};
  const known=items.filter(item=>item.usage?.reference.minimum_cny!==null&&item.usage!==null);
  if(summary.attempts!==items.length||summary.known!==known.length||summary.unknown!==items.length-known.length||summary.historical_unknown!==items.filter(item=>item.usage===null).length||summary.minimum_cny>summary.maximum_cny)throw Error('Inconsistent usage summary');
  for(const key of ['minimum_cny','maximum_cny'] as const){const sum=known.reduce((total,item)=>total+item.usage!.reference[key]!,0);if(Math.abs(sum-summary[key])>1e-6*Math.max(1,items.length))throw Error('Inconsistent reference subtotal');}
  return {summary,items};
}
export function referenceMoney(minimum:number,maximum:number):string{
  const display=(value:number)=>value.toLocaleString('zh-CN',{maximumFractionDigits:6});
  return '¥'+display(minimum)+(minimum===maximum?'':'–'+display(maximum));
}
