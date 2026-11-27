'use client';
// 拆解库: reference videos broken down (upload, link or pasted copy) and formulas drawn from them. A confirmed formula goes
// to the new-video page through the studio handoff.
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {request} from '../../lib/editor';
import {useConfirm} from '../ConfirmContext';
import {useToast} from '../ToastContext';
import {BREAKDOWN_STATE,HANDOFF_PATH,breakdownError,formulaSeconds,pending,segmentBars,storeHandoff,unseen,uploadVideo,type Breakdown,type Formula,type SavedFormula} from '../../lib/studio';
import {Spinner,Sparkles,RefreshCw,AlertCircle,Trash2} from '../Icons';

type Listing={breakdowns:Breakdown[];formulas:SavedFormula[]};
const COST='生成拆解卡会调用一次模型（计费）；上传的视频在本机转写口播、抽关键帧并交给看图模型描述画面（计费），原视频保留 7 天。';
const MAX_PICK=5;
/** A formula being looked at: `edited` once changed since it was loaded or confirmed (it then needs confirming again). */
type Draft=SavedFormula&{edited?:boolean};

export function Breakdowns(){
  const confirm=useConfirm(),toast=useToast(),router=useRouter();
  const [data,setData]=useState<Listing|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[progress,setProgress]=useState<number|null>(null);
  const [url,setUrl]=useState(''),[title,setTitle]=useState(''),[text,setText]=useState('');
  const [open,setOpen]=useState<string|null>(null),[detail,setDetail]=useState<Breakdown|null>(null),[picked,setPicked]=useState<string[]>([]);
  const [draft,setDraft]=useState<Draft|null>(null);
  const file=useRef<HTMLInputElement>(null);
  const load=async()=>setData(await request<Listing>('/api/studio/breakdowns'));
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'读取失败'));},[]);
  // While something is being broken down, look again every few seconds.
  useEffect(()=>{if(!data||!pending(data.breakdowns))return;const t=setTimeout(()=>void load().catch(()=>{}),4000);return()=>clearTimeout(t);},[data]);
  // The open card's details: fetched when it opens or its state changes, not on every poll.
  const openState=data?.breakdowns.find(b=>b.id===open)?.state;
  useEffect(()=>{if(!open){setDetail(null);return;}void request<Breakdown>('/api/studio/breakdowns/'+open).then(setDetail).catch(()=>{});},[open,openState]);
  async function run(kind:string,fn:()=>Promise<void>){setBusy(kind);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setBusy('');}}
  const ask=(message:string)=>confirm({title:'开始拆解',message:message+'\n\n'+COST,confirmText:'开始'});
  const add=(kind:string,make:()=>Promise<unknown>)=>run(kind,async()=>{await make();await load();toast('已加入拆解队列，完成后会出现在列表里',{variant:'success'});});
  const upload=(f:File)=>add('upload',async()=>{setProgress(0);try{await uploadVideo(f,setProgress);}finally{setProgress(null);}});

  const toggle=(id:string)=>{
    if(picked.includes(id)){setPicked(picked.filter(x=>x!==id));return;}
    if(picked.length>=MAX_PICK){toast(`一次最多选 ${MAX_PICK} 张拆解卡`,{variant:'info'});return;}
    setPicked([...picked,id]);
  };
  const editFormula=(patch:Partial<Formula>)=>draft&&setDraft({...draft,confirmed:false,edited:true,formula:{...draft.formula,...patch}});
  const editStep=(i:number,patch:Partial<Formula['steps'][number]>)=>draft&&editFormula({steps:draft.formula.steps.map((s,k)=>k===i?{...s,...patch}:s)});
  async function show(next:SavedFormula|null){
    if(draft?.edited&&next?.id!==draft.id&&!await confirm({title:'放弃未确认的修改？',message:`「${draft.formula.name}」的修改还没有确认，切换后会丢失。`,confirmText:'放弃修改',variant:'warning'}))return;
    setDraft(next);
  }
  const retry=(b:Breakdown)=>run('retry',async()=>{
    if(!await confirm({title:'重新拆解',message:`重新拆解「${b.source.title||'未命名'}」。\n\n${COST}`,confirmText:'重新拆解'}))return;
    await request('/api/studio/breakdowns/'+b.id+'/retry',{});await load();toast('已重新加入拆解队列',{variant:'success'});
  });
  const remove=(b:Breakdown)=>run('delete',async()=>{
    if(!await confirm({title:'删除拆解',message:`删除「${b.source.title||'未命名'}」的拆解卡、转写和关键帧${b.video_kept_until?'，以及保留在本机的原视频':''}。已提炼的公式不受影响。`,confirmText:'删除',variant:'danger'}))return;
    await request('/api/studio/breakdowns/'+b.id+'/delete',{});setPicked(p=>p.filter(x=>x!==b.id));if(open===b.id)setOpen(null);await load();
  });
  const removeFormula=(f:SavedFormula)=>run('delete',async()=>{
    if(!await confirm({title:'删除公式',message:`删除爆款公式「${f.formula.name}」。已经带到文案或建好的课程不受影响。`,confirmText:'删除',variant:'danger'}))return;
    await request('/api/studio/formulas/'+f.id+'/delete',{});if(draft?.id===f.id)setDraft(null);await load();
  });

  const list=data?.breakdowns??[];
  return <section className="studio-panel">
    {error&&<p role="alert" className="error"><AlertCircle size={14}/> {error}</p>}
    <div className="bd-add">
      <div className="bd-add-col">
        <b>上传对标视频</b>
        <p className="hint">mp4 / mov / webm，10 分钟、200MB 以内。在本机转写口播并抽关键帧。</p>
        <input ref={file} type="file" hidden accept="video/mp4,video/quicktime,video/webm,.mkv"
          onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(await ask(`上传「${f.name}」并拆解。`))await upload(f);}}/>
        {progress!==null?<div className="bd-progress" role="progressbar" aria-valuenow={Math.round(progress*100)} aria-valuemin={0} aria-valuemax={100}>
            <i style={{width:`${Math.round(progress*100)}%`}}/><span>{progress<1?`上传中 ${Math.round(progress*100)}%`:'上传完成，正在读取视频…'}</span></div>
          :<button type="button" className="bd-add-action" disabled={!!busy} onClick={()=>file.current?.click()}>选择视频文件</button>}
      </div>
      <div className="bd-add-col">
        <b>贴链接</b>
        <p className="hint">B站 / YouTube 取公开字幕，文章取正文；抖音 / 小红书需配置 TikHub，或下载后上传。</p>
        <input value={url} maxLength={500} placeholder="https://…" onChange={e=>setUrl(e.target.value)}/>
        <button type="button" className="bd-add-action" disabled={!!busy||!/^https?:\/\//.test(url.trim())} onClick={async()=>{if(await ask('拆解这个链接的口播或正文。'))await add('link',async()=>{await request('/api/studio/breakdowns',{kind:'link',url:url.trim()});setUrl('');});}}>拆解链接</button>
      </div>
      <div className="bd-add-col">
        <b>粘贴文案</b>
        <input value={title} maxLength={120} placeholder="标题（可选）" onChange={e=>setTitle(e.target.value)}/>
        <textarea rows={3} maxLength={8000} value={text} placeholder="粘贴爆款视频的口播文案（至少 20 字）…" onChange={e=>setText(e.target.value)}/>
        <button type="button" className="bd-add-action" disabled={!!busy||text.trim().length<20} onClick={async()=>{if(await ask('拆解这段文案。'))await add('text',async()=>{await request('/api/studio/breakdowns',{kind:'text',title,text});setText('');setTitle('');});}}>拆解文案</button>
      </div>
    </div>

    {draft&&<div className="idea-card chosen idea-expanded bd-formula">
      <div className="idea-card-head"><b className="idea-title">爆款公式{draft.confirmed?'（已确认）':draft.edited?'（已修改，待确认）':'（待确认）'}</b>
        <span className="idea-tags">合计约 {formulaSeconds(draft.formula)} 秒</span>
        <button type="button" className="link-button" onClick={()=>void show(null)}>收起</button></div>
      <label>名称<input value={draft.formula.name} maxLength={20} onChange={e=>editFormula({name:e.target.value})}/></label>
      <label>开场句式<input value={draft.formula.hook_pattern} maxLength={60} onChange={e=>editFormula({hook_pattern:e.target.value})}/></label>
      {draft.formula.steps.map((s,i)=><div key={i} className="idea-section">
        <div className="idea-section-head"><span className="idea-index">{i+1}</span><span className="review-kind">{s.role}</span>
          <input type="number" className="idea-seconds" min={3} max={60} value={s.seconds} onChange={e=>{const v=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(v))editStep(i,{seconds:Math.min(60,Math.max(3,Math.round(v)))});}}/><span className="hint">秒</span></div>
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
        <button type="button" disabled={!!busy||draft.confirmed} onClick={()=>void run('confirm',async()=>{setDraft(await request<SavedFormula>('/api/studio/formulas/'+draft.id+'/confirm',{formula:draft.formula}));await load();toast('公式已确认',{variant:'success'});})}>{draft.confirmed?'已确认':'确认公式'}</button>
        <button type="button" className="idea-use" disabled={!draft.confirmed} title={draft.confirmed?'':'先确认公式'} onClick={()=>{storeHandoff({formula:draft.formula});router.push(HANDOFF_PATH);}}>带到文案</button>
      </div>
    </div>}

    <div className="bd-list-head">
      <b>拆解记录{data?`（${list.length}）`:''}</b>
      <span className="hint">{picked.length?`已选 ${picked.length} / ${MAX_PICK} 张`:`勾选 1–${MAX_PICK} 张已完成的拆解卡，可以提炼一条爆款公式`}</span>
      {picked.length>0&&<button type="button" className="bd-formula-btn" disabled={!!busy} onClick={()=>void run('formula',async()=>{
        if(!await confirm({title:'提炼爆款公式',message:'用选中的拆解卡提炼一条可复用的结构公式（一次模型调用，计费）。提炼后可以修改，确认后再带到文案。',confirmText:'提炼'}))return;
        const made=await request<SavedFormula>('/api/studio/formulas',{breakdown_ids:picked});await show(made);setPicked([]);await load();})}>
        {busy==='formula'?<Spinner size={12} className="icon-spin"/>:<Sparkles size={12}/>} 提炼爆款公式（计费）</button>}
      <button type="button" className="bd-reload" title="重新读取" aria-label="重新读取" disabled={!!busy} onClick={()=>void run('load',load)}><RefreshCw size={14}/></button>
    </div>
    {!data?<p className="hint">正在读取…</p>:!list.length?<p className="hint">还没有拆解。上传一条对标视频、贴一个链接或粘贴一段文案开始。</p>:
    <ul className="bd-list">
      {list.map(b=><li key={b.id} className={`bd-item${open===b.id?' open':''}`}>
        <div className="bd-row">
          <input type="checkbox" disabled={b.state!=='succeeded'} checked={picked.includes(b.id)} onChange={()=>toggle(b.id)} title={b.state==='succeeded'?'选来提炼公式':'完成后才能选'} aria-label="选来提炼公式"/>
          <button type="button" className="bd-title" disabled={b.state!=='succeeded'} onClick={()=>setOpen(o=>o===b.id?null:b.id)}>
            <b>{b.source.title||'未命名'}</b>
            <span className="hint">{b.source.platform}{b.source.duration?` · ${Math.round(b.source.duration)} 秒`:''}{b.card?` · ${b.card.summary}`:''}</span>
          </button>
          <span className={`review-tag review-${b.state==='succeeded'?'pass':b.state==='failed'?'block':'warn'}`}>{(b.state==='queued'||b.state==='running')&&<Spinner size={10} className="icon-spin"/>} {BREAKDOWN_STATE[b.state]}</span>
          {b.state==='failed'&&<button type="button" className="bd-row-action" disabled={!!busy} onClick={()=>void retry(b)}>重试</button>}
          {b.state!=='running'&&<button type="button" className="bd-row-action" title="删除" aria-label="删除" disabled={!!busy} onClick={()=>void remove(b)}><Trash2 size={13}/></button>}
        </div>
        {b.error&&<p className="hint review-stale">{breakdownError(b.error)}</p>}
        {open===b.id&&detail?.id===b.id&&detail.card&&<BreakdownDetail b={detail}/>}
      </li>)}
    </ul>}
    {data&&data.formulas.length>0&&<details className="topics-findings"><summary>已有公式（{data.formulas.length}）</summary>
      <ul>{data.formulas.map(f=><li key={f.id} className="bd-formula-item"><button type="button" className="link-button" onClick={()=>void show(f)}>{f.formula.name}{f.confirmed?' ✓':''}</button> · {f.breakdown_ids.length} 张卡 · {formulaSeconds(f.formula)} 秒
        <button type="button" className="bd-row-action" title="删除公式" aria-label="删除公式" disabled={!!busy} onClick={()=>void removeFormula(f)}><Trash2 size={12}/></button></li>)}</ul></details>}
  </section>;
}

function BreakdownDetail({b}:{b:Breakdown}){
  const c=b.card!;
  const bars=segmentBars(c.segments,b.source.duration);
  // Lines the source could not show are gathered into one note.
  const lines:[string,string][]=[['画面',c.visuals],['转化',c.conversion],['合规',c.compliance]];
  const missing=[...(unseen(c.hook.alignment)?['画面与文案的配合']:[]),...lines.filter(([,v])=>unseen(v)).map(([k])=>k)];
  const beats=c.rhythm.beats.map(x=>(x.t!==null?`${x.t}s `:'')+x.what);
  return <div className="bd-detail">
    <div className="bd-hook">
      <p className="idea-line"><span>开场</span>「{c.hook.opening}」</p>
      <p className="idea-line"><span>钩子</span>文案：{c.hook.copy_type} · 画面：{c.hook.visual_type} · 强度 {c.hook.strength}/10（{c.hook.reason}）</p>
      {!unseen(c.hook.alignment)&&<p className="idea-line"><span>配合</span>{c.hook.alignment}</p>}
    </div>
    {bars.length>0&&<div className="bd-timeline">{bars.map((s,i)=><div key={i} className="bd-seg" style={{left:`${s.left}%`,width:`${s.width}%`}} title={`${s.start}–${s.end} 秒 · ${s.role}：${s.summary}`}>{s.role}</div>)}</div>}
    <ol className="bd-segments">{c.segments.map((s,i)=><li key={i}><span className="review-kind">{s.start!==null?`${s.start}–${s.end}s `:''}{s.role}</span> {s.summary}</li>)}</ol>
    <p className="idea-line"><span>节奏</span>{c.rhythm.model}{beats.length?'：'+beats.join('；'):''}</p>
    {lines.filter(([,v])=>!unseen(v)).map(([k,v])=><p key={k} className="idea-line"><span>{k}</span>{v}</p>)}
    <p className="idea-line"><span>可复制</span>{c.transferable.join('；')}</p>
    <p className="idea-line"><span>不可复制</span>{c.not_transferable.join('；')}</p>
    {missing.length>0&&<p className="hint">资料里看不出：{missing.join('、')}{b.source.kind!=='upload'?'（只有文字资料；上传视频可以看到画面）':''}。</p>}
    {b.source.frames_note&&<p className="hint">{b.source.frames_note}</p>}
    {!!b.frames?.length&&<div className="bd-frames">{b.frames.map(f=><figure key={f.file}>
      <img src={`/api/studio/breakdowns/${b.id}/frames/${f.file}`} alt={`${f.t} 秒`} loading="lazy"/>
      <figcaption>{f.t} 秒 · {f.description||'（无描述）'}</figcaption></figure>)}</div>}
    {!!b.transcript?.length&&<details className="topics-findings"><summary>口播转写（{b.transcript.length} 句）</summary>
      <ul>{b.transcript.map((s,i)=><li key={i}>{s.start}–{s.end}s {s.text}</li>)}</ul></details>}
    {b.video_kept_until&&<p className="hint">原视频保留到 {b.video_kept_until.slice(0,10)}，之后只保留转写、关键帧和拆解卡。</p>}
  </div>;
}
