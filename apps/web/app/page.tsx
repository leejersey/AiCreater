'use client';
import Link from 'next/link';
import {useAccount} from './AccountSession';
import {Plus, BookOpen, User, AlertCircle, RefreshCw} from './Icons';

export default function Home(){
  const {user,error,reload}=useAccount();

  return <main className="home-page">
    <header className="home-nav">
      <b className="brand">AI CREATER</b>
      <nav className="home-nav-links">
        {user ? <>
          <Link href="/courses" style={{display:'inline-flex',alignItems:'center',gap:'6px'}}><BookOpen size={14} /> 我的视频</Link>
          <span style={{color:'var(--text-secondary)',fontSize:'13px',display:'inline-flex',alignItems:'center',gap:'4px'}}><User size={14} /> {user.username}</span>
        </> : <>
          <Link href="/login">登录</Link>
          <Link className="primary-link" href="/register">注册</Link>
        </>}
      </nav>
    </header>

    {error&&<p role="alert"><AlertCircle size={14} /> {error} <button onClick={reload}><RefreshCw size={12} /> 重试连接</button></p>}

    <section className="home-hero-center">
      <h1>AI 教学视频创作</h1>
      <p>从想法到多风格讲解视频，输入主题或文稿，一键生成代码演示、流程图解与知识原理解析视频。</p>
      <Link className="home-cta-btn" href="/courses/new">
        <Plus size={20} /> 新建视频
      </Link>
      {user && <Link className="home-sublink" href="/courses">查看我的已有项目 →</Link>}
    </section>

    <footer className="home-footer">
      AI CREATER · 本地讲解视频与动画生成工具
    </footer>
  </main>;
}

