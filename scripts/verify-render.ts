import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseProject} from '../packages/video-schema/src/validate';
import {verifyVideo} from '../apps/renderer/src/media';
import {projectToSrt} from '../apps/renderer/src/subtitles';

async function main() {
  if (process.argv.length !== 3) throw new Error('Expected server-owned render directory');
  const project = parseProject(JSON.parse(readFileSync(0, 'utf8')));
  const directory = process.argv[2];
  await verifyVideo(path.join(directory, 'video.mp4'), project);
  if (readFileSync(path.join(directory, 'video.srt'), 'utf8') !== projectToSrt(project)) throw new Error('Subtitle snapshot mismatch');
}
main().catch(() => {console.error('render_verification_failed'); process.exitCode = 1;});
