import {test} from 'node:test';
import assert from 'node:assert/strict';
import {outlinePlaceholder, isTeachingStyle, type TeachingStyle} from '../lib/teaching-style';

test('outlinePlaceholder differs by style', () => {
  assert.match(outlinePlaceholder('technical'), /embedding/);
  assert.match(outlinePlaceholder('popular'), /生活例子/);
  assert.notEqual(outlinePlaceholder('popular'), outlinePlaceholder('technical'));
});

test('isTeachingStyle accepts only popular and technical', () => {
  const popular: unknown = 'popular';
  const technical: unknown = 'technical';
  assert.ok(isTeachingStyle(popular));
  assert.ok(isTeachingStyle(technical));
  if (isTeachingStyle(popular)) {
    const _: TeachingStyle = popular;
    assert.equal(_, 'popular');
  }
  for (const bad of ['nope', '', 'marketing', null, undefined, 1, true]) {
    assert.equal(isTeachingStyle(bad), false);
  }
});
