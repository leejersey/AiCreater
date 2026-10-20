'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {request,type Project} from '../../../lib/editor';
import {canGenerate,needsOverwriteConfirm,createButtonLabel} from '../../../lib/manuscript';
import {useLocalDraft,DraftNotice} from '../../LocalDraft';
import {ArrowLeft,Sparkles,Spinner,AlertCircle} from '../../Icons';
import {useConfirm} from '../../ConfirmContext';
import {outlinePlaceholder, isTeachingStyle, type TeachingStyle} from '../../../lib/teaching-style';

const initial = {title:'',source:'',audience:'',duration_hint:'',outline:'',teaching_style:'popular' as TeachingStyle};

export default function NewCourse(){
  const draft=useLocalDraft({kind:'course',projectId:'',sceneId:'',label:'新建课程文稿'},0,initial);const router=useRouter();
  const confirmDialog=useConfirm();
  const [busy,setBusy]=useState(false),[generating,setGenerating]=useState(false),[error,setError]=useState('');
  const blocked=busy||generating||draft.blocked;

  async function onGenerate(){
    if(!canGenerate(draft.value)||generating||draft.blocked)return;
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
      const body:{title:string;audience?:string;duration_hint?:string;outline?:string;teaching_style:TeachingStyle}={title:draft.value.title.trim(),teaching_style:style};
      const audience=draft.value.audience?.trim();if(audience)body.audience=audience;
      const duration_hint=draft.value.duration_hint?.trim();if(duration_hint)body.duration_hint=duration_hint;
      const outline=draft.value.outline?.trim();if(outline)body.outline=outline;
      const {text}=await request<{text:string}>('/api/manuscripts/generate',body);
      draft.change({source:text});
    }catch(e){setError(e instanceof Error?e.message:'生成失败，讲稿已保留，可修改提示后重试。');}
    finally{setGenerating(false);}
  }
  return <main className="new-course-container">
    <div className="studio-topbar">
      <div className="studio-title-group">
        <Link href="/courses" style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'13px',color:'var(--text-secondary)'}}>
          <ArrowLeft size={14}/> 返回我的视频
        </Link>
        <span style={{color:'var(--line-strong)'}}>|</span>
        <h1 style={{fontSize:'18px',margin:0}}>新建视频</h1>
        <span className="studio-badge">文稿草稿阶段 · 不扣费</span>
      </div>
      <div>
        <button type="button" className="primary-link" style={{background:'var(--accent)',color:'#0b0f17',fontWeight:600}} disabled={!draft.value.title.trim()||!draft.value.source.trim()||blocked} onClick={() => {
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
      const project=await request<Project>('/api/projects',{title:draft.value.title,source_text:draft.value.source,mode:'script',teaching_style:style});draft.clear();router.replace('/courses/'+project.id);}
      catch(e){setError(e instanceof Error?e.message:'创建失败，输入已保留。请先检查课程列表，不要重复提交。');setBusy(false);}
    }}>
      <fieldset disabled={blocked} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div className="new-course-studio">
          {/* 左栏：AI 灵感与参数配置 */}
          <div className="studio-config-pane">
            <h3 style={{margin:'0 0 12px',display:'flex',alignItems:'center',gap:'6px'}}>
              <Sparkles size={16} style={{color:'var(--accent)'}}/> 1. 配置教学主题
            </h3>

            <label>课程名称 *
              <input required maxLength={80} value={draft.value.title} onChange={e=>draft.change({title:e.target.value})} placeholder="例如：快速排序算法的核心原理"/>
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

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <label>目标受众（可选）
                <input maxLength={80} value={draft.value.audience??''} onChange={e=>draft.change({audience:e.target.value})} placeholder="例如：初学者 / 大学生"/>
              </label>
              <label>建议时长（可选）
                <input maxLength={40} value={draft.value.duration_hint??''} onChange={e=>draft.change({duration_hint:e.target.value})} placeholder="例如：3分钟"/>
              </label>
            </div>

            <label>核心要点（可选）
              <textarea maxLength={1000} rows={4} value={draft.value.outline??''} onChange={e=>draft.change({outline:e.target.value})} placeholder={outlinePlaceholder(isTeachingStyle(draft.value.teaching_style)?draft.value.teaching_style:'popular')}/>
            </label>

            <button type="button" style={{marginTop:'8px',width:'100%',padding:'11px',fontWeight:600}} disabled={!canGenerate(draft.value)||blocked} onClick={()=>void onGenerate()}>
              {generating ? <><Spinner size={14} className="icon-spin"/> AI 正在构思讲稿…</> : <><Sparkles size={14}/> ✨ AI 一键生成文稿</>}
            </button>
            <p className="hint" style={{margin:'4px 0 0',textAlign:'center'}}>输入标题后点击生成，或在右侧直接手动输入讲稿</p>
          </div>

          {/* 右栏：沉浸式讲稿编辑 */}
          <div className="studio-editor-pane">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h3 style={{margin:0,display:'flex',alignItems:'center',gap:'6px'}}>
                2. 教学口播文稿 *
              </h3>
              <span className="studio-badge">
                {draft.value.source.length} / 4000 字符
              </span>
            </div>

            <textarea
              required
              maxLength={4000}
              rows={18}
              style={{lineHeight:1.7,fontSize:'14px',resize:'vertical',minHeight:'360px'}}
              value={draft.value.source}
              onChange={e=>draft.change({source:e.target.value})}
              placeholder="编写讲解文稿（推荐结构：引入问题 → 核心概念与机制 → 流程与代码例子 → 总结对比）&#10;&#10;提示：点击左侧「AI 一键生成文稿」可根据标题与要点自动生成内容。"
            />

            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'10px',marginTop:'4px'}}>
              <p className="hint" style={{margin:0}}>
                确认讲稿后创建草稿免费；进入工作台后可自由生成分镜与选择配音声线。
              </p>
              <button type="submit" className="primary-link" style={{background:'var(--accent)',color:'#0b0f17',fontWeight:600,padding:'10px 20px'}} disabled={!draft.value.title.trim()||!draft.value.source.trim()||blocked}>
                {busy ? <Spinner size={14} className="icon-spin"/> : <Sparkles size={14}/>} {createButtonLabel(busy)}
              </button>
            </div>
          </div>
        </div>
      </fieldset>
    </form>
  </main>;
}
