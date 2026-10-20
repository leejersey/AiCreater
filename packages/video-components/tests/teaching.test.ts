import assert from 'node:assert/strict';
import {test} from 'node:test';
import {codeProject} from '../../video-schema/tests/fixture';
import {parseProject} from '../../video-schema/src/validate';
import {activeStepAtFrame} from '../src/CodeLesson';
import {layoutElements} from '../src/layout';

test('教学状态可随机寻帧，步骤持续到下一步而非闪过', () => {
  const scene = parseProject(codeProject()).scenes[0];
  assert.equal(activeStepAtFrame(scene, 5), undefined);
  assert.equal(activeStepAtFrame(scene, 6)?.id, 'a');
  assert.equal(activeStepAtFrame(scene, 35)?.id, 'a');
  assert.equal(activeStepAtFrame(scene, 36)?.id, 'b');
  assert.equal(activeStepAtFrame(scene, 70)?.output, '0');
  assert.equal(activeStepAtFrame(scene, 6)?.id, 'a');
  assert.deepEqual(layoutElements(scene), []);
});
