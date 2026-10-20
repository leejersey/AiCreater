import type {VideoProject} from '../../../packages/video-schema/src/types';
import {wrapText} from '../../../packages/video-components/src/layout';

export function frameTimestamp(frame: number, fps: number): string {
  const milliseconds = Math.round(frame * 1000 / fps);
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`;
}

export function projectToSrt(project: VideoProject): string {
  let offset = 0; let index = 0;
  const blocks = project.scenes.flatMap(scene => {
    const blocks = scene.captions.map(c => `${++index}\n${frameTimestamp(offset + c.start_frame, project.video_config.fps)} --> ${frameTimestamp(offset + c.end_frame, project.video_config.fps)}\n${wrapText(c.text, 22).join('\n')}`);
    offset += scene.duration_frames;
    return blocks;
  });
  return blocks.join('\n\n') + '\n';
}
