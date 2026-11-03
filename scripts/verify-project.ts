// Reads a project document on stdin and checks its media assets inside <public dir>: path, size, checksum, and
// that each asset really is the audio (or image) it claims to be. The project store runs this before publishing media.
import fs from 'node:fs';
import {realpath, stat, readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseProject} from '../packages/video-schema/src/validate';
import type {VideoProject} from '../packages/video-schema/src/types';

const run = promisify(execFile);
type Probe = {streams: {codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; nb_frames?: string; duration?: string}[]; format: {duration: string}};

async function probeMedia(file: string): Promise<Probe> {
  const {stdout} = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {timeout: 30000});
  return JSON.parse(stdout);
}

async function verifyAssets(project: VideoProject, publicDir: string) {
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
    if (!info.isFile() || info.size <= 0 || info.size > (asset.type==='image'?10:50) * 1024 * 1024) throw new Error(`asset_size: ${asset.id}`);
    const hash = createHash('sha256').update(await readFile(file)).digest('hex');
    if (hash !== asset.checksum) throw new Error(`asset_checksum: ${asset.id}`);
    const media = await probeMedia(file);
    if(asset.type==='image'){
      const stream=media.streams[0],extension=path.extname(asset.storage_key).toLowerCase();
      if(media.streams.length!==1||stream.codec_type!=='video'||stream.codec_name!==(extension==='.png'?'png':['.jpg','.jpeg'].includes(extension)?'mjpeg':'unsupported'))throw new Error(`image_type: ${asset.id}`);
      if(stream.width!==asset.width||stream.height!==asset.height||asset.width<1||asset.height<1||asset.width>4096||asset.height>4096||asset.width*asset.height>8_388_608)throw new Error(`image_dimensions: ${asset.id}`);
      // Decode up to two frames: headers alone cannot prove an intact, static image.
      const {stdout}=await run('ffmpeg',['-v','error','-xerror','-err_detect','explode','-threads','1','-i',file,'-map','0:v:0','-frames:v','2','-f','framehash','-'],{timeout:30000,maxBuffer:64*1024});
      if(stdout.split('\n').filter(line=>line.trim()&&!line.startsWith('#')).length!==1)throw new Error(`image_frames: ${asset.id}`);
      continue;
    }
    if (!media.streams.some(s => s.codec_type === 'audio') || media.streams.some(s => s.codec_type === 'video')) throw new Error(`asset_type: ${asset.id} must be audio only`);
    const duration = Number(media.format.duration) * 1000;
    if (!Number.isFinite(duration) || Math.abs(duration - asset.duration_ms) > 1) throw new Error(`asset_duration: ${asset.id}`);
  }
}

async function main() {
  const input = fs.readFileSync(0);
  if (input.length > 512 * 1024 || !process.argv[2]) throw new Error('invalid input');
  const project = parseProject(JSON.parse(input.toString('utf8')));
  await verifyAssets(project, process.argv[2]);
}
main().catch(() => { console.error('project_assets_invalid'); process.exitCode = 1; });
