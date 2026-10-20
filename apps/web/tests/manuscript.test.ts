import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {canGenerate, needsOverwriteConfirm, createButtonLabel} from '../lib/manuscript';

test('generate requires title; overwrite when source non-empty', () => {
  assert.equal(canGenerate({title: '', source: ''}), false);
  assert.equal(canGenerate({title: '蒸发', source: ''}), true);
  assert.equal(needsOverwriteConfirm(''), false);
  assert.equal(needsOverwriteConfirm('已有'), true);
  assert.equal(createButtonLabel(false), '确认讲稿并创建草稿');
});

test('new course and list copy no longer imply paste-only', () => {
  const neu = readFileSync(new URL('../app/courses/new/page.tsx', import.meta.url), 'utf8');
  const list = readFileSync(new URL('../app/courses/page.tsx', import.meta.url), 'utf8');
  assert.match(neu, /生成讲稿/);
  assert.match(neu, /确认讲稿并创建草稿/);
  assert.doesNotMatch(neu, /先保存讲稿，再选择AI生成分镜/);
  assert.doesNotMatch(list, /粘贴讲稿/);
  assert.match(list, /生成或填写讲稿/);
});

test('pending local draft keeps restore/discard clickable while form stays locked', () => {
  const neu = readFileSync(new URL('../app/courses/new/page.tsx', import.meta.url), 'utf8');
  assert.match(neu, /DraftNotice \{\.\.\.draft\.notice\} disabled=\{busy\|\|generating\}/);
  assert.doesNotMatch(neu, /DraftNotice \{\.\.\.draft\.notice\} disabled=\{blocked\}/);
  assert.match(neu, /请先上方「恢复到表单」或「丢弃本机草稿」/);
  assert.match(neu, /fieldset disabled=\{blocked\}/);
});
