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

import {breakdownError,formulaSeconds,pending,segmentBars,unseen,type Formula} from '../lib/studio';
const formula:Formula={name:'误区反转三段式',fits:'有常见误解的概念',hook_pattern:'你以为【A】，其实是【B】',rhythm:'每 10 秒一个小反转',ending:'引导收藏',variations:'无',
 steps:[{role:'钩子',seconds:5,does:'抛出误区',technique:'大字打叉'},{role:'机制',seconds:40,does:'讲清原理',technique:'流程图逐步点亮'},{role:'总结',seconds:10,does:'一句话结论',technique:'镜头推进'}],
 visual_rules:['每段一个图示','关键词大字'],avoid:['照搬原视频的例子']};

test('a formula adds up its seconds; old raw failures and unseen card lines read plainly',()=>{
 assert.equal(formulaSeconds(formula),55);
 assert.match(breakdownError('studio_breakdown: invalid_response: 模型返回的结果不符合要求：segment.summary: 1–50 characters'),/重试/);
 assert.equal(breakdownError('上传的视频已不在本机'),'上传的视频已不在本机');
 assert.ok(unseen('资料里看不出画面'));assert.ok(!unseen('大字报风格'));
});

test('segments sit on the timeline by their times; untimed ones are left out',()=>{
 const bars=segmentBars([{start:0,end:3,role:'钩子',summary:''},{start:3,end:30,role:'机制',summary:''},{start:null,end:null,role:'总结',summary:''}],30);
 assert.deepEqual(bars.map(b=>[b.role,Math.round(b.left),Math.round(b.width)]),[['钩子',0,10],['机制',10,90]]);
 assert.deepEqual(segmentBars([{start:null,end:null,role:'钩子',summary:''}]),[]);
 assert.equal(pending([{state:'succeeded'} as never,{state:'running'} as never]),true);
});

import {isFormula} from '../lib/studio';
import {readDraft,writeDraft} from '../lib/drafts';
import {toOrigin,emptyIdeation,choose,setOutline} from '../lib/ideation';

test('a confirmed formula survives the local draft and reaches the course origin',()=>{
 assert.ok(isFormula(formula));
 assert.ok(!isFormula({...formula,steps:formula.steps.slice(0,2)}));
 const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);},removeItem:(k:string)=>{store.delete(k);}};
 const scope={kind:'course' as const,projectId:'',sceneId:''};
 const raw=writeDraft(storage,scope,0,{title:'t',source:'',formula},null);
 assert.equal(readDraft(raw,scope)!.data.formula!.name,'误区反转三段式');
 assert.equal(readDraft(raw.replace('"误区反转三段式"','""'),scope),null);
 const angle={title:'a',hook:'h',audience:'u',takeaway:'t',structure:'problem' as const,depth:'intro' as const,duration_min:3,chapters:['1','2','3'],scope:'single' as const};
 const s=setOutline(choose(emptyIdeation(),angle),{sections:[{title:'一',points:['p'],picture:'变化的图',seconds:30}]});
 assert.equal(toOrigin('RAG','',s,formula)!.formula,formula);
 assert.equal('formula' in toOrigin('RAG','',s)!,false);
});
