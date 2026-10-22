'use client';
import { useState } from 'react';
import { AccountGate, AccountNav, useAccount } from '../AccountSession';
import { request } from '../../lib/editor';
import { parseAccount } from '../../lib/accounts';
import { ImageSettings } from './ImageSettings';
import {
  User,
  Shield,
  Key,
  Lock,
  CheckCircle,
  AlertCircle,
  Spinner,
  ImageIcon,
  Check,
  Eye,
  EyeOff,
  Sliders,
} from '../Icons';

function PasswordSettings() {
  const { accept } = useAccount();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  return (
    <section className="settings-card" aria-labelledby="password-settings-title">
      <div className="settings-card-header">
        <div className="settings-card-icon-wrap icon-wrap-security">
          <Shield size={22} className="settings-card-icon" />
        </div>
        <div className="settings-card-title-group">
          <div className="settings-title-row">
            <h2 id="password-settings-title" className="settings-card-title">
              修改密码
            </h2>
            <span className="settings-badge-sub">安全会话控制</span>
          </div>
          <p className="settings-card-desc">
            修改成功后其他所有登录会话将立即失效，当前浏览器页面可继续无缝使用。
          </p>
        </div>
      </div>

      {error && (
        <div className="settings-alert-box alert-error" role="alert">
          <div className="alert-content">
            <AlertCircle size={16} className="alert-icon" />
            <span className="alert-message">{error}</span>
          </div>
        </div>
      )}

      {saved && (
        <div className="settings-alert-box alert-success" role="status">
          <div className="alert-content">
            <CheckCircle size={16} className="alert-icon" />
            <span className="alert-message">密码已更新成功，其他设备会话已全部安全退出。</span>
          </div>
        </div>
      )}

      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          if (password !== repeat) {
            setError('两次输入的新密码不一致，请重新检查');
            return;
          }
          if (password.length < 6) {
            setError('新密码长度不能少于 6 个字符');
            return;
          }
          setBusy(true);
          setError('');
          setSaved(false);
          try {
            const result = await request('/api/auth/password', {
              current_password: current,
              new_password: password,
            });
            accept(parseAccount(result));
            setCurrent('');
            setPassword('');
            setRepeat('');
            setSaved(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : '修改密码失败，请检查原密码是否正确');
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="settings-fieldset">
          <div className="form-field-item">
            <div className="form-label-bar">
              <label htmlFor="current-password-input" className="form-field-label">
                <Lock size={14} className="field-label-icon" /> 当前密码
              </label>
              <span className="field-tag">必填验证</span>
            </div>
            <div className="input-with-icon-wrapper password-input-wrap">
              <input
                id="current-password-input"
                required
                type={showCurrent ? 'text' : 'password'}
                maxLength={128}
                autoComplete="current-password"
                className="input-styled"
                placeholder="请输入当前正在使用的旧密码"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
              <button
                type="button"
                className="btn-toggle-eye"
                title={showCurrent ? '隐藏密码' : '显示明文'}
                onClick={() => setShowCurrent(!showCurrent)}
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="password-dual-grid">
            <div className="form-field-item">
              <div className="form-label-bar">
                <label htmlFor="new-password-input" className="form-field-label">
                  <Key size={14} className="field-label-icon" /> 新密码
                </label>
                <span className="field-tag">至少 6 位</span>
              </div>
              <div className="input-with-icon-wrapper password-input-wrap">
                <input
                  id="new-password-input"
                  required
                  type={showNew ? 'text' : 'password'}
                  minLength={6}
                  maxLength={128}
                  autoComplete="new-password"
                  className="input-styled"
                  placeholder="至少 6 位字符"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-toggle-eye"
                  title={showNew ? '隐藏密码' : '显示明文'}
                  onClick={() => setShowNew(!showNew)}
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="form-field-item">
              <div className="form-label-bar">
                <label htmlFor="repeat-password-input" className="form-field-label">
                  <Key size={14} className="field-label-icon" /> 确认新密码
                </label>
                <span className="field-tag">再次核对</span>
              </div>
              <div className="input-with-icon-wrapper password-input-wrap">
                <input
                  id="repeat-password-input"
                  required
                  type={showNew ? 'text' : 'password'}
                  minLength={6}
                  maxLength={128}
                  autoComplete="new-password"
                  className="input-styled"
                  placeholder="再次输入新密码"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="settings-actions-bar">
            <div className="actions-info">
              <span className="text-muted-sm">建议使用包含字母和数字的高强度密码组合</span>
            </div>
            <div className="actions-buttons">
              <button type="submit" className="btn-primary-glow" disabled={busy || !current || !password || !repeat}>
                {busy ? (
                  <>
                    <Spinner size={14} className="icon-spin" /> 正在保存…
                  </>
                ) : (
                  <>
                    <Check size={14} /> 更新密码
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

function AccountPanel() {
  const { user } = useAccount();
  const [activeTab, setActiveTab] = useState<'all' | 'image' | 'security'>('all');

  const usernameInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';

  return (
    <>
      <AccountNav />
      <div className="account-wrapper">
        <div className="account-glow-bg" />
        <main className="account-main-content">
          {/* 顶部个人信息与概览横幅 */}
          <div className="account-hero-card">
            <div className="account-hero-left">
              <div className="account-avatar-ring">
                <div className="account-avatar-inner">
                  <span className="account-avatar-text">{usernameInitial}</span>
                </div>
              </div>
              <div className="account-hero-info">
                <div className="account-hero-title-row">
                  <h1 className="account-username">{user?.username ?? '当前用户'}</h1>
                  <span className="account-role-badge">个人创作者</span>
                </div>
                <div className="account-meta-row">
                  <span className="account-meta-item">
                    <span className="meta-dot dot-online" /> 本地安全会话已连接
                  </span>
                  <span className="account-meta-divider">•</span>
                  <span className="account-meta-item">AI Creater Studio v2.0</span>
                </div>
              </div>
            </div>

            {/* 标签切换栏 */}
            <div className="account-tab-pills" role="tablist" aria-label="设置分区">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'all'}
                className={`tab-pill-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                <Sliders size={14} /> 全部设置
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'image'}
                className={`tab-pill-btn ${activeTab === 'image' ? 'active' : ''}`}
                onClick={() => setActiveTab('image')}
              >
                <ImageIcon size={14} /> GPT Image 2
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'security'}
                className={`tab-pill-btn ${activeTab === 'security' ? 'active' : ''}`}
                onClick={() => setActiveTab('security')}
              >
                <Shield size={14} /> 修改密码
              </button>
            </div>
          </div>

          {/* 设置分区卡片列表 */}
          <div className="account-cards-container">
            {(activeTab === 'all' || activeTab === 'image') && <ImageSettings />}
            {(activeTab === 'all' || activeTab === 'security') && <PasswordSettings />}
          </div>
        </main>
      </div>
    </>
  );
}

export default function Account() {
  return (
    <AccountGate>
      <AccountPanel />
    </AccountGate>
  );
}
