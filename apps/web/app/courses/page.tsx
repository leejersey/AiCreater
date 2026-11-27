'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {request,parseProjectSummaries,filterProjects,activeJobLabel,type ProjectSummary} from '../../lib/editor';
import {clearProjectDrafts} from '../../lib/drafts';
import {DraftShelf} from '../LocalDraft';
import {useRouter} from 'next/navigation';
import {useConfirm} from '../ConfirmContext';
import {useToast} from '../ToastContext';
import {courseSteps,visualFileUrl} from '../../lib/visual-workbench';
import {SAMPLE_SOURCE,SAMPLE_TITLE} from '../../lib/sample';
import {CourseSteps} from '../CourseSteps';
import {parseThemes,type ThemeSummary} from '../../lib/themes';
import {Plus, Search, RefreshCw, BookOpen, Clock, AlertCircle, Mic, CheckCircle, Spinner, ChevronRight, Trash2} from '../Icons';

/** Where a course is on the way to an exported video, for the list filters. */
function projectStage(p:ProjectSummary):'needs_voice'|'to_confirm'|'done'{
  if(!p.scene_count||p.needs_voice||p.needs_timing)return 'needs_voice';
  return (p.confirmed_count??0)>=p.scene_count?'done':'to_confirm';
}

export default function Courses(){
  const [themes,setThemes]=useState<ThemeSummary[]>([]);
  useEffect(()=>{let live=true;request<unknown>('/api/themes').then(v=>{if(live)setThemes(parseThemes(v));}).catch(()=>{});return()=>{live=false;};},[]);
  const [projects,setProjects]=useState<ProjectSummary[]>([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[deletingId,setDeletingId]=useState<string|null>(null);
  const [statusFilter,setStatusFilter]=useState<'all'|'running'|'needs_voice'|'to_confirm'|'done'>('all');
  const router=useRouter();const confirmDialog=useConfirm();const toast=useToast();
  const [creatingSample,setCreatingSample]=useState(false);
  async function createSample(){
    setCreatingSample(true);setError('');
    try{const p=await request<{id:string}>('/api/projects',{title:SAMPLE_TITLE,source_text:SAMPLE_SOURCE,mode:'script',teaching_style:'popular',manuscript_format:'markdown'});router.push('/courses/'+p.id);}
    catch(e){setError(e instanceof Error?e.message:'创建示例课失败');setCreatingSample(false);}
  }
  async function load(){setLoading(true);setError('');try{setProjects(parseProjectSummaries(await request('/api/projects')));}catch(e){setError(e instanceof Error?e.message:'读取课程失败');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  async function deleteProject(p: ProjectSummary){
    if(deletingId||loading||p.revision==null)return;
    const ok=await confirmDialog({
      title:'删除此视频？',
      message:`「${p.title}」将从列表永久移除，不可恢复。对象存储中的旧音频/渲染文件不会自动清理。`,
      detail:p.active_jobs?'当前有排队或运行中的任务，请先进课程取消后再删。':undefined,
      confirmText:'确认删除',
      cancelText:'取消',
      variant:'danger',
    });
    if(!ok)return;
    setDeletingId(p.id);setError('');
    try{
      await request('/api/projects/'+p.id+'/delete',{expected_revision:p.revision,confirmed:true});
      if(typeof window!=='undefined')clearProjectDrafts(window.localStorage,p.id);
      setProjects(prev=>prev.filter(x=>x.id!==p.id));
      toast(`已删除「${p.title}」`,{variant:'success'});
    }catch(e){setError(e instanceof Error?e.message:'删除失败');}
    finally{setDeletingId(null);}
  }

  const queryFiltered = filterProjects(projects,query);
  const visible = queryFiltered.filter(p => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'running') return Boolean(activeJobLabel(p));
    return projectStage(p) === statusFilter;
  });

  const countRunning = projects.filter(p => Boolean(activeJobLabel(p))).length;
  const count = (stage: ReturnType<typeof projectStage>) => projects.filter(p => projectStage(p) === stage).length;
  const countNeeds = count('needs_voice'), countToConfirm = count('to_confirm'), countDone = count('done');

  return <main className="courses-page">
    <div className="studio-topbar">
      <div className="studio-title-group">
        <h1 style={{fontSize:'22px',margin:0}}>我的视频</h1>
        <span className="studio-badge">共 {projects.length} 个作品</span>
      </div>
      <div>
        <Link className="primary-link btn-accent" href="/courses/new">
          <Plus size={16} /> 新建视频
        </Link>
      </div>
    </div>

    <DraftShelf busy={loading} onOpen={scope=>router.push(scope.kind==='course'?'/courses/new':'/courses/'+scope.projectId+(scope.sceneId?'?scene='+scope.sceneId:''))}/>

    <div className="list-toolbar" style={{marginTop:'20px'}}>
      <div className="course-filter-bar">
        <button type="button" className={`course-filter-pill ${statusFilter==='all'?'active':''}`} onClick={()=>setStatusFilter('all')}>
          全部 ({projects.length})
        </button>
        <button type="button" className={`course-filter-pill ${statusFilter==='running'?'active':''}`} onClick={()=>setStatusFilter('running')}>
          进行中 {countRunning > 0 ? `(${countRunning})` : ''}
        </button>
        <button type="button" className={`course-filter-pill ${statusFilter==='needs_voice'?'active':''}`} onClick={()=>setStatusFilter('needs_voice')}>
          待配音 {countNeeds > 0 ? `(${countNeeds})` : ''}
        </button>
        <button type="button" className={`course-filter-pill ${statusFilter==='to_confirm'?'active':''}`} onClick={()=>setStatusFilter('to_confirm')}>
          待生成/确认 {countToConfirm > 0 ? `(${countToConfirm})` : ''}
        </button>
        <button type="button" className={`course-filter-pill ${statusFilter==='done'?'active':''}`} onClick={()=>setStatusFilter('done')}>
          可导出 {countDone > 0 ? `(${countDone})` : ''}
        </button>
      </div>

      <div className="list-actions">
        <div className="search-input-wrapper">
          <Search size={14} className="search-input-icon" />
          <input
            type="search"
            aria-label="搜索视频标题"
            placeholder="搜索视频标题…"
            value={query}
            onChange={e=>setQuery(e.target.value)}
          />
        </div>
        <button type="button" className="btn-refresh" disabled={loading} onClick={()=>void load()}>
          <RefreshCw size={13} className={loading?'icon-spin':''} /> 刷新
        </button>
      </div>
    </div>

    {loading&&!projects.length&&<div className="course-grid" aria-label="正在读取课程" role="status">
      {[0,1,2].map(i=><article key={i} className="course-skeleton" aria-hidden="true">
        <div className="skeleton-box skeleton-thumb"/>
        <div className="skeleton-box skeleton-title"/>
        <div className="skeleton-box skeleton-meta"/>
        <div className="skeleton-box skeleton-foot"/>
      </article>)}
    </div>}
    {error&&<p role="alert"><AlertCircle size={16} /> {error} 可点击刷新重试，已有列表保留。</p>}
    {!loading&&!error&&!projects.length&&<section className="empty"><h2><BookOpen size={24} /> 还没有视频</h2>
      <ol className="empty-steps">
        <li><b>找选题</b>：在选题台填领域关键词，生成带证据的选题卡；或上传对标视频拆出结构。</li>
        <li><b>写文稿</b>：新建视频里生成或填写讲稿（可以先发散方向、排大纲），配音前做一次内容审核。</li>
        <li><b>出视频</b>：工作台里配音，Agent 逐章生成画面，确认后导出整课 MP4。</li>
      </ol>
      <div className="empty-actions">
        <Link href="/studio">去选题台</Link>
        <Link href="/courses/new"><Plus size={16} />新建视频</Link>
        <button type="button" disabled={creatingSample} onClick={()=>void createSample()}>{creatingSample?'正在创建…':'用示例文稿创建一门课（免费）'}</button>
      </div>
      <p className="hint">示例课只创建草稿和章节，不调用模型；配音和生成画面时才计费。</p></section>}
    {!loading&&projects.length>0&&!visible.length&&<p className="muted" style={{textAlign:'center',padding:'32px'}}>没有符合当前条件的视频项目。</p>}
    <div className="course-grid">{visible.map(p=>{const job=activeJobLabel(p);const theme=themes.find(t=>t.id===p.theme_id);return <article key={p.id} className="course-card">
      <Link href={'/courses/'+p.id} className="course-card-main">
        <div className="course-thumb" style={theme?{background:theme.preview.background}:undefined}>
         {p.thumbnail?<img alt="" loading="lazy" src={visualFileUrl(p.id,p.thumbnail.job_id,p.thumbnail.file)}/>
          :theme&&<span aria-hidden="true"><i style={{background:theme.preview.surface}}/><i style={{background:theme.preview.accent}}/></span>}
         {theme&&<small>{theme.name_zh}</small>}
        </div>
        <h2>{p.title}</h2>
      </Link>
      <div className="scene-meta">
        {job?<span className="status-pill running"><Spinner size={12} className="icon-spin" />{job}</span>:
         p.scene_count===0?<span className="status-pill"><AlertCircle size={12} />待整理章节</span>:
         p.needs_voice?<span className="status-pill needs_voice"><Mic size={12} />待配音</span>:
         p.needs_timing?<span className="status-pill needs_timing"><Clock size={12} />待对齐</span>:
         projectStage(p)==='done'?<span className="status-pill ready"><CheckCircle size={12} />已全部确认</span>:
         <span className="status-pill">已确认 {p.confirmed_count??0}/{p.scene_count}</span>}
        <span className="scene-type-badge" title={p.revision!=null?`版本 r${p.revision}`:undefined}><BookOpen size={12} /> {p.scene_count??'—'}章</span>
      </div>
      {!!p.scene_count&&<CourseSteps steps={courseSteps({chapters:p.scene_count,voiced:p.scene_count-(p.needs_voice??0)-(p.needs_timing??0),confirmed:p.confirmed_count??0,exported:!!p.exported})}/>}
      {p.active_job_state==='queued'&&<p className="hint">任务在排队。未启动 Worker 时会一直等待；可进课程查看进度或取消。</p>}
      <p className="hint" style={{marginTop:'8px'}}><Clock size={12} /> 最近修改：{p.updated_at?new Date(p.updated_at).toLocaleString('zh-CN'):'旧项目时间未知'}</p>
      <div className="course-card-actions">
        <Link href={'/courses/'+p.id} className="primary-link" style={{fontSize:'12.5px',padding:'6px 12px'}}>继续制作 <ChevronRight size={14} /></Link>
        <button type="button" className="course-delete-btn" disabled={loading||deletingId===p.id||p.revision==null} onClick={()=>void deleteProject(p)} aria-label={'删除 '+p.title}>
          {deletingId===p.id?<Spinner size={13} className="icon-spin"/>:<Trash2 size={13}/>} 删除
        </button>
      </div></article>;})}</div>
    <p className="hint" style={{marginTop:'24px',textAlign:'center'}}>最多读取 100 门课程 · 草稿暂存于本机浏览器</p>
  </main>;
}

