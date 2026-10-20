import {realpath, stat, readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {VideoProject} from '../../../packages/video-schema/src/types';

const run = promisify(execFile);
type Probe = {streams: {codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; nb_frames?: string; duration?: string}[]; format: {duration: string}};

export async function probeMedia(file: string): Promise<Probe> {
  const {stdout} = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {timeout: 30000});
  return JSON.parse(stdout);
}

export async function verifyAssets(project: VideoProject, publicDir: string) {
  const root = await realpath(publicDir);
  const inside = (file: string) => {
    const relative = path.relative(root, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('asset_path: resource must be inside public directory');
  };
  for (const asset of project.assets) {
    const candidate = path.resolve(root, asset.storage_key);
    inside(candidate);
    const file = await realpath(candidate); inside(file);
    const info = await stat(file);
    if (!info.isFile() || info.size <= 0 || info.size > 50 * 1024 * 1024) throw new Error(`asset_size: ${asset.id}`);
    const hash = createHash('sha256').update(await readFile(file)).digest('hex');
    if (hash !== asset.checksum) throw new Error(`asset_checksum: ${asset.id}`);
    const media = await probeMedia(file);
    if (!media.streams.some(s => s.codec_type === 'audio') || media.streams.some(s => s.codec_type === 'video')) throw new Error(`asset_type: ${asset.id} must be audio only`);
    const duration = Number(media.format.duration) * 1000;
    if (!Number.isFinite(duration) || Math.abs(duration - asset.duration_ms) > 1) throw new Error(`asset_duration: ${asset.id}`);
  }
}

export async function verifyVideo(file: string, project: VideoProject) {
  const media = await probeMedia(file);
  const video = media.streams.find(s => s.codec_type === 'video');
  const audio = media.streams.find(s => s.codec_type === 'audio');
  const frames = project.scenes.reduce((n, s) => n + s.duration_frames, 0);
  if (!video || video.codec_name !== 'h264' || video.width !== 1920 || video.height !== 1080 || video.r_frame_rate !== '30/1' || Number(video.nb_frames) !== frames || !audio || audio.codec_name !== 'aac' || Math.abs(Number(media.format.duration) - frames / 30) > 1 / 30 + 0.001) throw new Error('output_verification: expected 1080P/30FPS H.264 + AAC with DSL duration');
  return {frames, duration_seconds: Number(media.format.duration), width: video.width, height: video.height, fps: 30, video_codec: video.codec_name, audio_codec: audio.codec_name};
}
