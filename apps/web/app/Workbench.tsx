'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Player, type PlayerRef} from '@remotion/player';
import {Video} from '../../../packages/video-components/src/Video';
import {API, Job, Project, SceneRow, readyVideo, previewVideo, draftPreviewVideo, sceneStartFrame, request, estimateDuration, reviewKey, canRetime, canPreview, retryMessage, jobScene, cancellationPending, filterJobs, type JobFilter, jobResultNotice, selectedSceneId, sceneTitle, filterProjects, parseProjectSummaries, parseJobs, parseSceneJob, type ProjectSummary} from '../lib/editor';
import {SceneEditor, PreviewSteps} from './SceneEditor';
import {TeachingImagePlan} from './TeachingImagePlan';
import {ChartEditor} from './ChartEditor';
import {VersionHistory, parseCreatedVersion} from './VersionHistory';
import {CandidateList} from './CandidateReview';
import {CourseOverview, SavedManuscript} from './CourseOverview';
import {SceneManagement} from './SceneManagement';
import {ConsumerStatus} from './ConsumerStatus';
import {VoiceSettings} from './VoiceSettings';
import {VisualStyleSettings} from './VisualStyleSettings';
import {TeachingStyleSettings} from './TeachingStyleSettings';
import {UsageRecords} from './UsageRecords';
import {confirmEstimate} from '../lib/cost-estimates';
import {currentVoiceJob, exportIssues} from '../lib/course';
import {DraftNotice, DraftShelf, useLocalDraft} from './LocalDraft';
import {THEMES} from '../../../packages/video-components/src/theme';
import {
  Sparkles, Film, RefreshCw, Eye, Mic, Zap, ChevronUp, ChevronDown,
  ArrowLeft, Settings, CheckCircle, Clock, Spinner, AlertCircle, Layers,
  SceneTypeIcon, FileText, BarChart
} from './Icons';
import {useConfirm} from './ConfirmContext';

const labels: Record<string, string> = {ready: '就绪', needs_voice: '待配音', needs_timing: '待对齐', queued: '排队', running: '处理中', succeeded: '完成', failed: '失败', cancelled: '取消', generate:'教学分镜', regenerate:'候选分镜', voice:'配音', timing:'本地对齐', render:'整课渲染'};

type CenterTab = 'overview' | 'settings' | 'manuscript' | 'history' | 'usage' | 'jobs';

export default function Workbench({routeProjectId}:{routeProjectId?:string}) {
  const router=useRouter();
  const confirmDialog=useConfirm();
  const [activeTab, setActiveTab] = useState<CenterTab>('overview');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectQuery,setProjectQuery]=useState('');
  const visibleProjects=filterProjects(projects,projectQuery);
  const [projectsLoading,setProjectsLoading]=useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [selected, setSelected] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobFilter,setJobFilter]=useState<JobFilter>('all');
  const visibleJobs=filterJobs(jobs,jobFilter);
  const courseDraft=useLocalDraft({kind:'course',projectId:'',sceneId:'',label:'新建课程文稿'},0,{title:'',source:''});
  const {title,source}=courseDraft.value;
  const [dirty, setDirty] = useState(false);
  const [chartEditing,setChartEditing]=useState(false);
  const [addingScene, setAddingScene] = useState(false);
  const [voiceEditing, setVoiceEditing] = useState(false);
  const [styleEditing,setStyleEditing]=useState(false);
  const [teachingStyleEditing,setTeachingStyleEditing]=useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pollError,setPollError]=useState('');
  const [reviews, setReviews] = useState<Set<string>>(new Set());
  const [batchNotice, setBatchNotice] = useState('');
  const [estimating, setEstimating] = useState(false);
  const session = useRef(0);
  const dirtyRef = useRef(false);
  function setEditorDirty(value: boolean) {
    dirtyRef.current = value; setDirty(value); if(!value){setChartEditing(false);setAddingScene(false);setVoiceEditing(false);setStyleEditing(false);}
    if (value && row) setReviews(old => { const next = new Set(old); next.delete(reviewKey(row)); return next; });
  }
  const row = project?.scenes.find(s => s.id === selected);
  const voiceJob = row ? currentVoiceJob(row,jobs) : undefined;
  const duration = project ? estimateDuration(project) : null;
  const video = useMemo(() => project ? readyVideo(project) : null, [project]);
  const formalPreview = useMemo(() => project ? previewVideo(project, selected) : null, [project, selected]);
  const draftPreview = useMemo(() => project&&!formalPreview ? draftPreviewVideo(project, selected) : null, [project, selected, formalPreview]);
  const preview = formalPreview??draftPreview;
  const player = useRef<PlayerRef>(null);
  const previewFrame = preview && row ? draftPreview?18:sceneStartFrame(preview, row.scene.id) : null;
  const wholeCourse = video !== null;
  const blockers = useMemo(() => project ? exportIssues(project, dirty) : [], [project, dirty]);
  const audioUrls = useMemo(() => Object.fromEntries((preview?.assets ?? []).map(a => [a.id, API + '/api/projects/' + project!.id + '/assets/' + a.id])), [preview, project]);
  useEffect(() => {
    if (previewFrame === null) return;
    player.current?.pause();
    player.current?.seekTo(previewFrame);
  }, [project?.id, selected, previewFrame, wholeCourse]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error&&e.name==='TimeoutError'?'读取超时，请手动重试读取；已提交的操作不会自动重发。':e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  }
  function applySavedProject(data:Project) {
    setEditorDirty(false);setProject(data);setSelected(current=>selectedSceneId(data,current));
  }
  function showProject(data:Project,sceneId?:string) {
    if(sceneId&&!data.scenes.some(s=>s.id===sceneId))throw new Error('目标章节已移除或不属于此项目；本机草稿仍可在上方复制，不会套用到其他章节。');
    if(data.id!==project?.id)setJobFilter('all');
    setEditorDirty(false); setReviews(new Set()); setBatchNotice(''); setProject(data); setSelected(current=>selectedSceneId(data,sceneId??(data.id===project?.id?current:''))); setJobs([]);
  }
  async function open(id: string, sceneId?: string) {
    if (dirtyRef.current) {
      const ok = await confirmDialog({
        title: '放弃未保存修改？',
        message: '当前项目有未保存的编辑内容，重新载入将丢失这些修改。',
        confirmText: '放弃并载入',
        cancelText: '留在当前项目',
        variant: 'warning',
      });
      if (!ok) return;
    }
    const generation = ++session.current;
    const data = await request<Project>('/api/projects/' + id);
    if (generation !== session.current) return;
    showProject(data,sceneId);
  }
  async function paid(message: string, path: string, body?: unknown) {
    if (dirtyRef.current) throw new Error('请先保存当前编辑，再提交任务。');
    const generation=session.current;setEstimating(true);
    try {
      return await confirmEstimate(message,API+path,body,()=>generation===session.current&&!dirtyRef.current,{
        confirm: async fullText => {
          const parts = fullText.split('\n\n');
          const title = parts[0] || message;
          const detail = parts.slice(1).join('\n\n');
          return await confirmDialog({
            title: '确认提交任务与预估费用',
            message: title,
            detail,
            confirmText: '确认提交执行',
            cancelText: '取消',
            variant: 'info',
          });
        }
      });
    }
    finally {setEstimating(false);}
  }
  useEffect(()=>()=>{session.current++;},[]);
  useEffect(()=>{
    if(!routeProjectId)return;
    void act(()=>open(routeProjectId,new URLSearchParams(window.location.search).get('scene')||undefined));
  },[routeProjectId]);
  useEffect(()=>{
    if(!routeProjectId||!selected)return;
    const url=new URL(window.location.href);url.searchParams.set('scene',selected);
    window.history.replaceState(window.history.state,'',url);
  },[routeProjectId,selected]);
  useEffect(()=>{
    if(!dirty||!routeProjectId)return;
    const leaving=(event:MouseEvent)=>{
      const anchor=event.target instanceof Element?(event.target.closest('a[href]') as HTMLAnchorElement | null):null;
      if(anchor&&anchor.href&&!anchor.target){
        event.preventDefault();
        event.stopImmediatePropagation();
        const href=anchor.href;
        void (async()=>{
          const ok = await confirmDialog({
            title: '离开页面确认',
            message: '离开前请保存或复制当前修改；本机草稿不会自动保存到服务器。确定离开？',
            confirmText: '确定离开',
            variant: 'warning'
          });
          if(ok) window.location.href = href;
        })();
      }
    };
    document.addEventListener('click',leaving,true);return()=>document.removeEventListener('click',leaving,true);
  },[dirty,routeProjectId,confirmDialog]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if(routeProjectId){setProjectsLoading(false);return;}
    let active=true;
    request<unknown>('/api/projects').then(data=>{if(active)setProjects(parseProjectSummaries(data));})
      .catch(()=>{if(active)setError('无法读取项目列表。请检查本地API/数据库，再点击“刷新项目列表”重试。');})
      .finally(()=>{if(active)setProjectsLoading(false);});
    return ()=>{active=false;};
  }, [routeProjectId]);
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let controller:AbortController|undefined;
    async function poll() {
      const active=new AbortController();controller=active;
      const deadline=setTimeout(()=>active.abort(),5000);
      try {
        const data = await request<unknown>('/api/projects/' + project!.id + '/jobs',undefined,'GET',active.signal);
        if (cancelled) return;
        setJobs(parseJobs(data,project!.id));
        if (!dirty && !busy) {
          const updated = await request<Project>('/api/projects/' + project!.id,undefined,'GET',active.signal);
          if (!cancelled && !dirtyRef.current) { setProject(updated); setSelected(current => selectedSceneId(updated,current)); }
        }
        if(!cancelled)setPollError('');
      } catch { if (!cancelled) setPollError('任务查询失败或超时；列表可能不是最新状态，请检查本地API/数据库。当前输入未清除。'); }
      finally {
        clearTimeout(deadline);
        if(!cancelled)timer=setTimeout(poll,2000);
      }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); controller?.abort(); };
  }, [project?.id, dirty, busy]);
  async function selectScene(id: string) {
    if (id === selected) {
      if (previewFrame !== null) { player.current?.pause(); player.current?.seekTo(previewFrame); }
      return;
    }
    if (dirty) {
      const ok = await confirmDialog({
        title: '放弃未保存修改？',
        message: '当前场景有未保存的编辑内容，切换章节将丢失这些修改。',
        confirmText: '放弃并切换',
        cancelText: '留在本章',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setEditorDirty(false); setSelected(id);
  }
  function reviewScene(scene: SceneRow, checked: boolean) {
    setReviews(old => { const next = new Set(old); if (checked) next.add(reviewKey(scene)); else next.delete(reviewKey(scene)); return next; });
  }
  async function reorder(index: number, delta: number) {
    if (!project || dirty) throw new Error('请先保存编辑再重排。');
    const ids = project.scenes.map(s => s.id); [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    applySavedProject(await request<Project>('/api/projects/' + project.id + '/scenes/reorder', {expected_revision: project.revision, scene_ids: ids}));
  }
  const activeJobs = jobs.filter(j => ['queued', 'running'].includes(j.state));
  const failedJobs = jobs.filter(j => j.state === 'failed');

  return <main>
    <div className="studio-topbar">
      <div className="studio-title-group">
        <Link href="/" title="返回首页" style={{textDecoration:'none',display:'inline-flex',alignItems:'center'}}>
          <b className="brand">AI CREATER</b>
        </Link>
        {routeProjectId ? <>
          <Link href="/courses" style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'13px',color:'var(--text-secondary)'}}>
            <ArrowLeft size={13}/> 我的视频
          </Link>
          <span style={{color:'var(--line-strong)'}}>|</span>
        </> : null}
        <h1>{project?.title ?? (routeProjectId ? '教学视频工作台' : '本地教学视频工作台')}</h1>
        {project && <span className="studio-badge">r{project.revision}</span>}
        {project && (
          dirty
            ? <span className="studio-status-tag unsaved"><AlertCircle size={12}/> 未保存修改</span>
            : <span className="studio-status-tag"><CheckCircle size={12}/> 已保存</span>
        )}
        {estimating && <span className="studio-badge"><Spinner size={11} className="icon-spin"/> 正在估价...</span>}
      </div>

      {project && <div className="studio-actions">
        <label style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'12.5px',color:'var(--text-secondary)',margin:0}}>
          主题
          <select aria-label="视频主题" disabled={busy||dirty} value={project.config.theme} onChange={e=>{const theme=e.target.value;void act(async()=>{applySavedProject(await request<Project>('/api/projects/'+project.id+'/theme',{expected_revision:project.revision,theme},'PATCH'));});}}>
            {Object.entries(THEMES).map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <button disabled={busy} onClick={() => void act(() => open(project.id))} title="从服务器重新载入最新数据">
          <RefreshCw size={13}/> 刷新
        </button>
        {!project.scenes.length && <button disabled={busy} onClick={() => void act(async () => { if (await paid('生成教学分镜','/api/projects/'+project.id+'/estimate',{operation:'generate',expected_revision:project.revision,scenes:[]})) {
          const job=parseJobs([await request<unknown>('/api/projects/'+project.id+'/generate',{expected_revision:project.revision})],project.id)[0];
          if(job.kind!=='generate'||job.scene_id!=null||job.base_revision!==project.revision||job.scope!==undefined||job.preview_scene_id!==undefined)throw new Error('生成任务响应与当前项目/版本不符，请核对持久任务，不要重复提交。');
          setJobs(current=>[job,...current.filter(j=>j.job_id!==job.job_id)]);
        } })}><Sparkles size={13}/> 生成分镜</button>}
        <button className="primary-link" style={{background:'var(--accent)',color:'#0b0f17',fontWeight:600}} disabled={busy || dirty || !video || blockers.length > 0} onClick={() => void act(async () => {
          if (blockers.length) throw new Error('请先处理导出前检查中的问题。');
          const version=parseCreatedVersion(await request<unknown>('/api/projects/'+project.id+'/versions',{expected_revision:project.revision}),project.id,project.revision);
          const job=parseJobs([await request<unknown>('/api/projects/'+project.id+'/render',{version_id:version.id})],project.id)[0];
          if(job.kind!=='render'||job.scope!==undefined||job.scene_id!=null||job.preview_scene_id!==undefined||job.base_revision!==version.revision)
            throw new Error('导出任务响应与冻结版本不符，列表未更新；请核对持久任务，不要重复提交。');
          setJobs(current=>[job,...current.filter(j=>j.job_id!==job.job_id)]);
        })}><Film size={13}/> 导出视频</button>
      </div>}
    </div>

    <div className="studio-notice-bar">
      <p>
        <span style={{color:'var(--accent)'}}>ℹ️</span> 提示：代码展示不执行；教学事实、变量快照及口播同步请在右侧检查核对。
      </p>
      {routeProjectId ? <details style={{display:'inline-block'}}><summary style={{fontSize:'12px',cursor:'pointer'}}><Settings size={12}/> 高级调度</summary><ConsumerStatus/></details> : null}
    </div>

    {error && <div role="alert" className="error">{error}</div>}
    {pollError && <div role="alert" className="error">{pollError}</div>}

    <DraftShelf busy={busy} onOpen={async scope=>{
      if(routeProjectId){
        if(dirty){
          const ok = await confirmDialog({
            title: '打开草稿确认',
            message: '离开前请保存或复制当前修改，确定打开草稿？',
            confirmText: '确定打开',
            variant: 'warning'
          });
          if(!ok)return;
        }
        router.push(scope.kind==='course'?'/courses/new':'/courses/'+scope.projectId+(scope.sceneId?'?scene='+scope.sceneId:''));return;
      }
      if(scope.kind==='course'){
        const form=document.getElementById('new-course');if(form instanceof HTMLDetailsElement){form.open=true;form.scrollIntoView({block:'nearest'});}
      }else void act(()=>open(scope.projectId,scope.sceneId||undefined));
    }}/>

    <div className="workspace">
      <aside>
        {!routeProjectId && <>
          <h2>项目列表</h2>
          <button type="button" disabled={busy||projectsLoading} onClick={()=>void act(async()=>setProjects(parseProjectSummaries(await request<unknown>('/api/projects'))))}><RefreshCw size={12} className={projectsLoading?'icon-spin':''}/> {projectsLoading?'读取项目列表…':'刷新项目列表'}</button>
          <label>查找项目<input type="search" aria-label="按标题查找项目" value={projectQuery} onChange={e=>setProjectQuery(e.target.value)}/></label>
          {visibleProjects.map(p => <button className={p.id === project?.id ? 'active' : ''} disabled={busy} key={p.id} onClick={() => void act(() => open(p.id))}>{p.title}</button>)}
          <details id="new-course" open={!project}><summary><Sparkles size={14}/> 新建教学文稿</summary>
          <DraftNotice {...courseDraft.notice} disabled={busy||dirty}/>
          <form onSubmit={e => { e.preventDefault();if(courseDraft.blocked||busy||projectsLoading)return;void act(async () => {
            if (dirty) {
              const ok = await confirmDialog({
                title: '放弃未保存修改？',
                message: '放弃当前未保存的修改并新建项目？',
                confirmText: '放弃并新建',
                cancelText: '取消',
                variant: 'warning',
              });
              if (!ok) return;
            }
            const p = await request<Project>('/api/projects', {title, source_text: source, mode: 'script', manuscript_format:courseDraft.value.manuscript_format??'plain', teaching_style:courseDraft.value.teaching_style??'popular'});
            courseDraft.clear();setProjects(current=>[{id:p.id,title:p.title},...current.filter(item=>item.id!==p.id)]);
            session.current++;showProject(p);
          }); }}>
            <fieldset disabled={busy||courseDraft.blocked||projectsLoading} style={{border:0,padding:0,margin:0,minWidth:0}}>
            <label>课程标题<input required maxLength={80} value={title} onChange={e => courseDraft.change({title:e.target.value})}/></label>
            <label>文稿格式<select value={courseDraft.value.manuscript_format??'plain'} onChange={e=>courseDraft.change({manuscript_format:e.target.value as 'plain'|'markdown'})}><option value="plain">纯文本口播</option><option value="markdown">Markdown · 口播与素材</option></select></label>
            <p className="hint">切换格式不转换内容；Markdown 请保留 AI 生成的段落 ID 与三类标题，只有口播参与配音。</p>
            <label>中文口播文稿<textarea aria-label="中文口播文稿" required maxLength={courseDraft.value.manuscript_format==='markdown'?24000:4000} rows={7} value={source} onChange={e => courseDraft.change({source:e.target.value})} placeholder="概念或问题 → 定义或原理 → 例子与过程 → 总结"/></label>
            <button disabled={busy || courseDraft.blocked || !source.trim()} type="submit"><Sparkles size={14}/> 创建草稿（不计费）</button>
            </fieldset>
          </form></details>
        </>}
        {routeProjectId && !project && <p role="status">{busy?'正在读取课程…':'无法打开课程，请检查登录或返回列表。'}</p>}
        {project && <>
          <h2><Layers size={16}/> 章节大纲 ({project.scenes.length})</h2>
          <SceneManagement key={project.id + ':' + selected + ':' + session.current} project={project} row={row} jobs={jobs} dirty={dirty} busy={busy} formEditing={addingScene}
            onDirty={value => {setAddingScene(value); setEditorDirty(value);}} act={act}
            onCreate={async (narration_text, content, elements) => {
              const data = await request<Project>('/api/projects/' + project.id + '/scenes' + (elements?'/concept':''), {expected_revision: project.revision, narration_text, ...(elements?{elements}:{content})});
              setEditorDirty(false); setProject(data); setSelected(data.scenes[data.scenes.length - 1].id);
            }}
            onDuplicate={() => void act(async () => {
              if (!row || dirty) throw new Error('请先保存修改并选择场景。');
              const index = project.scenes.findIndex(s => s.id === row.id);
              const data = await request<Project>('/api/projects/' + project.id + '/scenes/' + row.id + '/duplicate', {expected_revision: project.revision, expected_scene_revision: row.revision});
              setEditorDirty(false); setProject(data); setSelected(data.scenes[index + 1].id);
            })}
            onDelete={() => void act(async () => {
              if (!row || dirty) throw new Error('请先保存修改并选择场景。');
              const index = project.scenes.findIndex(s => s.id === row.id);
              const ok = await confirmDialog({
                title: `移除第${index + 1}章场景？`,
                message: `从当前稿移除第${index + 1}章 r${row.revision}（${row.scene.type}）？旧版本、任务和媒体保留，但没有一键撤销。不会自动配音。`,
                confirmText: '确认移除',
                cancelText: '取消',
                variant: 'danger',
              });
              if (!ok) return;
              const data = await request<Project>('/api/projects/' + project.id + '/scenes/' + row.id + '/delete', {expected_revision: project.revision, expected_scene_revision: row.revision, confirmed: true});
              setEditorDirty(false); setProject(data); setSelected(data.scenes[Math.min(index, data.scenes.length - 1)].id);
            })}/>
          {project.scenes.map((s, i) => <div className="scene-item" key={s.id}>
            <button disabled={busy} className={selected === s.id ? 'active' : ''} aria-current={selected===s.id?'true':undefined} onClick={() => selectScene(s.id)}>
              <div style={{display:'flex',alignItems:'center',gap:'6px',width:'100%',justifyContent:'space-between'}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontWeight:600}}>
                  <SceneTypeIcon type={s.scene.type} size={13}/>
                  {i + 1}. {sceneTitle(s.scene)}
                </span>
                <span className={`status-pill ${s.state}`}>
                  {s.state==='ready'&&<CheckCircle size={10}/>}
                  {s.state==='needs_voice'&&<Mic size={10}/>}
                  {s.state==='needs_timing'&&<Clock size={10}/>}
                  {s.state==='running'&&<Spinner size={10} className="icon-spin"/>}
                  {labels[s.state] ?? s.state}
                </span>
              </div>
              <div className="scene-meta">
                <span className="scene-type-badge">{s.scene.type}</span>
                <small>r{s.revision}</small>
              </div>
            </button>
            <div className="move"><button aria-label={'上移场景' + (i + 1)} disabled={busy || dirty || i === 0} onClick={() => void act(() => reorder(i, -1))}><ChevronUp size={13}/></button><button aria-label={'下移场景' + (i + 1)} disabled={busy || dirty || i === project.scenes.length - 1} onClick={() => void act(() => reorder(i, 1))}><ChevronDown size={13}/></button></div>
          </div>)}
        </>}
      </aside>

      <section className="center">
        <div className="preview">
          {preview ? <Player key={project!.id + ':' + (draftPreview?'draft:':'') + (wholeCourse ? 'course' : selected)} ref={player} component={Video} inputProps={{project: preview, audioUrls,visualStyleSnapshot:project?.visual_style,draftPreview:!!draftPreview,seriesTitle:project?.title}} durationInFrames={preview.scenes.reduce((n, s) => n + s.duration_frames, 0)} fps={30} compositionWidth={1920} compositionHeight={1080} style={{width: '100%'}} controls numberOfSharedAudioTags={draftPreview?0:undefined} errorFallback={({error}) => <p role="alert">预览失败：{error.message}</p>}/> : <div className="empty"><b>{project ? '先生成分镜，查看画面草稿' : '把知识变成可视化讲解'}</b><p>{project ? '生成或手工添加并保存场景后，可免费预览静音画面；正式导出仍需配音与对齐。' : '创建文稿 → 生成分镜 → 编辑确认 → 配音 → 预览导出'}</p>{row?.scene.code && <pre>{row.scene.code.source}</pre>}{row&&!preview&&<div className="draft-preview"><p>内容草稿（非视频／动画预览）</p>{row.scene.elements.map(e=><p key={e.id}>{e.content}</p>)}</div>}</div>}
        </div>
        {preview && <p className="hint" role="status" style={{marginTop:'-8px'}}>{draftPreview ? '静音画面草稿 · 临时时序，非真实配音对齐，不能导出；仅展示当前章已保存分镜，未保存修改不进入预览。' : wholeCourse ? '整课网页预览 · 选择章节会暂停并定位到该章起点，不自动播放。' : `仅预览当前第${project!.scenes.findIndex(s => s.id === selected) + 1}章 · 其他章节未就绪，不能整课导出。`}</p>}

        {activeJobs.length > 0 && <div className="studio-task-dock">
          <div className="studio-task-dock-info">
            <Spinner size={14} className="icon-spin" />
            <span>当前有 <b>{activeJobs.length}</b> 个任务正在后台处理中...</span>
          </div>
          <button type="button" className="studio-task-dock-action" onClick={() => setActiveTab('jobs')}>
            查看任务进度 →
          </button>
        </div>}

        <div className="studio-tabs-bar">
          <button type="button" className={`studio-tab-btn ${activeTab==='overview'?'active':''}`} onClick={()=>setActiveTab('overview')}>
            <Layers size={14}/> 章节概览与批量
          </button>
          <button type="button" className={`studio-tab-btn ${activeTab==='settings'?'active':''}`} onClick={()=>setActiveTab('settings')}>
            <Settings size={14}/> 课程设置
          </button>
          <button type="button" className={`studio-tab-btn ${activeTab==='manuscript'?'active':''}`} onClick={()=>setActiveTab('manuscript')}>
            <FileText size={14}/> 原始讲稿
          </button>
          <button type="button" className={`studio-tab-btn ${activeTab==='history'?'active':''}`} onClick={()=>setActiveTab('history')}>
            <Film size={14}/> 版本历史
          </button>
          <button type="button" className={`studio-tab-btn ${activeTab==='usage'?'active':''}`} onClick={()=>setActiveTab('usage')}>
            <BarChart size={14}/> Token消耗
          </button>
          <button type="button" className={`studio-tab-btn ${activeTab==='jobs'?'active':''}`} onClick={()=>setActiveTab('jobs')}>
            <Clock size={14}/> 持久任务
            {activeJobs.length > 0 ? <span className="tab-badge active-pulse">{activeJobs.length}</span> : failedJobs.length > 0 ? <span className="tab-badge danger">{failedJobs.length}</span> : null}
          </button>
        </div>

        <div className="studio-tab-content">
          {activeTab === 'overview' && (
            project && duration ? <>
              <p className="hint">{duration.exact ? `实际时长：${duration.min.toFixed(1)} 秒` : `中文粗估：${Math.ceil(duration.min)}–${Math.ceil(duration.max)} 秒（实际以配音为准；英文/代码混合偏差更大）`} · 基于已保存版本{duration.max > 300 && <strong className="unsaved"> · 可能超过5分钟，请检查；不自动截断</strong>}</p>
              <CourseOverview key={project.id + ':' + session.current} project={project} jobs={jobs} reviews={reviews} dirty={dirty} busy={busy}
                onSelect={selectScene} onReview={reviewScene} onTiming={scenes => void act(async () => {
                  if (dirty || !scenes.length || scenes.length > 20 || !scenes.every(s => reviews.has(s.scene_id + ':' + s.expected_revision))) throw new Error('请先保存并核对所选待对齐章节。');
                  const generation = session.current;
                  const ok = await confirmDialog({
                    title: `批量本地对齐（${scenes.length}章）？`,
                    message: `为所选 ${scenes.length} 章登记或复用本地对齐任务？将替换字幕与入场时间，保留音频，不调用模型/配音。匹配任务复用，失败不自动重试；消费者未启动则继续排队。`,
                    confirmText: '确认登记',
                    cancelText: '取消',
                    variant: 'info',
                  });
                  if (!ok) return;
                  try {
                    const response = await request<unknown>('/api/projects/' + project.id + '/timing', {expected_revision: project.revision, confirmed: true, scenes});
                    if (generation !== session.current) return;
                    const submitted=parseJobs(response,project.id);
                    setJobs(old => [...submitted, ...old.filter(j => !submitted.some(s => s.job_id === j.job_id))]);
                    setBatchNotice(`已登记或复用 ${submitted.length} 章本地对齐任务；尚不代表完成，请查看持久任务，不会自动重试。`);
                  } catch (error) {
                    if (generation === session.current) {
                      if (error instanceof Error && error.cause === 404) throw new Error('当前API尚未启用批量本地对齐；选择已保留，不会逐章兜底提交。');
                      throw error;
                    }
                  }
                })} onSubmit={scenes => void act(async () => {
                  if (!scenes.length || !scenes.every(s => reviews.has(s.scene_id + ':' + s.expected_revision))) throw new Error('请先核对所选场景。');
                  if (!await paid(`为所选 ${scenes.length} 章批量配音；已有任务复用，不自动重试。`,'/api/projects/'+project.id+'/estimate',{operation:'batch_voice',expected_revision:project.revision,scenes})) return;
                  const submitted = parseJobs(await request<unknown>('/api/projects/' + project.id + '/voice', {expected_revision: project.revision, confirmed: true, scenes}),project.id);
                  setJobs(old => [...submitted, ...old.filter(j => !submitted.some(s => s.job_id === j.job_id))]);
                  setBatchNotice(`已登记或复用 ${submitted.length} 章配音任务；进度与失败原因见下方，不会自动重试。`);
                })}/>
              {batchNotice && <p role="status">{batchNotice}</p>}
            </> : <p className="muted">当前无章节或正在读取课程概要...</p>
          )}

          {activeTab === 'settings' && (
            project ? <>
              <VoiceSettings key={'voice:'+project.id+':'+selected+':'+session.current} project={project} dirty={dirty} busy={busy} formEditing={voiceEditing}
                onDirty={value=>{setVoiceEditing(value);setEditorDirty(value);}} act={act} onSave={async speaker=>{
                  const data=await request<Project>('/api/projects/'+project.id+'/voice',{expected_revision:project.revision,speaker},'PATCH');
                  setEditorDirty(false);setReviews(new Set());setProject(data);
                }}/>
              <hr style={{border:'0',borderTop:'1px solid var(--line)',margin:'20px 0'}}/>
              <VisualStyleSettings key={'style:'+project.id+':'+session.current} project={project} dirty={dirty} busy={busy} formEditing={styleEditing}
                onDirty={value=>{setStyleEditing(value);setEditorDirty(value);}} act={act} onSave={async visual_style=>{
                  const generation=session.current;
                  try{
                    const data=await request<Project>('/api/projects/'+project.id+'/visual-style',{expected_revision:project.revision,visual_style},'PATCH');
                    if(generation!==session.current)return false;
                    setEditorDirty(false);setProject(data);return true;
                  }catch(error){
                    if(generation!==session.current)return false;
                    if(error instanceof Error&&error.cause===404)throw new Error('本地API尚未启用视觉风格保存；输入已保留，不会回退或派任务。');
                    throw error;
                  }
                }}/>
              <hr style={{border:'0',borderTop:'1px solid var(--line)',margin:'20px 0'}}/>
              <TeachingStyleSettings key={'teaching-style:'+project.id+':'+session.current} project={project} dirty={dirty} busy={busy} formEditing={teachingStyleEditing}
                onDirty={value=>{setTeachingStyleEditing(value);setEditorDirty(value);}} act={act} onSave={async teaching_style=>{
                  const data=await request<Project>('/api/projects/'+project.id+'/teaching-style',{expected_revision:project.revision,teaching_style},'PATCH');
                  setEditorDirty(false);setProject(data);
                }}/>
            </> : null
          )}

          {activeTab === 'manuscript' && (
            project ? <SavedManuscript key={'manuscript:'+project.id} project={project}/> : null
          )}

          {activeTab === 'history' && (
            project ? <VersionHistory key={project.id} projectId={project.id}/> : null
          )}

          {activeTab === 'usage' && (
            project ? <UsageRecords key={'usage:'+project.id} projectId={project.id}/> : null
          )}

          {activeTab === 'jobs' && (
            <>
              <p className="hint">分镜/配音提交前显示公开参考估价，不是供应商账单或硬扣费上限；本地渲染与缓存音频对齐不新增模型/配音调用费，不含机器成本。关闭页面不会取消任务，显式重试可能再计费。</p>
              <div className="toolbar">
                <label>任务筛选<select aria-label="任务筛选" value={jobFilter} onChange={e=>setJobFilter(e.target.value as JobFilter)}><option value="all">全部</option><option value="active">进行中</option><option value="failed">失败</option></select></label>
                <p className="hint" role="status">当前已加载 {jobs.length} 项，显示 {visibleJobs.length} 项；仅筛选本列表，不代表全部历史任务。</p>
              </div>
              {!visibleJobs.length && <p className="muted">{jobs.length?'暂无符合筛选的任务':'暂无任务'}</p>}
              {visibleJobs.map(j => {const target=jobScene(project,j),cancelling=cancellationPending(j),resultNotice=jobResultNotice(j);return <div className="job" key={j.job_id}>
                <div><strong>{j.scope === 'scene' ? '单场景预览' : labels[j.kind]??j.kind}</strong> <span>{labels[j.state] ?? j.state} · {j.progress}%</span>{j.voice_current===false&&<p className="hint">历史音色任务 · 不会覆盖当前音轨；请勿按新音色重试旧任务。</p>}{j.error && <p className="error-text">{j.error.message}</p>}</div>
                {resultNotice&&<p className="hint" role="status">{resultNotice}</p>}
                {cancelling&&<p className="hint" role="status">已请求取消，等待执行器确认；任务尚未停止，已发出的供应商调用可能仍计费。</p>}
                <div className="actions">
                  {target&&<button type="button" disabled={busy||dirty} onClick={()=>{if(busy||dirty)return;selectScene(target.id);document.querySelector('.editor')?.scrollIntoView({block:'start'});}}>定位任务章节</button>}
                  {['queued', 'running'].includes(j.state) && <button type="button" disabled={busy||cancelling} onClick={() => void act(async () => {
                    const updated=parseJobs([await request<unknown>('/api/jobs/'+j.job_id+'/cancel',{})],project!.id)[0];
                    if(updated.job_id!==j.job_id)throw new Error('取消响应不属于当前任务，状态未更新；请重新读取，不要重复提交。');
                    setJobs(current=>current.map(job=>job.job_id===updated.job_id?updated:job));
                  })}>{cancelling?'等待取消确认':'取消'}</button>}
                  {j.state === 'failed' && j.error?.retryable && <button disabled={busy || j.voice_current===false || (!!j.scene_id && !project?.scenes.some(s => s.id === j.scene_id)) || (['voice', 'timing'].includes(j.kind) && !project?.scenes.some(s => s.id === j.scene_id && s.revision === j.base_revision && reviews.has(reviewKey(s)) && !dirty))} onClick={() => void act(async () => {
                    const confirmed = ['generate','regenerate','voice'].includes(j.kind)
                      ? await paid(retryMessage(j.kind),'/api/jobs/'+j.job_id+'/estimate')
                      : await confirmDialog({
                          title: '重试任务？',
                          message: retryMessage(j.kind),
                          confirmText: '确认重试',
                          cancelText: '取消',
                          variant: 'warning',
                        });
                    if (confirmed) {
                      const updated=parseJobs([await request<unknown>('/api/jobs/'+j.job_id+'/retry',{})],project!.id)[0];
                      if(updated.job_id!==j.job_id)throw new Error('重试响应不属于当前任务，状态未更新；请重新读取，不要重复提交。');
                      setJobs(current=>current.map(job=>job.job_id===updated.job_id?updated:job));
                    }
                  })}>重试</button>}
                  {j.kind === 'render' && j.state === 'succeeded' && <><a href={API + '/api/jobs/' + j.job_id + '/files/mp4'}>下载MP4</a><a href={API + '/api/jobs/' + j.job_id + '/files/srt'}>下载字幕</a></>}
                </div>
              </div>;})}
            </>
          )}
        </div>
      </section>

      <section className="editor">
        <h2>{row ? `场景内容 · ${sceneTitle(row.scene)}` : '教学内容'}</h2>
        {row&&project&&<TeachingImagePlan entry={project.config.image_plans?.[row.scene.id]}/>}
        {row&&<PreviewSteps row={row} video={preview} draftPreview={!!draftPreview} busy={busy} dirty={dirty} onSeek={frame=>{player.current?.pause();player.current?.seekTo(frame);}}/>}
        {row && project ? <>{row.scene.type!=='data_chart'&&<SceneEditor key={row.id + ':' + row.revision + ':' + session.current} projectId={project.id} row={row} disabled={busy||chartEditing||addingScene||voiceEditing||styleEditing||teachingStyleEditing} onDirty={setEditorDirty} save={async changes => {
          applySavedProject(await request<Project>('/api/scenes/' + row.id, {expected_revision: row.revision, changes}, 'PATCH'));
        }} act={act}/>}
        <ChartEditor key={'chart:'+row.id+':'+row.revision+':'+session.current} projectId={project.id} row={row} disabled={busy||(dirty&&!chartEditing)} onDirty={v=>{setChartEditing(v);setEditorDirty(v);}} save={async body=>{
          applySavedProject(await request<Project>('/api/scenes/'+row.id+'/chart',{...body,expected_revision:row.revision},'PATCH'));
        }} act={act}/></> : <p className="muted">创建项目并选择场景。支持概念解释、卡片、流程、对比、数据图表，以及代码讲解、数组/对象/栈状态图与执行/等待时间线。</p>}
        {row && <label className="check" style={{marginTop:'12px'}}><input type="checkbox" disabled={busy || dirty} checked={reviews.has(reviewKey(row))} onChange={e => reviewScene(row, e.target.checked)}/>已核对当前 r{row.revision} 的口播、技术事实、示例状态与步骤触发位置（刷新需重确认）</label>}
        {row && <div className="toolbar">
          <button disabled={busy || dirty || !canPreview(row)} onClick={() => void act(async () => {
            const job=parseSceneJob(await request<unknown>('/api/scenes/'+row.id+'/preview',{expected_revision:row.revision}),project!.id,row,'render');
            setJobs(current=>[job,...current.filter(j=>j.job_id!==job.job_id)]);
          })}><Eye size={14}/> 预览本场景</button>
          <button disabled={busy || dirty || !reviews.has(reviewKey(row)) || !!voiceJob} onClick={() => void act(async () => { if (!reviews.has(reviewKey(row))) throw new Error('请先核对当前场景分镜。'); if(voiceJob)throw new Error('本版配音已有任务，请查看持久任务；失败任务需显式重试。'); if (await paid('为这个场景配音','/api/projects/'+project!.id+'/estimate',{operation:'voice',expected_revision:project!.revision,scenes:[{scene_id:row.id,expected_revision:row.revision}]})) {
            const job=parseSceneJob(await request<unknown>('/api/scenes/'+row.id+'/voice',{expected_revision:row.revision}),project!.id,row,'voice');
            setJobs(current=>[job,...current.filter(j=>j.job_id!==job.job_id)]);
          }})}><Mic size={14}/> 配音</button>
          {voiceJob&&<p className="hint" role="status">已加载的本版配音任务：{labels[voiceJob.state]??voiceJob.state}。请查看持久任务；失败任务需显式重试，不会自动再次配音。</p>}
          <button disabled={busy || dirty || !reviews.has(reviewKey(row)) || !canRetime(row)} onClick={() => void act(async () => {
            if (!reviews.has(reviewKey(row))) throw new Error('请先核对当前场景分镜。');
            const ok = await confirmDialog({
              title: '重算本章时间轴？',
              message: '重新计算会替换当前动画和字幕时间，保留原音频，不调用配音服务。',
              confirmText: '确认重算',
              cancelText: '取消',
              variant: 'info',
            });
            if (ok) {
              const job=parseSceneJob(await request<unknown>('/api/scenes/'+row.id+'/timing',{expected_revision:row.revision}),project!.id,row,'timing');
              setJobs(current=>[job,...current.filter(j=>j.job_id!==job.job_id)]);
            }
          })}><Zap size={14}/> 重算时间轴</button>
          <button disabled={busy || dirty || row.scene.type==='data_chart'} onClick={() => void act(async () => { if (await paid('生成独立候选分镜','/api/projects/'+project!.id+'/estimate',{operation:'regenerate',expected_revision:project!.revision,scenes:[{scene_id:row.id,expected_revision:row.revision}]})) {
            const job=parseSceneJob(await request<unknown>('/api/scenes/'+row.id+'/regenerate',{expected_revision:row.revision}),project!.id,row,'regenerate');
            setJobs(current=>[job,...current.filter(j=>j.job_id!==job.job_id)]);
          }})}><Sparkles size={14}/> 重生成候选</button>
        </div>}
        {row&&project&&<CandidateList key={project.id+':'+row.id+':'+row.revision+':'+session.current} row={row} busy={busy} dirty={dirty} refreshToken={jobs.map(j=>j.job_id+':'+j.state).join(',')} onAccept={c => void act(async () => {
          const ok = await confirmDialog({
            title: '接受候选分镜？',
            message: '接受候选会修改当前场景；请先检查教学事实与代码。',
            confirmText: '确认接受',
            cancelText: '取消',
            variant: 'warning',
          });
          if (!ok) return;
          applySavedProject(await request<Project>('/api/scenes/' + row!.id + '/candidates/' + c.id + '/accept', {expected_revision: row!.revision}));
        })}/>}
      </section>
    </div>
  </main>;
}

