// Hotspot research, trending feeds, URL/text import & viral brief types (shared with local drafts).

export type ViralStyle = 'balanced' | 'short_video' | 'deep_article' | 'myth_bust';

export type ResearchItem = {
  id: string;
  title: string;
  url: string;
  platform: string;
  platform_label: string;
  snippet: string;
  content: string;
  published_at?: string;
  score?: number;
  metrics?: string;
  provider?: string;
};

export type ResearchSourceRef = {
  title: string;
  platform_label: string;
  url: string;
};

export type ResearchBrief = {
  facts: string[];
  hooks: string[];
  pain_points: string[];
  pacing: string;
  viral_style: ViralStyle;
  sources: ResearchSourceRef[];
};

export type ResearchStatus = {
  tavily_configured: boolean;
  tikhub_configured: boolean;
  apify_configured: boolean;
};

export const PLATFORM_OPTIONS = [
  { id: 'all', label: '全网热点' },
  { id: 'wechat', label: '公众号' },
  { id: 'xiaohongshu', label: '小红书' },
  { id: 'douyin', label: '抖音' },
  { id: 'x', label: 'X / Twitter' },
  { id: 'bilibili', label: 'B站' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'zhihu', label: '知乎' },
  { id: 'tech', label: '科技媒体' },
] as const;

export const TREND_OPTIONS = [
  { id: 'all', label: '综合热榜' },
  { id: 'bilibili', label: 'B站热门' },
  { id: 'hackernews', label: 'Hacker News' },
  { id: 'github', label: 'GitHub 热门' },
  { id: 'news', label: '今日热点资讯' },
] as const;

export const VIRAL_STYLE_OPTIONS: { id: ViralStyle; label: string; desc: string }[] = [
  { id: 'balanced', label: '均衡爆款', desc: '前 3 秒钩子 + 扎实干货，逻辑清晰' },
  { id: 'short_video', label: '强钩子短视频', desc: '强反差开场、短句高频反转、适合抖音/B站/小红书' },
  { id: 'deep_article', label: '深度公众号拆解', desc: '热点故事切入、底层逻辑与案例层层递进' },
  { id: 'myth_bust', label: '反常识 / 避坑', desc: '先破除主流误区制造冲突，再给可执行结论' },
];

const VIRAL_STYLE_SET = new Set<string>(VIRAL_STYLE_OPTIONS.map(o => o.id));
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;

export function isResearchBrief(v: unknown): v is ResearchBrief {
  const b = v as ResearchBrief;
  return (
    !!b &&
    typeof b === 'object' &&
    Array.isArray(b.facts) &&
    b.facts.length >= 1 &&
    b.facts.length <= 8 &&
    b.facts.every(f => str(f, 200)) &&
    Array.isArray(b.hooks) &&
    b.hooks.length >= 1 &&
    b.hooks.length <= 6 &&
    b.hooks.every(h => str(h, 160)) &&
    Array.isArray(b.pain_points) &&
    b.pain_points.length >= 1 &&
    b.pain_points.length <= 6 &&
    b.pain_points.every(p => str(p, 160)) &&
    str(b.pacing, 400) &&
    b.pacing.trim().length > 0 &&
    VIRAL_STYLE_SET.has(b.viral_style) &&
    Array.isArray(b.sources) &&
    b.sources.length <= 5 &&
    b.sources.every(s => !!s && typeof s === 'object' && str(s.title, 200) && str(s.platform_label, 40) && str(s.url, 500))
  );
}

export function viralStyleLabel(style: ViralStyle): string {
  return VIRAL_STYLE_OPTIONS.find(o => o.id === style)?.label ?? '均衡爆款';
}
