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
export type FeedResponse = {feed:TopicFeed|null;days:string[];manual_left:number};
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
