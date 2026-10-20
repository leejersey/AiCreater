import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, readFile, writeFile, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type {VideoProject, Scene} from '../packages/video-schema/src/types';
import {parseProject} from '../packages/video-schema/src/validate';
import {probeMedia, verifyAssets} from '../apps/renderer/src/media';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'apps/renderer/public');
const general = process.argv.includes('--general');
const comparison = process.argv.includes('--comparison');
const state = process.argv.includes('--state');
const timeline = process.argv.includes('--timeline');
assert.ok(Number(general) + Number(state) + Number(comparison) + Number(timeline) <= 1, 'Choose one demo');
const demoName = general ? 'general-demo' : timeline ? 'timeline-demo' : state ? 'state-demo' : comparison ? 'comparison-demo' : 'demo';
const lessonDraft = general || state || timeline ? JSON.parse(await readFile(path.join(root, `examples/lessons/${general ? 'general' : state ? 'state' : 'timeline'}.json`), 'utf8')) as {scenes: (Pick<Scene, 'type' | 'structure' | 'timeline' | 'elements'> & {narration: {text: string}})[]} : undefined;
const definitions: {type: Scene['type']; phrases: string[]; labels: string[]; keywords: string[]; structure?: Scene['structure']; timeline?: Scene['timeline']; steps?: Scene['elements']}[] = lessonDraft ? lessonDraft.scenes.map(s => {
  const phrases = s.elements.map(e => [...s.narration.text].slice(e.cue.text_start, e.cue.text_end).join(''));
  assert.equal(phrases.join(''), s.narration.text, 'Demo cues must cover the entire manuscript');
  return {type: s.type, phrases, labels: s.elements.map(e => e.content), keywords: phrases, structure: s.structure, timeline: s.timeline, steps: s.elements};
}) : comparison ? [
  {type: 'comparison_panel',
    phrases: ['正确写法是循环外初始化。', '错误写法是循环内初始化。', '保留上一轮总和是正确写法。', '重置为零会丢掉累计结果。', '得到五是二和三的正确总和。', '得到三是错误版本的最后结果。'],
    labels: ['正确写法', '错误写法', '循环外初始化：保留累计', '循环内初始化：反复清零', '二和三：总和为五', '错误版本：最后为三'],
    keywords: ['正确写法', '错误写法', '保留上一轮', '重置为零', '得到五', '得到三']},
] : [
  {type: 'title_reveal', phrases: ['什么是智能体？它不只是回答问题，', '还能围绕目标，选择工具并完成任务。'], labels: ['从回答问题，到完成任务'], keywords: ['智能体']},
  {type: 'card_sequence', phrases: ['首先明确目标，让任务有清晰的完成标准。', '然后选择工具，获取信息或执行操作。', '最后检查结果，确认是否真正完成任务。'], labels: ['明确目标', '选择工具', '检查结果'], keywords: ['目标', '工具', '结果']},
  {type: 'flow_diagram', phrases: ['一个简单流程，从理解需求开始。', '接着调用工具，执行具体的操作。', '最后验证结果，必要时继续调整。'], labels: ['理解需求', '调用工具', '验证结果'], keywords: ['理解需求', '调用工具', '验证结果']},
  {type: 'card_sequence', phrases: ['稳定运行需要边界：只开放必要的权限。', '失败时有限重试，避免无限循环和费用。', '重要操作保留人工确认，保护原有数据。'], labels: ['最小权限', '有限重试', '人工确认'], keywords: ['权限', '重试', '人工确认']},
  {type: 'title_reveal', phrases: ['先做一个可验证的小闭环，', '再逐步增加能力，而不是一次构建所有功能。'], labels: ['先验证闭环，再扩展能力'], keywords: ['闭环']},
];

async function main() {
  if (process.platform !== 'darwin') throw new Error('Demo synthesis uses macOS say. On other platforms supply your own local audio and final DSL.');
  const temp = await mkdtemp(path.join(tmpdir(), 'aicreater-demo-'));
  const project: VideoProject = {schema_version: '1.0', theme: general ? 'light_teaching' : 'tech_explainer', video_config: {width: 1920, height: 1080, fps: 30, language: 'zh-CN'}, assets: [], scenes: []};
  try {
    for (let i = 0; i < definitions.length; i++) {
      const definition = definitions[i], id = `scene_${i + 1}`;
      const segments: {text: string; start_ms: number; end_ms: number; text_start: number; text_end: number}[] = [];
      const wavs: string[] = []; let elapsed = 0, textOffset = 0;
      for (let j = 0; j < definition.phrases.length; j++) {
        const phrase = definition.phrases[j], aiff = path.join(temp, `${i}-${j}.aiff`), wav = path.join(temp, `${i}-${j}.wav`);
        await run('say', ['-v', process.env.DEMO_VOICE ?? 'Eddy (中文（中国大陆）)', '-r', '220', '-o', aiff, phrase], {timeout: 120000});
        await run('ffmpeg', ['-v', 'error', '-i', aiff, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', wav], {timeout: 30000});
        const duration = Number((await probeMedia(wav)).format.duration) * 1000;
        assert.ok(Number.isFinite(duration) && duration > 0, 'TTS segment must have real audio');
        segments.push({text: phrase, start_ms: elapsed, end_ms: elapsed + duration, text_start: textOffset, text_end: textOffset + [...phrase].length});
        elapsed += duration; textOffset += [...phrase].length; wavs.push(wav);
      }
      const list = path.join(temp, 'concat.txt'); await writeFile(list, wavs.map(w => `file '${w}'`).join('\n'));
      const combined = path.join(temp, `${id}.wav`);
      await run('ffmpeg', ['-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', combined], {timeout: 30000});
      const duration = Math.round(Number((await probeMedia(combined)).format.duration) * 1000);
      const storageKey = `${demoName}/${id}.wav`;
      project.assets.push({id: `audio_${id}`, type: 'audio', storage_key: storageKey, checksum: createHash('sha256').update(await readFile(combined)).digest('hex'), duration_ms: duration});
      const text = definition.phrases.join('');
      const elements = definition.labels.map((content, j) => {
        if (definition.steps) return {...definition.steps[j], content};
        const keyword = definition.keywords[j];
        const prefix = text.slice(0, text.indexOf(keyword));
        assert.ok(text.includes(keyword));
        return {id: `e${j + 1}`, content, cue: {text_start: [...prefix].length, text_end: [...prefix].length + [...keyword].length}};
      });
      const captions = segments.map((segment, j) => ({text: segment.text, start_frame: 6 + Math.floor(segment.start_ms * 30 / 1000), end_frame: j + 1 < segments.length ? 6 + Math.floor(segments[j + 1].start_ms * 30 / 1000) : 6 + Math.ceil(duration * 30 / 1000)}));
      const scene: Scene = {
        id, type: definition.type, narration: {text, audio_asset_id: `audio_${id}`, audio_start_frame: 6}, duration_frames: 12 + Math.ceil(duration * 30 / 1000), elements, captions,
        animations: elements.map(e => {
          const segment = segments.find(s => e.cue.text_start >= s.text_start && e.cue.text_start < s.text_end)!;
          return {target: e.id, effect: 'fade_slide', start_frame: 6 + Math.floor(segment.start_ms * 30 / 1000), duration_frames: 12};
        }),
      };
      if (definition.structure) scene.structure = definition.structure;
      if (definition.timeline) scene.timeline = definition.timeline;
      if (scene.type === 'flow_diagram') scene.edges = [{from: 'e1', to: 'e2'}, {from: 'e2', to: 'e3'}];
      project.scenes.push(scene);
    }
    parseProject(project);
    await mkdir(path.join(publicDir, demoName), {recursive: true});
    for (const asset of project.assets) await copyFile(path.join(temp, `${asset.id.replace('audio_', '')}.wav`), path.join(publicDir, asset.storage_key));
    await verifyAssets(project, publicDir);
    await mkdir(path.join(root, 'examples'), {recursive: true});
    await writeFile(path.join(root, `examples/${demoName}.json`), JSON.stringify(project, null, 2) + '\n');
    await writeFile(path.join(root, `examples/${demoName}-props.json`), JSON.stringify({project}, null, 2) + '\n');
    console.log(`Created ${project.scenes.length} scenes, ${(project.scenes.reduce((n, s) => n + s.duration_frames, 0) / 30).toFixed(1)}s. Timings come from separately synthesized phrases, not forced alignment.`);
  } finally {await rm(temp, {recursive: true, force: true});}
}
main().catch(error => {console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;});
