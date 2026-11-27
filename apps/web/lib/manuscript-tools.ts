// Pure helpers for Markdown storyboard card editing, zero-cost manuscript audit, and creator persona storage.

export type MarkdownSection = {
  id: string;
  title: string;
  narration: string;
  materials: string;
  visual_intent: string;
};

export type AuditIssue = {
  severity: 'warn' | 'info';
  section: string;
  message: string;
};

export type AuditReport = {
  score: number;
  issues: AuditIssue[];
  passed: string[];
};

export type PersonaProfile = {
  id: string;
  name: string;
  audience_call: string;
  tone: string;
  catchphrases: string;
  banned_words: string;
  ending_cta: string;
  sample: string;
};

export type CritiqueIssue = {
  section: string;
  section_id?: string;
  problem: string;
  fix: string;
};

export type CritiqueResult = {
  overall_score: number;
  scores: { hook: number; density: number; pacing: number; visual: number };
  verdict: string;
  issues: CritiqueIssue[];
};

/** Resolve a critique issue to a concrete Markdown section id when possible; null means global rewrite. */
export function resolveCritiqueSectionId(issue: CritiqueIssue, sections: MarkdownSection[] | null): string | null {
  if (!sections || !sections.length) return null;
  if (issue.section_id && sections.some(s => s.id === issue.section_id)) return issue.section_id;
  const label = (issue.section || '').trim();
  const idMatch = /\b(s\d+|[a-zA-Z][a-zA-Z0-9_-]{0,31})\b/.exec(label);
  if (idMatch && sections.some(s => s.id === idMatch[1])) return idMatch[1];
  const numMatch = /第\s*(\d+)\s*[段章节]/.exec(label);
  if (numMatch) {
    const idx = Number(numMatch[1]) - 1;
    if (idx >= 0 && idx < sections.length) return sections[idx].id;
  }
  const byTitle = sections.find(s => label.includes(s.title) || (label.length >= 2 && s.title.includes(label)));
  return byTitle ? byTitle.id : null;
}

export type PublishKit = {
  platform: string;
  platform_label: string;
  titles: string[];
  cover_main: string;
  cover_sub: string;
  summary: string;
  tags: string[];
  pinned_comment: string;
};

export const DEFAULT_PERSONAS: PersonaProfile[] = [
  {
    id: 'preset-architect',
    name: '犀利技术拆解',
    audience_call: '各位',
    tone: '直接、克制、少废话，喜欢先抛反常识结论再拆底层机制，短句为主',
    catchphrases: '说白了、别被表象骗了、核心就卡在这一步',
    banned_words: '综上所述、总而言之、不仅如此、让我们一起揭开',
    ending_cta: '觉得讲透了点个收藏，评论区告诉我下期想拆哪个工具。',
    sample: '',
  },
  {
    id: 'preset-popular',
    name: '温和生活科普',
    audience_call: '朋友们',
    tone: '亲切有画面感，擅长用日常场景类比复杂概念，娓娓道来但节奏不拖沓',
    catchphrases: '打个比方、换句话说、你会发现',
    banned_words: '综上所述、众所周知、总而言之',
    ending_cta: '如果今天这个例子帮你听懂了，点个赞让我知道，我们下期见。',
    sample: '',
  },
  {
    id: 'preset-viral',
    name: '短视频强反转博主',
    audience_call: '家人们',
    tone: '前3秒强反差抓人，快节奏短句，每15秒一个痛点或反转，情绪饱满但不浮夸',
    catchphrases: '千万别踩这个坑、真相恰恰相反、记住这三步',
    banned_words: '首先、其次、综上所述、大家好欢迎来到',
    ending_cta: '先收藏防迷路，评论区扣个1看看有多少人中招了！',
    sample: '',
  },
];

const PERSONA_STORAGE_KEY = 'aicreater:personas:v1:';
const ACTIVE_PERSONA_KEY = 'aicreater:active-persona:v1:';

export function loadPersonas(userId?: string): PersonaProfile[] {
  if (typeof window === 'undefined') return DEFAULT_PERSONAS;
  try {
    const raw = window.localStorage.getItem(PERSONA_STORAGE_KEY + (userId || 'local'));
    if (!raw) return DEFAULT_PERSONAS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_PERSONAS;
    return parsed.filter((p): p is PersonaProfile => !!p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string');
  } catch {
    return DEFAULT_PERSONAS;
  }
}

export function savePersonas(list: PersonaProfile[], userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PERSONA_STORAGE_KEY + (userId || 'local'), JSON.stringify(list.slice(0, 12)));
  } catch { /* ignore quota errors */ }
}

export function loadActivePersonaId(userId?: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(ACTIVE_PERSONA_KEY + (userId || 'local')) || '';
  } catch {
    return '';
  }
}

export function saveActivePersonaId(id: string, userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVE_PERSONA_KEY + (userId || 'local'), id);
  } catch { /* ignore */ }
}

/** Parse strict Markdown manuscript into editable storyboard section cards; returns null if unparseable. */
export function parseMarkdownSections(source: string): MarkdownSection[] | null {
  const normalized = source.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const headerRe = /^## \[([a-zA-Z][a-zA-Z0-9_-]{0,31})\] ([^\n]{1,80})$/;
  const fieldMap: Record<string, keyof Pick<MarkdownSection, 'narration' | 'materials' | 'visual_intent'>> = {
    '### 口播': 'narration',
    '### 画面素材': 'materials',
    '### 画面意图': 'visual_intent',
  };
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;
  let field: 'narration' | 'materials' | 'visual_intent' | null = null;
  let fence: string | null = null;
  const buffers = new Map<MarkdownSection, { narration: string[]; materials: string[]; visual_intent: string[] }>();

  for (const line of normalized.split('\n')) {
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (current && field) buffers.get(current)![field].push(line);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = null;
      }
      continue;
    }
    if (marker) {
      if (field !== 'materials') return null;
      fence = marker[1];
    }
    const hm = headerRe.exec(line);
    if (hm) {
      current = { id: hm[1], title: hm[2], narration: '', materials: '', visual_intent: '' };
      sections.push(current);
      buffers.set(current, { narration: [], materials: [], visual_intent: [] });
      field = null;
    } else if (line in fieldMap) {
      if (!current) return null;
      field = fieldMap[line];
    } else if (line.startsWith('#')) {
      return null;
    } else if (current && field) {
      buffers.get(current)![field].push(line);
    } else if (line.trim()) {
      return null;
    }
  }
  if (fence || !sections.length) return null;
  for (const s of sections) {
    const b = buffers.get(s)!;
    s.narration = b.narration.join('\n').trim();
    s.materials = b.materials.join('\n').trim();
    s.visual_intent = b.visual_intent.join('\n').trim();
  }
  return sections;
}

export function serializeMarkdownSections(sections: MarkdownSection[]): string {
  return sections
    .map(
      s =>
        `## [${s.id}] ${s.title.trim() || '未命名章节'}\n\n` +
        `### 口播\n${s.narration.trim() || '待补充口播。'}\n\n` +
        `### 画面素材\n${s.materials.trim() || '无'}\n\n` +
        `### 画面意图\n${s.visual_intent.trim() || '围绕本段口播展示核心要点。'}`
    )
    .join('\n\n');
}

const AI_CLICHES = ['综上所述', '总而言之', '不仅如此', '值得注意的是', '让我们一起', '接下来让我们', '大家好欢迎来到', '众所周知', '不可否认'];

/** Zero-cost local quality audit before spending budget on TTS and Scene Agent. */
export function auditManuscript(source: string, format: 'markdown' | 'plain'): AuditReport {
  const issues: AuditIssue[] = [];
  const passed: string[] = [];
  if (!source.trim()) return { score: 0, issues: [], passed: [] };

  const sections = format === 'markdown' ? parseMarkdownSections(source) : null;
  const units = sections
    ? sections.map((s, i) => ({ label: `第 ${i + 1} 段（${s.title}）`, text: s.narration, materials: s.materials }))
    : source.split(/\r?\n\s*\r?\n/).filter(Boolean).map((p, i) => ({ label: `第 ${i + 1} 段`, text: p, materials: '' }));

  if (format === 'markdown' && sections === null) {
    issues.push({ severity: 'warn', section: '格式', message: 'Markdown 结构不完整，请确保每段包含 ## [id] 标题、### 口播、### 画面素材、### 画面意图' });
  } else {
    passed.push(`结构校验通过（共 ${units.length} 段）`);
  }

  let clicheCount = 0;
  let longSectionCount = 0;
  let emptyMaterialsCount = 0;
  let longSentenceCount = 0;

  units.forEach(u => {
    const chars = Array.from(u.text.replace(/\s+/g, '')).length;
    const sec = Math.round(chars / 5);
    if (sec > 110) {
      longSectionCount++;
      issues.push({ severity: 'warn', section: u.label, message: `口播预计约 ${sec} 秒，超过 110 秒上限（Agent 单章最多 120 秒），建议拆分或压缩` });
    }
    const foundCliches = AI_CLICHES.filter(c => u.text.includes(c));
    if (foundCliches.length) {
      clicheCount += foundCliches.length;
      issues.push({ severity: 'warn', section: u.label, message: `存在 AI 套话：「${foundCliches.join('、')}」，建议口语化改写` });
    }
    if (format === 'markdown' && sections && (!u.materials || u.materials === '无')) {
      emptyMaterialsCount++;
    }
    const sentences = u.text.split(/[。！？!?\n]+/).map(s => s.trim()).filter(Boolean);
    const overlong = sentences.filter(s => Array.from(s).length > 38);
    if (overlong.length) {
      longSentenceCount += overlong.length;
      issues.push({ severity: 'info', section: u.label, message: `有 ${overlong.length} 句超过 38 字，配音朗读容易喘不过气，建议拆成短句` });
    }
  });

  if (format === 'markdown' && sections && emptyMaterialsCount > 0) {
    issues.push({
      severity: emptyMaterialsCount >= Math.ceil(units.length / 2) ? 'warn' : 'info',
      section: '视觉素材',
      message: `有 ${emptyMaterialsCount}/${units.length} 段的「画面素材」为「无」，建议补充数据/对比项/步骤节点让动画更丰富`,
    });
  } else if (format === 'markdown' && sections) {
    passed.push('所有段落均已配备画面视觉素材');
  }

  if (clicheCount === 0) passed.push('未检测到常见 AI 套话');
  if (longSectionCount === 0) passed.push('所有段落时长均在 Agent 安全区间（≤110秒）');
  if (longSentenceCount === 0) passed.push('口播断句节奏良好，无超长难读句');

  const warnCount = issues.filter(i => i.severity === 'warn').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;
  const score = Math.max(40, Math.min(100, 100 - warnCount * 12 - infoCount * 5));
  return { score, issues, passed };
}

/** Add or remove one evidence id on a section's 「依据：[E…]」 line (the last line of its materials, as the storyboard skill
 *  writes it); ids stay in number order and an empty line is dropped. */
export function toggleCitation(materials: string, id: string): string {
  const lines = materials.replace(/\s+$/, '').split('\n');
  const at = lines.findIndex(l => /^\s*依据[：:]\s*(\[E\d+\]\s*)*$/.test(l));
  const ids = new Set(at >= 0 ? [...lines[at].matchAll(/\[(E\d+)\]/g)].map(m => m[1]) : []);
  if (ids.has(id)) ids.delete(id); else ids.add(id);
  const line = ids.size ? '依据：' + [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map(x => `[${x}]`).join('') : null;
  if (at >= 0) { if (line) lines[at] = line; else lines.splice(at, 1); }
  else if (line) lines.push(line);
  return lines.join('\n').replace(/^\n+/, '');
}

/** The evidence ids a section's materials cite. */
export const citedIds = (materials: string): string[] => [...materials.matchAll(/\[(E\d+)\]/g)].map(m => m[1]);
