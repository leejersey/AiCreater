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
import {Modal} from '../../Modal';
import {outlinePlaceholder, isTeachingStyle, type TeachingStyle} from '../../../lib/teaching-style';
import {parseThemes,suggestTheme,type ThemeSummary} from '../../../lib/themes';
import {ThemePicker} from '../../ThemePicker';
import {Ideation} from './Ideation';
import {ResearchModal} from './ResearchModal';
import {emptyIdeation,toOrigin,toPlan} from '../../../lib/ideation';
import {viralStyleLabel} from '../../../lib/research';

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
  const confirmDialog=useConfirm();const toast=useToast();
  const [busy,setBusy]=useState(false),[generating,setGenerating]=useState(false),[error,setError]=useState('');
  const [focusPane,setFocusPane]=useState<'split'|'ideate'|'write'>('split');
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [researchOpen,setResearchOpen]=useState(false);
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
      const body:{title:string;audience?:string;duration_hint?:string;outline?:string;teaching_style:TeachingStyle;manuscript_format:'plain'|'markdown';plan?:unknown;research?:unknown}={title:courseTitle,teaching_style:style,manuscript_format:manuscriptFormat,...(plan?{plan}:{}),...(draft.value.research?{research:draft.value.research}:{})};
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
      const project=await request<Project>('/api/projects',{title:courseTitle,source_text:draft.value.source,mode:'script',teaching_style:style,manuscript_format:manuscriptFormat,...(themeId?{theme_id:themeId}:{}),...(origin?{origin}:{})});draft.clear();router.replace('/courses/'+project.id);}
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

            <Ideation state={ideation} title={courseTitle} disabled={blocked} generating={generating}
              context={{topic,notes:draft.value.notes??'',audience:draft.value.audience??'',duration_hint:draft.value.duration_hint??'',teaching_style:style,research:draft.value.research}}
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

            <textarea
              required
              maxLength={manuscriptFormat==='markdown'?24000:4000}
              rows={18}
              style={{lineHeight:1.7,fontSize:'14px',resize:'vertical',minHeight:'360px'}}
              value={draft.value.source}
              onChange={e=>draft.change({source:e.target.value})}
              placeholder={manuscriptFormat==='markdown'?'## [s1] 段落标题\n\n### 口播\n这里填写纯文本口播。\n\n### 画面素材\n补充命令、代码或流程标签，无额外素材填“无”。\n\n### 画面意图\n引用口播短句安排素材出现；不写秒数。':'编写纯文本口播，或在左侧构思后生成。'}
            />

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
      onUseTopic={nextTopic=>draft.change({topic:nextTopic})}
    />
  </main>;
}

/** "：受众 开发者 · 3分钟 · 蓝图" when anything is set, so folded settings stay visible. */
function settingsSummary(v:{audience?:string;duration_hint?:string},theme?:string){
  const parts=[v.audience?.trim()&&`受众 ${v.audience.trim()}`,v.duration_hint?.trim(),theme].filter(Boolean);
  return parts.length?`：${parts.join(' · ')}`:'';
}
