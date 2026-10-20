import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {codeProject} from './fixture';
import {validateProject} from '../src/validate';

function accepts(p: unknown, valid: boolean) {
  assert.equal(validateProject(p).length === 0, valid);
  const r = spawnSync('python3', ['packages/video-schema/validate.py', '-'], {input: JSON.stringify(p), encoding: 'utf8'});
  assert.equal(r.status, valid ? 0 : 1, r.stderr);
}
test('代码教学同时通过 TS/Python', () => accepts(codeProject(), true));
test('代码最大16行和48显示单位边界通过双语言校验', () => {
  const p = codeProject();
  p.scenes[0].code.source = '# ' + 'x'.repeat(46) + '\n' + Array(15).fill('pass').join('\n');
  accepts(p, true);
});
const bad: [string, (p: ReturnType<typeof codeProject>) => void][] = [
  ['缺少代码', p => Reflect.deleteProperty(p.scenes[0], 'code')],
  ['空代码', p => {p.scenes[0].code.source = ' ';}],
  ['过多行', p => {p.scenes[0].code.source = Array(17).fill('x').join('\n');}],
  ['长行', p => {p.scenes[0].code.source = 'x'.repeat(49) + '\nx = 1';}],
  ['中文显示宽度', p => {p.scenes[0].code.source = '# ' + '字'.repeat(30) + '\nx = 1';}],
  ['缩进制表符', p => {p.scenes[0].code.source = '\tx = 1\nx = 2';}],
  ['不可见方向字符', p => {p.scenes[0].code.source = 'x\u202e = 1\nx = 2';}],
  ['行号越界', p => {p.scenes[0].elements[0].code_lines = [3];}],
  ['重复行号', p => {p.scenes[0].elements[0].code_lines = [1, 1];}],
  ['过多变量', p => {p.scenes[0].elements[0].variables = Array(4).fill({name: 'x', value: '1'});}],
  ['重复变量', p => {p.scenes[0].elements[0].variables = Array(2).fill({name: 'x', value: '1'});}],
  ['输出过长', p => {p.scenes[0].elements[0].output = '字'.repeat(45);}],
  ['教学步骤标题过长', p => {p.scenes[0].elements[0].content = '字'.repeat(33);}],
  ['空变量名', p => {p.scenes[0].elements[0].variables[0].name = ' ';}],
  ['步骤cue倒序', p => {p.scenes[0].elements[1].cue = {text_start: 0, text_end: 1};}],
  ['步骤时间相同', p => {p.scenes[0].animations[1].start_frame = 6;}],
  ['普通场景不许夹带代码', p => {p.scenes[0].type = 'card_sequence';}],
];
for (const [name, mutate] of bad) test(`教学拒绝：${name}`, () => {const p = codeProject(); mutate(p); accepts(p, false);});
