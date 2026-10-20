import {validateProject} from '../../../packages/video-schema/src/validate';
import {reviewKey, videoDocument, type Job, type Project, type SceneRow} from './editor';

export function currentVoiceJob(row: SceneRow, jobs: Job[]): Job | undefined {
  // API returns newest first, including current-revision voice jobs outside its recent-history window.
  return jobs.find(j => j.kind === 'voice' && j.voice_current !== false && j.scene_id === row.id && j.base_revision === row.revision);
}

export function batchVoiceScenes(project: Project, jobs: Job[], reviews: Set<string>, selected: Set<string>, dirty: boolean) {
  if (dirty) return [];
  return project.scenes.filter(s => s.state === 'needs_voice' && reviews.has(reviewKey(s)) &&
    selected.has(reviewKey(s)) && !currentVoiceJob(s, jobs))
    .map(s => ({scene_id: s.id, expected_revision: s.revision}));
}

export function batchTimingScenes(project: Project, reviews: Set<string>, selected: Set<string>, dirty: boolean) {
  if (dirty) return [];
  return project.scenes.filter(s => s.state === 'needs_timing' && reviews.has(reviewKey(s)) && selected.has(reviewKey(s)) &&
    project.config.assets.some(a => a.id === s.scene.narration.audio_asset_id))
    .map(s => ({scene_id: s.id, expected_revision: s.revision}));
}

export type ExportIssue = {sceneId?: string; code: string; message: string; path?: string};
export function exportIssues(project: Project, dirty: boolean): ExportIssue[] {
  const issues: ExportIssue[] = [];
  if (dirty) issues.push({code: 'unsaved', message: '请先保存当前编辑，再导出。'});
  if (!project.scenes.length) issues.push({code: 'empty', message: '请先生成并核对分镜。'});
  for (const row of project.scenes) {
    if (row.state !== 'ready') issues.push({sceneId: row.id, code: row.state,
      message: row.state === 'needs_voice' ? '待配音：请核对后提交配音。' :
        row.state === 'needs_timing' ? '待对齐：保留原音频，核对后重算时间轴。' : '场景未就绪，请检查。'});
  }
  const ready = project.scenes.filter(s => s.state === 'ready');
  if (ready.length) {
    for (const error of validateProject(videoDocument({...project,scenes:ready}))) {
      const index = /^\/scenes\/(\d+)(?:\/|$)/.exec(error.path);
      issues.push({...error, sceneId: index ? ready[Number(index[1])]?.id : undefined,
        message: '字段或布局校验未通过：' + error.message});
    }
  }
  return issues;
}
