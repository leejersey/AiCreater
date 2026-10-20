import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {validateProject} from '../src/validate';
import {validProject, type Fixture} from './fixture';

const cases: [string, (p: Fixture) => void][] = [
  ['未知字段', p => Object.assign(p, {secret: 'no'})],
  ['未来版本', p => {p.schema_version = '2.0';}],
  ['主题对象', p => Object.assign(p, {theme: {palette: []}})],
  ['无场景', p => {p.scenes = [];}],
  ['未知资源', p => {p.scenes[0].narration.audio_asset_id = 'missing';}],
  ['重复资产', p => {p.assets.push({...p.assets[0]});}],
  ['重复场景', p => {p.scenes.push(structuredClone(p.scenes[0]));}],
  ['重复元素', p => {p.scenes[0].elements[1].id = 'a';}],
  ['不存在的动画目标', p => {p.scenes[0].animations[0].target = 'missing';}],
  ['重复入场', p => {p.scenes[0].animations.push({...p.scenes[0].animations[0]});}],
  ['缺少入场', p => {p.scenes[0].animations.pop();}],
  ['动画越界', p => {p.scenes[0].animations[0].start_frame = 71;}],
  ['字幕越界', p => {p.scenes[0].captions[0].end_frame = 73;}],
  ['字幕空区间', p => {p.scenes[0].captions[0].end_frame = 6;}],
  ['字幕重叠', p => {p.scenes[0].captions.push({...p.scenes[0].captions[0]});}],
  ['空字幕', p => {p.scenes[0].captions = [];}],
  ['非法音频时长', p => {p.assets[0].duration_ms = 0;}],
  ['音频与场景时长不符', p => {p.scenes[0].duration_frames++;}],
  ['cue越界', p => {p.scenes[0].elements[0].cue.text_end = 100;}],
  ['cue倒序', p => {p.scenes[0].elements[0].cue.text_end = 1;}],
  ['仅空白cue', p => {p.scenes[0].narration.text = '          ';}],
  ['长标签', p => {p.scenes[0].elements[0].content = '字'.repeat(41);}],
  ['空标签', p => {p.scenes[0].elements[0].content = ' ';}],
  ['BOM 空白标签', p => {p.scenes[0].elements[0].content = '\ufeff';}],
  ['标签控制字符', p => {p.scenes[0].elements[0].content = '规则\u0000';}],
  ['标题数量错误', p => {p.scenes[0].type = 'title_reveal';}],
  ['卡片不能含边', p => Object.assign(p.scenes[0], {edges: []})],
  ['流程缺少边定义', p => {p.scenes[0].type = 'flow_diagram';}],
  ['流程环', p => {p.scenes[0].type = 'flow_diagram'; Object.assign(p.scenes[0], {edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'a'}]});}],
  ['流程无效引用', p => {p.scenes[0].type = 'flow_diagram'; Object.assign(p.scenes[0], {edges: [{from: 'a', to: 'x'}]});}],
  ['重复流程边', p => {p.scenes[0].type = 'flow_diagram'; Object.assign(p.scenes[0], {edges: [{from: 'a', to: 'b'}, {from: 'a', to: 'b'}]});}],
  ['全片超过五分钟', p => {p.assets[0].duration_ms = 300001; p.scenes[0].duration_frames = 9013;}],
  ['口播超过输入限制', p => {p.scenes[0].narration.text = '字'.repeat(4001);}],
];

function pythonAccepts(value: unknown) {
  const result = spawnSync('python3', ['packages/video-schema/validate.py', '-'], {input: JSON.stringify(value), encoding: 'utf8'});
  assert.equal(result.error, undefined);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  return result.status === 0;
}

test('合法输入通过 TS/Python', () => {
  assert.deepEqual(validateProject(validProject()), []);
  assert.equal(pythonAccepts(validProject()), true);
});
for (const [name, mutate] of cases) {
  test(`TS/Python 均拒绝：${name}`, () => {
    const p = validProject(); mutate(p);
    const errors = validateProject(p);
    assert.ok(errors.length > 0);
    assert.ok(errors.every(e => e.path && e.code && e.message));
    assert.equal(pythonAccepts(p), false);
  });
}
test('Unicode cue 按码点，而不是 UTF-16', () => {
  const p = validProject();
  p.scenes[0].narration.text = '😀规则';
  p.scenes[0].elements[0].cue = {text_start: 1, text_end: 3};
  p.scenes[0].elements[1].cue = {text_start: 1, text_end: 3};
  assert.deepEqual(validateProject(p), []);
  assert.equal(pythonAccepts(p), true);
  p.scenes[0].elements[0].cue.text_end = 4;
  assert.ok(validateProject(p).length > 0);
  assert.equal(pythonAccepts(p), false);
});
test('单节点 DAG 允许空边', () => {
  const p = validProject(); p.scenes[0].type = 'flow_diagram';
  p.scenes[0].elements.pop(); p.scenes[0].animations.pop();
  Object.assign(p.scenes[0], {edges: []});
  assert.deepEqual(validateProject(p), []);
  assert.equal(pythonAccepts(p), true);
});
test('Python 接受 Schema 定义的整数值浮点表示', () => {
  const input = JSON.stringify(validProject()).replace('"text_start":2', '"text_start":2.0').replace('"text_end":4', '"text_end":4.0');
  const result = spawnSync('python3', ['packages/video-schema/validate.py', '-'], {input, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
});
test('任意 JSON 输入返回结构化错误而非异常', () => {
  for (const value of [null, [], {}, 'text', 1]) {
    assert.ok(validateProject(value).length > 0);
    assert.equal(pythonAccepts(value), false);
  }
});
