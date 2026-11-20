'use client';
import { useEffect, useState } from 'react';
import { request } from '../../../lib/editor';
import {
  PLATFORM_OPTIONS,
  TREND_OPTIONS,
  VIRAL_STYLE_OPTIONS,
  type PlatformPitch,
  type ResearchBrief,
  type ResearchItem,
  type ResearchStatus,
  type ViralStyle,
} from '../../../lib/research';
import { Modal } from '../../Modal';
import { useToast } from '../../ToastContext';
import { AlertCircle, Check, Plus, RefreshCw, Search, Sparkles, Spinner, Trash2 } from '../../Icons';

type Tab = 'search' | 'trends' | 'import' | 'brief';

export function ResearchModal({
  open,
  topic,
  currentBrief,
  disabled,
  onClose,
  onApplyBrief,
  onApplyPitch,
  onUseTopic,
}: {
  open: boolean;
  topic: string;
  currentBrief: ResearchBrief | null | undefined;
  disabled: boolean;
  onClose: () => void;
  onApplyBrief: (brief: ResearchBrief | null) => void;
  onApplyPitch: (pitch: PlatformPitch, brief: ResearchBrief) => void;
  onUseTopic: (nextTopic: string) => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('search');
  const [status, setStatus] = useState<ResearchStatus | null>(null);

  // Search tab state
  const [query, setQuery] = useState(topic);
  const [platforms, setPlatforms] = useState<string[]>(['all']);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('week');
  const [searching, setSearching] = useState(false);
  const [searchAnswer, setSearchAnswer] = useState('');
  const [searchResults, setSearchResults] = useState<ResearchItem[]>([]);
  const [searchProviders, setSearchProviders] = useState<string[]>([]);

  // Trends tab state
  const [trendPlatform, setTrendPlatform] = useState<string>('all');
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendItems, setTrendItems] = useState<ResearchItem[]>([]);

  // Import tab state
  const [importUrl, setImportUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualPlatform, setManualPlatform] = useState('抖音 / 小红书 / 公众号');
  const [manualText, setManualText] = useState('');

  // Selected pool & deconstructed brief
  const [selected, setSelected] = useState<ResearchItem[]>([]);
  const [viralStyle, setViralStyle] = useState<ViralStyle>(currentBrief?.viral_style ?? 'balanced');
  const [analyzing, setAnalyzing] = useState(false);
  const [draftBrief, setDraftBrief] = useState<ResearchBrief | null>(currentBrief ?? null);
  const [pitches, setPitches] = useState<PlatformPitch[]>([]);
  const [generatingPitches, setGeneratingPitches] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (topic.trim() && !query.trim()) setQuery(topic.trim());
    setDraftBrief(currentBrief ?? null);
    if (currentBrief?.viral_style) setViralStyle(currentBrief.viral_style);
    let live = true;
    request<ResearchStatus>('/api/research/status')
      .then(v => { if (live) setStatus(v); })
      .catch(() => {});
    return () => { live = false; };
  }, [open]);

  function togglePlatform(id: string) {
    if (id === 'all') {
      setPlatforms(['all']);
      return;
    }
    setPlatforms(prev => {
      const cleaned = prev.filter(p => p !== 'all');
      const next = cleaned.includes(id) ? cleaned.filter(p => p !== id) : [...cleaned, id];
      return next.length ? next : ['all'];
    });
  }

  function toggleSelect(item: ResearchItem) {
    setSelected(prev => {
      if (prev.some(x => x.id === item.id)) return prev.filter(x => x.id !== item.id);
      if (prev.length >= 5) {
        toast('最多选择 5 条参考素材', { variant: 'warning' });
        return prev;
      }
      return [...prev, item];
    });
  }

  async function runSearch() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setError('');
    try {
      const res = await request<{ answer?: string; items?: ResearchItem[]; providers?: string[] }>('/api/research/search', {
        query: q,
        platforms,
        time_range: timeRange,
        max_results: 8,
      });
      setSearchAnswer(res.answer ?? '');
      setSearchResults(Array.isArray(res.items) ? res.items : []);
      setSearchProviders(Array.isArray(res.providers) ? res.providers : []);
      if (!res.items?.length) setError('未搜到匹配结果，可尝试换个关键词或放宽平台/时间范围。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '搜索热点失败');
    } finally {
      setSearching(false);
    }
  }

  async function loadTrends(plat = trendPlatform) {
    setTrendPlatform(plat);
    setLoadingTrends(true);
    setError('');
    try {
      const res = await request<{ items?: ResearchItem[] }>(`/api/research/trends?platform=${encodeURIComponent(plat)}&limit=12`);
      setTrendItems(Array.isArray(res.items) ? res.items : []);
      if (!res.items?.length) setError('暂未拉取到热榜数据，可稍后重试或直接使用关键词搜索。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取热榜失败');
    } finally {
      setLoadingTrends(false);
    }
  }

  async function runExtract() {
    const url = importUrl.trim();
    if (!url || extracting) return;
    setExtracting(true);
    setError('');
    try {
      const res = await request<{ item: ResearchItem }>('/api/research/extract', { url });
      if (res.item) {
        setSelected(prev => {
          const filtered = prev.filter(x => x.id !== res.item.id);
          return [...filtered.slice(-4), res.item];
        });
        setImportUrl('');
        toast(`已提取并加入参考：「${res.item.title.slice(0, 28)}」`, { variant: 'success' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '提取链接失败，建议直接复制爆款正文粘贴到下方导入。');
    } finally {
      setExtracting(false);
    }
  }

  function addManualSource() {
    const content = manualText.trim();
    if (!content) return;
    const title = manualTitle.trim() || content.split(/\n/)[0].slice(0, 40) || '手动导入爆款文案';
    const item: ResearchItem = {
      id: 'manual-' + Date.now().toString(36),
      title,
      url: '',
      platform: 'manual',
      platform_label: manualPlatform.trim() || '手动导入',
      snippet: content.slice(0, 200),
      content: content.slice(0, 3000),
      provider: 'manual',
    };
    setSelected(prev => [...prev.slice(-4), item]);
    setManualTitle('');
    setManualText('');
    toast('已加入参考素材池', { variant: 'success' });
  }

  async function runAnalyze() {
    if (!selected.length || analyzing) return;
    setAnalyzing(true);
    setError('');
    try {
      const res = await request<{ brief: ResearchBrief }>('/api/research/analyze', {
        topic: (topic || query || selected[0].title).trim().slice(0, 80),
        sources: selected.map(s => ({
          title: s.title,
          url: s.url,
          platform: s.platform,
          platform_label: s.platform_label,
          content: s.content || s.snippet,
          metrics: s.metrics || '',
        })),
        viral_style: viralStyle,
      });
      setDraftBrief(res.brief);
      setPitches([]);
      setTab('brief');
      toast('已拆解出爆款事实、钩子与叙事节奏', { variant: 'success' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '爆款拆解失败');
    } finally {
      setAnalyzing(false);
    }
  }

  async function runPitches() {
    if (!draftBrief || generatingPitches) return;
    setGeneratingPitches(true);
    setError('');
    try {
      const res = await request<{ pitches: PlatformPitch[] }>('/api/research/pitches', {
        topic: (topic || query || selected[0]?.title || '热点选题').trim().slice(0, 80),
        brief: draftBrief,
      });
      setPitches(Array.isArray(res.pitches) ? res.pitches : []);
      toast('已生成抖音 / 小红书 / B站三平台适配方案', { variant: 'success' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成平台方案失败');
    } finally {
      setGeneratingPitches(false);
    }
  }

  const renderItemCard = (item: ResearchItem, allowUseTopic = false) => {
    const picked = selected.some(s => s.id === item.id);
    return (
      <div key={item.id} className={`research-item${picked ? ' selected' : ''}`}>
        <div className="research-item-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="research-item-meta">
              <span className="research-plat-tag">{item.platform_label}</span>
              {item.metrics && <span className="research-metrics">{item.metrics}</span>}
              {item.published_at && <span className="hint">{item.published_at}</span>}
              {item.provider === 'tikhub' && <span className="research-provider-tag">实时互动</span>}
            </div>
            <b className="research-item-title">
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
              ) : (
                item.title
              )}
            </b>
          </div>
          <div className="research-item-actions">
            {allowUseTopic && (
              <button
                type="button"
                className="research-mini-btn"
                onClick={() => {
                  onUseTopic(item.title.slice(0, 60));
                  setQuery(item.title.slice(0, 60));
                  toast('已设为本课选题', { variant: 'info' });
                }}
              >
                设为选题
              </button>
            )}
            <button
              type="button"
              className={`research-mini-btn${picked ? ' active' : ''}`}
              onClick={() => toggleSelect(item)}
            >
              {picked ? <><Check size={12} /> 已选</> : <><Plus size={12} /> 加入参考</>}
            </button>
          </div>
        </div>
        {item.snippet && <p className="research-snippet">{item.snippet}</p>}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="热点检索与爆款参考"
      maxWidth="880px"
      footer={
        <div className="research-modal-footer">
          <div className="research-footer-left">
            <span className="hint">
              已选素材 {selected.length}/5
              {draftBrief ? ` · 已生成简报（${draftBrief.facts.length} 条事实 / ${draftBrief.hooks.length} 个钩子）` : ''}
            </span>
          </div>
          <div className="research-footer-right">
            {currentBrief && (
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => {
                  onApplyBrief(null);
                  setDraftBrief(null);
                  toast('已清除本课的爆款参考', { variant: 'info' });
                }}
              >
                清除参考
              </button>
            )}
            {selected.length > 0 && tab !== 'brief' && (
              <button type="button" className="btn-modal-confirm primary" disabled={analyzing || disabled} onClick={() => void runAnalyze()}>
                {analyzing ? <><Spinner size={13} className="icon-spin" /> 正在拆解爆款…</> : <><Sparkles size={13} /> 拆解已选 {selected.length} 条素材</>}
              </button>
            )}
            {draftBrief && (
              <button
                type="button"
                className="btn-modal-confirm primary"
                disabled={disabled}
                onClick={() => {
                  onApplyBrief(draftBrief);
                  toast('爆款参考简报已应用到构思与文稿生成', { variant: 'success' });
                  onClose();
                }}
              >
                <Check size={14} /> 应用到本课构思与文稿
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="research-modal">
        <div className="research-topbar">
          <div className="research-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'active' : undefined} onClick={() => setTab('search')}>
              <Search size={13} /> 搜全网 / 平台热点
            </button>
            <button type="button" role="tab" aria-selected={tab === 'trends'} className={tab === 'trends' ? 'active' : undefined} onClick={() => { setTab('trends'); if (!trendItems.length && !loadingTrends) void loadTrends(); }}>
              🔥 今日热榜
            </button>
            <button type="button" role="tab" aria-selected={tab === 'import'} className={tab === 'import' ? 'active' : undefined} onClick={() => setTab('import')}>
              <Plus size={13} /> 粘贴链接 / 文案
            </button>
            <button type="button" role="tab" aria-selected={tab === 'brief'} className={tab === 'brief' ? 'active' : undefined} onClick={() => setTab('brief')}>
              <Sparkles size={13} /> 爆款拆解 ({selected.length}{draftBrief ? ' · 就绪' : ''})
            </button>
          </div>
          {status && (
            <div className="research-status-badges">
              <span className={`studio-badge${status.tavily_configured ? ' badge-ok' : ' badge-warn'}`}>
                Tavily {status.tavily_configured ? '已就绪' : '未配置'}
              </span>
              {status.tikhub_configured && <span className="studio-badge badge-ok">TikHub 实时互动</span>}
            </div>
          )}
        </div>

        {error && <p role="alert" className="error" style={{ margin: 0 }}><AlertCircle size={14} /> {error}</p>}

        {tab === 'search' && (
          <div className="research-pane">
            <div className="research-search-bar">
              <input
                maxLength={120}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(); } }}
                placeholder="输入热点关键词，例如：DeepSeek 新模型、MCP 协议、AI Agent 实战"
              />
              <select value={timeRange} onChange={e => setTimeRange(e.target.value as 'day' | 'week' | 'month')} aria-label="时间范围">
                <option value="day">近 24 小时</option>
                <option value="week">近 7 天</option>
                <option value="month">近 30 天</option>
              </select>
              <button type="button" className="btn-accent" disabled={searching || !query.trim()} onClick={() => void runSearch()}>
                {searching ? <Spinner size={13} className="icon-spin" /> : <Search size={13} />} 搜索
              </button>
            </div>
            <div className="research-platform-bar">
              {PLATFORM_OPTIONS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`research-pill${platforms.includes(p.id) ? ' active' : ''}`}
                  onClick={() => togglePlatform(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {searchAnswer && (
              <div className="research-ai-summary">
                <b>热点速览</b>
                <p>{searchAnswer}</p>
              </div>
            )}
            {searchProviders.length > 0 && (
              <p className="hint" style={{ margin: 0 }}>数据来源：{searchProviders.join(' + ')} · 勾选 1–5 条后点击底部「拆解已选素材」</p>
            )}
            <div className="research-list">
              {searchResults.map(item => renderItemCard(item, true))}
              {!searching && !searchResults.length && (
                <p className="hint" style={{ textAlign: 'center', padding: '24px 0' }}>
                  输入关键词并选择平台，即可检索公众号、小红书、抖音、X、B站、YouTube 等公开爆款与热点内容。
                </p>
              )}
            </div>
          </div>
        )}

        {tab === 'trends' && (
          <div className="research-pane">
            <div className="research-platform-bar" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {TREND_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`research-pill${trendPlatform === opt.id ? ' active' : ''}`}
                    onClick={() => void loadTrends(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button type="button" className="research-mini-btn" disabled={loadingTrends} onClick={() => void loadTrends(trendPlatform)}>
                <RefreshCw size={12} className={loadingTrends ? 'icon-spin' : ''} /> 刷新热榜
              </button>
            </div>
            <div className="research-list">
              {loadingTrends && <p className="hint"><Spinner size={14} className="icon-spin" /> 正在拉取实时热榜…</p>}
              {!loadingTrends && trendItems.map(item => renderItemCard(item, true))}
            </div>
          </div>
        )}

        {tab === 'import' && (
          <div className="research-pane">
            <div className="research-import-box">
              <label>方式一：粘贴爆款文章或视频链接（自动提取正文；B站拉互动与分P，YouTube 拉字幕口播）
                <div className="research-search-bar">
                  <input
                    maxLength={500}
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    placeholder="https://mp.weixin.qq.com/... 或 B站 / YouTube / X / 小红书 / 抖音链接"
                  />
                  <button type="button" className="btn-accent" disabled={extracting || !importUrl.trim()} onClick={() => void runExtract()}>
                    {extracting ? <Spinner size={13} className="icon-spin" /> : <Plus size={13} />} 提取并加入
                  </button>
                </div>
              </label>
            </div>

            <div className="research-import-box">
              <label>方式二：直接粘贴刷到的爆款口播 / 小红书笔记 / 公众号片段（零反爬限制）</label>
              <div className="more-settings-row">
                <input maxLength={120} value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="标题或主题（可选）" />
                <input maxLength={30} value={manualPlatform} onChange={e => setManualPlatform(e.target.value)} placeholder="来源平台，如：抖音 / 小红书 / 公众号" />
              </div>
              <textarea
                rows={5}
                maxLength={3000}
                value={manualText}
                onChange={e => setManualText(e.target.value)}
                placeholder="把爆款视频口播稿、高赞评论或公众号核心段落粘贴在这里…"
              />
              <div>
                <button type="button" disabled={!manualText.trim()} onClick={addManualSource}>
                  <Plus size={13} /> 加入参考素材池
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'brief' && (
          <div className="research-pane">
            <div className="research-selected-pool">
              <div className="idea-toolbar">
                <b>已选参考素材（{selected.length}/5）</b>
                {selected.length > 0 && (
                  <button type="button" className="research-mini-btn" onClick={() => setSelected([])}>清空已选</button>
                )}
              </div>
              {selected.length === 0 ? (
                <p className="hint" style={{ margin: '6px 0' }}>还没有勾选参考素材；请先在「搜热点」「今日热榜」或「粘贴链接 / 文案」中添加 1–5 条。</p>
              ) : (
                <div className="research-selected-chips">
                  {selected.map(item => (
                    <span key={item.id} className="research-chip">
                      <b>[{item.platform_label}]</b> {item.title.slice(0, 32)}
                      <button type="button" aria-label="移除" onClick={() => setSelected(prev => prev.filter(x => x.id !== item.id))}><Trash2 size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={{ marginBottom: '6px' }}>爆款风格与节奏偏向</label>
              <div className="research-style-grid">
                {VIRAL_STYLE_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`style-card-btn${viralStyle === opt.id ? ' selected' : ''}`}
                    onClick={() => {
                      setViralStyle(opt.id);
                      if (draftBrief) setDraftBrief({ ...draftBrief, viral_style: opt.id });
                    }}
                  >
                    <span className="style-card-title">{opt.label}</span>
                    <span className="style-card-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <button type="button" className="idea-explore btn-accent" disabled={!selected.length || analyzing || disabled} onClick={() => void runAnalyze()}>
                {analyzing ? <><Spinner size={14} className="icon-spin" /> AI 正在拆解事实、钩子与爆款节奏…</> : <><Sparkles size={14} /> AI 拆解爆款结构与事实（短调用）</>}
              </button>
            </div>

            {draftBrief && (
              <div className="research-brief-editor">
                <h4>拆解结果（可直接微调，应用后将自动注入发散方向、大纲与文稿生成）</h4>
                <label>真实事实与案例弹药（每行一条）
                  <textarea
                    rows={4}
                    value={draftBrief.facts.join('\n')}
                    onChange={e => setDraftBrief({ ...draftBrief, facts: e.target.value.split('\n').filter(Boolean).slice(0, 8) })}
                  />
                </label>
                <label>高点击开场钩子（每行一条）
                  <textarea
                    rows={3}
                    value={draftBrief.hooks.join('\n')}
                    onChange={e => setDraftBrief({ ...draftBrief, hooks: e.target.value.split('\n').filter(Boolean).slice(0, 6) })}
                  />
                </label>
                <label>观众痛点与争议焦点（每行一条）
                  <textarea
                    rows={2}
                    value={draftBrief.pain_points.join('\n')}
                    onChange={e => setDraftBrief({ ...draftBrief, pain_points: e.target.value.split('\n').filter(Boolean).slice(0, 6) })}
                  />
                </label>
                <label>爆款叙事骨架与节奏
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={draftBrief.pacing}
                    onChange={e => setDraftBrief({ ...draftBrief, pacing: e.target.value })}
                  />
                </label>

                <div className="research-pitches-section">
                  <div className="idea-toolbar">
                    <b>一鱼多吃：按平台定位生成选题方案</b>
                    <button type="button" className="research-mini-btn active" disabled={generatingPitches || disabled} onClick={() => void runPitches()}>
                      {generatingPitches ? <><Spinner size={12} className="icon-spin" /> 生成中…</> : <><Sparkles size={12} /> 生成抖音 / 小红书 / B站方案</>}
                    </button>
                  </div>
                  {pitches.length > 0 && (
                    <div className="research-pitches-grid">
                      {pitches.map(p => (
                        <div key={p.platform} className="research-pitch-card">
                          <div className="research-item-meta">
                            <span className="research-plat-tag">{p.platform_name}</span>
                            <span className="hint">{p.duration_hint}</span>
                          </div>
                          <div className="research-cover-badge">封面大字：{p.cover_text}</div>
                          <b className="research-item-title">{p.title}</b>
                          <p className="research-snippet"><b>前 3 秒：</b>「{p.hook}」</p>
                          <p className="research-snippet">{p.angle_summary}</p>
                          <button
                            type="button"
                            className="btn-accent research-pitch-use"
                            disabled={disabled}
                            onClick={() => {
                              onApplyPitch(p, draftBrief);
                              toast(`已套用「${p.platform_name}」方案，可直接发散或生成文稿`, { variant: 'success' });
                              onClose();
                            }}
                          >
                            <Check size={13} /> 采用此平台方案
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
