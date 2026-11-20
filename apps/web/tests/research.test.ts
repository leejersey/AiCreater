import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isResearchBrief, type ResearchBrief } from '../lib/research';
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
