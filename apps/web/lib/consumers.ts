export type ConsumerState='detected'|'not_detected'|'unknown';
export type ConsumerStatus={checked_at:string;code:'checked'|'configuration'|'inspection_failed'|'invalid_response';
  queues:Record<'workflow'|'render',{state:ConsumerState;responders:number}>};
export function parseConsumerStatus(input:unknown):ConsumerStatus {
  const invalid=()=>new Error('消费者检测响应无效，请确认本地API已更新。');
  if(!input||typeof input!=='object')throw invalid();
  const value=input as Record<string,unknown>;
  if(typeof value.checked_at!=='string'||value.checked_at.length>40||!Number.isFinite(Date.parse(value.checked_at))||
    !['checked','configuration','inspection_failed','invalid_response'].includes(value.code as string)||!value.queues||typeof value.queues!=='object')throw invalid();
  const queues={} as ConsumerStatus['queues'];
  for(const name of ['workflow','render'] as const){
    const item=(value.queues as Record<string,unknown>)[name];
    if(!item||typeof item!=='object')throw invalid();
    const row=item as Record<string,unknown>;
    if(!['detected','not_detected','unknown'].includes(row.state as string)||!Number.isSafeInteger(row.responders)||
      (row.responders as number)<0||(row.responders as number)>256||
      (row.state==='detected'?(row.responders as number)<1:row.responders!==0)||
      (value.code==='checked'?row.state==='unknown':row.state!=='unknown'))throw invalid();
    queues[name]={state:row.state as ConsumerState,responders:row.responders as number};
  }
  return {checked_at:value.checked_at,code:value.code as ConsumerStatus['code'],queues};
}
