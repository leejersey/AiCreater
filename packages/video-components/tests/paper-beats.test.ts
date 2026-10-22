import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseProject} from '../../video-schema/src/validate';
import type {Scene} from '../../video-schema/src/types';
import {validProject} from '../../video-schema/tests/fixture';
import {SceneGraphics} from '../src/SceneGraphics';
import {Caption} from '../src/captions';
import {PaletteContext, VisualStyleContext, getVisualStyle, paletteFor, palettes} from '../src/theme';
import {blendCamera, cameraTransform, entranceAtFrame, sceneCamera, IDENTITY_CAMERA} from '../src/motion';

function paint(scene: Scene, frame: number) {
  const style = getVisualStyle('paper_slide');
  return renderToStaticMarkup(React.createElement(PaletteContext.Provider, {value: paletteFor(style, 'tech_explainer')},
    React.createElement(VisualStyleContext.Provider, {value: style},
      React.createElement(SceneGraphics, {scene: parseProject({...validProject(), scenes: [scene]}).scenes[0], frame}))));
}

test('paper palette ignores dark themes and subtitles are outlined at the bottom', () => {
  const colors = paletteFor(getVisualStyle('paper_slide'), 'tech_explainer');
  assert.equal(colors.background, '#f6f1e7');
  assert.equal(colors.text, '#1c1915');
  assert.equal(colors.accent, '#c4272f');
  assert.equal(colors.card, '#fff4cc');
  assert.notEqual(colors.background, palettes.tech_explainer.background);
  const html = renderToStaticMarkup(React.createElement(Caption, {text: '底部字幕'}));
  assert.match(html, /data-caption/);
  assert.match(html, /bottom:48px/);
  assert.match(html, /#ffffff/);
  assert.match(html, /#000000/);
  assert.match(html, /transparent/);
  assert.doesNotMatch(html, /background:[^;]*#080e19/);
});

test('paper entrances expose draw, scale, box and shake', () => {
  const scene = validProject().scenes[0] as Scene;
  scene.elements[0].content = '画出规则';
  scene.animations = [
    {target: 'a', effect: 'draw', start_frame: 6, duration_frames: 24},
    {target: 'b', effect: 'shake', start_frame: 6, duration_frames: 24},
  ];
  const drawn = paint(scene, 12);
  assert.match(drawn, /data-effect="draw"/);
  assert.match(drawn, /clip-path:inset/);
  scene.animations[0].effect = 'scale_pop';
  scene.animations[1].effect = 'box';
  const popped = paint(scene, 12);
  assert.match(popped, /data-effect="scale_pop"/);
  assert.match(popped, /scale\(/);
  assert.match(popped, /data-box-reveal="b"/);
  const shake = entranceAtFrame(8, 6, 24, {kind: 'slide', distance: 16}, 'shake');
  assert.notEqual(shake.shiftX, 0);
  const slide = entranceAtFrame(6, 6, 12, {kind: 'slide', distance: 24}, 'fade_slide');
  assert.equal(slide.opacity, 0);
  assert.equal(slide.translateY, 24);
});

test('vector primitives replace cards and cameras blend over ten frames', () => {
  const scene = validProject().scenes[0] as Scene;
  scene.vector = {kind: 'stroke_curve'};
  scene.animations[0].effect = 'draw';
  assert.match(paint(scene, 18), /data-vector="stroke_curve"/);
  assert.match(paint(scene, 18), /data-vector-stroke/);
  scene.vector = {kind: 'gauge'};
  scene.animations[1].effect = 'shake';
  assert.match(paint(scene, 20), /data-vector="gauge"/);
  assert.match(paint(scene, 20), /data-vector-needle/);
  scene.vector = {kind: 'tradeoff_triangle'};
  scene.animations[0].effect = 'box';
  assert.match(paint(scene, 20), /data-vector="tradeoff_triangle"/);
  scene.vector = {kind: 'dot_funnel'};
  scene.animations[0].effect = 'draw';
  const funnel = paint(scene, 8);
  assert.match(funnel, /data-vector="dot_funnel"/);
  assert.match(funnel, /data-vector-dot="kept"/);
  assert.match(funnel, /data-vector-dot="out"/);
  const from = IDENTITY_CAMERA, to = {x: 1200, y: 700, scale: 1.5};
  assert.deepEqual(blendCamera(from, to, 0), from);
  assert.deepEqual(blendCamera(from, to, 10), to);
  const mid = blendCamera(from, to, 5);
  assert.ok(mid.x > from.x && mid.x < to.x);
  assert.ok(mid.scale > 1 && mid.scale < 1.5);
  assert.equal(cameraTransform(sceneCamera({})).transform, 'translate(0px, 0px) scale(1)');
});
