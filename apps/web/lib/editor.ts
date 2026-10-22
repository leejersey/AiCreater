import type {Scene, VideoProject} from '../../../packages/video-schema/src/types';
import type {TeachingStyle} from './teaching-style';
import type {RawCues} from './drafts';
import type {VisualStyleSnapshot} from '../../../packages/video-components/src/theme';
import {AUTH_REQUIRED} from './accounts';
import {conceptLabels} from '../../../packages/video-schema/src/concept';
import {visualActionErrors, type DraftVisualAction} from '../../../packages/video-schema/src/visual-actions';
import {diagramErrors} from '../../../packages/video-schema/src/diagrams';

export type DraftScene = Pick<Scene, 'id' | 'type' | 'elements' | 'code' | 'edges' | 'structure' | 'timeline' | 'chart' | 'motif' | 'dialogue' | 'process' | 'funnel' | 'images'> & {
  visual_actions?: DraftVisualAction[];
  narration: {text: string; audio_asset_id?: string}; duration_frames?: number;
};
export type SceneRow = {id: string; revision: number; state: string; scene: DraftScene};
export type TeachingImagePlanEntry = {status:'planned'|'needs_review';scene_fingerprint:string;plan:{needed:boolean;reason:string;
  requirements:{id:string;element_id:string;purpose:'object'|'metaphor'|'comparison'|'spatial';description:string;composition:string;alt:string;quote:string}[]}};
export type Project = {id: string; title: string; revision: number; source_text: string;
  config: Omit<VideoProject, 'scenes'> & {visual_style?:VisualStyleSnapshot; teaching_style?:TeachingStyle; manuscript?:{markdown:string};image_plans?:Record<string,TeachingImagePlanEntry>}; scenes: SceneRow[];
  visual_style?:VisualStyleSnapshot;
  voice?: {resource_id: string; speaker: string}; voice_configured?: boolean;
  teaching_style?: TeachingStyle};
export type ProjectSummary = Pick<Project,'id'|'title'> & {revision?:number;updated_at?:string|null;scene_count?:number;needs_voice?:number;needs_timing?:number;active_jobs?:boolean;
  active_job_kind?:string|null;active_job_state?:string|null};
const JOB_KIND_LABELS: Record<string, string> = {generate:'教学分镜',regenerate:'候选分镜',voice:'配音',timing:'本地对齐',render:'整课渲染'};
const JOB_STATE_LABELS: Record<string, string> = {queued:'排队中',running:'执行中'};
export function activeJobLabel(summary: Pick<ProjectSummary,'active_jobs'|'active_job_kind'|'active_job_state'>): string | null {
  if(!summary.active_jobs)return null;
  const kind=summary.active_job_kind?JOB_KIND_LABELS[summary.active_job_kind]??summary.active_job_kind:null;
  const state=summary.active_job_state?JOB_STATE_LABELS[summary.active_job_state]??summary.active_job_state:null;
  if(kind&&state)return `${kind} · ${state}`;
  if(kind||state)return kind??state;
  return '任务处理中';
}
export function parseProjectSummaries(value:unknown):ProjectSummary[] {
  if(!Array.isArray(value))throw new Error('项目列表格式错误，已有列表未更新；请重试读取。');
  const ids=new Set<string>();
  for(const item of value){
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||!item.id.trim()||ids.has(item.id)||typeof item.title!=='string'||!item.title.trim())
      throw new Error('项目列表格式错误，已有列表未更新；请重试读取。');
    if(['revision','scene_count','needs_voice','needs_timing'].some(key=>item[key]!==undefined&&(!Number.isSafeInteger(item[key])||item[key]<(key==='revision'?1:0)))||
      (item.active_jobs!==undefined&&typeof item.active_jobs!=='boolean')||
      (item.active_job_kind!=null&&(typeof item.active_job_kind!=='string'||!item.active_job_kind.trim()))||
      (item.active_job_state!=null&&(typeof item.active_job_state!=='string'||!['queued','running'].includes(item.active_job_state)))||
      (item.updated_at!=null&&(typeof item.updated_at!=='string'||!Number.isFinite(Date.parse(item.updated_at)))))throw new Error('项目进度格式错误，请重新读取。');
    ids.add(item.id);
  }
  return value as ProjectSummary[];
}
export function filterProjects(projects:ProjectSummary[],query:string):ProjectSummary[] {
  const text=query.trim().toLowerCase();
  return projects.filter(project=>project.title.toLowerCase().includes(text));
}
export type Job = {job_id: string; project_id?: string; kind: string; voice_current?: boolean | null; cancel_requested?: boolean; state: string; progress: number; scope?: 'scene'; preview_scene_id?: string; scene_id?: string | null; base_revision?: number | null;
  error?: {message: string; retryable: boolean} | null; result?: {candidate_id?: string; attached?: boolean} | null};
export function parseJobs(value:unknown,projectId:string):Job[] {
  const invalid=()=>new Error('任务响应格式错误，已有状态未更新；请重新读取任务，不要重复提交。');
  if(!Array.isArray(value))throw invalid();
  const ids=new Set<string>();
  for(const item of value){
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.job_id!=='string'||!/^[A-Za-z0-9_-]+$/.test(item.job_id)||ids.has(item.job_id)||item.project_id!==projectId||
      !['generate','regenerate','voice','timing','render'].includes(item.kind)||!['queued','running','succeeded','failed','cancelled'].includes(item.state)||
      typeof item.progress!=='number'||!Number.isFinite(item.progress)||item.progress<0||item.progress>100||
      (item.cancel_requested!==undefined&&typeof item.cancel_requested!=='boolean')||
      (item.voice_current!=null&&typeof item.voice_current!=='boolean')||
      (item.scene_id!=null&&(typeof item.scene_id!=='string'||!item.scene_id.trim()))||
      (item.preview_scene_id!==undefined&&(typeof item.preview_scene_id!=='string'||!item.preview_scene_id.trim()))||
      (item.scope!==undefined&&item.scope!=='scene')||
      (item.base_revision!=null&&(!Number.isSafeInteger(item.base_revision)||item.base_revision<1))||
      (item.error!=null&&(typeof item.error!=='object'||Array.isArray(item.error)||typeof item.error.message!=='string'||typeof item.error.retryable!=='boolean'))||
      (item.result!=null&&(typeof item.result!=='object'||Array.isArray(item.result)||(item.result.attached!==undefined&&typeof item.result.attached!=='boolean')||(item.result.candidate_id!==undefined&&typeof item.result.candidate_id!=='string'))))throw invalid();
    ids.add(item.job_id);
  }
  return value as Job[];
}
export function parseSceneJob(value:unknown,projectId:string,row:SceneRow,kind:'render'|'timing'|'voice'|'regenerate'):Job {
  const job=parseJobs([value],projectId)[0];
  if(job.base_revision!==row.revision||job.kind!==kind||(kind==='render'?(job.scope!=='scene'||job.preview_scene_id!==row.id):(job.scene_id!==row.id||job.scope!==undefined||job.preview_scene_id!==undefined)))
    throw new Error('任务响应与当前章节/版本不符，列表未更新；请核对任务，不要重复提交。');
  return job;
}
export type JobFilter = 'all' | 'active' | 'failed';
export function filterJobs(jobs:Job[],filter:JobFilter):Job[] {
  return jobs.filter(job=>filter==='all'||(filter==='active'?['queued','running'].includes(job.state):job.state==='failed'));
}
export const API = ''; // Same-origin cookies also cover media and download requests.

export function jobResultNotice(job:Job):string|null {
  if(job.state!=='succeeded')return null;
  if(job.kind==='regenerate'&&typeof job.result?.candidate_id==='string'&&job.result.candidate_id.trim())
    return '此任务生成的是独立候选；是否已接受请查看对应章节候选列表。';
  if(!['generate','voice','timing'].includes(job.kind))return null;
  if(job.result?.attached===false)return '任务已完成，但发布时未应用到当前稿；不会自动覆盖或重试。';
  if(job.result?.attached===true)return '结果在发布时已应用；不代表当前稿仍与该结果一致。';
  return null;
}

export function cancellationPending(job:Job):boolean {
  return job.state==='running'&&job.cancel_requested===true;
}

export function sceneTitle(scene:DraftScene):string {
  return [scene.elements.find(e=>e.role==='topic')?.content,scene.chart?.title,scene.elements[0]?.content,scene.type]
    .find(value=>typeof value==='string'&&value.trim())??'未命名章节';
}

export function selectedSceneId(project:Project,preferred:string):string {
  return project.scenes.some(scene=>scene.id===preferred)?preferred:project.scenes[0]?.id??'';
}

export function jobScene(project: Project|null, job: Job): SceneRow|null {
  if(!project||(job.project_id&&job.project_id!==project.id))return null;
  const id=job.kind==='render'&&job.scope==='scene'?job.preview_scene_id:
    ['regenerate','voice','timing'].includes(job.kind)?job.scene_id:null;
  return project.scenes.find(scene=>scene.id===id)??null;
}

export function canRetime(row: SceneRow): boolean {
  return !row.scene.images?.length && ['ready', 'needs_timing'].includes(row.state) && !!row.scene.narration.audio_asset_id;
}
export function canPreview(row: SceneRow): boolean {
  return row.state === 'ready' && !!row.scene.duration_frames && !!row.scene.narration.audio_asset_id;
}
export function retryMessage(kind: string): string {
  if (kind === 'render') return '本地重试渲染，不调用模型或配音服务。继续？';
  return kind === 'timing' ? '本地重试使用保存的音频，不调用配音服务。继续？' : '显式重试可能再次产生费用，继续？';
}

export function videoDocument(project:Project):VideoProject{
  const {visual_style:_,teaching_style:_teachingStyle,manuscript:_manuscript,image_plans:_imagePlans,...config}=project.config;
  return {...config,scenes:project.scenes.map(s=>s.scene as Scene)};
}
export function readyVideo(project: Project): VideoProject | null {
  if (!project.scenes.length || project.scenes.some(s => s.state !== 'ready' || !s.scene.duration_frames)) return null;
  return videoDocument(project);
}

export function previewVideo(project: Project, sceneId: string): VideoProject | null {
  return readyVideo(project) ?? readyVideo({...project, scenes: project.scenes.filter(s => s.id === sceneId)});
}

// View-only projection: empty audio references and temporary timing are never saved or exported.
export function draftPreviewVideo(project:Project,sceneId:string):VideoProject|null {
  const row=project.scenes.find(s=>s.id===sceneId);
  if(!row||!['needs_voice','needs_timing'].includes(row.state))return null;
  const text=row.scene.narration.text,length=Array.from(text).length;
  if(!text.trim()||!row.scene.elements.length||row.scene.elements.some(e=>!e.cue||
    !Number.isSafeInteger(e.cue.text_start)||!Number.isSafeInteger(e.cue.text_end)||
    e.cue.text_start<0||e.cue.text_end<=e.cue.text_start||e.cue.text_end>length))return null;
  if(visualActionErrors(row.scene,false).length||diagramErrors(row.scene).length)return null;
  const ordered=[...row.scene.elements].sort((a,b)=>a.cue.text_start-b.cue.text_start);
  const duration=Math.max(90,Math.min(900,12+Math.ceil(length*30/4))),origin=ordered[0].cue.text_start;
  let previous=-6;
  const animations=ordered.map(e=>{
    const start=Math.max(previous+12,6+Math.floor((e.cue.text_start-origin)/Math.max(1,length-origin)*(duration-30)));
    previous=start;
    return {target:e.id,effect:'fade_slide' as const,start_frame:start,duration_frames:12};
  });
  const starts=new Map(animations.map(a=>[a.target,a.start_frame]));
  let previousAction=6;
  const actions=row.scene.visual_actions?.map(a=>{
    const start=Math.max(previousAction,starts.get(a.target)??6,a.to?starts.get(a.to)??6:6,
      6+Math.floor(Math.max(0,a.cue.text_start-origin)/Math.max(1,length-origin)*(duration-30)));
    previousAction=start;
    return {...a,start_frame:start,duration_frames:12};
  });
  const {visual_style:_,teaching_style:_teachingStyle,manuscript:_manuscript,image_plans:_imagePlans,...config}=project.config;
  return {...config,assets:[],scenes:[{...row.scene,
    visual_actions:actions,
    narration:{text,audio_asset_id:'',audio_start_frame:6},
    duration_frames:Math.max(duration,previous+30,previousAction+18),animations,captions:[]}]};
}

export function sceneStartFrame(video: VideoProject, sceneId: string): number | null {
  let frame = 0;
  for (const scene of video.scenes) {
    if (scene.id === sceneId) return frame;
    frame += scene.duration_frames;
  }
  return null;
}

export function stepStartFrame(video: VideoProject, sceneId: string, elementId: string): number | null {
  const start = sceneStartFrame(video, sceneId), scene = video.scenes.find(s => s.id === sceneId);
  const animation = scene?.animations?.find(a => a.target === elementId);
  if (start === null || !scene || !animation || !scene.elements.some(e => e.id === elementId) ||
    !Number.isSafeInteger(animation.start_frame) || animation.start_frame < 0 || animation.start_frame >= scene.duration_frames) return null;
  return start + animation.start_frame;
}

export function parseSteps(text: string): Scene['elements'] {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('步骤JSON格式错误，未保存。'); }
  if (!Array.isArray(value) || !value.length || value.length > 6) throw new Error('步骤必须是1–6项JSON数组。');
  // Server schema remains authoritative for cues, IDs, code lines and teaching state.
  return value as Scene['elements'];
}

export function reviewKey(row: SceneRow): string { return row.id + ':' + row.revision; }

export function estimateDuration(project: Project): {min: number; max: number; exact: boolean} {
  const count = (text: string) => Array.from(text).filter(c => !/\s/u.test(c)).length;
  const scenes = project.scenes;
  if (!scenes.length) { const n = count(project.source_text); return {min:n / 5, max:n * .3, exact:false}; }
  let frames = 0, characters = 0, pending = 0;
  for (const row of scenes) {
    if (row.state === 'ready' && row.scene.duration_frames) frames += row.scene.duration_frames;
    else { characters += count(row.scene.narration.text); pending++; }
  }
  return {min:frames / 30 + characters / 5 + pending * .4, max:frames / 30 + characters * .3 + pending * .4, exact:pending === 0};
}

export function formSteps(text: string): Scene['elements'] {
  const steps = parseSteps(text);
  for (const e of steps) {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || typeof e.content !== 'string' ||
      !e.cue || !Number.isInteger(e.cue.text_start) || !Number.isInteger(e.cue.text_end) ||
      (e.output !== undefined && typeof e.output !== 'string') ||
      (e.input !== undefined && typeof e.input !== 'string') ||
      (e.loop !== undefined && e.loop!==null && (!e.loop || !Number.isInteger(e.loop.current) || !Number.isInteger(e.loop.total))) ||
      (e.array_items !== undefined && (!Array.isArray(e.array_items) || e.array_items.length>6 || e.array_items.some(v=>!v||typeof v.id!=='string'||typeof v.key!=='string'||typeof v.value!=='string'))) ||
      (e.pointers !== undefined && (!Array.isArray(e.pointers) || e.pointers.length>2 || e.pointers.some(v=>!v||typeof v.name!=='string'||typeof v.item_id!=='string'))) ||
      (e.concept_role !== undefined && (typeof e.concept_role!=='string'||!Object.hasOwn(conceptLabels,e.concept_role))) ||
      (e.icon !== undefined && !['document','search','idea','code','check','warning'].includes(e.icon)) ||
      (e.step !== undefined && (!Number.isInteger(e.step) || e.step<1 || e.step>9)) ||
      (e.source_label !== undefined && (typeof e.source_label!=='string' || !e.source_label.trim() || [...e.source_label].length>12)) ||
      (e.panel_style !== undefined && e.panel_style!=='conclusion') ||
      (e.highlight !== undefined && (!e.highlight || !Number.isInteger(e.highlight.text_start) || !Number.isInteger(e.highlight.text_end) || e.highlight.text_start<0 || e.highlight.text_end<1)) ||
      (e.code_lines !== undefined && (!Array.isArray(e.code_lines) || e.code_lines.some(n => !Number.isInteger(n) || n < 1 || n > 16) || new Set(e.code_lines).size !== e.code_lines.length)) ||
      (e.variables !== undefined && (!Array.isArray(e.variables) || e.variables.length > 3 || e.variables.some(v => !v || typeof v.name !== 'string' || typeof v.value !== 'string')))) {
      throw new Error('步骤字段类型或数量不适合表单，请在高级JSON中修正；原输入未清除。');
    }
  }
  return steps;
}

export function updateStep(text: string, index: number, changes: Partial<Pick<Scene['elements'][number], 'content' | 'code_lines' | 'variables' | 'output' | 'icon' | 'step' | 'highlight' | 'source_label' | 'panel_style' | 'array_items' | 'pointers' | 'loop' | 'input' | 'concept_role'>>): string {
  const steps = formSteps(text);
  if (!Number.isInteger(index) || !steps[index] || Object.keys(changes).some(k => !['content','code_lines','variables','output','icon','step','highlight','source_label','panel_style','array_items','pointers','loop','input','concept_role'].includes(k))) throw new Error('无效的步骤表单修改。');
  const next = JSON.stringify(steps.map((e, i) => i === index ? {...e, ...changes} : e), null, 2);
  formSteps(next);
  return next;
}

export function codeStateFields(text:string): Pick<Scene['elements'][number],'array_items'|'pointers'|'loop'|'input'> {
  const value=JSON.parse(text);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==4||!['array_items','pointers','loop','input'].every(k=>Object.hasOwn(value,k)))throw new Error('请完整保留四个快照字段。');
  return value;
}

export function toggleCodeStateSteps(text:string,enabled:boolean):string {
  return JSON.stringify(formSteps(text).map(e=>{
    if(enabled)return {...e,array_items:e.array_items??[],pointers:e.pointers??[],loop:e.loop??null,input:e.input??''};
    const {array_items,pointers,loop,input,...old}=e;return old;
  }),null,2);
}

export function formEdgeError(elements: DraftScene['elements'], edges: NonNullable<Scene['edges']>): string {
  if (edges.some(e => !elements.some(v => v.id === e.from) || !elements.some(v => v.id === e.to))) return '请选择现有来源和目标节点。';
  if (edges.some(e => e.from === e.to)) return '连线不能指向自身。';
  return '';
}

export function cuePreview(text: string, cue: Scene['elements'][number]['cue']): string {
  const points=Array.from(text),{text_start:start,text_end:end}=cue;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<0 || start>=end || end>points.length)
    throw new Error('触发范围须为0起Unicode码点整数，起点小于终点且不越过口播。');
  const selected=points.slice(start,end).join('');
  if (!selected.trim()) throw new Error('触发范围不能只包含空白。');
  return selected;
}

export function manualConceptElements(narration: string, steps: Pick<Scene['elements'][number],'content'|'concept_role'>[]): Scene['elements'] {
  const elements=steps.map((step,i)=>{
    if(typeof step.content!=='string'||!step.content.trim()||[...step.content].length>40)throw new Error('概念摘录须为1–40码点的非空原文。');
    const start=narration.indexOf(step.content);
    if(start<0||narration.indexOf(step.content,start+1)>=0)throw new Error('每项概念摘录须在口播中唯一出现；请选择更明确的连续原文。');
    const offset=[...narration.slice(0,start)].length;
    return {id:`point${i+1}`,content:step.content,concept_role:step.concept_role,cue:{text_start:offset,text_end:offset+[...step.content].length}};
  });
  return JSON.parse(cueSteps(JSON.stringify(elements),narration,'concept'));
}

export function cueSteps(text: string, narration: string, type: Scene['type'], rawCues: RawCues = {}): string {
  const steps=formSteps(text);
  if(type==='concept'){
    if(steps.some(e=>!e.concept_role)||steps.filter(e=>e.concept_role==='definition').length!==1)throw new Error('概念场景须恰好一个定义，且每项都有教学角色。');
    if(steps.filter(e=>e.concept_role==='summary').length>1)throw new Error('概念场景至多一个总结。');
  }
  if (Object.keys(rawCues).some(id=>!steps.some(e=>e.id===id))) throw new Error('触发范围含未知步骤，原输入保留。');
  let previous=-1;
  return JSON.stringify(steps.map(e=>{
    const raw=Object.hasOwn(rawCues,e.id)?rawCues[e.id]:undefined;
    if (raw && ![raw.text_start,raw.text_end].every(v=>typeof v==='string' && /^\d+$/.test(v)))
      throw new Error('触发范围须完整填写非负整数；原输入保留。');
    const cue=raw?{text_start:Number(raw.text_start),text_end:Number(raw.text_end)}:e.cue;
    const excerpt=cuePreview(narration,cue);
    if(type==='concept'&&!excerpt.includes(e.content))throw new Error('概念正文须是对应触发范围内的原文摘录；原输入保留。');
    if (['code_walkthrough','state_diagram','execution_timeline','data_chart','concept'].includes(type) && cue.text_start<=previous)
      throw new Error('此类场景的步骤触发起点必须按口播严格递增。');
    previous=cue.text_start;
    return raw?{...e,cue}:e;
  }),null,2);
}

export function scenePatch(scene: DraftScene, text: string, code: string, steps: string, edges?: NonNullable<Scene['edges']>) {
  return {narration_text: text, elements: parseSteps(steps),
    ...(scene.type === 'flow_diagram' && edges !== undefined ? {edges} : {}),
    ...(scene.code ? {code: {...scene.code, source: code}} : {})};
}

export async function request<T>(path: string, body?: unknown, method = 'POST', signal?: AbortSignal): Promise<T> {
  // Bodyless calls are GET here; never impose a deadline on submitted mutations.
  signal ??= body === undefined ? AbortSignal.timeout(5000) : undefined;
  const response = await fetch(API + path, {
    ...(body === undefined ? {} : {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}),
    ...(signal ? {signal} : {}),
  });
  if(response.status===401&&!path.startsWith('/api/auth/')&&typeof window!=='undefined')window.dispatchEvent(new Event(AUTH_REQUIRED));
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 409) throw new Error('版本冲突或内容尚未就绪。你的输入已保留，请检查任务和场景状态；不要覆盖其他修改。', {cause: response.status});
    const fields = value.validation_errors?.map((e: {path: string}) => e.path).join('、');
    throw new Error((value.message || '请求失败') + (fields ? '：' + fields : ''), {cause: response.status});
  }
  return value as T;
}
