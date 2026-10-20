import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseProject} from '../../video-schema/src/validate';
import {validProject} from '../../video-schema/tests/fixture';
import {coerceSceneMotif, motifLayout, MotifDecor} from '../src/motifs';
import {SceneGraphics} from '../src/SceneGraphics';
import {visualStyles, PaletteContext, VisualStyleContext, palettes} from '../src/theme';

test('coerce drops invalid motifs and keeps valid funnel/means_row', () => {
  const bad = {type: 'code_walkthrough', motif: 'funnel', elements: [{}, {}]};
  coerceSceneMotif(bad);
  assert.equal(bad.motif, undefined);
  const funnel = {
    type: 'card_sequence',
    motif: 'funnel',
    elements: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
  };
  coerceSceneMotif(funnel);
  assert.equal(funnel.motif, 'funnel');
  const means = {type: 'card_sequence', motif: 'means_row', elements: [{}, {}, {}, {}]};
  coerceSceneMotif(means);
  assert.equal(means.motif, undefined);
});

test('motif layouts produce distinct silhouettes for funnel and means_row', () => {
  const layout = visualStyles.legacy.layout;
  const funnelScene = parseProject(validProject()).scenes[0];
  funnelScene.type = 'card_sequence';
  funnelScene.motif = 'funnel';
  funnelScene.elements = ['a', 'b', 'c'].map((id, i) => ({id, content: `层${i}`, cue: {text_start: 0, text_end: 1}}));
  funnelScene.animations = funnelScene.elements.map((e, i) => ({target: e.id, effect: 'fade_slide' as const, start_frame: 6 + i * 12, duration_frames: 12}));
  const funnel = motifLayout(funnelScene, layout)!;
  assert.equal(funnel.length, 3);
  assert.ok(funnel[0].width > funnel[1].width && funnel[1].width > funnel[2].width);

  const meansScene = parseProject(validProject()).scenes[0];
  meansScene.type = 'card_sequence';
  meansScene.motif = 'means_row';
  meansScene.elements = ['a', 'b', 'c'].map((id, i) => ({id, content: `手段${i}`, cue: {text_start: 0, text_end: 1}}));
  const means = motifLayout(meansScene, layout)!;
  assert.equal(new Set(means.map(b => Math.round(b.y))).size, 1);
  assert.ok(means[1].x > means[0].x);
});

test('schematic and dialogue_split render motif decor markers', () => {
  const scene = parseProject(validProject()).scenes[0];
  scene.type = 'card_sequence';
  scene.motif = 'schematic';
  scene.elements = ['a', 'b'].map((id, i) => ({id, content: `点${i}`, cue: {text_start: 0, text_end: 1}}));
  scene.animations = scene.elements.map((e, i) => ({target: e.id, effect: 'fade_slide' as const, start_frame: 6 + i * 12, duration_frames: 12}));
  const boxes = motifLayout(scene, visualStyles.legacy.layout)!;
  const decor = renderToStaticMarkup(React.createElement(PaletteContext.Provider, {value: palettes.light_teaching},
    React.createElement(MotifDecor, {scene, boxes, frame: 12})));
  assert.match(decor, /data-motif="schematic"/);

  scene.motif = 'dialogue_split';
  scene.elements = ['a', 'b', 'c', 'd'].map((id, i) => ({id, content: `话${i}`, cue: {text_start: 0, text_end: 1}}));
  scene.animations = scene.elements.map((e, i) => ({target: e.id, effect: 'fade_slide' as const, start_frame: 6 + i * 12, duration_frames: 12}));
  const html = renderToStaticMarkup(React.createElement(PaletteContext.Provider, {value: palettes.light_teaching},
    React.createElement(VisualStyleContext.Provider, {value: visualStyles.paper_slide},
      React.createElement(SceneGraphics, {scene, frame: 40}))));
  assert.match(html, /data-motif="dialogue_split"/);
});
