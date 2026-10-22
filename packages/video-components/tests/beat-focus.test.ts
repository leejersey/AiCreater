import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Scene} from '../../video-schema/src/types';
import {SceneGraphics} from '../src/SceneGraphics';
import {beatCamera, IDENTITY_CAMERA, latestBeat} from '../src/motion';
import {PaletteContext, VisualStyleContext, palettes, visualStyles} from '../src/theme';

function scene(): Scene {
  return {
    id: 's', type: 'card_sequence',
    narration: {text: '先出现甲，再出现乙。', audio_asset_id: 'a', audio_start_frame: 0},
    duration_frames: 120,
    elements: [
      {id: 'a', content: '先出现甲', cue: {text_start: 0, text_end: 4}},
      {id: 'b', content: '再出现乙', cue: {text_start: 5, text_end: 9}},
    ],
    animations: [
      {target: 'a', effect: 'fade_slide', start_frame: 20, duration_frames: 12},
      {target: 'b', effect: 'fade_slide', start_frame: 80, duration_frames: 12},
    ],
    captions: [],
  } as Scene;
}

function html(frame: number) {
  return renderToStaticMarkup(React.createElement(PaletteContext.Provider, {value: palettes.light_teaching},
    React.createElement(VisualStyleContext.Provider, {value: visualStyles.legacy},
      React.createElement(SceneGraphics, {scene: scene(), frame}))));
}

test('latest entered element is the beat, and the camera holds on it', () => {
  const animations = scene().animations;
  assert.equal(latestBeat(animations, 19), undefined);
  assert.equal(latestBeat(animations, 20)?.target, 'a');
  assert.equal(latestBeat(animations, 80)?.target, 'b');
  assert.deepEqual(beatCamera(undefined, undefined, 0), IDENTITY_CAMERA);
  const held = beatCamera({x: 100, y: 200, width: 400, height: 100}, undefined, 10);
  assert.equal(held.scale, 1.12);
  assert.equal(held.x, 300);
  assert.equal(beatCamera({x: 100, y: 200, width: 400, height: 100}, undefined, 40).scale, 1.12);
});

test('a card scene reveals one beat at a time and dims the previous beat', () => {
  assert.doesNotMatch(html(10), /data-beat-focus/);
  const first = html(40);
  assert.match(first, /data-beat-focus="a"/);
  assert.match(first, /data-beat-camera/);
  assert.doesNotMatch(first, /data-beat-past="a"/);
  const next = html(100);
  assert.match(next, /data-beat-focus="b"/);
  assert.match(next, /data-beat-past="a"/);
  assert.match(next, /opacity:0\.35/);
});
