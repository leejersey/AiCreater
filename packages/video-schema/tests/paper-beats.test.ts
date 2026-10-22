import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseProject} from '../src/validate';
import type {Scene} from '../src/types';
import {validProject} from './fixture';

test('legacy fade_slide projects stay valid and new beats stay optional', () => {
  assert.doesNotThrow(() => parseProject(validProject()));
  const project = validProject();
  const scene = project.scenes[0] as Scene;
  scene.camera = {x: 1200, y: 640, scale: 1.4};
  scene.vector = {kind: 'gauge'};
  scene.elements[0].entrance = 'draw';
  scene.animations[0].effect = 'draw';
  scene.animations[0].duration_frames = 30;
  scene.animations[1].effect = 'shake';
  assert.equal(parseProject(project).scenes[0].vector?.kind, 'gauge');
  assert.equal(parseProject(project).scenes[0].animations[0].duration_frames, 30);
});

test('animation duration above the scene ceiling is rejected', () => {
  const project = validProject();
  project.scenes[0].animations[0].duration_frames = 8995;
  assert.throws(() => parseProject(project));
});
