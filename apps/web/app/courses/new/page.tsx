'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {request,type Project} from '../../../lib/editor';
import {canGenerate,needsOverwriteConfirm,createButtonLabel} from '../../../lib/manuscript';
import {useLocalDraft,DraftNotice} from '../../LocalDraft';
import {ArrowLeft,ChevronRight,Sparkles,Spinner,AlertCircle} from '../../Icons';
import {useConfirm} from '../../ConfirmContext';
import {useToast} from '../../ToastContext';
import {useAccount} from '../../AccountSession';
import {Modal} from '../../Modal';
import {ReviewReport} from '../../ReviewPanel';
import type {ReviewResult} from '../../../lib/review';
import {outlinePlaceholder, isTeachingStyle, type TeachingStyle} from '../../../lib/teaching-style';
import {parseThemes,suggestTheme,type ThemeSummary} from '../../../lib/themes';
import {ThemePicker} from '../../ThemePicker';
import {Ideation} from './Ideation';
import {ResearchModal} from './ResearchModal';
import {StoryboardEditor} from './StoryboardEditor';
import {ArticleConvertModal,CritiqueModal,PersonaModal,PublishKitModal} from './CreatorToolsModals';
import {emptyIdeation,toOrigin,toPlan} from '../../../lib/ideation';
import {replaceFirstOpening,viralStyleLabel,type ManuscriptHook} from '../../../lib/research';
import {auditManuscript,loadActivePersonaId,loadPersonas,parseMarkdownSections,saveActivePersonaId,savePersonas,type PersonaProfile} from '../../../lib/manuscript-tools';

const initial = {title:'',source:'',topic:'',notes:'',audience:'',duration_hint:'',outline:'',teaching_style:'popular' as TeachingStyle,manuscript_format:'markdown' as 'markdown'|'plain'};

/** Lightweight live stats for the manuscript editor (sections, narration code points, estimated duration). */
function inspectManuscript(source:string,format:'markdown'|'plain'){
  const totalChars=Array.from(source).length;
  if(!source.trim())return {totalChars,sections:0,narrationChars:0,estSeconds:0,warnings:[] as string[]};
  if(format==='plain'){
    const narrationChars=Array.from(source.replace(/\s+/g,'')).length;
    const estSeconds=Math.max(1,Math.round(narrationChars/5));
    const warnings=totalChars>4000?['纯文本已超过 4000 字符上限']:[];
    return {totalChars,sections:0,narrationChars:totalChars,estSeconds,warnings};
  }
  const blocks=source.split(/^##\s+/m).slice(1);
  let narrationChars=0,missingNarration=0;
  for(const block of blocks){
    const match=block.match(/^###\s*口播\s*\n([\s\S]*?)(?=^###\s+|\Z|$)/m);
    const body=match?match[1].trim():'';
    if(!body)missingNarration++;
    else narrationChars+=Array.from(body).length;
  }
  const estSeconds=narrationChars?Math.max(1,Math.round(narrationChars/5)):0;
  const warnings:string[]=[];
  if(blocks.length>20)warnings.push(`已超出 20 段上限（当前 ${blocks.length} 段）`);
  if(narrationChars>4000)warnings.push(`口播字数超出 4000 上限（当前 ${narrationChars} 字）`);
  if(blocks.length>0&&missingNarration>0)warnings.push(`有 ${missingNarration} 个段落缺少「### 口播」内容`);
  return {totalChars,sections:blocks.length,narrationChars,estSeconds,warnings};
}

function formatDuration(sec:number){
  if(sec<=0)return '0 秒';
  const m=Math.floor(sec/60),s=sec%60;
  return m>0?`${m} 分 ${s} 秒`:`${s} 秒`;
}

export default function NewCourse(){
  const draft=useLocalDraft({kind:'course',projectId:'',sceneId:'',label:'新建课程文稿'},0,initial);const router=useRouter();
  const confirmDialog=useConfirm();const toast=useToast();const userId=useAccount().user?.id;
  const [busy,setBusy]=useState(false),[generating,setGenerating]=useState(false),[error,setError]=useState('');
  const [focusPane,setFocusPane]=useState<'split'|'ideate'|'write'>('split');
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [researchOpen,setResearchOpen]=useState(false);
  const [hooksOpen,setHooksOpen]=useState(false);
  const [hooksLoading,setHooksLoading]=useState(false);
  const [hooksList,setHooksList]=useState<ManuscriptHook[]>([]);
  const [polishing,setPolishing]=useState(false);
  const [editorMode,setEditorMode]=useState<'source'|'cards'>('source');
  const [rewritingId,setRewritingId]=useState<string|null>(null);
  const [personas,setPersonas]=useState<PersonaProfile[]>([]);
  const [activePersonaId,setActivePersonaId]=useState('');
  const [personaOpen,setPersonaOpen]=useState(false);
  const [critiqueOpen,setCritiqueOpen]=useState(false);
  const [contentReview,setContentReview]=useState<ReviewResult|null>(null),[contentReviewing,setContentReviewing]=useState(false);
  const [publishOpen,setPublishOpen]=useState(false);
  const [articleOpen,setArticleOpen]=useState(false);
  useEffect(()=>{
    setPersonas(loadPersonas(userId));
    setActivePersonaId(loadActivePersonaId(userId));
  },[userId]);
  const activePersona=personas.find(p=>p.id===activePersonaId)??null;
  const personaPayload=activePersona?{name:activePersona.name,audience_call:activePersona.audience_call,tone:activePersona.tone,catchphrases:activePersona.catchphrases,banned_words:activePersona.banned_words,ending_cta:activePersona.ending_cta,sample:activePersona.sample}:undefined;
  const blocked=busy||generating||draft.blocked;
  const manuscriptFormat=draft.value.manuscript_format??'plain';
  const [themes,setThemes]=useState<ThemeSummary[]>([]);
  useEffect(()=>{let live=true;request<unknown>('/api/themes').then(v=>{if(live)setThemes(parseThemes(v));}).catch(()=>{});return()=>{live=false;};},[]);
  const style=isTeachingStyle(draft.value.teaching_style)?draft.value.teaching_style:'popular';
  // Until the person picks one, the theme follows the teaching style's suggestion.
  const suggestion=themes.length?suggestTheme(themes,style,draft.value.source):undefined;
  const suggested=suggestion?.id;
  const themeId=draft.value.theme_id&&themes.some(t=>t.id===draft.value.theme_id)?draft.value.theme_id:suggested;
  const ideation=draft.value.ideation??emptyIdeation();
  const topic=draft.value.topic??'';
  // The course name defaults to the topic until a direction (or the person) names it.
  const courseTitle=(draft.value.title||topic).trim();

  /** withPlan: follow the chosen direction's outline; otherwise the one-step generation from the topic. */
  /** A free pre-review of the manuscript against the injected research (the same rules the course gate uses). */
  async function onContentReview(){
    setContentReviewing(true);setError('');
    try{setContentReview(await request<ReviewResult>('/api/studio/review',{source_text:draft.value.source,manuscript_format:manuscriptFormat,...(draft.value.research?{research:draft.value.research}:{})}));}
    catch(e){setError(e instanceof Error?e.message:'内容审核失败，可稍后重试。');}
    finally{setContentReviewing(false);}
  }

  async function onGenerate(withPlan=false){
    const plan=withPlan?toPlan(ideation):null;
    if(!canGenerate({title:courseTitle,source:draft.value.source})||generating||draft.blocked||(withPlan&&!plan))return;
    if(needsOverwriteConfirm(draft.value.source)){
      const ok = await confirmDialog({
        title: '替换现有讲稿？',
        message: '继续生成将用 AI 生成的全新内容覆盖当前编辑框中的讲稿。',
        confirmText: '确认替换',
        cancelText: '取消',
        variant: 'warning',
      });
      if(!ok)return;
    }
    setGenerating(true);setError('');
    try{
      const style=isTeachingStyle(draft.value.teaching_style)?draft.value.teaching_style:'popular';
      const body:{title:string;audience?:string;duration_hint?:string;outline?:string;teaching_style:TeachingStyle;manuscript_format:'plain'|'markdown';plan?:unknown;research?:unknown;persona?:unknown}={title:courseTitle,teaching_style:style,manuscript_format:manuscriptFormat,...(plan?{plan}:{}),...(draft.value.research?{research:draft.value.research}:{}),...(personaPayload?{persona:personaPayload}:{})};
      const audience=draft.value.audience?.trim();if(audience)body.audience=audience;
      const duration_hint=draft.value.duration_hint?.trim();if(duration_hint)body.duration_hint=duration_hint;
      const outline=draft.value.outline?.trim();if(outline&&!plan)body.outline=outline;
      const {text}=await request<{text:string}>('/api/manuscripts/generate',body);
      draft.change({source:text,...(draft.value.title.trim()?{}:{title:courseTitle})});
      if(focusPane==='ideate')setFocusPane('split');
      toast('教学文稿已生成，可在右侧检查并微调',{variant:'success'});
    }catch(e){setError(e instanceof Error?e.message:'生成失败，讲稿已保留，可修改提示后重试。');}
    finally{setGenerating(false);}
  }

  async function onGenerateHooks(){
    if(!draft.value.source.trim()||hooksLoading||blocked)return;
    setHooksOpen(true);setHooksLoading(true);setError('');
    try{
      const res=await request<{hooks:ManuscriptHook[]}>('/api/manuscripts/hooks',{
        title:courseTitle,source_text:draft.value.source,
        ...(draft.value.research?{research:draft.value.research}:{}),
        ...(personaPayload?{persona:personaPayload}:{}),
      });
      setHooksList(Array.isArray(res.hooks)?res.hooks:[]);
    }catch(e){
      setError(e instanceof Error?e.message:'生成开场钩子失败，请重试。');
      setHooksOpen(false);
    }finally{setHooksLoading(false);}
  }

  function applyHook(hook:ManuscriptHook){
    const prev=draft.value.source;
    const next=replaceFirstOpening(prev,hook.opening,manuscriptFormat);
    draft.change({source:next});
    setHooksOpen(false);
    toast(`已替换为「${hook.label}」开场钩子`,{variant:'success',duration:6000,action:{label:'撤销',onClick:()=>draft.change({source:prev})}});
  }

  async function onPolishDeAi(instruction=''){
    if(!draft.value.source.trim()||polishing||blocked)return false;
    const prev=draft.value.source;
    setPolishing(true);setError('');
    try{
      const res=await request<{text:string}>('/api/manuscripts/polish',{
        source_text:prev,manuscript_format:manuscriptFormat,
        ...(personaPayload?{persona:personaPayload}:{}),
        ...(instruction.trim()?{instruction:instruction.trim()}:{}),
      });
      draft.change({source:res.text});
      toast(instruction.trim()?'已按审稿建议完成全局改写':'已完成口语化去 AI 味润色',{variant:'success',duration:6000,action:{label:'撤销',onClick:()=>draft.change({source:prev})}});
      return true;
    }catch(e){setError(e instanceof Error?e.message:'润色失败，原文已保留。');return false;}
    finally{setPolishing(false);}
  }

  async function onRewriteSection(sectionId:string,instruction:string){
    if(!draft.value.source.trim()||rewritingId||blocked)return false;
    const prev=draft.value.source;
    setRewritingId(sectionId);setError('');
    try{
      const res=await request<{text:string}>('/api/manuscripts/rewrite-section',{
        title:courseTitle,source_text:prev,section_id:sectionId,instruction,
        ...(draft.value.research?{research:draft.value.research}:{}),
        ...(personaPayload?{persona:personaPayload}:{}),
      });
      draft.change({source:res.text});
      toast(`已重写段落 [${sectionId}]`,{variant:'success',duration:6000,action:{label:'撤销重写',onClick:()=>draft.change({source:prev})}});
      return true;
    }catch(e){setError(e instanceof Error?e.message:'局部重写失败，原文已保留。');return false;}
    finally{setRewritingId(null);}
  }

  const parsedSections=manuscriptFormat==='markdown'?parseMarkdownSections(draft.value.source):null;
  const audit=auditManuscript(draft.value.source,manuscriptFormat);
  const auditWarnCount=audit.issues.filter(i=>i.severity==='warn').length;
  const stats=inspectManuscript(draft.value.source,manuscriptFormat);
  const studioClass=`new-course-studio${ideation.batches.length?' ideating':''}${focusPane!=='split'?` focus-${focusPane}`:''}`;
  return <main className="new-course-container">
    <div className="studio-topbar">
      <div className="studio-title-group">
        <Link href="/courses" className="studio-back-link">
          <ArrowLeft size={14}/> 我的视频
        </Link>
        <span style={{color:'var(--line-strong)'}}>/</span>
        <h1 style={{fontSize:'20px',margin:0}}>新建视频</h1>
        <span className="studio-badge">创建草稿免费 · AI 生成计费</span>
      </div>
      <div className="studio-topbar-actions">
        <div className="studio-view-switch" role="group" aria-label="布局视图">
          <button type="button" className={focusPane==='ideate'?'active':undefined} onClick={()=>setFocusPane('ideate')}>专注构思</button>
          <button type="button" className={focusPane==='split'?'active':undefined} onClick={()=>setFocusPane('split')}>双栏</button>
          <button type="button" className={focusPane==='write'?'active':undefined} onClick={()=>setFocusPane('write')}>专注文稿</button>
        </div>
        <button type="button" className="primary-link btn-accent" disabled={!courseTitle||!draft.value.source.trim()||blocked} onClick={() => {
          const form = document.getElementById('new-course-form') as HTMLFormElement | null;
          form?.requestSubmit();
        }}>
          {busy ? <Spinner size={14} className="icon-spin"/> : <Sparkles size={14}/>} {createButtonLabel(busy)}
        </button>
      </div>
    </div>

    {error && <p role="alert" className="error" style={{margin:'0 0 16px'}}><AlertCircle size={14}/> {error}</p>}
    <DraftNotice {...draft.notice} disabled={busy||generating}/>
    {draft.blocked && draft.notice.pending != null && <p className="hint" role="status">表单已暂时锁定。请先上方「恢复到表单」或「丢弃本机草稿」，再输入。</p>}

    <form id="new-course-form" onSubmit={async e=>{e.preventDefault();if(blocked)return;setBusy(true);setError('');
      try{const style=isTeachingStyle(draft.value.teaching_style)?draft.value.teaching_style:'popular';
      const origin=toOrigin(topic,draft.value.notes??'',ideation);
      const project=await request<Project>('/api/projects',{title:courseTitle,source_text:draft.value.source,mode:'script',teaching_style:style,manuscript_format:manuscriptFormat,...(themeId?{theme_id:themeId}:{}),...(origin?{origin}:{}),...(draft.value.research?{research:draft.value.research}:{})});draft.clear();router.replace('/courses/'+project.id);}
      catch(e){setError(e instanceof Error?e.message:'创建失败，输入已保留。请先检查课程列表，不要重复提交。');setBusy(false);}
    }}>
      <fieldset disabled={blocked} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div className={studioClass}>
          {/* 左栏：AI 灵感与参数配置 */}
          <div className="studio-config-pane">
            <h3 style={{margin:'0 0 4px',display:'flex',alignItems:'center',gap:'6px'}}>
              <Sparkles size={16} style={{color:'var(--accent)'}}/> 1. 构思
            </h3>

            <label>选题 *
              <input maxLength={80} value={topic} onChange={e=>draft.change({topic:e.target.value})} placeholder="例如：RAG、快速排序、为什么天空是蓝的"/>
            </label>
            <label>补充想法（可选）
              <textarea maxLength={300} rows={2} value={draft.value.notes??''} onChange={e=>draft.change({notes:e.target.value})} placeholder="讲给谁、想达到什么、想避开什么，例如：讲给做客服系统的同事，别太学术"/>
            </label>

            <div>
              <label style={{marginBottom:'6px'}}>讲解风格</label>
              <div className="style-selector-grid">
                <button type="button" className={`style-card-btn ${(!draft.value.teaching_style || draft.value.teaching_style==='popular')?'selected':''}`} onClick={()=>draft.change({teaching_style:'popular'})}>
                  <span className="style-card-title">🌟 通俗科普</span>
                  <span className="style-card-desc">比喻与生活化概念，通俗易懂</span>
                </button>
                <button type="button" className={`style-card-btn ${draft.value.teaching_style==='technical'?'selected':''}`} onClick={()=>draft.change({teaching_style:'technical'})}>
                  <span className="style-card-title">🔬 知识干货</span>
                  <span className="style-card-desc">严谨机制、技术术语与原理</span>
                </button>
              </div>
            </div>

            <button type="button" className="more-settings-trigger" disabled={blocked} onClick={()=>setSettingsOpen(true)}>
              <span>更多设置{settingsSummary(draft.value,themes.find(t=>t.id===themeId)?.name_zh)}</span>
              <ChevronRight size={15}/>
            </button>

            <button
              type="button"
              className={`more-settings-trigger research-trigger${draft.value.research?' active':''}`}
              disabled={blocked}
              onClick={()=>setResearchOpen(true)}
            >
              <span>
                {draft.value.research
                  ? `已注入爆款参考 · ${viralStyleLabel(draft.value.research.viral_style)}（${draft.value.research.facts.length} 事实 / ${draft.value.research.hooks.length} 钩子）`
                  : '热点与爆款参考 · 搜公众号 / 抖音 / 小红书 / X / 热榜'}
              </span>
              <ChevronRight size={15}/>
            </button>

            <button
              type="button"
              className={`more-settings-trigger research-trigger${activePersona?' active':''}`}
              disabled={blocked}
              onClick={()=>setPersonaOpen(true)}
            >
              <span>
                {activePersona
                  ? `博主口吻：${activePersona.name}${activePersona.audience_call?` · 称呼「${activePersona.audience_call}」`:''}`
                  : '🎭 博主口吻 / 人设档案 · 固定个人风格（可选）'}
              </span>
              <ChevronRight size={15}/>
            </button>

            <button
              type="button"
              className="more-settings-trigger"
              disabled={blocked}
              onClick={()=>setArticleOpen(true)}
            >
              <span>📄 长文 / 笔记转视频脚本 · 粘贴文章、链接或导入 .md/.txt</span>
              <ChevronRight size={15}/>
            </button>

            <Ideation state={ideation} title={courseTitle} disabled={blocked} generating={generating}
              context={{topic,notes:draft.value.notes??'',audience:draft.value.audience??'',duration_hint:draft.value.duration_hint??'',teaching_style:style,research:draft.value.research,persona:activePersona}}
              onChange={next=>draft.change({ideation:next})} onTitle={title=>draft.change({title})} onGenerate={()=>void onGenerate(true)}/>

            {!ideation.chosen&&<button type="button" className="link-skip" disabled={!courseTitle||blocked} onClick={()=>void onGenerate(false)}>
              {generating?<><Spinner size={12} className="icon-spin"/> AI 正在写文稿…</>:'跳过，直接生成文稿 →'}
            </button>}
          </div>

          {/* 右栏：沉浸式讲稿编辑 */}
          <div className="studio-editor-pane">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',flexWrap:'wrap'}}>
              <h3 style={{margin:0,display:'flex',alignItems:'center',gap:'6px'}}>
                2. 教学文稿（可编辑） *
              </h3>
              <div className="manuscript-stats">
                {manuscriptFormat==='markdown'&&stats.sections>0&&<span className={`studio-badge${stats.sections>20?' badge-warn':''}`}>{stats.sections} / 20 段</span>}
                {manuscriptFormat==='markdown'&&stats.narrationChars>0&&<span className={`studio-badge${stats.narrationChars>4000?' badge-warn':''}`}>口播 {stats.narrationChars} / 4000 字</span>}
                {stats.estSeconds>0&&<span className="studio-badge">预计约 {formatDuration(stats.estSeconds)}</span>}
                <span className="studio-badge">
                  {stats.totalChars} / {manuscriptFormat==='markdown'?24000:4000} 字符
                </span>
              </div>
            </div>
            {stats.warnings.length>0&&<p className="vw-warning manuscript-warn" role="status">{stats.warnings.join(' · ')}</p>}

            <label>课程名称 *
              <input maxLength={80} value={draft.value.title} onChange={e=>draft.change({title:e.target.value})} placeholder={topic.trim()?`默认用选题「${topic.trim()}」；选定方向后自动填入`:'选定方向后自动填入，也可以自己写'}/>
            </label>

            {draft.value.source.trim()&&<div className="manuscript-tools">
              {manuscriptFormat==='markdown'&&parsedSections&&parsedSections.length>0&&<div className="studio-view-switch" role="group" aria-label="文稿编辑视图">
                <button type="button" className={editorMode==='cards'?'active':undefined} onClick={()=>setEditorMode('cards')}>分镜卡片 ({parsedSections.length})</button>
                <button type="button" className={editorMode==='source'?'active':undefined} onClick={()=>setEditorMode('source')}>Markdown 源码</button>
              </div>}
              <button type="button" className="research-mini-btn" disabled={blocked||hooksLoading||polishing} onClick={()=>void onGenerateHooks()}>
                {hooksLoading?<><Spinner size={12} className="icon-spin"/> 生成钩子中…</>:'🪝 开场钩子 3 选 1'}
              </button>
              <button type="button" className="research-mini-btn" disabled={blocked||polishing||hooksLoading} onClick={()=>void onPolishDeAi()}>
                {polishing?<><Spinner size={12} className="icon-spin"/> 去 AI 味润色中…</>:'✨ 一键去 AI 味'}
              </button>
              <button type="button" className="research-mini-btn" disabled={blocked||contentReviewing||!draft.value.source.trim()} onClick={()=>void onContentReview()}>
                {contentReviewing?'审核中…':'🔎 内容审核（免费）'}
              </button>
              <button type="button" className={`research-mini-btn${auditWarnCount>0?' audit-btn-warn':''}`} disabled={blocked} onClick={()=>setCritiqueOpen(true)}>
                🩺 文稿体检 ({audit.score}分{auditWarnCount>0?` · ${auditWarnCount}预警`:''})
              </button>
              <button type="button" className="research-mini-btn" disabled={blocked} onClick={()=>setPublishOpen(true)}>
                📦 发布套件
              </button>
            </div>}

            {editorMode==='cards'&&manuscriptFormat==='markdown'&&parsedSections&&parsedSections.length>0?(
              <StoryboardEditor
                sections={parsedSections}
                disabled={blocked}
                rewritingId={rewritingId}
                onChangeSource={next=>draft.change({source:next})}
                onRewriteSection={(id,ins)=>void onRewriteSection(id,ins)}
              />
            ):(
              <textarea
                required
                maxLength={manuscriptFormat==='markdown'?24000:4000}
                rows={18}
                style={{lineHeight:1.7,fontSize:'14px',resize:'vertical',minHeight:'360px'}}
                value={draft.value.source}
                onChange={e=>draft.change({source:e.target.value})}
                placeholder={manuscriptFormat==='markdown'?'## [s1] 段落标题\n\n### 口播\n这里填写纯文本口播。\n\n### 画面素材\n补充命令、代码或流程标签，无额外素材填“无”。\n\n### 画面意图\n引用口播短句安排素材出现；不写秒数。':'编写纯文本口播，或在左侧构思后生成。'}
              />
            )}

            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'10px',marginTop:'4px'}}>
              <p className="hint" style={{margin:0}}>
                确认讲稿后创建草稿免费；Markdown 全文最多24000字符、20段，口播合计最多4000字符。进入工作台后整理章节、配音并由 Agent 生成画面。
              </p>
              <button type="submit" className="primary-link" style={{background:'var(--accent)',color:'#0b0f17',fontWeight:600,padding:'10px 20px'}} disabled={!courseTitle||!draft.value.source.trim()||blocked}>
                {busy ? <Spinner size={14} className="icon-spin"/> : <Sparkles size={14}/>} {createButtonLabel(busy)}
              </button>
            </div>
          </div>
        </div>
      </fieldset>
    </form>

    <Modal
      open={settingsOpen}
      onClose={()=>setSettingsOpen(false)}
      title="更多设置"
      maxWidth="680px"
      footer={<button type="button" className="btn-modal-confirm primary" onClick={()=>setSettingsOpen(false)}>完成</button>}
    >
      <fieldset disabled={blocked} className="more-settings-modal-body" style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div className="more-settings-row">
          <label>目标受众（可选）
            <input maxLength={80} value={draft.value.audience??''} onChange={e=>draft.change({audience:e.target.value})} placeholder="例如：初学者 / 大学生"/>
          </label>
          <label>建议时长（可选）
            <input maxLength={40} value={draft.value.duration_hint??''} onChange={e=>draft.change({duration_hint:e.target.value})} placeholder="例如：3分钟"/>
          </label>
        </div>
        {themes.length>0&&<div>
          <label style={{marginBottom:'6px'}}>画面主题</label>
          <ThemePicker themes={themes} value={themeId??''} suggested={suggested} onChange={id=>draft.change({theme_id:id})}/>
          {suggestion&&<p className="hint">推荐「{themes.find(t=>t.id===suggestion.id)?.name_zh}」：{suggestion.reason}{draft.value.theme_id&&draft.value.theme_id!==suggestion.id?'（你已另选）':''}。</p>}
          <p className="hint">整门课使用同一个主题，之后可在工作台更换，已确认的章节不用重新生成。</p>
        </div>}
        <label>文稿格式
          <select value={manuscriptFormat} onChange={e=>draft.change({manuscript_format:e.target.value as 'plain'|'markdown'})}>
            <option value="markdown">Markdown · AI 联合生成口播与素材</option>
            <option value="plain">纯文本 · 仅口播（兼容旧稿）</option>
          </select>
        </label>
        <label>核心要点（直接生成时使用，可选）
          <textarea maxLength={1000} rows={3} value={draft.value.outline??''} onChange={e=>draft.change({outline:e.target.value})} placeholder={outlinePlaceholder(isTeachingStyle(draft.value.teaching_style)?draft.value.teaching_style:'popular')}/>
        </label>
      </fieldset>
    </Modal>

    <ResearchModal
      open={researchOpen}
      topic={topic}
      currentBrief={draft.value.research}
      disabled={blocked}
      onClose={()=>setResearchOpen(false)}
      onApplyBrief={brief=>draft.change({research:brief})}
      onApplyPitch={(pitch,brief)=>draft.change({
        topic:pitch.title,
        title:pitch.title,
        duration_hint:pitch.duration_hint,
        teaching_style:pitch.teaching_style,
        notes:`【${pitch.platform_name}】封面大字：${pitch.cover_text}；开场可参考：「${pitch.hook}」；${pitch.notes}`.slice(0,300),
        research:brief,
      })}
      onUseTopic={nextTopic=>draft.change({topic:nextTopic})}
    />

    <Modal
      open={hooksOpen}
      onClose={()=>setHooksOpen(false)}
      title="开场钩子 3 选 1（替换第 1 段口播）"
      maxWidth="760px"
      footer={<button type="button" className="btn-modal-cancel" onClick={()=>setHooksOpen(false)}>关闭</button>}
    >
      {hooksLoading?<p className="hint"><Spinner size={15} className="icon-spin"/> 正在为当前文稿定制 3 种风格的黄金前 10 秒开场…</p>
        :<div className="hooks-grid">
          {hooksList.map(h=><div key={h.type} className="hook-card">
            <div className="research-item-meta">
              <span className="research-plat-tag">{h.label}</span>
              <span className="research-cover-badge">封面大字：{h.cover_line}</span>
            </div>
            <p className="hook-opening">「{h.opening}」</p>
            <p className="hint" style={{margin:0}}>留存原理：{h.why}</p>
            <div>
              <button type="button" className="btn-accent research-pitch-use" onClick={()=>applyHook(h)}>替换第 1 段开场</button>
            </div>
          </div>)}
        </div>}
    </Modal>

    <PersonaModal
      open={personaOpen}
      personas={personas}
      activeId={activePersonaId}
      onClose={()=>setPersonaOpen(false)}
      onSelect={id=>{setActivePersonaId(id);saveActivePersonaId(id,userId);}}
      onSaveList={next=>{setPersonas(next);savePersonas(next,userId);}}
    />

    <Modal open={!!contentReview} onClose={()=>setContentReview(null)} title="内容审核（预审）" maxWidth="760px"
      footer={<button type="button" className="btn-modal-confirm primary" onClick={()=>setContentReview(null)}>关闭</button>}>
      <p className="hint" style={{marginTop:0}}>{draft.value.research?'按已注入的爆款参考（证据包）溯源口播里的断言。创建课程后会保存证据包，配音前需要通过审核。':'当前没有注入爆款参考，带数字或「研究显示」的断言都无法溯源。'}</p>
      {contentReview&&<ReviewReport result={contentReview} evidence={contentReview.evidence??[]}/>}
    </Modal>

    <CritiqueModal
      open={critiqueOpen}
      title={courseTitle}
      source={draft.value.source}
      format={manuscriptFormat}
      sections={parsedSections}
      audit={audit}
      disabled={blocked||polishing||!!rewritingId}
      onRewriteSection={onRewriteSection}
      onGlobalFix={ins=>onPolishDeAi(ins)}
      onClose={()=>setCritiqueOpen(false)}
    />

    <PublishKitModal
      open={publishOpen}
      title={courseTitle}
      source={draft.value.source}
      onClose={()=>setPublishOpen(false)}
    />

    <ArticleConvertModal
      open={articleOpen}
      teachingStyle={style}
      manuscriptFormat={manuscriptFormat}
      persona={personaPayload}
      disabled={blocked}
      onClose={()=>setArticleOpen(false)}
      onConverted={({title:nextTitle,text})=>{
        const prevSource=draft.value.source;
        const prevTitle=draft.value.title;
        draft.change({source:text,...(nextTitle?{title:nextTitle,topic:draft.value.topic||nextTitle}:{})});
        if(focusPane==='ideate')setFocusPane('split');
        toast('长文已转换为视频分镜脚本',{variant:'success',duration:6000,action:prevSource?{label:'撤销',onClick:()=>draft.change({source:prevSource,title:prevTitle})}:undefined});
      }}
    />
  </main>;
}

/** "：受众 开发者 · 3分钟 · 蓝图" when anything is set, so folded settings stay visible. */
function settingsSummary(v:{audience?:string;duration_hint?:string},theme?:string){
  const parts=[v.audience?.trim()&&`受众 ${v.audience.trim()}`,v.duration_hint?.trim(),theme].filter(Boolean);
  return parts.length?`：${parts.join(' · ')}`:'';
}
