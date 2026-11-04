'use client';
import React, { useEffect, useRef, useState } from 'react';
import { request } from '../../lib/editor';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, parseModelSettings, type ModelSettingsStatus } from '../../lib/model-settings';
import { useConfirm } from '../ConfirmContext';
import {
  Sparkles,
  Globe,
  Key,
  Shield,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Trash2,
  Spinner,
  Eye,
  EyeOff,
  Info,
  Check,
} from '../Icons';

export function ModelSettings() {
  const [saved, setSaved] = useState<ModelSettingsStatus | null>(null);
  const [url, setUrl] = useState(DEFAULT_BASE_URL);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const confirm = useConfirm();

  function accept(value: unknown) {
    const status = parseModelSettings(value);
    setSaved(status);
    setUrl(status.base_url);
    setModel(status.model);
    setKey('');
  }

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError('');
    setMessage('');
    setKey('');
    try {
      const value = await request('/api/auth/model-settings', undefined, 'GET', signal);
      if (mounted.current && !signal?.aborted) accept(value);
    } catch (e) {
      if (mounted.current && !signal?.aborted) {
        setError(e instanceof Error ? e.message : '读取配置失败');
      }
    } finally {
      if (mounted.current && !signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    void load(abort.signal);
    return () => {
      mounted.current = false;
      abort.abort();
    };
  }, []);

  const needsKey = !saved?.configured || url.trim() !== saved.base_url;

  return (
    <section className="settings-card" aria-labelledby="model-settings-title">
      <div className="settings-card-header">
        <div className="settings-card-icon-wrap">
          <Sparkles size={22} className="settings-card-icon" />
        </div>
        <div className="settings-card-title-group">
          <div className="settings-title-row">
            <h2 id="model-settings-title" className="settings-card-title">
              模型配置
            </h2>
            <div className="settings-status-pill">
              {loading ? (
                <span className="status-badge status-loading" role="status">
                  <Spinner size={12} className="icon-spin" /> 正在读取配置…
                </span>
              ) : !saved ? (
                <span className="status-badge status-unknown" role="status">
                  <span className="status-dot dot-gray" /> 配置状态未知
                </span>
              ) : saved.configured ? (
                <span className="status-badge status-configured" role="status">
                  <span className="status-dot dot-green" /> 已保存（密钥不回显；未验证服务兼容性）
                </span>
              ) : (
                <span className="status-badge status-unconfigured" role="status">
                  <span className="status-dot dot-amber" /> 未配置 · 使用服务端 DeepSeek
                </span>
              )}
            </div>
          </div>
          <p className="settings-card-desc">
            仅当前账号可用：讲稿生成和 Agent 生成画面都会使用这里的模型（OpenAI 兼容接口），费用由你的服务商收取。保存不调用模型、不产生费用；未配置时使用服务端 DeepSeek。已排队的 Agent 任务按提交时的配置执行，保存新配置后它们会停止，需要重新提交。
          </p>
        </div>
      </div>

      {error && (
        <div className="settings-alert-box alert-error" role="alert">
          <div className="alert-content">
            <AlertCircle size={16} className="alert-icon" />
            <span className="alert-message">{error}</span>
          </div>
          <button
            type="button"
            className="btn-retry"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            <RefreshCw size={13} className={loading ? 'icon-spin' : ''} /> 重新读取
          </button>
        </div>
      )}

      {message && (
        <div className="settings-alert-box alert-success" role="status">
          <div className="alert-content">
            <CheckCircle size={16} className="alert-icon" />
            <span className="alert-message">{message}</span>
          </div>
        </div>
      )}

      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || loading || !saved) return;
          if (needsKey && !key) {
            setError('首次配置或更换地址时，请填写新的 API Key');
            return;
          }
          setBusy(true);
          setError('');
          setMessage('');
          const body = { base_url: url, api_key: key, model: model.trim() };
          setKey('');
          try {
            const result = await request('/api/auth/model-settings', body);
            if (mounted.current) {
              accept(result);
              setMessage('配置已保存，不会自动调用模型。');
            }
          } catch (e) {
            if (mounted.current) {
              setError(e instanceof Error ? e.message : '保存失败，请重新读取状态后再决定是否重试');
            }
          } finally {
            if (mounted.current) setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || loading || !saved} className="settings-fieldset">
          <div className="form-field-item">
            <div className="form-label-bar">
              <label htmlFor="model-base-url" className="form-field-label">
                <Globe size={14} className="field-label-icon" /> Base URL
              </label>
              <div className="form-field-tags">
                <span className="field-tag">HTTPS 协议</span>
                {url !== DEFAULT_BASE_URL && (
                  <button
                    type="button"
                    className="btn-tag-action"
                    onClick={() => {
                      setUrl(DEFAULT_BASE_URL);
                      setModel(DEFAULT_MODEL);
                      setKey('');
                    }}
                  >
                    重置为 DeepSeek
                  </button>
                )}
              </div>
            </div>
            <div className="input-with-icon-wrapper">
              <input
                id="model-base-url"
                type="url"
                required
                maxLength={2048}
                autoComplete="off"
                className="input-styled"
                placeholder={DEFAULT_BASE_URL}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setKey('');
                }}
              />
            </div>
            <p className="field-hint">
              <Info size={13} className="hint-icon" />
              填写 OpenAI 兼容接口的根地址（会在后面拼接 /chat/completions），例如 https://api.deepseek.com。仅支持 HTTPS，不能包含密钥、查询参数或片段；每次调用前会检查它解析到公网地址，本机/内网地址会被拒绝。
            </p>
          </div>

          <div className="form-field-item">
            <div className="form-label-bar">
              <label htmlFor="model-id" className="form-field-label">
                <Sparkles size={14} className="field-label-icon" /> 模型 ID
              </label>
            </div>
            <div className="input-with-icon-wrapper">
              <input
                id="model-id"
                required
                maxLength={200}
                pattern={'[\\x21-\\x7e]{1,200}'}
                autoComplete="off"
                spellCheck={false}
                className="input-styled"
                placeholder={DEFAULT_MODEL}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <p className="field-hint">
              <Info size={13} className="hint-icon" />
              服务商的模型名称，例如 deepseek-flash、qwen-plus。Agent 需要模型支持工具调用（function calling）。
            </p>
          </div>

          <div className="form-field-item">
            <div className="form-label-bar">
              <label htmlFor="model-api-key" className="form-field-label">
                <Key size={14} className="field-label-icon" /> API Key
              </label>
              <div className="form-field-tags">
                {needsKey ? (
                  <span className="field-tag tag-warning">需要填写密钥</span>
                ) : (
                  <span className="field-tag tag-muted">留空则保留原密钥</span>
                )}
              </div>
            </div>
            <div className="input-with-icon-wrapper password-input-wrap">
              <input
                id="model-api-key"
                type={showKey ? 'text' : 'password'}
                required={needsKey}
                maxLength={2048}
                autoComplete="off"
                spellCheck={false}
                className="input-styled"
                placeholder={needsKey ? '请输入 API 密钥...' : '已配置密钥，如不更换请留空'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <button
                type="button"
                className="btn-toggle-eye"
                title={showKey ? '隐藏密钥' : '显示明文'}
                onClick={() => setShowKey(!showKey)}
                tabIndex={-1}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="field-hint">
              <Shield size={13} className="hint-icon" />
              密钥仅在服务端加密保存，不回显、不写浏览器缓存。地址不变时留空保留原密钥；更换地址必须重新填写。第三方地址由你选择，请确认可信后再保存。
            </p>
          </div>

          <div className="settings-actions-bar">
            <div className="actions-info">
              {needsKey && saved?.configured && (
                <span className="text-warning-sm">地址已变更，保存时必须输入新密钥</span>
              )}
            </div>
            <div className="actions-buttons">
              <button
                type="button"
                className="btn-danger-outline"
                disabled={!saved?.configured || busy}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  try {
                    const ok = await confirm({
                      title: '删除模型配置？',
                      message: '仅删除当前账号保存的地址、模型和密钥，之后改用服务端 DeepSeek；已排队的 Agent 任务会停止，需要重新提交。',
                      confirmText: '删除配置',
                      variant: 'danger',
                    });
                    if (!ok || !mounted.current) return;
                    setError('');
                    setMessage('');
                    setKey('');
                    const result = await request('/api/auth/model-settings/clear', {});
                    if (mounted.current) {
                      accept(result);
                      setMessage('配置已删除。');
                    }
                  } catch (e) {
                    if (mounted.current) {
                      setError(e instanceof Error ? e.message : '删除失败，请重新读取状态');
                    }
                  } finally {
                    if (mounted.current) setBusy(false);
                  }
                }}
              >
                <Trash2 size={14} /> 删除配置
              </button>
              <button type="submit" className="btn-primary-glow" disabled={busy || loading || !saved}>
                {busy ? (
                  <>
                    <Spinner size={14} className="icon-spin" /> 正在处理…
                  </>
                ) : (
                  <>
                    <Check size={14} /> 保存配置
                  </>
                )}
              </button>
            </div>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
