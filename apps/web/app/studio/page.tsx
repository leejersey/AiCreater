'use client';
// 选题台: today's topics (P2) and the breakdown library (P3), the places to look before writing. Copy is written and reviewed
// on the new-video page, which everything here hands over to.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {request} from '../../lib/editor';
import {useAccount} from '../AccountSession';
import {useToast} from '../ToastContext';
import {useConfirm} from '../ConfirmContext';
import {Breakdowns} from './Breakdowns';
import {ResearchModal} from './ResearchModal';
import {Modal} from '../Modal';
import type {ResearchBrief} from '../../lib/research';
import {loadActivePersonaId,loadPersonas} from '../../lib/manuscript-tools';
import {costHint} from '../../lib/tasks';
import {SUGGESTED_KEYWORDS} from '../../lib/sample';
import {HANDOFF_PATH,NO_FILTER,PLATFORM_LABELS,SCORE_LABELS,cardToDraft,filterCards,parseKeywords,rankedCards,storeHandoff,totalScore,type CardFilter,type CreatorProfile,type FeedResponse,type ScoreKey,type TopicCard} from '../../lib/studio';
import {Sparkles,Spinner,RefreshCw,AlertCircle,Search} from '../Icons';

type Tab='topics'|'breakdowns';
const TABS:{id:Tab;label:string}[]=[{id:'topics',label:'今日选题'},{id:'breakdowns',label:'拆解库'}];
const isTab=(v:string|null):v is Tab=>TABS.some(t=>t.id===v);

export default function Studio(){
  const [tab,setTab]=useState<Tab>('topics');
  // The tab lives in the address (?tab=breakdowns), so a reload or going back keeps it.
  useEffect(()=>{const read=()=>{const t=new URLSearchParams(window.location.search).get('tab');setTab(isTab(t)?t:'topics');};
    read();window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read);},[]);
  function choose(next:Tab){
    if(next===tab)return;setTab(next);
    const url=new URL(window.location.href);if(next==='topics')url.searchParams.delete('tab');else url.searchParams.set('tab',next);
    window.history.pushState(null,'',url);
  }
  return <main className="studio-page">
    <div className="studio-topbar">
      <div className="studio-title-group"><h1 style={{fontSize:'18px',margin:0}}>选题台</h1><span className="studio-badge">找选题、拆对标，带着证据去写稿</span></div>
      <Link href="/courses/new" className="primary-link studio-next">下一步：新建视频 →</Link>
    </div>
    <div className="studio-tabs" role="tablist">
      {TABS.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} className={`studio-tab${tab===t.id?' active':''}`} onClick={()=>choose(t.id)}>{t.label}</button>)}
    </div>
    {tab==='topics'&&<Topics/>}
    {tab==='breakdowns'&&<Breakdowns/>}
  </main>;
}

function Topics(){
  const userId=useAccount().user?.id,toast=useToast(),confirm=useConfirm(),router=useRouter();
  const [profile,setProfile]=useState<CreatorProfile|null>(null),[keywords,setKeywords]=useState(''),[auto,setAuto]=useState(false);
  const [data,setData]=useState<FeedResponse|null>(null),[day,setDay]=useState<string>('');
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[open,setOpen]=useState<number|null>(null),[research,setResearch]=useState(false);
  const [filter,setFilter]=useState<CardFilter>(NO_FILTER),[compare,setCompare]=useState<number[]>([]),[comparing,setComparing]=useState(false);
  // Only the first load fills the keyword form: starring or switching days must not overwrite what is being typed.
  const loadFeed=async(chosen=day)=>setData(await request<FeedResponse>('/api/studio/topics'+(chosen?'?day='+chosen:'')));
  useEffect(()=>{void Promise.all([request<CreatorProfile>('/api/studio/profile'),loadFeed('')])
    .then(([p])=>{setProfile(p);setKeywords(p.keywords.join('，'));setAuto(p.daily_auto);})
    .catch(e=>setError(e instanceof Error?e.message:'读取失败'));},[]);
  async function run(kind:string,fn:()=>Promise<void>){setBusy(kind);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setBusy('');}}
  const parsed=parseKeywords(keywords),dirty=!!profile&&(parsed.join('|')!==profile.keywords.join('|')||auto!==profile.daily_auto);
  const save=()=>run('save',async()=>{const p=await request<CreatorProfile>('/api/studio/profile',{keywords:parsed,daily_auto:auto});setProfile(p);setKeywords(p.keywords.join('，'));toast('已保存领域关键词',{variant:'success'});});
  const refresh=()=>run('refresh',async()=>{
    const hint=await costHint(request,['studio_topics']);
    if(!await confirm({title:'刷新今日选题',message:`会采集热榜并按前 ${Math.min(3,profile?.keywords.length??0)} 个关键词检索（Tavily），再调用一次模型生成 5–8 张选题卡（计费，约一分钟）。今天还可手动刷新 ${data?.manual_left??0} 次。${hint?'\n\n'+hint:''}`,confirmText:'开始生成'}))return;
    const personas=loadPersonas(userId),active=personas.find(p=>p.id===loadActivePersonaId(userId));
    const persona=active?{name:active.name,audience_call:active.audience_call,tone:active.tone}:undefined;
    await request('/api/studio/topics/refresh',persona?{persona}:{});setDay('');await loadFeed('');toast('今日选题已生成',{variant:'success'});
  });
  // Comparing belongs to one day's cards.
  useEffect(()=>{setCompare([]);setFilter(NO_FILTER);},[data?.feed?.id]);
  const toggleCompare=(index:number)=>setCompare(c=>c.includes(index)?c.filter(x=>x!==index):c.length>=3?(toast('最多对比 3 张',{variant:'info'}),c):[...c,index]);
  const star=(index:number,starred:boolean)=>run('star',async()=>{if(!data?.feed)return;await request('/api/studio/topics/'+data.feed.id+'/star',{index,starred});await loadFeed();});
  const handoff=(payload:Record<string,unknown>)=>{storeHandoff(payload);router.push(HANDOFF_PATH);};
  const feed=data?.feed,evidence=Object.fromEntries((feed?.evidence??[]).map(e=>[e.id,e]));
  const old=!!feed&&!day&&!!data?.today&&feed.day!==data.today;
  return <section className="studio-panel">
    {error&&<p role="alert" className="error"><AlertCircle size={14}/> {error}</p>}
    <div className="topics-profile">
      <label>领域关键词（用逗号分隔，最多 10 个；检索用前 3 个）
        <input value={keywords} maxLength={220} disabled={!profile} onChange={e=>setKeywords(e.target.value)} placeholder={profile?"例如：RAG，AI Agent，大模型应用":"正在读取…"}/>
      </label>
      {profile&&!parsed.length&&<div className="keyword-suggest"><span className="hint">不知道填什么？点一下加入：</span>
        {SUGGESTED_KEYWORDS.map(k=><button key={k} type="button" className="research-pill" onClick={()=>setKeywords(v=>parseKeywords(v+'，'+k).join('，'))}>{k}</button>)}</div>}
      <label className="review-toggle"><input type="checkbox" checked={auto} disabled={!profile} onChange={e=>setAuto(e.target.checked)}/>每天 7 点后自动生成一次（计费）</label>
      <button type="button" disabled={!dirty||!parsed.length||!!busy} onClick={()=>void save()}>{busy==='save'?'保存中…':'保存'}</button>
    </div>
    <div className="topics-toolbar">
      <button type="button" className="topics-refresh" disabled={!profile?.keywords.length||dirty||!!busy||(data?.manual_left??0)<=0} onClick={()=>void refresh()}>
        {busy==='refresh'?<><Spinner size={14} className="icon-spin"/> 正在采集热点并生成…</>:<><Sparkles size={14}/> 刷新今日选题（计费）</>}
      </button>
      <span className="hint">今天还可手动刷新 {data?.manual_left??0} 次{!profile?.keywords.length?' · 先填写并保存领域关键词':dirty?' · 先保存关键词':''}</span>
      {!!data?.days.length&&<select value={day||feed?.day||''} aria-label="按日期查看" onChange={e=>{const d=e.target.value;setDay(d);void run('day',()=>loadFeed(d));}}>
        {data.days.map(d=><option key={d} value={d}>{d}</option>)}
      </select>}
      <button type="button" title="重新读取" aria-label="重新读取" disabled={!!busy} onClick={()=>void run('load',()=>loadFeed())}><RefreshCw size={14}/></button>
      <button type="button" className="topics-research" disabled={!!busy} onClick={()=>setResearch(true)}><Search size={14}/> 自己检索热点 / 三平台方案</button>
    </div>
    {!feed?<p className="hint">还没有选题。填写领域关键词后点「刷新今日选题」，或用「自己检索热点」按关键词搜。</p>:<>
      {old&&<p className="hint review-stale">这是 {feed.day} 的选题，今天（{data?.today}）还没有生成{auto?'，开启了每日自动生成的话 7 点后会自动出现':''}。</p>}
      <p className="hint">{feed.day} · {feed.trigger==='daily'?'每日自动':'手动刷新'} · 关键词：{feed.keywords.join('、')} · 样本 {feed.evidence.length} 条</p>
      <div className="topics-filter" aria-label="筛选选题">
        <select aria-label="平台" value={filter.platform} onChange={e=>setFilter({...filter,platform:e.target.value})}>
          <option value="">全部平台</option>{[...new Set(feed.cards.flatMap(c=>c.platforms))].map(p=><option key={p} value={p}>{PLATFORM_LABELS[p]??p}</option>)}</select>
        <select aria-label="时效" value={filter.window} onChange={e=>setFilter({...filter,window:e.target.value})}>
          <option value="">全部时效</option>{[...new Set(feed.cards.map(c=>c.window))].map(w=><option key={w} value={w}>{w}</option>)}</select>
        <select aria-label="最低总分" value={filter.minScore} onChange={e=>setFilter({...filter,minScore:Number(e.target.value)})}>
          {[0,12,14,16].map(n=><option key={n} value={n}>{n?`总分 ≥ ${n}`:'不限总分'}</option>)}</select>
        <label className="review-toggle"><input type="checkbox" checked={filter.starred} onChange={e=>setFilter({...filter,starred:e.target.checked})}/>只看收藏</label>
        {compare.length>0&&<button type="button" className="topics-compare" disabled={compare.length<2} onClick={()=>setComparing(true)}>{compare.length<2?'再选一张来对比':`对比 ${compare.length} 张`}</button>}
      </div>
      {feed.findings.length>0&&<details className="topics-findings"><summary>样本里的发现（{feed.findings.length}）</summary><ul>{feed.findings.map((f,i)=><li key={i}>{f}</li>)}</ul></details>}
      <div className="topics-grid">
        {(()=>{const shown=filterCards(rankedCards(feed.cards),filter);return shown.length?null:<p className="hint">没有符合筛选条件的选题。</p>;})()}
        {filterCards(rankedCards(feed.cards),filter).map(({card,index})=><article key={index} className={`topic-card${card.starred?' starred':''}`}>
          <div className="topic-card-head">
            <b>{card.title}</b>
            <button type="button" className="topic-star" title={card.starred?'取消收藏':'收藏'} aria-label={card.starred?'取消收藏':'收藏'} disabled={!!busy} onClick={()=>void star(index,!card.starred)}>{card.starred?'★':'☆'}</button>
          </div>
          <p className="topic-judgement">{card.judgement}</p>
          <div className="topic-tags">{card.platforms.map(p=><span key={p}>{PLATFORM_LABELS[p]??p}</span>)}<span>{card.window}</span><span>面向{card.audience}</span><span className="topic-total">{totalScore(card)}/20</span></div>
          <div className="topic-scores">{(Object.keys(SCORE_LABELS) as ScoreKey[]).map(k=><div key={k} title={card.scores[k].reason}>
            <span>{SCORE_LABELS[k]}</span><i style={{width:`${card.scores[k].score*20}%`}}/><em>{card.scores[k].score}</em></div>)}</div>
          <p className="idea-line"><span>开场</span>「{card.hook}」</p>
          <p className="idea-line"><span>角度</span>{card.angle}</p>
          {open===index&&<>
            <p className="idea-line"><span>痛点</span>{card.pain_point}</p>
            {(Object.keys(SCORE_LABELS) as ScoreKey[]).map(k=><p key={k} className="idea-line"><span>{SCORE_LABELS[k]}</span>{card.scores[k].score} 分 · {card.scores[k].reason}</p>)}
            <p className="idea-line"><span>缺证据</span>{card.gaps}</p>
            <p className="idea-line"><span>风险</span>{card.risks}</p>
            <ul className="topic-evidence">{card.evidence.map(id=>{const e=evidence[id];return <li key={id}>{id} {e?.source?.url?<a href={e.source.url} target="_blank" rel="noreferrer noopener">{e.source.title||e.text.slice(0,40)}</a>:e?.text.slice(0,60)}{e?.source?.platform_label?` · ${e.source.platform_label}`:''}</li>;})}</ul>
          </>}
          <div className="idea-card-foot">
            <button type="button" className="link-button idea-toggle" onClick={()=>setOpen(o=>o===index?null:index)}>{open===index?'收起 ▴':'证据与评分理由 ▸'}</button>
            <label className="topic-compare-pick"><input type="checkbox" checked={compare.includes(index)} onChange={()=>toggleCompare(index)}/>对比</label>
            <button type="button" className="idea-use" onClick={()=>handoff(cardToDraft(card,feed.evidence))}>用这个选题做视频</button>
          </div>
        </article>)}
      </div>
    </>}
    {feed&&<Modal open={comparing} onClose={()=>setComparing(false)} title={`对比 ${compare.length} 张选题卡`} maxWidth="1080px"
      footer={<button type="button" className="btn-modal-confirm primary" onClick={()=>setComparing(false)}>关闭</button>}>
      <div className="topics-compare-table"><table><thead><tr><th/>{compare.map(i=><th key={i}>{feed.cards[i].title}</th>)}</tr></thead><tbody>
        {([['判断',c=>c.judgement],['面向',c=>c.audience],['平台',c=>c.platforms.map(p=>PLATFORM_LABELS[p]??p).join('、')],['时效',c=>c.window],
          ...(Object.keys(SCORE_LABELS) as ScoreKey[]).map(k=>[SCORE_LABELS[k],(c:TopicCard)=>`${c.scores[k].score} · ${c.scores[k].reason}`] as const),
          ['总分',c=>`${totalScore(c)}/20`],['开场',c=>`「${c.hook}」`],['角度',c=>c.angle],['缺证据',c=>c.gaps],['风险',c=>c.risks]] as const satisfies readonly (readonly [string,(c:TopicCard)=>string])[])
          .map(([label,value])=><tr key={label}><th>{label}</th>{compare.map(i=><td key={i}>{value(feed.cards[i])}</td>)}</tr>)}
        <tr><th/>{compare.map(i=><td key={i}><button type="button" className="idea-use" onClick={()=>{setComparing(false);handoff(cardToDraft(feed.cards[i],feed.evidence));}}>用这个选题做视频</button></td>)}</tr>
      </tbody></table></div>
    </Modal>}
    <ResearchModal open={research} topic={parsed[0]??''} currentBrief={null} disabled={false} onClose={()=>setResearch(false)}
      onApplyBrief={(brief:ResearchBrief|null)=>{if(brief)handoff({research:brief});}}
      onApplyPitch={(pitch,brief)=>handoff({topic:pitch.title,title:pitch.title,duration_hint:pitch.duration_hint,teaching_style:pitch.teaching_style,
        notes:`【${pitch.platform_name}】封面大字：${pitch.cover_text}；开场可参考：「${pitch.hook}」；${pitch.notes}`.slice(0,300),research:brief})}
      onUseTopic={t=>handoff({topic:t})}/>
  </section>;
}
