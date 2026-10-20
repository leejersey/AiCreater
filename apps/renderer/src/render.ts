import '../../../scripts/loopback.cjs';
import {bundle} from '@remotion/bundler';
import {selectComposition, renderMedia, makeCancelSignal} from '@remotion/renderer';
import {readFile, writeFile, mkdir, mkdtemp, rm, cp, link, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseProject} from '../../../packages/video-schema/src/validate';
import {getVisualStyle,validateVisualStyle} from '../../../packages/video-components/src/theme';
import {verifyAssets, verifyVideo} from './media';
import {projectToSrt} from './subtitles';

const root = fileURLToPath(new URL('../../../', import.meta.url));

async function ensureAbsent(file: string) {
  try {await lstat(file);} catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`output_exists: refusing to overwrite ${file}`);
}

async function main() {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length>1 || (extra.length&&!/^--visual-style(?:-file)?=.+/.test(extra[0])) || !output.endsWith('.mp4')) throw new Error('Usage: npm run render -- input.json output/video.mp4 [--visual-style=ID | --visual-style-file=snapshot.json]');
  const flag=extra[0],visualStyle=flag?.startsWith('--visual-style=')?flag.slice('--visual-style='.length):undefined;
  let visualStyleSnapshot;
  if(flag?.startsWith('--visual-style-file=')){
    const raw=await readFile(path.resolve(flag.slice('--visual-style-file='.length)),'utf8');
    if(Buffer.byteLength(raw)>16384)throw new Error('invalid_visual_style_snapshot');
    visualStyleSnapshot=JSON.parse(raw);
  }
  getVisualStyle(visualStyle);
  const project = parseProject(JSON.parse(await readFile(path.resolve(input), 'utf8')));
  validateVisualStyle(project,visualStyle,visualStyleSnapshot);
  const destination = path.resolve(output), subtitleDestination = destination.slice(0, -4) + '.srt';
  await ensureAbsent(destination); await ensureAbsent(subtitleDestination);
  const publicDir = process.env.AICREATER_PUBLIC_DIR || path.join(root, 'apps/renderer/public');
  await verifyAssets(project, publicDir);
  await mkdir(path.dirname(destination), {recursive: true});
  const temp = await mkdtemp(path.join(path.dirname(destination), '.render-'));
  const {cancelSignal, cancel} = makeCancelSignal();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let videoPublished = false, srtPublished = false;
  const onInterrupt = () => cancel();
  process.on('SIGINT', onInterrupt); process.on('SIGTERM', onInterrupt);
  try {
    const frozenPublic = path.join(temp, 'public'); await mkdir(frozenPublic);
    for (const asset of project.assets) {
      const target = path.join(frozenPublic, asset.storage_key);
      await mkdir(path.dirname(target), {recursive: true});
      await cp(path.join(publicDir, asset.storage_key), target, {dereference: true});
    }
    await verifyAssets(project, frozenPublic);
    const serveUrl = await bundle({entryPoint: path.join(root, 'apps/renderer/src/index.tsx'), publicDir: frozenPublic, outDir: path.join(temp, 'bundle')});
    const inputProps = {project,visualStyle,visualStyleSnapshot};
    const composition = await selectComposition({serveUrl, id: 'KnowledgeVideo', inputProps});
    const video = path.join(temp, 'video.mp4'), subtitle = path.join(temp, 'video.srt');
    timer = setTimeout(cancel, 600000);
    let last = -1;
    await renderMedia({serveUrl, composition, inputProps, codec: 'h264', audioCodec: 'aac', pixelFormat: 'yuv420p', outputLocation: video, concurrency: 2, overwrite: false, cancelSignal, timeoutInMilliseconds: 60000, onProgress: ({progress}) => {
      const percent = Math.floor(progress * 10) * 10;
      if (percent !== last) {last = percent; console.log(`render ${percent}%`);}
    }});
    clearTimeout(timer);
    const metadata = await verifyVideo(video, project);
    await writeFile(subtitle, projectToSrt(project), {flag: 'wx'});
    await link(video, destination); videoPublished = true;
    await link(subtitle, subtitleDestination); srtPublished = true;
    console.log(JSON.stringify({mp4: destination, srt: subtitleDestination, ...metadata}, null, 2));
  } catch (error) {
    if (videoPublished) await rm(destination, {force: true});
    if (srtPublished) await rm(subtitleDestination, {force: true});
    throw error;
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', onInterrupt); process.off('SIGTERM', onInterrupt);
    await rm(temp, {recursive: true, force: true});
  }
}

main().catch(error => {console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;});
