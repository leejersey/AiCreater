'use client';
// 构思区: angles for a topic → one chosen → its outline edited inside the card → manuscript (see
// docs/superpowers/specs/2026-11-09-topic-ideation-design.md). Every model call is a short paid call.
import {useEffect,useState} from 'react';
import {request} from '../../../lib/editor';
import {addBatch,addExtra,addSection,angleTags,choose,moveSection,outlineProblems,outlineWarnings,removeSection,
  sameAngle,setOutline,shownTitles,totalSeconds,undo,updateSection,type Angle,type IdeationDraft,type Outline} from '../../../lib/ideation';
import {Sparkles,Spinner,ChevronUp,ChevronDown,X,Plus,RefreshCw,Check} from '../../Icons';

export type IdeaContext = {topic:string;notes:string;audience:string;duration_hint:string;teaching_style:'popular'|'technical'};
type Busy = ''|'angles'|'custom'|'merge'|'outline'|'refine';

export function Ideation({state,context,title,disabled,generating,onChange,onTitle,onGenerate}:{
  state:IdeationDraft;context:IdeaContext;title:string;disabled:boolean;generating:boolean;
  onChange:(next:IdeationDraft)=>void;onTitle:(title:string)=>void;onGenerate:()=>void;
}){
  const [busy,setBusy]=useState<Busy>(''),[error,setError]=useState('');
  const [picked,setPicked]=useState<Angle[]>([]),[custom,setCustom]=useState(''),[feedback,setFeedback]=useState('');
  const [showOthers,setShowOthers]=useState(false),[open,setOpen]=useState<Set<string>>(new Set());
  const locked=disabled||!!busy||generating;
  const latest=state.batches[state.batches.length-1]??[],older=state.batches.slice(0,-1);
  const body=()=>({topic:context.topic.trim(),notes:context.notes.trim(),audience:context.audience.trim(),
    duration_hint:context.duration_hint.trim(),teaching_style:context.teaching_style});

  async function call<T>(kind:Busy,run:()=>Promise<T>):Promise<T|undefined>{
    setBusy(kind);setError('');
    try{return await run();}
    catch(e){setError(e instanceof Error?e.message:'生成失败，可以重试。');return undefined;}
    finally{setBusy('');}
  }
  const angles=(extra:object)=>request<{angles:Angle[]}>('/api/ideas/angles',{...body(),...extra}).then(r=>r.angles);

  async function explore(){
    const got=await call('angles',()=>angles(state.batches.length?{exclude:shownTitles(state)}:{}));
    if(got){onChange(addBatch(state,got));setPicked([]);setShowOthers(true);}
  }
  async function own(){
    const got=await call('custom',()=>angles({custom:custom.trim()}));
    if(got){onChange(addExtra(state,got[0]));setCustom('');}
  }
  async function merge(){
    const got=await call('merge',()=>angles({merge:picked}));
    if(got){onChange(addExtra(state,got[0]));setPicked([]);}
  }
  async function pick(angle:Angle){
    const next=choose(state,angle);onChange(next);onTitle(angle.title);setShowOthers(false);setFeedback('');
    const outline=await call('outline',()=>request<{outline:Outline}>('/api/ideas/outline',{...body(),angle}).then(r=>r.outline));
    if(outline)onChange(setOutline(next,outline,false));
  }
  async function refine(){
    if(!state.chosen||!state.outline)return;
    const outline=await call('refine',()=>request<{outline:Outline}>('/api/ideas/outline',{...body(),angle:state.chosen,
      previous:state.outline,feedback:feedback.trim()}).then(r=>r.outline));
    if(outline){onChange(setOutline(state,outline));setFeedback('');}
  }
  // Cards picked for a merge stay picked only while they are still shown.
  useEffect(()=>{setPicked(p=>p.filter(a=>[...state.batches.flat(),...state.extras].some(b=>sameAngle(a,b))));},[state.batches,state.extras]);

  const toggle=(a:Angle)=>setPicked(p=>p.some(b=>sameAngle(a,b))?p.filter(b=>!sameAngle(a,b)):p.length>=2?[p[1],a]:[...p,a]);
  const card=(a:Angle,key:string)=>{
    const chosen=sameAngle(a,state.chosen),checked=picked.some(b=>sameAngle(a,b));
    return <div key={key} className={`idea-card${chosen?' chosen':''}`}>
      <div className="idea-card-head">
        <label className="idea-pick" title="勾选两个可以合并"><input type="checkbox" checked={checked} disabled={locked} onChange={()=>toggle(a)}/></label>
        <div style={{minWidth:0,flex:1}}>
          <b className="idea-title">{a.title}</b>
          <span className="idea-tags">{angleTags(a)}</span>
        </div>
      </div>
      <p className="idea-line"><span>看完能</span>{a.takeaway}</p>
      {open.has(key)&&<>
        <p className="idea-line"><span>开场</span>「{a.hook}」</p>
        <p className="idea-line"><span>适合</span>{a.audience}</p>
        <p className="idea-line"><span>章节</span>{a.chapters.join(' / ')}</p>
      </>}
      <div className="idea-card-foot">
        <button type="button" className="link-button idea-toggle" onClick={()=>setOpen(o=>{const n=new Set(o);n.has(key)?n.delete(key):n.add(key);return n;})}>{open.has(key)?'收起 ▴':'展开 ▸'}</button>
        {chosen?<span className="studio-badge"><Check size={12}/> 已选</span>
          :<button type="button" className="idea-use" disabled={locked} onClick={()=>void pick(a)}>用这个方向</button>}
      </div>
    </div>;
  };

  const outline=state.outline;
  const problems=outline?outlineProblems(outline):[],warnings=outline?outlineWarnings(outline,context.duration_hint):[];
  const cards=<>
    <div className="idea-toolbar">
      <b>{latest.length} 个方向</b>
      <button type="button" className="link-button" disabled={locked||!context.topic.trim()} onClick={()=>void explore()}>
        {busy==='angles'?<Spinner size={12} className="icon-spin"/>:<RefreshCw size={12}/>} 换一批</button>
    </div>
    {latest.map((a,i)=>card(a,`l${i}`))}
    {state.extras.length>0&&<><p className="idea-group">你的方向 / 合并的方向</p>{state.extras.map((a,i)=>card(a,`e${i}`))}</>}
    {older.length>0&&<details className="idea-older"><summary>之前的方向（{older.length} 批）</summary>
      {older.map((batch,b)=>batch.map((a,i)=>card(a,`o${b}-${i}`)))}</details>}
    {picked.length===2&&<div className="idea-merge">已勾选 2 个
      <button type="button" disabled={locked} onClick={()=>void merge()}>{busy==='merge'?<Spinner size={12} className="icon-spin"/>:<Sparkles size={12}/>} 合并成一个方向</button></div>}
    <div className="idea-custom">
      <input maxLength={200} value={custom} disabled={locked} onChange={e=>setCustom(e.target.value)} placeholder="我自己说一个方向，例如：用客服工单的例子讲 RAG"/>
      <button type="button" disabled={locked||!custom.trim()} onClick={()=>void own()}>{busy==='custom'?<Spinner size={12} className="icon-spin"/>:<Plus size={12}/>} 整理成卡片</button>
    </div>
  </>;

  return <div className="ideation">
    {!state.batches.length&&<button type="button" className="idea-explore" disabled={locked||!context.topic.trim()} onClick={()=>void explore()}>
      {busy==='angles'?<><Spinner size={14} className="icon-spin"/> AI 正在发散方向…</>:<><Sparkles size={14}/> 发散几个方向</>}
    </button>}
    {error&&<p role="alert" className="error" style={{margin:0}}>{error}</p>}

    {state.chosen?<>
      <div className="idea-card chosen idea-expanded">
        <div className="idea-card-head">
          <div style={{minWidth:0,flex:1}}><b className="idea-title">{state.chosen.title}</b><span className="idea-tags">{angleTags(state.chosen)}</span></div>
          <button type="button" className="link-button" disabled={locked} onClick={()=>{onChange(choose(state,null));setShowOthers(true);}}>换个方向</button>
        </div>
        {!outline&&(busy==='outline'?<p className="hint"><Spinner size={12} className="icon-spin"/> AI 正在写大纲…</p>
          :<button type="button" disabled={locked} onClick={()=>void pick(state.chosen!)}>生成大纲</button>)}
        {outline&&<>
          {outline.sections.map((s,i)=><div key={i} className="idea-section">
            <div className="idea-section-head">
              <span className="idea-index">{i+1}</span>
              <input value={s.title} maxLength={24} disabled={locked} aria-label={`第 ${i+1} 章标题`} onChange={e=>onChange(setOutline(state,updateSection(outline,i,{title:e.target.value}),false))}/>
              <input type="number" min={10} max={110} value={s.seconds} disabled={locked} aria-label={`第 ${i+1} 章秒数`} className="idea-seconds"
                onChange={e=>onChange(setOutline(state,updateSection(outline,i,{seconds:Math.round(Number(e.target.value))}),false))}/>
              <span className="hint">秒</span>
              <button type="button" className="icon-button" title="上移" disabled={locked||i===0} onClick={()=>onChange(setOutline(state,moveSection(outline,i,-1)))}><ChevronUp size={13}/></button>
              <button type="button" className="icon-button" title="下移" disabled={locked||i===outline.sections.length-1} onClick={()=>onChange(setOutline(state,moveSection(outline,i,1)))}><ChevronDown size={13}/></button>
              <button type="button" className="icon-button" title="删除这一章" disabled={locked||outline.sections.length<=1} onClick={()=>onChange(setOutline(state,removeSection(outline,i)))}><X size={13}/></button>
            </div>
            <textarea rows={Math.max(1,s.points.length)} value={s.points.join('\n')} disabled={locked} aria-label={`第 ${i+1} 章要点`} placeholder="要点，一行一个（1–4 个）"
              onChange={e=>onChange(setOutline(state,updateSection(outline,i,{points:e.target.value.split('\n')}),false))}/>
            <label className="idea-picture">画面<input value={s.picture} maxLength={80} disabled={locked} placeholder="一个会变化的物体或过程"
              onChange={e=>onChange(setOutline(state,updateSection(outline,i,{picture:e.target.value}),false))}/></label>
          </div>)}
          <div className="idea-toolbar">
            <button type="button" className="link-button" disabled={locked||outline.sections.length>=20} onClick={()=>onChange(setOutline(state,addSection(outline)))}><Plus size={12}/> 加一章</button>
            <span className="hint">合计约 {totalSeconds(outline)} 秒 · {outline.sections.length} 章</span>
          </div>
          {warnings.map(w=><p key={w} className="hint idea-warning">{w}</p>)}
          <div className="idea-custom">
            <input maxLength={300} value={feedback} disabled={locked} onChange={e=>setFeedback(e.target.value)} placeholder="追问 / 调整，例如：第 3 章换成客服场景的例子"/>
            <button type="button" disabled={locked||!feedback.trim()} onClick={()=>void refine()}>{busy==='refine'?<Spinner size={12} className="icon-spin"/>:<Sparkles size={12}/>} 按意见调整</button>
          </div>
          {state.history.length>0&&<button type="button" className="link-button" disabled={locked} onClick={()=>onChange(undo(state))}>↶ 上一版大纲</button>}
          {problems.length>0&&<p className="hint idea-warning">生成文稿前请先改好：{problems.join('；')}</p>}
          <button type="button" className="idea-explore" disabled={locked||problems.length>0||!title.trim()} onClick={onGenerate}>
            {generating?<><Spinner size={14} className="icon-spin"/> AI 正在按大纲写文稿…</>:<><Sparkles size={14}/> 按这个大纲生成文稿 →</>}
          </button>
        </>}
      </div>
      {state.batches.length>0&&<button type="button" className="link-button" onClick={()=>setShowOthers(v=>!v)}>{showOthers?'收起其他方向':`其他方向（${state.batches.flat().length+state.extras.length-1}）▸`}</button>}
      {showOthers&&cards}
    </>:state.batches.length>0&&cards}
    <p className="hint" style={{margin:0}}>发散、大纲与追问都是一次短的 AI 调用（计费；用你自己的模型时由你的服务商收费）。</p>
  </div>;
}

