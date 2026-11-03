import {AUTH_REQUIRED} from './accounts';

export type Caption = {text: string; start_frame: number; end_frame: number};
export type DraftScene = {narration: {text: string; audio_asset_id?: string}; duration_frames?: number; captions?: Caption[]};
export type SceneRow = {id: string; revision: number; state: string; scene: DraftScene};
export type Project = {id: string; title: string; revision: number; source_text: string; scenes: SceneRow[];
  voice?: {resource_id: string; speaker: string}; voice_configured?: boolean};
export type ProjectSummary = Pick<Project,'id'|'title'> & {revision?:number;updated_at?:string|null;scene_count?:number;needs_voice?:number;needs_timing?:number;confirmed_count?:number;active_jobs?:boolean;
  active_job_kind?:string|null;active_job_state?:string|null};
const JOB_KIND_LABELS: Record<string, string> = {voice:'配音',timing:'本地对齐',agent:'Agent 生成',export:'整课导出'};
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
    if(['revision','scene_count','needs_voice','needs_timing','confirmed_count'].some(key=>item[key]!==undefined&&(!Number.isSafeInteger(item[key])||item[key]<(key==='revision'?1:0)))||
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
export type Job = {job_id: string; project_id?: string; kind: 'voice'|'timing'; voice_current?: boolean | null; cancel_requested?: boolean; state: string; progress: number; scene_id?: string | null; base_revision?: number | null;
  error?: {message: string; retryable: boolean} | null; result?: {attached?: boolean} | null};
export function parseJobs(value:unknown,projectId:string):Job[] {
  const invalid=()=>new Error('任务响应格式错误，已有状态未更新；请重新读取任务，不要重复提交。');
  if(!Array.isArray(value))throw invalid();
  const ids=new Set<string>();
  for(const item of value){
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.job_id!=='string'||!/^[A-Za-z0-9_-]+$/.test(item.job_id)||ids.has(item.job_id)||item.project_id!==projectId||
      !['voice','timing'].includes(item.kind)||!['queued','running','succeeded','failed','cancelled'].includes(item.state)||
      typeof item.progress!=='number'||!Number.isFinite(item.progress)||item.progress<0||item.progress>100||
      (item.cancel_requested!==undefined&&typeof item.cancel_requested!=='boolean')||
      (item.voice_current!=null&&typeof item.voice_current!=='boolean')||
      (item.scene_id!=null&&(typeof item.scene_id!=='string'||!item.scene_id.trim()))||
      (item.base_revision!=null&&(!Number.isSafeInteger(item.base_revision)||item.base_revision<1))||
      (item.error!=null&&(typeof item.error!=='object'||Array.isArray(item.error)||typeof item.error.message!=='string'||typeof item.error.retryable!=='boolean'))||
      (item.result!=null&&(typeof item.result!=='object'||Array.isArray(item.result)||(item.result.attached!==undefined&&typeof item.result.attached!=='boolean'))))throw invalid();
    ids.add(item.job_id);
  }
  return value as Job[];
}
export function parseSceneJob(value:unknown,projectId:string,row:SceneRow,kind:'timing'|'voice'):Job {
  const job=parseJobs([value],projectId)[0];
  if(job.base_revision!==row.revision||job.kind!==kind||job.scene_id!==row.id)
    throw new Error('任务响应与当前章节/版本不符，列表未更新；请核对任务，不要重复提交。');
  return job;
}
export const API = ''; // Same-origin cookies also cover media and download requests.

export function canRetime(row: SceneRow): boolean {
  return ['ready', 'needs_timing'].includes(row.state) && !!row.scene.narration.audio_asset_id;
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
