import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, writeFile, symlink, rm, open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {parseProject} from '../../../packages/video-schema/src/validate';
import {validProject} from '../../../packages/video-schema/tests/fixture';
import {frameTimestamp, projectToSrt} from '../src/subtitles';
import {verifyAssets} from '../src/media';

test('帧转换正确舍入并支持分钟/小时', () => {
  assert.equal(frameTimestamp(1, 30), '00:00:00,033');
  assert.equal(frameTimestamp(1800, 30), '00:01:00,000');
  assert.equal(frameTimestamp(108000, 30), '01:00:00,000');
});
test('全片 SRT 加场景偏移，自动拆为 22 字符每行', () => {
  const p = parseProject(validProject());
  p.scenes.push({...structuredClone(p.scenes[0]), id: 'scene2'});
  p.scenes[1].captions[0].text = '字'.repeat(40);
  const srt = projectToSrt(p);
  assert.ok(srt.includes('1\n00:00:00,200 --> 00:00:02,200\n先用规则，再用模型。'));
  assert.ok(srt.includes('2\n00:00:02,600 --> 00:00:04,600\n' + '字'.repeat(22) + '\n' + '字'.repeat(18)));
});
test('重排场景后字幕偏移随之变化', () => {
  const p = parseProject(validProject());
  const other = structuredClone(p.scenes[0]); other.id = 'scene2'; other.duration_frames = 102;
  other.captions[0].text = '第二段';
  p.scenes.push(other);
  assert.ok(projectToSrt(p).includes('00:00:02,600 --> 00:00:04,600\n第二段'));
  p.scenes.reverse();
  assert.ok(projectToSrt(p).includes('00:00:03,600 --> 00:00:05,600\n先用规则'));
});
test('Remotion 服务配置仅绑定回环地址', () => {
  const result = spawnSync(process.execPath, ['--require', './scripts/loopback.cjs', '-e', 'const c=require("@remotion/renderer").RenderInternals.getPortConfig(false); console.log(JSON.stringify(c))'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {host: '127.0.0.1', hostsToTry: ['127.0.0.1']});
});
test('导出 CLI 拒绝非法输入，不创建最终文件', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aicreater-cli-'));
  try {
    const input = path.join(dir, 'bad.json'), output = path.join(dir, 'bad.mp4');
    await writeFile(input, '{}');
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'apps/renderer/src/render.ts', input, output], {encoding: 'utf8'});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid_dsl/);
    await assert.rejects(readFile(output), /ENOENT/);
  } finally {await rm(dir, {recursive: true, force: true});}
});
test('visual style CLI accepts a registered override and rejects unknown IDs before assets or output', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'aicreater-style-cli-'));
  try {
    const input=path.join(dir,'input.json'),output=path.join(dir,'out.mp4');
    await writeFile(input,'{}');
    const run=(style:string)=>spawnSync(process.execPath,['--import','tsx','apps/renderer/src/render.ts',input,output,`--visual-style=${style}`],{encoding:'utf8'});
    assert.match(run('whiteboard').stderr,/invalid_dsl/);
    await writeFile(input,JSON.stringify(validProject()));
    assert.match(run('unknown').stderr,/invalid_visual_style/);
    await assert.rejects(readFile(output),/ENOENT/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('导出 CLI 保留已存在的视频和字幕，不覆盖', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aicreater-existing-'));
  try {
    const input = path.join(dir, 'input.json'), output = path.join(dir, 'video.mp4'), srt = path.join(dir, 'video.srt');
    await writeFile(input, JSON.stringify(validProject()));
    for (const existing of [output, srt]) {
      await writeFile(existing, 'original');
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'apps/renderer/src/render.ts', input, output], {encoding: 'utf8'});
      assert.equal(result.status, 1);
      assert.match(result.stderr, /output_exists/);
      assert.equal(await readFile(existing, 'utf8'), 'original');
      await rm(existing);
    }
  } finally {await rm(dir, {recursive: true, force: true});}
});
test('资产核验：合法音频、哈希/时长错误、穿越、外部软链、超限', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aicreater-test-'));
  const root = path.join(dir, 'public');
  const {mkdir} = await import('node:fs/promises'); await mkdir(root);
  try {
    const file = path.join(root, 'one.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=400:duration=2', file]);
    const p = parseProject(validProject());
    p.assets[0].storage_key = 'one.wav';
    p.assets[0].checksum = createHash('sha256').update(await readFile(file)).digest('hex');
    await verifyAssets(p, root);
    assert.ok(p.assets[0].type === 'audio');
    const original = {...p.assets[0]};
    p.assets[0].checksum = 'b'.repeat(64);
    await assert.rejects(verifyAssets(p, root), /checksum/);
    p.assets[0] = {...original, duration_ms: 1900};
    await assert.rejects(verifyAssets(p, root), /duration/);
    p.assets[0] = {...original, storage_key: '../outside.wav'};
    await assert.rejects(verifyAssets(p, root), /path/);
    await writeFile(path.join(dir, 'outside.wav'), await readFile(file));
    await symlink(path.join(dir, 'outside.wav'), path.join(root, 'link.wav'));
    p.assets[0] = {...original, storage_key: 'link.wav'};
    await assert.rejects(verifyAssets(p, root), /path/);
    p.assets[0] = {...original, storage_key: 'missing.wav'};
    await assert.rejects(verifyAssets(p, root), /ENOENT/);
    const big = await open(path.join(root, 'big.wav'), 'w'); await big.truncate(50 * 1024 * 1024 + 1); await big.close();
    p.assets[0] = {...original, storage_key: 'big.wav'};
    await assert.rejects(verifyAssets(p, root), /size/);
  } finally {await rm(dir, {recursive: true, force: true});}
});
