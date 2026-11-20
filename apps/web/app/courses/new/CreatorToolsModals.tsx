'use client';
import { useState } from 'react';
import { request } from '../../../lib/editor';
import {
  DEFAULT_PERSONAS,
  resolveCritiqueSectionId,
  type AuditReport,
  type CritiqueIssue,
  type CritiqueResult,
  type MarkdownSection,
  type PersonaProfile,
  type PublishKit,
} from '../../../lib/manuscript-tools';
import { Modal } from '../../Modal';
import { useToast } from '../../ToastContext';
import { AlertCircle, Check, Plus, Sparkles, Spinner, Trash2 } from '../../Icons';

export function PersonaModal({
  open,
  personas,
  activeId,
  onClose,
  onSelect,
  onSaveList,
}: {
  open: boolean;
  personas: PersonaProfile[];
  activeId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onSaveList: (next: PersonaProfile[]) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<PersonaProfile | null>(null);

  function startNew() {
    setEditing({
      id: 'custom-' + Date.now().toString(36),
      name: '',
      audience_call: '',
      tone: '',
      catchphrases: '',
      banned_words: '综上所述、总而言之、不仅如此',
      ending_cta: '',
      sample: '',
    });
  }

  function saveEditing() {
    if (!editing || !editing.name.trim()) return;
    const clean = { ...editing, name: editing.name.trim() };
    const exists = personas.some(p => p.id === clean.id);
    const next = exists ? personas.map(p => (p.id === clean.id ? clean : p)) : [...personas, clean];
    onSaveList(next);
    onSelect(clean.id);
    setEditing(null);
    toast(`已保存并启用人设「${clean.name}」`, { variant: 'success' });
  }

  function removePersona(id: string) {
    const next = personas.filter(p => p.id !== id);
    onSaveList(next.length ? next : DEFAULT_PERSONAS);
    if (activeId === id) onSelect('');
    toast('已删除该人设卡', { variant: 'info' });
  }

  return (
    <Modal
      open={open}
      onClose={() => { setEditing(null); onClose(); }}
      title="博主口吻 / 人设档案"
      maxWidth="740px"
      footer={
        editing ? (
          <>
            <button type="button" className="btn-modal-cancel" onClick={() => setEditing(null)}>返回列表</button>
            <button type="button" className="btn-modal-confirm primary" disabled={!editing.name.trim()} onClick={saveEditing}>保存并启用</button>
          </>
        ) : (
          <div className="research-modal-footer">
            <button type="button" className="research-mini-btn" onClick={startNew}><Plus size={13} /> 新建自定义人设</button>
            <div className="research-footer-right">
              {activeId && <button type="button" className="btn-modal-cancel" onClick={() => { onSelect(''); toast('已切回默认风格', { variant: 'info' }); }}>取消选用人设</button>}
              <button type="button" className="btn-modal-confirm primary" onClick={onClose}>完成</button>
            </div>
          </div>
        )
      }
    >
      {editing ? (
        <div className="more-settings-modal-body">
          <div className="more-settings-row">
            <label>人设名称 *
              <input maxLength={40} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="例如：毒舌AI架构师 / 温和科普学姐" />
            </label>
            <label>对观众称呼（可选）
              <input maxLength={24} value={editing.audience_call} onChange={e => setEditing({ ...editing, audience_call: e.target.value })} placeholder="例如：各位、朋友们、老铁" />
            </label>
          </div>
          <label>语气与表达风格
            <textarea rows={2} maxLength={160} value={editing.tone} onChange={e => setEditing({ ...editing, tone: e.target.value })} placeholder="例如：直接犀利、少废话，喜欢用生活场景做反差对比，短句为主" />
          </label>
          <div className="more-settings-row">
            <label>常用口头禅（可选）
              <input maxLength={120} value={editing.catchphrases} onChange={e => setEditing({ ...editing, catchphrases: e.target.value })} placeholder="例如：说白了、核心就卡在这一步" />
            </label>
            <label>禁用词（可选）
              <input maxLength={120} value={editing.banned_words} onChange={e => setEditing({ ...editing, banned_words: e.target.value })} placeholder="例如：综上所述、总而言之" />
            </label>
          </div>
          <label>结尾固定引导语（可选）
            <input maxLength={160} value={editing.ending_cta} onChange={e => setEditing({ ...editing, ending_cta: e.target.value })} placeholder="例如：觉得讲透了点个收藏，评论区告诉我下期想看什么" />
          </label>
          <label>历史样稿片段（可选，最多 600 字；AI 只学语感与断句，不抄内容）
            <textarea rows={4} maxLength={600} value={editing.sample} onChange={e => setEditing({ ...editing, sample: e.target.value })} placeholder="粘贴一段你最满意的过往口播稿…" />
          </label>
        </div>
      ) : (
        <div className="persona-list">
          <p className="hint" style={{ margin: '0 0 8px' }}>选用后，发散方向、大纲、成稿、开场钩子、去 AI 味和单段重写都会统一保持该博主口吻（保存在本机浏览器）。</p>
          {personas.map(p => {
            const active = p.id === activeId;
            return (
              <div key={p.id} className={`research-item${active ? ' selected' : ''}`}>
                <div className="research-item-head">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b className="research-item-title">{p.name}</b>
                    {p.audience_call && <span className="hint" style={{ marginLeft: '8px' }}>称呼：{p.audience_call}</span>}
                  </div>
                  <div className="research-item-actions">
                    <button type="button" className="research-mini-btn" onClick={() => setEditing(p)}>编辑</button>
                    <button type="button" className="research-mini-btn" aria-label="删除" onClick={() => removePersona(p.id)}><Trash2 size={12} /></button>
                    <button type="button" className={`research-mini-btn${active ? ' active' : ''}`} onClick={() => { onSelect(active ? '' : p.id); toast(active ? '已取消选用人设' : `已启用人设「${p.name}」`, { variant: 'success' }); }}>
                      {active ? <><Check size={12} /> 已启用</> : '选用'}
                    </button>
                  </div>
                </div>
                {p.tone && <p className="research-snippet">风格：{p.tone}</p>}
                {p.catchphrases && <p className="research-snippet">口头禅：{p.catchphrases}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export function CritiqueModal({
  open,
  title,
  source,
  format,
  sections,
  audit,
  disabled,
  onRewriteSection,
  onGlobalFix,
  onClose,
}: {
  open: boolean;
  title: string;
  source: string;
  format: 'markdown' | 'plain';
  sections: MarkdownSection[] | null;
  audit: AuditReport;
  disabled: boolean;
  onRewriteSection: (sectionId: string, instruction: string) => Promise<boolean>;
  onGlobalFix: (instruction: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CritiqueResult | null>(null);
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  const [appliedSet, setAppliedSet] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  async function runAiCritique() {
    if (!source.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await request<{ critique: CritiqueResult }>('/api/manuscripts/critique', {
        title,
        source_text: source,
        manuscript_format: format,
      });
      setResult(res.critique);
      setAppliedSet(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 审稿失败');
    } finally {
      setLoading(false);
    }
  }

  async function applyIssue(issue: CritiqueIssue, idx: number) {
    if (applyingIndex !== null || disabled) return;
    setApplyingIndex(idx);
    setError('');
    const instruction = `针对问题「${issue.problem}」，请按建议修改：${issue.fix}`.slice(0, 300);
    const targetSectionId = format === 'markdown' ? resolveCritiqueSectionId(issue, sections) : null;
    try {
      const ok = targetSectionId
        ? await onRewriteSection(targetSectionId, instruction)
        : await onGlobalFix(instruction);
      if (ok) {
        setAppliedSet(prev => new Set(prev).add(idx));
      }
    } finally {
      setApplyingIndex(null);
    }
  }

  const dims = [
    { key: 'hook', label: '前 3 秒钩子' },
    { key: 'density', label: '信息密度' },
    { key: 'pacing', label: '口播节奏' },
    { key: 'visual', label: '画面可画性' },
  ] as const;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`文稿体检（本地评分 ${audit.score} 分）`}
      maxWidth="760px"
      footer={<button type="button" className="btn-modal-confirm primary" onClick={onClose}>关闭</button>}
    >
      <div className="research-pane">
        <div className="audit-section">
          <h4>零成本实时体检</h4>
          {audit.passed.length > 0 && (
            <div className="audit-passed">
              {audit.passed.map(p => <span key={p} className="studio-badge badge-ok"><Check size={11} /> {p}</span>)}
            </div>
          )}
          {audit.issues.length === 0 ? (
            <p className="hint">本地硬指标全部通过，可以直接配音或再跑一次 AI 毒舌审稿。</p>
          ) : (
            <ul className="audit-list">
              {audit.issues.map((it, i) => (
                <li key={i} className={`audit-item audit-${it.severity}`}>
                  <b>[{it.section}]</b> {it.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="audit-section">
          <div className="idea-toolbar">
            <h4 style={{ margin: 0 }}>AI 毒舌总编审稿（短调用）</h4>
            <button type="button" className="btn-accent research-mini-btn" disabled={loading || !source.trim()} onClick={() => void runAiCritique()}>
              {loading ? <><Spinner size={12} className="icon-spin" /> 审稿中…</> : <><Sparkles size={12} /> {result ? '重新审稿' : '开始 AI 毒舌审稿'}</>}
            </button>
          </div>
          {error && <p role="alert" className="error" style={{ margin: 0 }}><AlertCircle size={14} /> {error}</p>}
          {result && (
            <div className="critique-box">
              <div className="critique-head">
                <span className="critique-score">{result.overall_score}<em>/100</em></span>
                <p>{result.verdict}</p>
              </div>
              <div className="critique-bars">
                {dims.map(d => (
                  <div key={d.key} className="critique-bar-row">
                    <span>{d.label}</span>
                    <div className="vw-progress-track"><div className="vw-progress-fill" style={{ width: `${result.scores[d.key]}%` }} /></div>
                    <b>{result.scores[d.key]}</b>
                  </div>
                ))}
              </div>
              <div className="critique-issues">
                {result.issues.map((it, i) => {
                  const targetId = format === 'markdown' ? resolveCritiqueSectionId(it, sections) : null;
                  const done = appliedSet.has(i);
                  const busyThis = applyingIndex === i;
                  return (
                    <div key={i} className={`research-item${done ? ' selected' : ''}`}>
                      <div className="research-item-head">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <b>[{it.section}] {it.problem}</b>
                          <p className="research-snippet" style={{ marginTop: '4px' }}>改法建议：{it.fix}</p>
                        </div>
                        <button
                          type="button"
                          className={`research-mini-btn${done ? ' active' : ''}`}
                          disabled={disabled || applyingIndex !== null}
                          onClick={() => void applyIssue(it, i)}
                        >
                          {busyThis ? (
                            <><Spinner size={12} className="icon-spin" /> 改写中…</>
                          ) : done ? (
                            <><Check size={12} /> 已采纳</>
                          ) : (
                            <><Sparkles size={12} /> {targetId ? `一键改写 [${targetId}]` : '一键全局改写'}</>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function PublishKitModal({
  open,
  title,
  source,
  onClose,
}: {
  open: boolean;
  title: string;
  source: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [platform, setPlatform] = useState<'general' | 'douyin' | 'xiaohongshu' | 'bilibili' | 'wechat'>('general');
  const [loading, setLoading] = useState(false);
  const [kit, setKit] = useState<PublishKit | null>(null);
  const [error, setError] = useState('');

  async function generate(plat = platform) {
    if (!source.trim() || loading) return;
    setPlatform(plat);
    setLoading(true);
    setError('');
    try {
      const res = await request<{ kit: PublishKit }>('/api/manuscripts/publish-kit', {
        title,
        source_text: source,
        platform: plat,
      });
      setKit(res.kit);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成发布套件失败');
    } finally {
      setLoading(false);
    }
  }

  function copyText(text: string, label: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text).then(() => toast(`已复制${label}`, { variant: 'success', duration: 1800 }));
    }
  }

  const plats = [
    { id: 'general', label: '全平台通用' },
    { id: 'douyin', label: '抖音 / 快手' },
    { id: 'xiaohongshu', label: '小红书' },
    { id: 'bilibili', label: 'B站 / YouTube' },
    { id: 'wechat', label: '公众号 / 视频号' },
  ] as const;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="多平台发布套件（标题 · 封面 · 简介 · 标签 · 置顶评论）"
      maxWidth="780px"
      footer={<button type="button" className="btn-modal-confirm primary" onClick={onClose}>关闭</button>}
    >
      <div className="research-pane">
        <div className="research-platform-bar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {plats.map(p => (
              <button key={p.id} type="button" className={`research-pill${platform === p.id ? ' active' : ''}`} onClick={() => setPlatform(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn-accent research-mini-btn" disabled={loading || !source.trim()} onClick={() => void generate(platform)}>
            {loading ? <><Spinner size={12} className="icon-spin" /> 生成中…</> : <><Sparkles size={12} /> 一键生成发布套件</>}
          </button>
        </div>

        {error && <p role="alert" className="error" style={{ margin: 0 }}><AlertCircle size={14} /> {error}</p>}

        {!kit && !loading && (
          <p className="hint" style={{ textAlign: 'center', padding: '24px 0' }}>
            选择目标平台后点击「一键生成发布套件」，自动产出 5 个爆款标题、封面主副大字、简介、话题标签与置顶引导评论。
          </p>
        )}

        {kit && (
          <div className="publish-kit-body">
            <div className="research-item">
              <div className="idea-toolbar">
                <b>封面大字</b>
                <button type="button" className="research-mini-btn" onClick={() => copyText(`${kit.cover_main}\n${kit.cover_sub}`, '封面大字')}>复制</button>
              </div>
              <div className="publish-cover-preview">
                <strong>{kit.cover_main}</strong>
                {kit.cover_sub && <span>{kit.cover_sub}</span>}
              </div>
            </div>

            <div className="research-item">
              <b>5 个高点击标题候选</b>
              <div className="publish-titles">
                {kit.titles.map((t, i) => (
                  <div key={i} className="publish-title-row">
                    <span>{i + 1}. {t}</span>
                    <button type="button" className="research-mini-btn" onClick={() => copyText(t, '标题')}>复制</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="research-item">
              <div className="idea-toolbar">
                <b>视频简介 / 正文摘要</b>
                <button type="button" className="research-mini-btn" onClick={() => copyText(kit.summary, '简介')}>复制</button>
              </div>
              <p className="research-snippet" style={{ whiteSpace: 'pre-wrap' }}>{kit.summary}</p>
            </div>

            <div className="research-item">
              <div className="idea-toolbar">
                <b>话题标签</b>
                <button type="button" className="research-mini-btn" onClick={() => copyText(kit.tags.map(t => `#${t}`).join(' '), '话题标签')}>复制全部</button>
              </div>
              <div className="research-platform-bar">
                {kit.tags.map(t => <span key={t} className="research-plat-tag">#{t}</span>)}
              </div>
            </div>

            <div className="research-item">
              <div className="idea-toolbar">
                <b>置顶引导评论</b>
                <button type="button" className="research-mini-btn" onClick={() => copyText(kit.pinned_comment, '置顶评论')}>复制</button>
              </div>
              <p className="research-snippet">{kit.pinned_comment}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ArticleConvertModal({
  open,
  teachingStyle,
  manuscriptFormat,
  persona,
  disabled,
  onClose,
  onConverted,
}: {
  open: boolean;
  teachingStyle: 'popular' | 'technical';
  manuscriptFormat: 'markdown' | 'plain';
  persona?: Record<string, string>;
  disabled: boolean;
  onClose: () => void;
  onConverted: (result: { title: string; text: string }) => void;
}) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [title, setTitle] = useState('');
  const [articleText, setArticleText] = useState('');
  const [durationHint, setDurationHint] = useState('3分钟');
  const [focus, setFocus] = useState('');
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');

  async function extractFromUrl() {
    const target = url.trim();
    if (!target || extracting) return;
    setExtracting(true);
    setError('');
    try {
      const res = await request<{ item: { title: string; content: string } }>('/api/research/extract', { url: target });
      if (res.item?.content) {
        if (!title.trim() && res.item.title) setTitle(res.item.title.slice(0, 80));
        setArticleText(res.item.content.slice(0, 25000));
        setUrl('');
        toast('已提取文章正文，确认参数后点击转换', { variant: 'success' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '链接提取失败，建议直接复制长文粘贴到下方。');
    } finally {
      setExtracting(false);
    }
  }

  function handleFile(file: File | null) {
    if (!file) return;
    if (file.size > 512 * 1024) {
      setError('文件过大（超过 512KB），请节选核心内容粘贴。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setArticleText(text.slice(0, 25000));
      if (!title.trim()) setTitle(file.name.replace(/\.(md|txt)$/i, '').slice(0, 80));
      setError('');
      toast(`已载入文件「${file.name}」`, { variant: 'success' });
    };
    reader.onerror = () => setError('读取文件失败');
    reader.readAsText(file, 'utf-8');
  }

  async function runConvert() {
    if (articleText.trim().length < 20 || converting || disabled) return;
    setConverting(true);
    setError('');
    try {
      const res = await request<{ title: string; text: string }>('/api/manuscripts/from-article', {
        article_text: articleText.trim(),
        title: title.trim(),
        duration_hint: durationHint,
        teaching_style: teachingStyle,
        manuscript_format: manuscriptFormat,
        focus: focus.trim(),
        ...(persona ? { persona } : {}),
      });
      onConverted(res);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '转换失败，请重试');
    } finally {
      setConverting(false);
    }
  }

  const durations = ['1分钟', '3分钟', '5分钟', '8分钟'];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="长文 / 笔记一键转爆款视频脚本"
      maxWidth="780px"
      footer={
        <div className="research-modal-footer">
          <span className="hint">已输入 {Array.from(articleText).length} / 25000 字 · 忠于原文事实不编造</span>
          <div className="research-footer-right">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>取消</button>
            <button
              type="button"
              className="btn-modal-confirm primary"
              disabled={disabled || converting || articleText.trim().length < 20}
              onClick={() => void runConvert()}
            >
              {converting ? <><Spinner size={13} className="icon-spin" /> 正在提炼转脚本…</> : <><Sparkles size={13} /> 一键转为视频脚本</>}
            </button>
          </div>
        </div>
      }
    >
      <div className="research-pane">
        {error && <p role="alert" className="error" style={{ margin: 0 }}><AlertCircle size={14} /> {error}</p>}

        <div className="research-import-box">
          <div className="research-search-bar">
            <input
              maxLength={500}
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="可选：粘贴公众号 / 博客 / 知乎 / B站 / YouTube 链接一键提取正文"
            />
            <button type="button" className="research-mini-btn active" disabled={extracting || !url.trim()} onClick={() => void extractFromUrl()}>
              {extracting ? <Spinner size={12} className="icon-spin" /> : <Plus size={12} />} 提取正文
            </button>
            <label className="research-mini-btn" style={{ cursor: 'pointer', margin: 0 }}>
              导入 .md/.txt
              <input type="file" accept=".md,.txt,text/plain,text/markdown" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>

        <div className="more-settings-row">
          <label>视频标题（可选，留空自动提炼）
            <input maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：3分钟看懂 MCP 协议" />
          </label>
          <label>目标时长
            <div className="research-platform-bar" style={{ marginTop: '6px' }}>
              {durations.map(d => (
                <button key={d} type="button" className={`research-pill${durationHint === d ? ' active' : ''}`} onClick={() => setDurationHint(d)}>
                  {d}
                </button>
              ))}
            </div>
          </label>
        </div>

        <label>原文内容 *（粘贴公众号长文、技术文档、学习笔记等，20–25000 字）
          <textarea
            rows={8}
            maxLength={25000}
            value={articleText}
            onChange={e => setArticleText(e.target.value)}
            placeholder="把你的长文、读书笔记或公众号文章粘贴到这里，AI 会提炼核心干货、去书面腔、重构前 3 秒钩子并产出带画面素材的分镜脚本…"
          />
        </label>

        <label>保留重点 / 改写要求（可选）
          <input
            maxLength={300}
            value={focus}
            onChange={e => setFocus(e.target.value)}
            placeholder="例如：重点保留文中的实测对比数据，略过历史背景，结尾强调实战避坑"
          />
        </label>
      </div>
    </Modal>
  );
}
