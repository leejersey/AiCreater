'use client';
// 拆解库: reference videos broken down (upload, link or pasted copy), formulas drawn from them, and the text research that
// used to live on the new-video page. Everything taken onward goes to the new-video page through the studio handoff.
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {request} from '../../lib/editor';
import {useConfirm} from '../ConfirmContext';
import {useToast} from '../ToastContext';
import {ResearchModal} from '../courses/new/ResearchModal';
import type {ResearchBrief} from '../../lib/research';
import {BREAKDOWN_STATE,HANDOFF_KEY,formulaSeconds,formulaToNotes,pending,segmentBars,uploadVideo,type Breakdown,type Formula,type SavedFormula} from '../../lib/studio';
import {Spinner,Sparkles,RefreshCw,AlertCircle} from '../Icons';

type Listing={breakdowns:Breakdown[];formulas:SavedFormula[]};
const COST='生成拆解卡会调用一次模型（计费）；上传的视频在本机转写口播、抽关键帧并交给看图模型描述画面（计费），原视频保留 7 天。';

function handoff(router:ReturnType<typeof useRouter>,payload:Record<string,unknown>){
  sessionStorage.setItem(HANDOFF_KEY,JSON.stringify(payload));router.push('/courses/new?from=studio');
}

export function Breakdowns(){
  const confirm=useConfirm(),toast=useToast(),router=useRouter();
  const [data,setData]=useState<Listing|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const [url,setUrl]=useState(''),[title,setTitle]=useState(''),[text,setText]=useState('');
  const [open,setOpen]=useState<string|null>(null),[detail,setDetail]=useState<Breakdown|null>(null),[picked,setPicked]=useState<string[]>([]);
  const [draft,setDraft]=useState<SavedFormula|null>(null),[research,setResearch]=useState(false);
  const file=useRef<HTMLInputElement>(null);
  const load=async()=>setData(await request<Listing>('/api/studio/breakdowns'));
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'读取失败'));},[]);
  // While something is being broken down, look again every few seconds.
  useEffect(()=>{if(!data||!pending(data.breakdowns))return;const t=setTimeout(()=>void load().catch(()=>{}),4000);return()=>clearTimeout(t);},[data]);
  useEffect(()=>{if(!open){setDetail(null);return;}void request<Breakdown>('/api/studio/breakdowns/'+open).then(setDetail).catch(()=>{});},[open,data]);
  async function run(kind:string,fn:()=>Promise<void>){setBusy(kind);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setBusy('');}}
  const ask=(message:string)=>confirm({title:'开始拆解',message:message+'\n\n'+COST,confirmText:'开始'});
  const add=(kind:string,make:()=>Promise<unknown>)=>run(kind,async()=>{await make();await load();toast('已加入拆解队列，完成后会出现在列表里',{variant:'success'});});

  const done=(data?.breakdowns??[]).filter(b=>b.state==='succeeded');
  const toggle=(id:string)=>setPicked(p=>p.includes(id)?p.filter(x=>x!==id):p.length>=5?p:[...p,id]);
  const editStep=(i:number,patch:Partial<Formula['steps'][number]>)=>draft&&setDraft({...draft,formula:{...draft.formula,steps:draft.formula.steps.map((s,k)=>k===i?{...s,...patch}:s)}});
  const editFormula=(patch:Partial<Formula>)=>draft&&setDraft({...draft,formula:{...draft.formula,...patch}});

  return <section className="studio-panel">
    {error&&<p role="alert" className="error"><AlertCircle size={14}/> {error}</p>}
    <div className="bd-add">
      <div className="bd-add-col">
        <b>上传对标视频</b>
        <p className="hint">mp4 / mov / webm，10 分钟、200MB 以内。在本机转写口播并抽关键帧。</p>
        <input ref={file} type="file" accept="video/mp4,video/quicktime,video/webm,.mkv" disabled={!!busy}
          onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(await ask(`上传「${f.name}」并拆解。`))await add('upload',()=>uploadVideo(f));}}/>
      </div>
      <div className="bd-add-col">
        <b>贴链接</b>
        <p className="hint">B站 / YouTube 取公开字幕，文章取正文；抖音 / 小红书需配置 TikHub，或下载后上传。</p>
        <div className="idea-custom"><input value={url} maxLength={500} placeholder="https://…" onChange={e=>setUrl(e.target.value)}/>
          <button type="button" disabled={!!busy||!/^https?:\/\//.test(url.trim())} onClick={async()=>{if(await ask('拆解这个链接的口播或正文。'))await add('link',async()=>{await request('/api/studio/breakdowns',{kind:'link',url:url.trim()});setUrl('');});}}>拆解</button></div>
      </div>
      <div className="bd-add-col">
        <b>粘贴文案</b>
        <input value={title} maxLength={120} placeholder="标题（可选）" onChange={e=>setTitle(e.target.value)}/>
        <textarea rows={3} maxLength={8000} value={text} placeholder="粘贴爆款视频的口播文案…" onChange={e=>setText(e.target.value)}/>
        <button type="button" disabled={!!busy||text.trim().length<20} onClick={async()=>{if(await ask('拆解这段文案。'))await add('text',async()=>{await request('/api/studio/breakdowns',{kind:'text',title,text});setText('');setTitle('');});}}>拆解</button>
      </div>
    </div>
    <div className="topics-toolbar">
      <button type="button" onClick={()=>setResearch(true)}>检索热点 / 文字拆解 / 三平台方案</button>
      <span className="hint">原「热点与爆款参考」：检索全网热点、今日热榜、导入链接，拆成参考简报后带到文案。</span>
      <button type="button" title="重新读取" disabled={!!busy} onClick={()=>void run('load',load)}><RefreshCw size={14}/></button>
    </div>

    {picked.length>0&&<div className="idea-merge">已选 {picked.length} 张拆解卡
      <button type="button" disabled={!!busy} onClick={()=>void run('formula',async()=>{
        if(!await confirm({title:'提炼爆款公式',message:'用选中的拆解卡提炼一条可复用的结构公式（一次模型调用，计费）。提炼后可以修改，确认后再带到文案。',confirmText:'提炼'}))return;
        setDraft(await request<SavedFormula>('/api/studio/formulas',{breakdown_ids:picked}));await load();})}>
        {busy==='formula'?<Spinner size={12} className="icon-spin"/>:<Sparkles size={12}/>} 提炼爆款公式（计费）</button></div>}

    {draft&&<div className="idea-card chosen idea-expanded bd-formula">
      <div className="idea-card-head"><b className="idea-title">爆款公式{draft.confirmed?'（已确认）':'（待确认）'}</b><span className="idea-tags">合计约 {formulaSeconds(draft.formula)} 秒</span></div>
      <label>名称<input value={draft.formula.name} maxLength={20} onChange={e=>editFormula({name:e.target.value})}/></label>
      <label>开场句式<input value={draft.formula.hook_pattern} maxLength={60} onChange={e=>editFormula({hook_pattern:e.target.value})}/></label>
      {draft.formula.steps.map((s,i)=><div key={i} className="idea-section">
        <div className="idea-section-head"><span className="idea-index">{i+1}</span><span className="review-kind">{s.role}</span>
          <input type="number" className="idea-seconds" min={3} max={60} value={s.seconds} onChange={e=>editStep(i,{seconds:Math.round(Number(e.target.value))})}/><span className="hint">秒</span></div>
        <input value={s.does} maxLength={50} onChange={e=>editStep(i,{does:e.target.value})}/>
        <label className="idea-picture">手法<input value={s.technique} maxLength={40} onChange={e=>editStep(i,{technique:e.target.value})}/></label>
      </div>)}
      <label>节奏<input value={draft.formula.rhythm} maxLength={60} onChange={e=>editFormula({rhythm:e.target.value})}/></label>
      <p className="idea-line"><span>适合</span>{draft.formula.fits}</p>
      <p className="idea-line"><span>画面</span>{draft.formula.visual_rules.join('；')}</p>
      <p className="idea-line"><span>结尾</span>{draft.formula.ending}</p>
      <p className="idea-line"><span>避免</span>{draft.formula.avoid.join('；')}</p>
      {draft.formula.variations!=='无'&&<p className="idea-line"><span>差异</span>{draft.formula.variations}</p>}
      <div className="idea-card-foot">
        <button type="button" disabled={!!busy} onClick={()=>void run('confirm',async()=>{setDraft(await request<SavedFormula>('/api/studio/formulas/'+draft.id+'/confirm',{formula:draft.formula}));await load();toast('公式已确认',{variant:'success'});})}>确认公式</button>
        <button type="button" className="idea-use" disabled={!draft.confirmed} title={draft.confirmed?'':'先确认公式'} onClick={()=>handoff(router,{notes:formulaToNotes(draft.formula)})}>带到文案</button>
      </div>
    </div>}

    {!data?<p className="hint">正在读取…</p>:!data.breakdowns.length?<p className="hint">还没有拆解。上传一条对标视频、贴一个链接或粘贴一段文案开始。</p>:
    <ul className="bd-list">
      {data.breakdowns.map(b=><li key={b.id} className={`bd-item${open===b.id?' open':''}`}>
        <div className="bd-row">
          <input type="checkbox" disabled={b.state!=='succeeded'} checked={picked.includes(b.id)} onChange={()=>toggle(b.id)} title="选来提炼公式"/>
          <button type="button" className="bd-title" onClick={()=>setOpen(o=>o===b.id?null:b.id)}>
            <b>{b.source.title||'未命名'}</b>
            <span className="hint">{b.source.platform}{b.source.duration?` · ${Math.round(b.source.duration)} 秒`:''}{b.card?` · ${b.card.summary}`:''}</span>
          </button>
          <span className={`review-tag review-${b.state==='succeeded'?'pass':b.state==='failed'?'block':'warn'}`}>{(b.state==='queued'||b.state==='running')&&<Spinner size={10} className="icon-spin"/>} {BREAKDOWN_STATE[b.state]}</span>
        </div>
        {b.error&&<p className="hint review-stale">{b.error}</p>}
        {open===b.id&&detail?.id===b.id&&detail.card&&<BreakdownDetail b={detail}/>}
      </li>)}
    </ul>}
    {data&&data.formulas.length>0&&<details className="topics-findings"><summary>已有公式（{data.formulas.length}）</summary>
      <ul>{data.formulas.map(f=><li key={f.id}><button type="button" className="link-button" onClick={()=>setDraft(f)}>{f.formula.name}{f.confirmed?' ✓':''}</button> · {f.breakdown_ids.length} 张卡 · {formulaSeconds(f.formula)} 秒</li>)}</ul></details>}

    <ResearchModal open={research} topic="" currentBrief={null} disabled={false} onClose={()=>setResearch(false)}
      onApplyBrief={(brief:ResearchBrief|null)=>{if(brief)handoff(router,{research:brief});}}
      onApplyPitch={(pitch,brief)=>handoff(router,{topic:pitch.title,title:pitch.title,duration_hint:pitch.duration_hint,teaching_style:pitch.teaching_style,
        notes:`【${pitch.platform_name}】封面大字：${pitch.cover_text}；开场可参考：「${pitch.hook}」；${pitch.notes}`.slice(0,300),research:brief})}
      onUseTopic={t=>handoff(router,{topic:t})}/>
  </section>;
}

function BreakdownDetail({b}:{b:Breakdown}){
  const c=b.card!;
  const bars=segmentBars(c.segments,b.source.duration);
  return <div className="bd-detail">
    <div className="bd-hook">
      <p className="idea-line"><span>开场</span>「{c.hook.opening}」</p>
      <p className="idea-line"><span>钩子</span>文案：{c.hook.copy_type} · 画面：{c.hook.visual_type} · 强度 {c.hook.strength}/10（{c.hook.reason}）</p>
      <p className="idea-line"><span>配合</span>{c.hook.alignment}</p>
    </div>
    {bars.length>0&&<div className="bd-timeline">{bars.map((s,i)=><div key={i} className="bd-seg" style={{left:`${s.left}%`,width:`${s.width}%`}} title={`${s.start}–${s.end} 秒 · ${s.role}：${s.summary}`}>{s.role}</div>)}</div>}
    <ol className="bd-segments">{c.segments.map((s,i)=><li key={i}><span className="review-kind">{s.start!==null?`${s.start}–${s.end}s`:'—'} {s.role}</span> {s.summary}</li>)}</ol>
    <p className="idea-line"><span>节奏</span>{c.rhythm.model}{c.rhythm.beats.length?'：'+c.rhythm.beats.map(x=>`${x.t??'?'}s ${x.what}`).join('；'):''}</p>
    <p className="idea-line"><span>画面</span>{c.visuals}</p>
    <p className="idea-line"><span>转化</span>{c.conversion}</p>
    <p className="idea-line"><span>合规</span>{c.compliance}</p>
    <p className="idea-line"><span>可复制</span>{c.transferable.join('；')}</p>
    <p className="idea-line"><span>不可复制</span>{c.not_transferable.join('；')}</p>
    {b.source.frames_note&&<p className="hint">{b.source.frames_note}</p>}
    {!!b.frames?.length&&<div className="bd-frames">{b.frames.map(f=><figure key={f.file}>
      <img src={`/api/studio/breakdowns/${b.id}/frames/${f.file}`} alt={`${f.t} 秒`} loading="lazy"/>
      <figcaption>{f.t} 秒 · {f.description||'（无描述）'}</figcaption></figure>)}</div>}
    {!!b.transcript?.length&&<details className="topics-findings"><summary>口播转写（{b.transcript.length} 句）</summary>
      <ul>{b.transcript.map((s,i)=><li key={i}>{s.start}–{s.end}s {s.text}</li>)}</ul></details>}
    {b.video_kept_until&&<p className="hint">原视频保留到 {b.video_kept_until.slice(0,10)}，之后只保留转写、关键帧和拆解卡。</p>}
  </div>;
}
