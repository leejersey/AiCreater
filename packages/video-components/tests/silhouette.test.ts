import assert from 'node:assert/strict';
import {test} from 'node:test';
import {layoutElements} from '../src/layout';
import {parseProject} from '../../video-schema/src/validate';
import {validProject} from '../../video-schema/tests/fixture';
import type {Element, Scene} from '../../video-schema/src/types';

function baseScene(): Scene {
  return parseProject(validProject()).scenes[0];
}

function element(id: string, content: string, extra: Partial<Element> = {}): Element {
  return {id, content, cue: {text_start: 2, text_end: 4}, ...extra};
}

function centers(boxes: {x: number; y: number; width: number; height: number}[]) {
  return boxes.map(b => ({cx: b.x + b.width / 2, cy: b.y + b.height / 2}));
}

function uniqueRounded(values: number[], tol = 8) {
  const rounded: number[] = [];
  for (const v of values) {
    if (!rounded.some(r => Math.abs(r - v) <= tol)) rounded.push(v);
  }
  return rounded.length;
}

test('soft-template silhouette signatures stay mutually distinct', () => {
  const title = baseScene();
  title.type = 'title_reveal';
  title.elements = [element('t', '开场提问')];
  title.edges = undefined;
  const titleBoxes = layoutElements(title);
  assert.equal(titleBoxes.length, 1);
  assert.ok(titleBoxes[0].width >= 1400 && titleBoxes[0].height >= 280);

  const concept = baseScene();
  concept.type = 'concept';
  concept.elements = [
    element('d', '惯性是物体保持原有运动状态的性质', {concept_role: 'definition'}),
    element('f1', '物体都有惯性', {concept_role: 'feature'}),
    element('f2', '刹车时身体前倾', {concept_role: 'feature'}),
  ];
  concept.edges = undefined;
  const conceptBoxes = layoutElements(concept);
  const def = conceptBoxes.find(b => b.id === 'd')!;
  assert.ok(def.width >= 1200);
  assert.ok(conceptBoxes.filter(b => b.id !== 'd').every(b => b.y > def.y && b.fontSize < def.fontSize));

  const flow = baseScene();
  flow.type = 'flow_diagram';
  flow.elements = ['a', 'b', 'c', 'd'].map((id, i) => element(id, `步骤${i + 1}`));
  flow.edges = [{from: 'a', to: 'b'}, {from: 'b', to: 'c'}, {from: 'c', to: 'd'}];
  const flowBoxes = layoutElements(flow);
  const flowC = centers(flowBoxes);
  assert.equal(uniqueRounded(flowC.map(c => c.cx)), 1);
  for (let i = 1; i < flowC.length; i++) assert.ok(flowC[i].cy > flowC[i - 1].cy);

  const flowGraphic = baseScene();
  flowGraphic.type = 'flow_diagram';
  flowGraphic.elements = ['a', 'b', 'c', 'd'].map((id, i) => element(id, `步骤${i + 1}`, {step: i + 1, icon: 'idea'}));
  flowGraphic.edges = [{from: 'a', to: 'b'}, {from: 'b', to: 'c'}, {from: 'c', to: 'd'}];
  const flowGraphicBoxes = layoutElements(flowGraphic);
  assert.equal(uniqueRounded(centers(flowGraphicBoxes).map(c => c.cx)), 1, 'graphic flow must stay single-column');

  const comparison = baseScene();
  comparison.type = 'comparison_panel';
  comparison.elements = ['l1', 'r1', 'l2', 'r2'].map((id, i) => element(id, `对比${i}`));
  comparison.edges = undefined;
  const comparisonBoxes = layoutElements(comparison);
  assert.equal(uniqueRounded(centers(comparisonBoxes).map(c => c.cx)), 2);

  const card = baseScene();
  card.type = 'card_sequence';
  card.elements = ['a', 'b', 'c'].map((id, i) => element(id, `要点${i}`));
  card.edges = undefined;
  const cardBoxes = layoutElements(card);
  assert.equal(uniqueRounded(centers(cardBoxes).map(c => c.cy)), 1);
  for (let i = 1; i < cardBoxes.length; i++) assert.ok(cardBoxes[i].x > cardBoxes[i - 1].x);

  const cardWrap = baseScene();
  cardWrap.type = 'card_sequence';
  cardWrap.elements = ['a', 'b', 'c', 'd'].map((id, i) => element(id, `要点${i}`));
  cardWrap.edges = undefined;
  const wrapBoxes = layoutElements(cardWrap);
  assert.ok(uniqueRounded(centers(wrapBoxes).map(c => c.cy)) <= 2);

  const signatures = [
    ['title', uniqueRounded(centers(titleBoxes).map(c => c.cx)), uniqueRounded(centers(titleBoxes).map(c => c.cy))],
    ['concept', uniqueRounded(centers(conceptBoxes).map(c => c.cx)), uniqueRounded(centers(conceptBoxes).map(c => c.cy))],
    ['flow', uniqueRounded(centers(flowBoxes).map(c => c.cx)), uniqueRounded(centers(flowBoxes).map(c => c.cy))],
    ['comparison', uniqueRounded(centers(comparisonBoxes).map(c => c.cx)), uniqueRounded(centers(comparisonBoxes).map(c => c.cy))],
    ['card', uniqueRounded(centers(cardBoxes).map(c => c.cx)), uniqueRounded(centers(cardBoxes).map(c => c.cy))],
  ];
  const keys = new Set(signatures.map(([, cx, cy]) => `${cx}:${cy}`));
  assert.equal(keys.size, signatures.length, `silhouette collisions: ${JSON.stringify(signatures)}`);
});
