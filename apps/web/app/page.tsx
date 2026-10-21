'use client';
import Link from 'next/link';
import {useAccount} from './AccountSession';
import {
  Sparkles, Plus, BookOpen, User, AlertCircle, RefreshCw,
  Code, Workflow, Mic, Film, ArrowLeft, ChevronRight
} from './Icons';

export default function Home(){
  const {user,error,reload}=useAccount();

  return <div className="home-container">
    {/* 顶部柔和环境光晕与科技微网格 */}
    <div className="home-glow-top" />
    <div className="home-grid-pattern" />

    <main className="home-page">
      <header className="home-nav">
        <div className="home-brand">
          <b className="brand">AI CREATER</b>
          <span className="home-brand-tag">Studio v2.0</span>
        </div>
        <nav className="home-nav-links">
          {user ? <>
            <Link href="/courses" className="home-nav-link" style={{display:'inline-flex',alignItems:'center',gap:'6px'}}>
              <BookOpen size={14} /> 我的视频
            </Link>
            <span className="home-user-badge"><User size={13} /> {user.username}</span>
          </> : <>
            <Link href="/login" className="home-nav-link">登录</Link>
            <Link className="home-nav-btn" href="/register">免费注册</Link>
          </>}
        </nav>
      </header>

      {error && <p role="alert" style={{color:'#f87171',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',padding:'10px 16px',borderRadius:'8px',margin:'16px 0',fontSize:'13px',display:'flex',alignItems:'center',gap:'8px'}}>
        <AlertCircle size={14} /> {error} 
        <button type="button" onClick={reload} style={{marginLeft:'auto',padding:'4px 10px',fontSize:'12px'}}><RefreshCw size={12} /> 重试</button>
      </p>}

      <section className="home-hero">
        <div className="hero-badge">
          <Sparkles size={13} className="hero-badge-icon" />
          <span>全新 AI 教学讲解视频生成平台</span>
        </div>

        <h1 className="hero-title">
          把教学想法与讲稿<br />
          <span className="hero-gradient-text">一键变成专业级讲解视频</span>
        </h1>

        <p className="hero-desc">
          专为知识教学、代码演练与原理科普打造。输入纯文本或主题，系统全自动完成智能分镜、9 种专业教学画面编排、字级毫秒配音对齐与 1080P 高清渲染。
        </p>

        <div className="hero-cta-group">
          <Link className="home-primary-btn" href="/courses/new">
            <Plus size={18} /> 新建视频作品
          </Link>
          <Link className="home-secondary-btn" href="/courses">
            <BookOpen size={16} /> 查看我的视频项目
          </Link>
        </div>

        {/* 4 维核心能力 Bento 微卡片 */}
        <div className="hero-bento-grid">
          <div className="bento-card">
            <div className="bento-icon-wrapper" style={{color:'#34d399'}}>
              <Sparkles size={18} />
            </div>
            <h3>智能讲稿分镜</h3>
            <p>DeepSeek 深度语义切分，按教学逻辑自动匹配表达模板，原稿不失真。</p>
          </div>

          <div className="bento-card">
            <div className="bento-icon-wrapper" style={{color:'#60a5fa'}}>
              <Code size={18} />
            </div>
            <h3>9 种教学场景图解</h3>
            <p>涵盖代码单步追踪、无环流程图、定义解析卡片、数据对比与时间线。</p>
          </div>

          <div className="bento-card">
            <div className="bento-icon-wrapper" style={{color:'#c084fc'}}>
              <Mic size={18} />
            </div>
            <h3>字级配音与字幕对齐</h3>
            <p>火山引擎 TTS 2.0 原生时间戳驱动，毫秒级音画同步与可读字幕排版。</p>
          </div>

          <div className="bento-card">
            <div className="bento-icon-wrapper" style={{color:'#fbbf24'}}>
              <Film size={18} />
            </div>
            <h3>1080P/30FPS 实时渲染</h3>
            <p>基于 Remotion 的工程级合成引擎，支持静音草稿试播与整课高质量导出。</p>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <p>AI CREATER · 面向中文知识创作者的端到端视频生成平台</p>
      </footer>
    </main>
  </div>;
}
