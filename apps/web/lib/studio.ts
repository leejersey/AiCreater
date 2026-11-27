// 选题台 (services/studio/topics.py): the account's keywords, daily topic cards with their evidence, and handing a card to
// the new-video page as a research brief, so its facts and sources reach the manuscript and the content review.
import type {ResearchBrief} from './research';
import type {Evidence} from './review';

export const PLATFORM_LABELS: Record<string,string> = {bilibili:'B站',douyin:'抖音',xiaohongshu:'小红书',wechat:'公众号',youtube:'YouTube'};
export const SCORE_LABELS = {heat:'热度',fit:'匹配',visual:'可视化',timeliness:'时效'} as const;
export type ScoreKey = keyof typeof SCORE_LABELS;
export type TopicCard = {title:string;judgement:string;audience:string;platforms:string[];window:string;hook:string;pain_point:string;angle:string;
  evidence:string[];gaps:string;risks:string;scores:Record<ScoreKey,{score:number;reason:string}>;starred:boolean};
export type TopicFeed = {id:string;day:string;trigger:'manual'|'daily';keywords:string[];cards:TopicCard[];findings:string[];evidence:Evidence[];created_at:string};
export type FeedResponse = {feed:TopicFeed|null;days:string[];manual_left:number;today?:string};
export type CreatorProfile = {keywords:string[];daily_auto:boolean};

/** 「RAG, Agent，向量库 」→ ['RAG','Agent','向量库']: commas (either width), 、 or new lines; duplicates and blanks dropped. */
export function parseKeywords(text:string):string[] {
  return [...new Set(text.split(/[,，、\n]+/).map(k=>k.trim()).filter(Boolean))].slice(0,10);
}

export const totalScore = (c:TopicCard) => (Object.keys(SCORE_LABELS) as ScoreKey[]).reduce((n,k)=>n+c.scores[k].score,0);

/** Starred cards first, then by total score; the original index is kept for starring. */
export function rankedCards(cards:TopicCard[]):{card:TopicCard;index:number}[] {
  return cards.map((card,index)=>({card,index})).sort((a,b)=>Number(b.card.starred)-Number(a.card.starred)||totalScore(b.card)-totalScore(a.card)||a.index-b.index);
}

const cut = (text:string,max:number) => Array.from(text.trim()).length<=max?text.trim():Array.from(text.trim()).slice(0,max-1).join('')+'…';

/** The card as a research brief the new-video page accepts (same limits as research.check_brief). */
export function cardToResearch(card:TopicCard,evidence:Evidence[]):ResearchBrief {
  const used=card.evidence.map(id=>evidence.find(e=>e.id===id)).filter((e):e is Evidence=>!!e);
  const sources=[...new Map(used.filter(e=>e.source?.title||e.source?.url).map(e=>[e.source!.url||e.source!.title,{title:cut(e.source!.title||'参考素材',160),platform_label:cut(e.source!.platform_label||'网页',30),url:e.source!.url||''}])).values()].slice(0,5);
  return {facts:used.slice(0,8).map(e=>cut(e.text,160)),hooks:[cut(card.hook,120)],pain_points:[cut(card.pain_point,120)],
    pacing:cut(`核心判断：${card.judgement}。差异化角度：${card.angle}`,300),viral_style:'balanced',sources};
}

/** What the new-video page starts from when a card is taken into a video. */
export function cardToDraft(card:TopicCard,evidence:Evidence[]){
  return {topic:cut(card.title,80),title:cut(card.title,80),notes:cut(`${card.judgement}。面向${card.audience}；角度：${card.angle}`,300),research:cardToResearch(card,evidence)};
}

export const HANDOFF_KEY = 'aicreater:studio:handoff:v1';
/** Keep what the new-video page should start from; it reads (and asks before replacing a draft) on /courses/new?from=studio. */
export function storeHandoff(payload:Record<string,unknown>){sessionStorage.setItem(HANDOFF_KEY,JSON.stringify(payload));}
export const HANDOFF_PATH = '/courses/new?from=studio';

// 拆解库 (services/studio/breakdowns.py) ----------------------------------------------------------------------------
export type BreakdownSegment = {start:number|null;end:number|null;role:string;summary:string};
export type BreakdownCard = {summary:string;hook:{copy_type:string;opening:string;visual_type:string;alignment:string;strength:number;reason:string};
  segments:BreakdownSegment[];rhythm:{model:string;beats:{t:number|null;what:string}[]};visuals:string;conversion:string;compliance:string;
  transferable:string[];not_transferable:string[]};
export type Breakdown = {id:string;state:'queued'|'running'|'succeeded'|'failed';card:BreakdownCard|null;error:string|null;created_at:string;
  video_kept_until:string|null;source:{kind:'upload'|'link'|'text';title?:string;platform?:string;url?:string;duration?:number;frames_note?:string};
  transcript?:{start:number;end:number;text:string}[];frames?:{t:number;file:string;description:string}[]};
export type FormulaStep = {role:string;seconds:number;does:string;technique:string};
export type Formula = {name:string;fits:string;hook_pattern:string;steps:FormulaStep[];rhythm:string;visual_rules:string[];ending:string;variations:string;avoid:string[]};
export type SavedFormula = {id:string;breakdown_ids:string[];formula:Formula;confirmed:boolean;created_at:string};
/** A confirmed formula kept in the new-video draft (the API checks it again: services/studio/breakdowns.check_formula). */
export function isFormula(v:unknown):v is Formula {
  const f=v as Formula,str=(x:unknown,max:number)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
  return !!f&&typeof f==='object'&&str(f.name,40)&&str(f.hook_pattern,120)&&Array.isArray(f.steps)&&f.steps.length>=3&&f.steps.length<=8&&
    f.steps.every(s=>!!s&&str(s.role,10)&&Number.isInteger(s.seconds)&&str(s.does,100)&&str(s.technique,80))&&str(f.rhythm,120)&&str(f.ending,80)&&
    Array.isArray(f.visual_rules)&&Array.isArray(f.avoid)&&typeof f.fits==='string'&&typeof f.variations==='string';
}

export const BREAKDOWN_STATE = {queued:'排队中',running:'拆解中',succeeded:'已完成',failed:'失败'} as const;

export const pending = (list:Breakdown[]) => list.some(b=>b.state==='queued'||b.state==='running');
export const formulaSeconds = (f:Formula) => f.steps.reduce((n,s)=>n+s.seconds,0);


/** Where each segment sits on the video's timeline, in percent; segments without times are left out. */
export function segmentBars(segments:BreakdownSegment[],duration?:number){
  const end=duration||Math.max(0,...segments.map(s=>s.end??0));
  if(!end)return [];
  return segments.filter(s=>s.start!==null&&s.end!==null&&s.end>s.start).map(s=>({...s,left:(s.start!/end)*100,width:((s.end!-s.start!)/end)*100}));
}

/** Upload a video as the raw body (the route streams it to disk), reporting progress 0–1 as it goes. */
export function uploadVideo(file:File,onProgress?:(share:number)=>void):Promise<Breakdown>{
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST','/api/studio/breakdowns/upload');
    xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');
    xhr.setRequestHeader('X-Filename',encodeURIComponent(file.name));
    xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(e.loaded/e.total);};
    xhr.onload=()=>{let value:{message?:string}={};try{value=JSON.parse(xhr.responseText);}catch{/* not JSON */}
      if(xhr.status>=200&&xhr.status<300)resolve(value as Breakdown);else reject(new Error(value.message||'上传失败',{cause:xhr.status}));};
    xhr.onerror=()=>reject(new Error('上传中断，请检查网络后重试'));
    xhr.send(file);
  });
}

/** A failure as a person reads it: breakdowns failed before the friendly messages still carry the provider's code prefix. */
export const breakdownError = (error:string) => /^[a-z_]+: [a-z_]+: /.test(error)?'模型返回的结果不合格，可以点「重试」再试一次':error;

/** Card lines the source could not show (「资料里看不出…」) are gathered into one note instead of one line each. */
export const unseen = (text:string) => /^资料里看不出/.test(text.trim());
