'use client';
import {useEffect, useState} from 'react';
import {batchTimingScenes, batchVoiceScenes, currentVoiceJob, exportIssues} from '../lib/course';
import {cuePreview, reviewKey, sceneTitle, type Job, type Project, type SceneRow} from '../lib/editor';
import {conceptLabels} from '../../../packages/video-schema/src/concept';
import {Layers, FileText, CheckCircle, AlertCircle, AlertTriangle} from './Icons';

const states: Record<string, string> = {ready: '可导出', needs_voice: '待配音', needs_timing: '待对齐'};
const jobStates: Record<string, string> = {queued: '排队', running: '处理中', succeeded: '完成', failed: '失败', cancelled: '取消'};

type Props = {project: Project; jobs: Job[]; reviews: Set<string>; dirty: boolean; busy: boolean;
  onSelect: (id: string) => void; onReview: (row: SceneRow, checked: boolean) => void;
  onSubmit: (scenes: {scene_id: string; expected_revision: number}[]) => void;
  onTiming: (scenes: {scene_id: string; expected_revision: number}[]) => void};

export function SavedManuscript({project}:{project:Project}) {
  const [copy,setCopy]=useState<{text:string;state:'pending'|'success'|'error'}|null>(null);
  return <details><summary><FileText size={14} /> 已保存全文（只读）</summary>
    <p className="hint">项目 r{project.revision} · 有分镜时按当前章节顺序合并已保存口播，无分镜时显示项目保存的文稿。不是最初提交稿的历史存档，不含未保存输入；复制点击时的已保存稿会写入系统剪贴板，不会生成或配音。</p>
    <button type="button" disabled={!project.source_text||copy?.state==='pending'} onClick={async()=>{
      if(!project.source_text||copy?.state==='pending')return;
      const text=project.source_text;setCopy({text,state:'pending'});
      try{await navigator.clipboard.writeText(text);setCopy({text,state:'success'});}
      catch{setCopy({text,state:'error'});}
    }}>{copy?.state==='pending'?'正在复制…':'复制已保存全文'}</button>
    {copy?.text===project.source_text&&copy.state!=='pending'&&<p role={copy.state==='error'?'alert':'status'} className="hint">{copy.state==='success'?'已复制已保存全文。':'复制失败，请选中文本手动复制。'}</p>}
    {project.source_text?<pre tabIndex={0} role="region" aria-label="已保存全文">{project.source_text}</pre>:<p className="muted">暂无已保存全文。</p>}
  </details>;
}

export function CourseOverview({project, jobs, reviews, dirty, busy, onSelect, onReview, onSubmit, onTiming}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timingSelected, setTimingSelected] = useState<Set<string>>(new Set());
  const timingCandidates = batchTimingScenes(project, reviews, new Set(project.scenes.map(reviewKey)), dirty);
  const timingBatch = batchTimingScenes(project, reviews, timingSelected, dirty);
  useEffect(() => {
    setSelected(old => {
      const valid = new Set(batchVoiceScenes(project, jobs, reviews, old, dirty).map(s => s.scene_id + ':' + s.expected_revision));
      return valid.size === old.size ? old : valid;
    });
    setTimingSelected(old => {
      const valid = new Set(batchTimingScenes(project, reviews, old, dirty).map(s => s.scene_id + ':' + s.expected_revision));
      return valid.size === old.size ? old : valid;
    });
  }, [project, jobs, reviews, dirty]);
  const checked = project.scenes.filter(s => reviews.has(reviewKey(s))).length;
  const candidates = batchVoiceScenes(project, jobs, reviews, new Set(project.scenes.map(reviewKey)), dirty);
  const batch = batchVoiceScenes(project, jobs, reviews, selected, dirty);
  const issues = exportIssues(project, dirty);
  return <section aria-label="整课制作">
    <h2><Layers size={18} /> 整课制作 · {checked}/{project.scenes.length} 已确认</h2>
    <p className="hint">{Object.entries(states).map(([state, label]) => `${label} ${project.scenes.filter(s => s.state === state).length}`).join(' · ')} · 待确认 {project.scenes.length - checked}</p>
    <p className="hint">本版配音任务：{Object.entries(jobStates).map(([state, label]) => `${label} ${project.scenes.filter(s => currentVoiceJob(s, jobs)?.state === state).length}`).join(' · ')}</p>
    <p className="hint">只提交已核对、已选择且没有本版配音任务的待配音章节；已有音频不批量重配。撤销核对、编辑或出现本版任务会清除不再合格的选择，重新核对后需重新勾选。失败不自动重试。</p>
    <div className="actions">
      <button disabled={busy || dirty || !candidates.length} onClick={() => setSelected(new Set(candidates.map(s => s.scene_id + ':' + s.expected_revision)))}>选择已确认待配音章节</button>
      <button disabled={busy || dirty || !batch.length} onClick={() => onSubmit(batch)}>批量配音（收费 · {batch.length}章）</button>
    </div>
    <p className="hint">本地对齐仅使用已保存音频缓存；会替换所选章字幕与入场时间。匹配任务由服务端复用，失败不自动重试；登记不等于完成，消费者状态仅提示。</p>
    <div className="actions">
      <button disabled={busy || dirty || !timingCandidates.length} onClick={() => setTimingSelected(new Set(timingCandidates.map(s => s.scene_id + ':' + s.expected_revision)))}>选择已确认待对齐章节</button>
      <button disabled={busy || dirty || !timingBatch.length || timingBatch.length > 20} onClick={() => onTiming(timingBatch)}>批量本地对齐（{timingBatch.length}章）</button>
      {timingBatch.length > 20 && <span role="alert">每批最多20章，请缩小选择。</span>}
    </div>
    {project.scenes.map((row, i) => {
      const key = reviewKey(row), job = currentVoiceJob(row, jobs);
      const eligible = candidates.some(s => s.scene_id === row.id);
      return <div className="course-scene" key={row.id}>
        <div className="section-heading"><strong>第{i + 1}章 · {sceneTitle(row.scene)} · {states[row.state] ?? row.state} · {reviews.has(key) ? '已确认' : '待确认'} · r{row.revision}</strong>
          <button disabled={busy} onClick={() => onSelect(row.id)}>定位第{i + 1}章</button></div>
        {job && <p className="hint">配音任务：{jobStates[job.state] ?? job.state} · {job.progress}%{job.error && ` · ${job.error.message}`}
          {['failed', 'cancelled', 'succeeded'].includes(job.state) && row.state === 'needs_voice' && ' · 本版已有任务，不再批量提交；请定位章节检查，失败请在持久任务中显式重试（可能再次计费）。'}</p>}
        {row.state === 'needs_timing' && <p className="hint">保留原音频；定位章节后重算时间轴，不需重新配音。</p>}
        <details><summary><FileText size={14} /> 核对口播与步骤 · {row.scene.type}</summary><p>{row.scene.narration.text}</p>
          {row.scene.code && <pre>{row.scene.code.source}</pre>}
          <ol>{row.scene.elements.map(e => {
            let excerpt:string|undefined;
            try{excerpt=cuePreview(row.scene.narration.text,e.cue);}catch{}
            return <li key={e.id}>{e.content}
              {row.scene.type==='concept'&&<p className="hint">{`教学角色：${e.concept_role&&Object.hasOwn(conceptLabels,e.concept_role)?conceptLabels[e.concept_role]:'未记录或无效'}（只读）`}</p>}
              {excerpt===undefined?<p role="alert" className="error-text">范围无效，请定位章节修正后再确认。</p>:
                <p className="hint">触发范围 [{e.cue.text_start}, {e.cue.text_end})（Unicode码点） · 对应口播原文：<mark>{excerpt}</mark></p>}
            </li>;
          })}</ol>
          <p className="hint">范围仅来自已保存稿的Unicode码点，不是秒或帧，不代替事实核对与实听同步。复杂变量、状态与连线请定位章节检查后再确认；确认仅对当前保存版本有效，刷新需重确认。</p>
          <label className="check"><input type="checkbox" disabled={busy || dirty} checked={reviews.has(key)}
            onChange={e => onReview(row, e.target.checked)}/>已核对第{i + 1}章 r{row.revision} 的口播、技术事实、示例状态与步骤触发位置</label>
        </details>
        {row.state === 'needs_timing' && <label className="check"><input type="checkbox" disabled={busy || dirty || !timingCandidates.some(s => s.scene_id === row.id)}
          checked={timingBatch.some(s => s.scene_id === row.id)} onChange={e => {const value = e.target.checked; setTimingSelected(old => {const next = new Set(old); if(value) next.add(key); else next.delete(key); return next;});}}/>选择第{i + 1}章批量本地对齐</label>}
        {row.state === 'needs_voice' && <label className="check"><input type="checkbox" disabled={busy || dirty || !eligible}
          checked={eligible && selected.has(key)} onChange={e => {const value = e.target.checked; setSelected(old => {const next = new Set(old); if (value) next.add(key); else next.delete(key); return next;});}}/>选择第{i + 1}章批量配音</label>}
      </div>;
    })}
    <details open={issues.length > 0}><summary>{issues.length ? <AlertTriangle size={14} /> : <CheckCircle size={14} />} 导出前检查 · {issues.length ? `${issues.length}项待处理` : '已保存稿字段检查通过'}</summary>
      <p className="hint">这里只检查已保存稿的状态与字段/布局限制；冻结导出时仍会校验实际音频文件，不代替人工听检。</p>
      {!issues.length && <p>可冻结版本并导出。</p>}
      <ul>{issues.map((issue, i) => <li key={i}>{issue.message} {issue.path && <code>{issue.path}</code>}
        {issue.sceneId && <button disabled={busy} onClick={() => onSelect(issue.sceneId!)}>定位第{project.scenes.findIndex(s => s.id === issue.sceneId) + 1}章</button>}</li>)}</ul>
    </details>
  </section>;
}
