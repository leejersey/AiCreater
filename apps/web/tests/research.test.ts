import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isResearchBrief, replaceFirstOpening, type ResearchBrief } from '../lib/research';
import { auditManuscript, parseMarkdownSections, resolveCritiqueSectionId, serializeMarkdownSections } from '../lib/manuscript-tools';
import { readDraft, writeDraft, type DraftScope } from '../lib/drafts';

class MemoryStorage {
  items = new Map<string, string>();
  get length() { return this.items.size; }
  key(i: number) { return [...this.items.keys()][i] ?? null; }
  getItem(k: string) { return this.items.get(k) ?? null; }
  setItem(k: string, v: string) { this.items.set(k, v); }
  removeItem(k: string) { this.items.delete(k); }
}

const sampleBrief: ResearchBrief = {
  facts: ['混合检索比纯向量召回稳定（公众号）', '切分策略决定上下文质量（X）'],
  hooks: ['为什么你的 RAG 总是答非所问？'],
  pain_points: ['文档切分破坏语义'],
  pacing: '痛点开场 → 对比原理 → 实操避坑',
  viral_style: 'short_video',
  sources: [{ title: '一文搞懂 RAG', platform_label: '公众号', url: 'https://mp.weixin.qq.com/s/test' }],
};

test('research brief validates shape and survives local course draft roundtrip', () => {
  assert.equal(isResearchBrief(sampleBrief), true);
  assert.equal(isResearchBrief({ ...sampleBrief, viral_style: 'unknown' }), false);
  assert.equal(isResearchBrief({ ...sampleBrief, facts: [] }), false);

  const store = new MemoryStorage();
  const scope: DraftScope & { kind: 'course' } = { kind: 'course', projectId: '', sceneId: '', label: '新建课程' };
  const raw = writeDraft(store, scope, 0, { title: 'RAG 避坑', source: '', research: sampleBrief }, null);
  const loaded = readDraft(raw, scope);
  assert.deepEqual(loaded?.data.research, sampleBrief);
});

test('replaceFirstOpening swaps only the first section narration in markdown and first paragraph in plain', () => {
  const md = '## [s1] 开场\n\n### 口播\n旧开场。\n\n### 画面素材\n对比图\n\n### 画面意图\n显示对比。';
  const nextMd = replaceFirstOpening(md, '新钩子开场！', 'markdown');
  assert.match(nextMd, /### 口播\n新钩子开场！\n\n### 画面素材\n对比图/);
  assert.equal(replaceFirstOpening('第一段。\n\n第二段。', '新第一段！', 'plain'), '新第一段！\n\n第二段。');
});

test('storyboard sections roundtrip and zero-cost audit flags cliches and empty materials', () => {
  const md = '## [s1] 痛点\n\n### 口播\n综上所述，RAG 经常答错。\n\n### 画面素材\n无\n\n### 画面意图\n展示痛点卡片。';
  const sections = parseMarkdownSections(md);
  assert.equal(sections?.length, 1);
  assert.equal(sections?.[0].id, 's1');
  assert.equal(serializeMarkdownSections(sections!), md);
  const report = auditManuscript(md, 'markdown');
  assert.ok(report.issues.some(i => i.message.includes('综上所述')));
  assert.ok(report.issues.some(i => i.message.includes('画面素材')));
  assert.equal(resolveCritiqueSectionId({ section: '第1段', problem: 'p', fix: 'f' }, sections), 's1');
  assert.equal(resolveCritiqueSectionId({ section: '全局', problem: 'p', fix: 'f' }, sections), null);
});
