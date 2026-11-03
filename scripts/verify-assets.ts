// Reads {assets:[...]} on stdin and checks each media asset inside <public dir>: path, size, checksum, and that it
// really is the audio it claims to be. The project store runs this before publishing a chapter's voice.
import fs from 'node:fs';
import {realpath, stat, readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

type Asset={id:string;type:'audio';storage_key:string;checksum:string;duration_ms:number};

const run = promisify(execFile);
type Probe = {streams: {codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; nb_frames?: string; duration?: string}[]; format: {duration: string}};

async function probeMedia(file: string): Promise<Probe> {
  const {stdout} = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {timeout: 30000});
  return JSON.parse(stdout);
}

async function verifyAssets(project: {assets: Asset[]}, publicDir: string) {
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

async function main() {
  const input = fs.readFileSync(0);
  if (input.length > 512 * 1024 || !process.argv[2]) throw new Error('invalid input');
  const value = JSON.parse(input.toString('utf8'));
  const valid = (a: any) => a && typeof a.id === 'string' && a.type === 'audio' && typeof a.storage_key === 'string' &&
    /^[a-f0-9]{64}$/.test(a.checksum) && Number.isInteger(a.duration_ms) && a.duration_ms > 0;
  if (!value || !Array.isArray(value.assets) || value.assets.length > 200 || !value.assets.every(valid)) throw new Error('invalid assets');
  await verifyAssets({assets: value.assets}, process.argv[2]);
}
main().catch(() => { console.error('project_assets_invalid'); process.exitCode = 1; });
