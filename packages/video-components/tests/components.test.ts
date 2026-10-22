import assert from 'node:assert/strict';
import {test} from 'node:test';
import {layoutElements, wrapText, flowPath, orderFlowElements} from '../src/layout';
import {entranceAtFrame, leadInText} from '../src/motion';
import {parseProject} from '../../video-schema/src/validate';
import {validProject} from '../../video-schema/tests/fixture';

test('按 Unicode 码点分行，保留文字', () => {
  assert.deepEqual(wrapText('😀规则模型', 3), ['😀规则', '模型']);
  assert.deepEqual(wrapText('第一行\n第二行', 22), ['第一行', '第二行']);
});
for (const type of ['title_reveal', 'card_sequence', 'flow_diagram'] as const) {
  test(`${type} 最大元素数布局在安全区内且互不重叠`, () => {
    const p = validProject();
    p.scenes[0].type = type;
    const scene = parseProject(validProject()).scenes[0];
    scene.type = type;
    scene.elements = Array.from({length: type === 'title_reveal' ? 1 : 6}, (_, i) => ({id: `e${i}`, content: '字'.repeat(type === 'title_reveal' ? 30 : 40), cue: {text_start: 0, text_end: 1}}));
    const boxes = layoutElements(scene);
    assert.equal(boxes.length, scene.elements.length);
    for (const b of boxes) {
      assert.ok(b.x >= 80 && b.y >= 80 && b.x + b.width <= 1840 && b.y + b.height <= 900);
      assert.ok(b.fontSize >= 32);
      assert.ok(b.lines.length * b.fontSize * 1.35 <= b.height - 24);
      assert.ok(b.lines.every(l => [...l].length * b.fontSize <= b.width - 48));
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    }
  });
}
test('纵向流程拓扑排序保持边方向且路由不经过文字区域', () => {
  const scene = parseProject(validProject()).scenes[0];
  scene.type = 'flow_diagram'; scene.edges = [{from: 'b', to: 'a'}];
  assert.deepEqual(orderFlowElements(scene).map(e => e.id), ['b', 'a']);
  const boxes = layoutElements(scene);
  assert.ok(flowPath(boxes[0], boxes[1], 0).startsWith('M '));
  assert.notEqual(flowPath(boxes[0], boxes[1], 0), flowPath(boxes[0], boxes[1], 1));
});
test('入场函数可随机寻帧，开始之前隐藏，完成后固定', () => {
  assert.deepEqual(entranceAtFrame(5, 6, 12), {opacity: 0, translateY: 24});
  assert.deepEqual(entranceAtFrame(18, 6, 12), {opacity: 1, translateY: 0});
  assert.deepEqual(entranceAtFrame(999, 6, 12), entranceAtFrame(18, 6, 12));
  const halfway = entranceAtFrame(12, 6, 12);
  assert.ok(halfway.opacity > 0 && halfway.opacity < 1);
  assert.deepEqual(entranceAtFrame(12, 6, 12), halfway);
  assert.equal(entranceAtFrame(30, 6, 200).opacity, 1);
  assert.ok(entranceAtFrame(18, 6, 200).opacity < 1);
});

test('口播先于第一张卡片时，用当前字幕填上空白', () => {
  const scene = {animations: [{start_frame: 205}], captions: [{text: '知识库不是建完就结束。', start_frame: 6, end_frame: 55}]};
  assert.equal(leadInText(scene, 40), '知识库不是建完就结束。');
  assert.equal(leadInText(scene, 205), undefined);
  assert.equal(leadInText(scene, 2), undefined);
});
