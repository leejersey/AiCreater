import test from 'node:test';
import assert from 'node:assert/strict';
import {cardToDraft,cardToResearch,parseKeywords,rankedCards,totalScore,type TopicCard} from '../lib/studio';
import {isResearchBrief} from '../lib/research';

const card=(title:string,score:number,starred=false):TopicCard=>({title,judgement:'判断',audience:'开发者',platforms:['bilibili'],window:'本周内',hook:'开场一句',pain_point:'痛点',angle:'角度',
 evidence:['E1','E2','E9'],gaps:'无',risks:'无',starred,scores:{heat:{score,reason:'r'},fit:{score,reason:'r'},visual:{score,reason:'r'},timeliness:{score,reason:'r'}}});
const evidence=[{id:'E1',text:'长样本'.repeat(80),source:{title:'文章 A',platform_label:'网页',url:'https://a'}},{id:'E2',text:'样本二',source:{title:'文章 A',platform_label:'网页',url:'https://a'}}];

test('keywords split on either comma, 、 or new lines, without duplicates',()=>{
 assert.deepEqual(parseKeywords('RAG, Agent，向量库、RAG\n 微调 '),['RAG','Agent','向量库','微调']);
 assert.equal(parseKeywords(Array(12).fill(0).map((_,i)=>'k'+i).join(',')).length,10);
});

test('starred cards first, then by total score, keeping their original index',()=>{
 const ranked=rankedCards([card('低',2),card('高',5),card('收藏',1,true)]);
 assert.deepEqual(ranked.map(r=>[r.card.title,r.index]),[['收藏',2],['高',1],['低',0]]);
 assert.equal(totalScore(card('x',4)),16);
});

test('a card becomes a research brief the new-video page and the API accept, with its sources once',()=>{
 const brief=cardToResearch(card('标题',4),evidence);
 assert.ok(isResearchBrief(brief));
 assert.equal(brief.facts.length,2);                       // the unknown E9 is skipped
 assert.ok(Array.from(brief.facts[0]).length<=160);       // research.check_brief's limit
 assert.deepEqual(brief.sources,[{title:'文章 A',platform_label:'网页',url:'https://a'}]);
 assert.match(brief.pacing,/核心判断：判断/);
 const draft=cardToDraft(card('标题',4),evidence);
 assert.equal(draft.topic,'标题');assert.match(draft.notes,/面向开发者/);
});
