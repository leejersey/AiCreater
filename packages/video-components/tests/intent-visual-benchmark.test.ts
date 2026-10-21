import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync} from 'node:fs';
import {parseProject} from '../../video-schema/src/validate';

test('intent visual baseline uses three original paragraphs with literal cues and no real audio claims', async () => {
  assert.ok(existsSync('examples/lessons/intent-visual-benchmark.txt'), 'benchmark script must exist');
  const {intentVisualBaseline} = await import('./intent-visual-fixture');
  const project = parseProject(intentVisualBaseline());
  assert.deepEqual(project.scenes.map(s => s.motif ?? 'default'), ['funnel', 'dialogue_split', 'default']);
  assert.equal(project.scenes.length, 3);
  assert.equal(project.scenes.reduce((sum,s) => sum+s.duration_frames,0), 1116);
  for (const scene of project.scenes) {
    for (const element of scene.elements) {
      assert.ok(Array.from(scene.narration.text).slice(element.cue.text_start,element.cue.text_end).join('').includes(element.content));
    }
  }
  assert.ok(project.assets.every(a => a.storage_key.startsWith('benchmark/silent-')));
});
