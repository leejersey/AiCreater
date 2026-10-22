'use client';
import React, { useEffect, useRef, useState } from 'react';
import { request } from '../../lib/editor';
import { parseImageSettings, type ImageSettingsStatus } from '../../lib/image-settings';
import { useConfirm } from '../ConfirmContext';
import {
  ImageIcon,
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

export function ImageSettings() {
  const [saved, setSaved] = useState<ImageSettingsStatus | null>(null);
  const [url, setUrl] = useState('https://api.openai.com/v1');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const confirm = useConfirm();

  function accept(value: unknown) {
    const status = parseImageSettings(value);
    setSaved(status);
    setUrl(status.base_url);
    setKey('');
  }

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError('');
    setMessage('');
    setKey('');
    try {
      const value = await request('/api/auth/image-settings', undefined, 'GET', signal);
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
    <section className="settings-card" aria-labelledby="image-settings-title">
      <div className="settings-card-header">
        <div className="settings-card-icon-wrap">
          <ImageIcon size={22} className="settings-card-icon" />
        </div>
        <div className="settings-card-title-group">
          <div className="settings-title-row">
            <h2 id="image-settings-title" className="settings-card-title">
              GPT Image 2 配置
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
                  <span className="status-dot dot-green" /> 已保存密钥（不回显；未验证服务兼容性）
                </span>
              ) : (
                <span className="status-badge status-unconfigured" role="status">
                  <span className="status-dot dot-amber" /> 未配置
                </span>
              )}
            </div>
          </div>
          <p className="settings-card-desc">
            仅当前账号可用。保存不会调用生图，也不会产生模型费用；尚未接通生图任务。
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
          const body = { base_url: url, api_key: key };
          setKey('');
          try {
            const result = await request('/api/auth/image-settings', body);
            if (mounted.current) {
              accept(result);
              setMessage('配置已保存，不会自动生成图片。');
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
              <label htmlFor="image-base-url" className="form-field-label">
                <Globe size={14} className="field-label-icon" /> Base URL
              </label>
              <div className="form-field-tags">
                <span className="field-tag">HTTPS 协议</span>
                {url !== 'https://api.openai.com/v1' && (
                  <button
                    type="button"
                    className="btn-tag-action"
                    onClick={() => {
                      setUrl('https://api.openai.com/v1');
                      setKey('');
                    }}
                  >
                    重置为官方地址
                  </button>
                )}
              </div>
            </div>
            <div className="input-with-icon-wrapper">
              <input
                id="image-base-url"
                type="url"
                required
                maxLength={2048}
                autoComplete="off"
                className="input-styled"
                placeholder="https://api.openai.com/v1"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setKey('');
                }}
              />
            </div>
            <p className="field-hint">
              <Info size={13} className="hint-icon" />
              填写 API 根地址，例如 https://api.openai.com/v1。保存不检查 DNS 或连通性；仅支持 HTTPS，不能包含密钥、查询参数或片段，不支持直接填写本机/内网地址。
            </p>
          </div>

          <div className="form-field-item">
            <div className="form-label-bar">
              <label htmlFor="image-api-key" className="form-field-label">
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
                id="image-api-key"
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
                      title: '删除图片服务配置？',
                      message: '仅删除当前账号保存的地址和密钥，不删除已有图片或课程。',
                      confirmText: '删除配置',
                      variant: 'danger',
                    });
                    if (!ok || !mounted.current) return;
                    setError('');
                    setMessage('');
                    setKey('');
                    const result = await request('/api/auth/image-settings/clear', {});
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
