// The task tray (GET /api/tasks): what is queued or running for the account, and what ended in the last minutes.
export type Task = {id:string;kind:string;state:'queued'|'running'|'succeeded'|'failed'|'cancelled';label:string;title:string;href:string;
  created_at:string|null;started_at:string|null;ended_at:string|null};
export type TaskList = {tasks:Task[];active:number};

const ACTIVE = new Set(['queued','running']);
export const isActive = (t:Pick<Task,'state'>) => ACTIVE.has(t.state);
export const TASK_STATE = {queued:'排队中',running:'进行中',succeeded:'已完成',failed:'失败',cancelled:'已取消'} as const;

/** Tasks that were queued or running in `before` and have ended in `after`: each is announced once. */
export function finished(before:Task[],after:Task[]):Task[] {
  const was=new Map(before.map(t=>[t.id,t.state]));
  return after.filter(t=>!isActive(t)&&ACTIVE.has(was.get(t.id)??''));
}

/** "3 分钟" / "45 秒" since `from` (for a running task), or ''. */
export function elapsed(from:string|null,now=Date.now()):string {
  if(!from)return '';
  const s=Math.max(0,Math.round((now-Date.parse(from))/1000));
  return s<60?`${s} 秒`:`${Math.floor(s/60)} 分钟`;
}

// 用量 (GET /api/usage, /api/usage/estimate) --------------------------------------------------------------------------
type Tokens = {input:number;cached_input:number;output:number};
export type UsagePeriod = {voice:{characters:number;cny:number};agent:{server:Tokens&{cny:number|null};own_model:Tokens};
  content:{server:Tokens&{calls:number;cny:number|null};own_model:Tokens&{calls:number}};total_cny:number|null};
export type Usage = {prices:{deepseek_configured:boolean};today:UsagePeriod;month:UsagePeriod};
export type UsageEstimate = {samples:number;tokens:number|null;cny:number|null};

const wan=(n:number)=>n>=10000?`${(n/10000).toFixed(1)} 万`:String(n);
export const tokenText = (t:Tokens) => `输入 ${wan(t.input)} / 输出 ${wan(t.output)} token`;

/** One line for a paid confirmation: what calls like this used lately, or '' when there is nothing to go on. */
export function estimateText(e:UsageEstimate|null):string {
  if(!e||!e.samples||e.tokens==null)return '';
  return `参考：你最近 ${e.samples} 次同类调用平均约 ${e.cny!=null?`¥${e.cny.toFixed(3)}（${wan(e.tokens)} token）`:`${wan(e.tokens)} token（在 .env 配置 DeepSeek 价格可换算成元）`}。`;
}

/** The cost hint for calls of these kinds (see estimateText); '' when it cannot be read. */
export async function costHint(read:(path:string)=>Promise<UsageEstimate>,kinds:string[]):Promise<string>{
  try{return estimateText(await read('/api/usage/estimate?kinds='+kinds.join(',')));}catch{return '';}
}
