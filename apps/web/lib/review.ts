// Content review (services/workflow/review.py): fact tracing against the evidence pack, rules, and the gate before voicing.

export type ReviewSeverity = 'block' | 'warn' | 'info';
export type ReviewItem = {id:string;kind:string;severity:ReviewSeverity;section_id:string;section:string;text:string;detail:string;claim_id?:string;evidence_id?:string};
export type ReviewClaim = {id:string;section_id:string;section:string;text:string;evidence_id:string|null;status:'sourced'|'secondhand'|'unsourced';judged_by?:'ai';reason?:string;cited_by_section?:boolean};
export type Evidence = {id:string;text:string;source?:{title?:string;platform_label?:string;url?:string}};
export type ReviewResult = {level:'pass'|'warn'|'block';hash:string;items:ReviewItem[];claims:ReviewClaim[];
  counts:{claims:number;sourced:number;secondhand:number;unsourced:number;evidence:number};at:string;evidence?:Evidence[]};
export type ReviewOverride = {note:string;by?:string|null;at:string};
/** A course's review as the API returns it (GET /api/projects/:id/review). */
export type ReviewState = {required:boolean;result:ReviewResult|null;overrides:Record<string,ReviewOverride>;current:boolean;level:ReviewResult['level']|null;evidence:number};

export const LEVEL_LABELS = {pass:'通过',warn:'有提醒，可以继续',block:'有阻断项'} as const;
export const SEVERITY_LABELS: Record<ReviewSeverity,string> = {block:'阻断',warn:'提醒',info:'建议'};
export const KIND_LABELS: Record<string,string> = {claim:'事实溯源',bad_ref:'证据编号',ad_law:'广告法用语',sensitive:'敏感类目',cliche:'AI 套话',length:'时长',long_sentence:'长句',empty_materials:'画面素材'};
export const CLAIM_LABELS = {sourced:'有来源',secondhand:'二手来源',unsourced:'找不到来源'} as const;

/** Items in reading order: blocking first, then reminders, then suggestions; confirmed blocks after open ones. */
export function orderedItems(items:ReviewItem[],overrides:Record<string,ReviewOverride>={}):ReviewItem[] {
  const rank=(i:ReviewItem)=>({block:0,warn:2,info:3}[i.severity]+(i.severity==='block'&&overrides[i.id]?1:0));
  return [...items].sort((a,b)=>rank(a)-rank(b));
}

export const openBlocks = (s:Pick<ReviewState,'result'|'overrides'>) => (s.result?.items??[]).filter(i=>i.severity==='block'&&!s.overrides[i.id]).length;

/** One line for the review button / status: what stands between the course and voicing. */
export function reviewSummary(s:ReviewState|null):{label:string;tone:'ok'|'warn'|'block'|'idle'} {
  if(!s||!s.required&&!s.result)return {label:'内容审核',tone:'idle'};
  if(!s.result)return {label:'内容审核 · 未运行',tone:s.required?'block':'idle'};
  if(!s.current)return {label:'内容审核 · 口播已改，需重新审核',tone:s.required?'block':'warn'};
  const blocks=openBlocks(s);
  if(blocks)return {label:`内容审核 · ${blocks} 条阻断`,tone:s.required?'block':'warn'};
  return s.level==='warn'?{label:'内容审核 · 有提醒',tone:'warn'}:{label:'内容审核 · 通过',tone:'ok'};
}
