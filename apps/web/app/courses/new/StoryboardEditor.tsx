'use client';
import { useState } from 'react';
import {
  serializeMarkdownSections,
  type MarkdownSection,
} from '../../../lib/manuscript-tools';
import { ChevronDown, ChevronUp, Plus, Sparkles, Spinner, X } from '../../Icons';

const QUICK_REWRITES = [
  { label: '压缩到 45 秒内', instruction: '把口播精简压缩到 200 字（约 40 秒）以内，保留核心干货与爆点。' },
  { label: '加个生活例子', instruction: '保持核心观点不变，在口播里加入一个生动的生活化类比或具体案例，并在画面素材中补上对应元素。' },
  { label: '补强画面素材', instruction: '口播微调即可，重点把「画面素材」和「画面意图」写扎实：提炼出可绘制的数字卡片、对比项或步骤流程图节点，禁止填无。' },
  { label: '更犀利有网感', instruction: '改写成更有网感的短视频口语短句，增强反差和节奏感，去掉书面腔。' },
];

export function StoryboardEditor({
  sections,
  disabled,
  rewritingId,
  onChangeSource,
  onRewriteSection,
}: {
  sections: MarkdownSection[];
  disabled: boolean;
  rewritingId: string | null;
  onChangeSource: (nextMarkdown: string) => void;
  onRewriteSection: (sectionId: string, instruction: string) => void;
}) {
  const [openRewrite, setOpenRewrite] = useState<string | null>(null);
  const [customNote, setCustomNote] = useState('');

  const commit = (next: MarkdownSection[]) => onChangeSource(serializeMarkdownSections(next));

  const update = (idx: number, patch: Partial<MarkdownSection>) =>
    commit(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const move = (idx: number, by: -1 | 1) => {
    const j = idx + by;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[idx], next[j]] = [next[j], next[idx]];
    commit(next);
  };

  const remove = (idx: number) => {
    if (sections.length <= 1) return;
    commit(sections.filter((_, i) => i !== idx));
  };

  const add = () => {
    if (sections.length >= 20) return;
    let n = sections.length + 1;
    const used = new Set(sections.map(s => s.id));
    while (used.has(`s${n}`)) n++;
    commit([
      ...sections,
      { id: `s${n}`, title: '新段落', narration: '这里填写口播内容。', materials: '核心关键词 / 对比卡片', visual_intent: '说到核心词时高亮展示。' },
    ]);
  };

  return (
    <div className="sb-list">
      {sections.map((sec, idx) => {
        const chars = Array.from(sec.narration.replace(/\s+/g, '')).length;
        const seconds = Math.max(1, Math.round(chars / 5));
        const tooLong = seconds > 110;
        const emptyMat = !sec.materials.trim() || sec.materials.trim() === '无';
        const isRewriting = rewritingId === sec.id;
        return (
          <div key={sec.id} className={`sb-card${tooLong ? ' sb-warn' : ''}`}>
            <div className="sb-card-head">
              <span className="idea-index">{idx + 1}</span>
              <input
                className="sb-title-input"
                maxLength={80}
                disabled={disabled || isRewriting}
                value={sec.title}
                aria-label={`第 ${idx + 1} 段标题`}
                onChange={e => update(idx, { title: e.target.value })}
              />
              <span className={`studio-badge${tooLong ? ' badge-warn' : ''}`} title="按约每秒 5 字估算">
                约 {seconds}s{tooLong ? ' · 偏长' : ''}
              </span>
              <button type="button" className="research-mini-btn" disabled={disabled || !!rewritingId} onClick={() => setOpenRewrite(openRewrite === sec.id ? null : sec.id)}>
                {isRewriting ? <><Spinner size={12} className="icon-spin" /> 重写中…</> : <><Sparkles size={12} /> AI 改这段</>}
              </button>
              <button type="button" className="icon-button" title="上移" disabled={disabled || idx === 0} onClick={() => move(idx, -1)}><ChevronUp size={13} /></button>
              <button type="button" className="icon-button" title="下移" disabled={disabled || idx === sections.length - 1} onClick={() => move(idx, 1)}><ChevronDown size={13} /></button>
              <button type="button" className="icon-button" title="删除此段" disabled={disabled || sections.length <= 1} onClick={() => remove(idx)}><X size={13} /></button>
            </div>

            {openRewrite === sec.id && (
              <div className="sb-rewrite-bar">
                <div className="research-platform-bar">
                  {QUICK_REWRITES.map(q => (
                    <button
                      key={q.label}
                      type="button"
                      className="research-pill"
                      disabled={disabled || !!rewritingId}
                      onClick={() => {
                        setOpenRewrite(null);
                        onRewriteSection(sec.id, q.instruction);
                      }}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <div className="idea-custom">
                  <input
                    maxLength={300}
                    value={customNote}
                    disabled={disabled || !!rewritingId}
                    onChange={e => setCustomNote(e.target.value)}
                    placeholder="自定义修改意见，例如：把例子换成电商客服场景"
                  />
                  <button
                    type="button"
                    className="btn-accent"
                    disabled={disabled || !!rewritingId || !customNote.trim()}
                    onClick={() => {
                      const note = customNote.trim();
                      setCustomNote('');
                      setOpenRewrite(null);
                      onRewriteSection(sec.id, note);
                    }}
                  >
                    重写此段
                  </button>
                </div>
              </div>
            )}

            <label className="sb-field">
              <span>口播（{chars} 字）</span>
              <textarea
                rows={3}
                disabled={disabled || isRewriting}
                value={sec.narration}
                onChange={e => update(idx, { narration: e.target.value })}
              />
            </label>

            <div className="sb-visual-row">
              <label className="sb-field">
                <span>画面素材（视觉弹药）{emptyMat && <em className="sb-empty-tip">建议补充</em>}</span>
                <textarea
                  rows={2}
                  disabled={disabled || isRewriting}
                  value={sec.materials}
                  onChange={e => update(idx, { materials: e.target.value })}
                />
              </label>
              <label className="sb-field">
                <span>画面意图（如何随口播变化）</span>
                <textarea
                  rows={2}
                  disabled={disabled || isRewriting}
                  value={sec.visual_intent}
                  onChange={e => update(idx, { visual_intent: e.target.value })}
                />
              </label>
            </div>
          </div>
        );
      })}
      <button type="button" className="research-mini-btn" disabled={disabled || sections.length >= 20} onClick={add}>
        <Plus size={13} /> 新增一个分镜段落（{sections.length}/20）
      </button>
    </div>
  );
}
