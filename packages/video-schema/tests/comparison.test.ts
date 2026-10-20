import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {validProject} from './fixture';
import {validateProject, parseProject} from '../src/validate';
import {layoutElements} from '../../video-components/src/layout';

function comparison(count: number) {
  const p = validProject();
  const elements = Array.from({length: count}, (_, i) => ({id: `e${i}`, content: '字'.repeat(40), cue: {text_start: 0, text_end: 1}}));
  return {...p, scenes: [{...p.scenes[0], type: 'comparison_panel', elements,
    animations: elements.map(e => ({target: e.id, effect: 'fade_slide', start_frame: 6, duration_frames: 12}))}]};
}
for (const count of [1, 2, 3, 4, 5, 6]) test(`对比${count}项：Node/Python成对协议一致`, () => {
  const p = comparison(count), valid = count % 2 === 0;
  assert.equal(validateProject(p).length === 0, valid);
  const r = spawnSync('python3', ['packages/video-schema/validate.py', '-'], {input: JSON.stringify(p), encoding: 'utf8'});
  assert.equal(r.status, valid ? 0 : 1, r.stderr);
});
test('对比六项：固定两列同排、安全区与长文字', () => {
  const boxes = layoutElements(parseProject(comparison(6)).scenes[0]);
  assert.deepEqual(boxes.map(b => [b.x,b.y]), [[80,184],[976,184],[80,416],[976,416],[80,648],[976,648]]);
  for (const box of boxes) {
    assert.ok(box.x + box.width <= 1840 && box.y + box.height < 920);
    assert.ok(box.lines.length * box.fontSize * 1.35 <= box.height - 52);
    assert.ok(box.lines.every(line => [...line].length * box.fontSize <= box.width - 52));
  }
  assert.deepEqual(boxes, layoutElements(parseProject(comparison(6)).scenes[0]));
});
test('对比不接受代码或流程边', () => {
  const p = comparison(2);
  assert.ok(validateProject({...p, scenes: [{...p.scenes[0], code: {language: 'python', source: 'x = 1'}}]}).length);
  assert.ok(validateProject({...p, scenes: [{...p.scenes[0], edges: []}]}).length);
});
