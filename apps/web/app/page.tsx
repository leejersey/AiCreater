'use client';
import Link from 'next/link';
import {useAccount} from './AccountSession';
import {
  Sparkles, Plus, BookOpen, User, AlertCircle, RefreshCw,
  Code, Workflow, Mic, Film, ArrowLeft, ChevronRight, Zap
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
        </div>
        <nav className="home-nav-links">
          {user ? <>
            <Link href="/studio" className="home-nav-link" style={{display:'inline-flex',alignItems:'center',gap:'6px'}}>
              <Zap size={14} /> 选题台
            </Link>
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

      <section className="home-hero home-hero-editorial">
        <div className="hero-kicker">
          <span className="hero-kicker-dot" aria-hidden="true" />
          <span>STUDIO EDITION // 1080P · 30FPS · SCENE AGENT</span>
        </div>

        <h1 className="hero-title">
          把教学想法与热点素材<br />
          <span className="hero-gradient-text">编排成电影级讲解视频</span>
        </h1>

        <p className="hero-desc">
          面向中文知识创作者的暗房剪辑工作台。从全网热点拆解、人设口播与分镜卡片，到字级配音对齐与 Scene Agent 逐章自主绘制动画，端到端输出 1080P 成片与字幕。
        </p>

        <div className="hero-cta-group">
          <Link className="home-primary-btn" href="/courses/new">
            <Plus size={18} /> 开始创作新视频
          </Link>
          <Link className="home-secondary-btn" href="/studio">
            <Zap size={16} /> 去选题台找选题
          </Link>
          <Link className="home-secondary-btn" href="/courses">
            <BookOpen size={16} /> 进入我的作品库
          </Link>
        </div>

        <div className="hero-bento-grid">
          <div className="bento-card">
            <div className="bento-head">
              <span className="bento-index">01</span>
              <div className="bento-icon-wrapper"><Sparkles size={16} /></div>
            </div>
            <h3>选题台与爆款拆解</h3>
            <p>每日选题卡带证据与评分，上传对标视频拆出钩子与节奏、提炼爆款公式，文案逐条溯源再配音。</p>
          </div>

          <div className="bento-card">
            <div className="bento-head">
              <span className="bento-index">02</span>
              <div className="bento-icon-wrapper"><Code size={16} /></div>
            </div>
            <h3>Scene Agent 自主绘片</h3>
            <p>内置指标大卡、对比双栏、时间轴与代码终端组件，自动渲染、几何审计并迭代修改。</p>
          </div>

          <div className="bento-card">
            <div className="bento-head">
              <span className="bento-index">03</span>
              <div className="bento-icon-wrapper"><Mic size={16} /></div>
            </div>
            <h3>字级配音与实测对齐</h3>
            <p>火山引擎 TTS 2.0 原生时间戳驱动，画面跟随口播节奏，换音色免费自动重渲染。</p>
          </div>

          <div className="bento-card">
            <div className="bento-head">
              <span className="bento-index">04</span>
              <div className="bento-icon-wrapper"><Film size={16} /></div>
            </div>
            <h3>连续审片与一键成片</h3>
            <p>全键盘连续审片、按画面时刻提意见，整课本机 1080P 导出并附带多平台发布套件。</p>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <p>AI CREATER · 面向中文知识创作者的端到端视频生成平台</p>
      </footer>
    </main>
  </div>;
}
