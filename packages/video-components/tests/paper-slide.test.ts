import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseProject} from '../../video-schema/src/validate';
import {validProject} from '../../video-schema/tests/fixture';
import {SceneGraphics} from '../src/SceneGraphics';
import {GraphicContent} from '../src/GraphicContent';
import {layoutElements} from '../src/layout';
import {PaletteContext, VisualStyleContext, getVisualStyle, isPaperSlide, validateVisualStyle, visualStyles, palettes} from '../src/theme';

test('paper_slide is a registered style distinct from whiteboard/minimal', () => {
  assert.ok(Object.hasOwn(visualStyles, 'paper_slide'));
  assert.equal(getVisualStyle('paper_slide').label, '纸质幻灯');
  assert.ok(isPaperSlide(getVisualStyle('paper_slide')));
  assert.equal(isPaperSlide(getVisualStyle('whiteboard')), false);
  assert.notDeepEqual(getVisualStyle('paper_slide'), getVisualStyle('minimal'));
});

test('paper_slide named preset and frozen snapshot both validate', () => {
  const project = parseProject(validProject());
  assert.doesNotThrow(() => validateVisualStyle(project, 'paper_slide'));
  const snapshot = {id: 'paper_slide' as const, tokens: structuredClone(visualStyles.paper_slide)};
  assert.equal(validateVisualStyle(project, undefined, snapshot).label, '纸质幻灯');
});

test('paper_slide cards expose sticky/stamp chrome and yellow highlights', () => {
  const scene = parseProject(validProject()).scenes[0];
  scene.type = 'card_sequence';
  scene.elements = [
    {id: 'a', content: '打开设置面板', cue: {text_start: 0, text_end: 6}, icon: 'search', highlight: {text_start: 2, text_end: 4}, source_label: '规则'},
    {id: 'b', content: '命中后给出意图', cue: {text_start: 0, text_end: 7}, panel_style: 'conclusion'},
  ];
  scene.animations = scene.elements.map((e, i) => ({target: e.id, effect: 'fade_slide' as const, start_frame: 6 + i * 12, duration_frames: 12}));
  const style = getVisualStyle('paper_slide');
  const html = renderToStaticMarkup(React.createElement(PaletteContext.Provider, {value: palettes.light_teaching},
    React.createElement(VisualStyleContext.Provider, {value: style},
      React.createElement(SceneGraphics, {scene, frame: 60}))));
  assert.match(html, /#fff4cc/);
  assert.match(html, /data-sticky/);
  assert.match(html, /data-tape/);
  assert.match(html, /data-stamp="规则"/);
  const box = layoutElements(scene, style.layout)[0];
  const graphic = renderToStaticMarkup(React.createElement(PaletteContext.Provider, {value: palettes.light_teaching},
    React.createElement(VisualStyleContext.Provider, {value: style},
      React.createElement(GraphicContent, {element: scene.elements[0], box}))));
  assert.match(graphic, /data-paper-highlight/);
  assert.match(graphic, /#ffe566/);
});
