'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {request,parseProjectSummaries,filterProjects,activeJobLabel,type ProjectSummary} from '../../lib/editor';
import {clearProjectDrafts} from '../../lib/drafts';
import {DraftShelf} from '../LocalDraft';
import {useRouter} from 'next/navigation';
import {useConfirm} from '../ConfirmContext';
import {Plus, Search, RefreshCw, BookOpen, Clock, AlertCircle, Mic, CheckCircle, Spinner, ChevronRight, Trash2} from '../Icons';

export default function Courses(){
  const [projects,setProjects]=useState<ProjectSummary[]>([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[deletingId,setDeletingId]=useState<string|null>(null);
  const [statusFilter,setStatusFilter]=useState<'all'|'running'|'needs_voice'|'ready'>('all');
  const router=useRouter();const confirmDialog=useConfirm();
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
    }catch(e){setError(e instanceof Error?e.message:'删除失败');}
    finally{setDeletingId(null);}
  }

  const queryFiltered = filterProjects(projects,query);
  const visible = queryFiltered.filter(p => {
    if (statusFilter === 'running') return Boolean(activeJobLabel(p));
    if (statusFilter === 'needs_voice') return p.needs_voice || p.scene_count === 0;
    if (statusFilter === 'ready') return p.scene_count > 0 && !p.needs_voice && !p.needs_timing && !activeJobLabel(p);
    return true;
  });

  const countRunning = projects.filter(p => Boolean(activeJobLabel(p))).length;
  const countNeeds = projects.filter(p => p.needs_voice || p.scene_count === 0).length;

  return <main className="courses-page">
    <div className="studio-topbar">
      <div className="studio-title-group">
        <b className="brand">AI CREATER</b>
        <h1 style={{fontSize:'20px',margin:0}}>我的视频</h1>
        <span className="studio-badge">共 {projects.length} 个作品</span>
      </div>
      <div>
        <Link className="primary-link" style={{background:'var(--accent)',color:'#0b0f17',fontWeight:600}} href="/courses/new">
          <Plus size={16} /> 新建视频
        </Link>
      </div>
    </div>

    <DraftShelf busy={loading} onOpen={scope=>router.push(scope.kind==='course'?'/courses/new':'/courses/'+scope.projectId+(scope.sceneId?'?scene='+scope.sceneId:''))}/>

    <div className="list-toolbar" style={{marginTop:'16px'}}>
      <div className="course-filter-bar" style={{margin:0}}>
        <button type="button" className={`course-filter-pill ${statusFilter==='all'?'active':''}`} onClick={()=>setStatusFilter('all')}>
          全部 ({projects.length})
        </button>
        <button type="button" className={`course-filter-pill ${statusFilter==='running'?'active':''}`} onClick={()=>setStatusFilter('running')}>
          进行中 {countRunning > 0 ? `(${countRunning})` : ''}
        </button>
        <button type="button" className={`course-filter-pill ${statusFilter==='needs_voice'?'active':''}`} onClick={()=>setStatusFilter('needs_voice')}>
          待分镜/配音 {countNeeds > 0 ? `(${countNeeds})` : ''}
        </button>
        <button type="button" className={`course-filter-pill ${statusFilter==='ready'?'active':''}`} onClick={()=>setStatusFilter('ready')}>
          已就绪
        </button>
      </div>

      <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
        <label style={{margin:0}}><Search size={14} /> 搜索视频<input type="search" placeholder="输入视频标题…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <button disabled={loading} onClick={()=>void load()}><RefreshCw size={14} className={loading?'icon-spin':''} /> 刷新</button>
      </div>
    </div>

    {loading&&<p role="status"><Spinner size={16} className="icon-spin" /> 正在读取课程…</p>}
    {error&&<p role="alert"><AlertCircle size={16} /> {error} 可点击刷新重试，已有列表保留。</p>}
    {!loading&&!error&&!projects.length&&<section className="empty"><h2><BookOpen size={24} /> 还没有视频</h2><p>点击上方“新建视频”开启你的第一个作品。</p><Link href="/courses/new"><Plus size={16} />创建第一堂课</Link></section>}
    {!loading&&projects.length>0&&!visible.length&&<p className="muted" style={{textAlign:'center',padding:'32px'}}>没有符合当前条件的视频项目。</p>}
    <div className="course-grid">{visible.map(p=>{const job=activeJobLabel(p);return <article key={p.id} style={{display:'flex',flexDirection:'column'}}><h2>{p.title}</h2>
      <div className="scene-meta">
        {job?<span className="status-pill running"><Spinner size={12} className="icon-spin" />{job}</span>:
         p.scene_count===0?<span className="status-pill"><AlertCircle size={12} />待分镜</span>:
         p.needs_voice?<span className="status-pill needs_voice"><Mic size={12} />待配音</span>:
         p.needs_timing?<span className="status-pill needs_timing"><Clock size={12} />待对齐</span>:
         p.scene_count?<span className="status-pill ready"><CheckCircle size={12} />就绪</span>:<span className="status-pill">待检查</span>}
        <span className="scene-type-badge"><BookOpen size={12} /> {p.scene_count??'—'}章</span>
        <span className="scene-type-badge">r{p.revision??'—'}</span>
      </div>
      {p.active_job_state==='queued'&&<p className="hint">任务在排队。未启动 workflow 消费者时会一直等待；可进课程查看「持久任务」或取消。</p>}
      <p className="hint" style={{marginTop:'8px'}}><Clock size={12} /> 最近修改：{p.updated_at?new Date(p.updated_at).toLocaleString('zh-CN'):'旧项目时间未知'}</p>
      <div style={{display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap',marginTop:'auto',paddingTop:'12px'}}>
        <Link href={'/courses/'+p.id} className="primary-link" style={{fontSize:'12.5px',padding:'6px 12px'}}>继续制作 <ChevronRight size={14} /></Link>
        <button type="button" style={{fontSize:'12px',padding:'6px 10px'}} disabled={loading||deletingId===p.id||p.revision==null} onClick={()=>void deleteProject(p)} aria-label={'删除 '+p.title}>
          {deletingId===p.id?<Spinner size={13} className="icon-spin"/>:<Trash2 size={13}/>} 删除
        </button>
      </div></article>;})}</div>
    <p className="hint" style={{marginTop:'24px',textAlign:'center'}}>最多读取 100 门课程 · 草稿暂存于本机浏览器</p>
  </main>;
}

