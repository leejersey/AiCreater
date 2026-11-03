import type {Job, SceneRow} from './editor';

export function currentVoiceJob(row: SceneRow, jobs: Job[]): Job | undefined {
  // API returns newest first, including current-revision voice jobs outside its recent-history window.
  return jobs.find(j => j.kind === 'voice' && j.voice_current !== false && j.scene_id === row.id && j.base_revision === row.revision);
}
