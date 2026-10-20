import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SceneManagement} from '../app/SceneManagement';
import type {Project, Job} from '../lib/editor';
import demo from '../../../examples/demo.json';
import type {VideoProject} from '../../../packages/video-schema/src/types';

const {scenes, ...config} = demo as VideoProject;
const project: Project = {id: 'p', title: 't', revision: 1, source_text: '', config,
  scenes: scenes.map(scene => ({id: scene.id, revision: 1, state: 'ready', scene}))};
function markup(overrides = {}) {
  return renderToStaticMarkup(createElement(SceneManagement, {project, row: project.scenes[0], jobs: [] as Job[],
    dirty: false, busy: false, formEditing: false, onDirty: () => {},
    onCreate: async () => {}, onDuplicate: () => {}, onDelete: () => {}, act: async () => {}, ...overrides}));
}
function disabled(html: string, label: string) {
  const tag = html.match(new RegExp('<button([^>]*)>' + label + '</button>'));
  assert.ok(tag, label); return tag[1].includes('disabled');
}
test('scene management offers manual form and media-preserving copy/delete', () => {
  const html = markup();
  assert.match(html, /新增场景（不计费）/);
  assert.match(html, /场景类型/);assert.match(html, /value="concept"/);assert.match(html, /概念解释/);
  assert.match(html, /展示要点/); assert.match(html, /新增场景口播/);
  assert.match(html, /复用已有音频/); assert.match(html, /保留旧版本/);
  assert.equal(disabled(html, '复制当前场景'), false);
  assert.equal(disabled(html, '删除当前场景'), false);
  assert.match(html, /maxLength="40"/); assert.match(html, /maxLength="4000"/);
});
test('dirty and busy state block structural actions', () => {
  for (const props of [{dirty: true}, {busy: true}]) {
    const html = markup(props);
    assert.equal(disabled(html, '复制当前场景'), true);
    assert.equal(disabled(html, '删除当前场景'), true);
    assert.match(html, /<fieldset disabled=""/);
  }
});
test('last scene and empty project cannot be deleted, max20 blocks copies', () => {
  assert.equal(disabled(markup({project: {...project, scenes: project.scenes.slice(0, 1)}}), '删除当前场景'), true);
  const empty = markup({project: {...project, scenes: []}, row: undefined});
  assert.equal(disabled(empty, '复制当前场景'), true);
  assert.equal(disabled(empty, '删除当前场景'), true);
  const full = markup({project: {...project, scenes: Array.from({length: 20}, (_, i) => ({...project.scenes[0], id: String(i)}))}});
  assert.equal(disabled(full, '复制当前场景'), true);
});
test('initial generation blocks all structure changes; scene jobs block only deletion', () => {
  for (const state of ['queued', 'running']) {
    const generate = markup({jobs: [{job_id: 'j', kind: 'generate', state, progress: 0}]});
    assert.equal(disabled(generate, '复制当前场景'), true);
    assert.equal(disabled(generate, '删除当前场景'), true);
    assert.match(generate, /<fieldset disabled=""/);
    const voice = markup({jobs: [{job_id: 'j', kind: 'voice', state, progress: 0, scene_id: project.scenes[0].id}]});
    assert.equal(disabled(voice, '删除当前场景'), true);
    assert.equal(disabled(voice, '复制当前场景'), false);
  }
  const render = markup({jobs: [{job_id: 'j', kind: 'render', state: 'running', progress: 0}]});
  assert.equal(disabled(render, '删除当前场景'), false);
});
test('new-scene form waits for draft hydration even when it owns dirty input', () => {
  const html = markup({dirty: true, formEditing: true});
  assert.match(html, /正在检查本机草稿/);
  assert.match(html, /<fieldset disabled=""/);
  assert.equal(disabled(html, '复制当前场景'), true);
});
