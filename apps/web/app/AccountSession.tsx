'use client';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {API,request} from '../lib/editor';
import {AUTH_REQUIRED,safeReturn,parseAccount,type Account} from '../lib/accounts';
import {User,Key,LogOut,BookOpen,Spinner,AlertCircle,RefreshCw,Lock} from './Icons';
import {useConfirm} from './ConfirmContext';

type Session={user:Account|null;ready:boolean;error:string;reload:()=>void;accept:(user:Account|null)=>void};
const AccountContext=createContext<Session>({user:null,ready:false,error:'',reload:()=>{},accept:()=>{}});
export const useAccount=()=>useContext(AccountContext);

export function AccountSession({children}:{children:ReactNode}) {
  const [user,setUser]=useState<Account|null>(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[expired,setExpired]=useState(false);
  const current=useRef<Account|null>(null),generation=useRef(0);
  function accept(account:Account|null){generation.current++;current.current=account;setUser(account);setReady(true);setExpired(false);setError('');
    try{localStorage.setItem('aicreater:account-changed',String(Date.now())+Math.random());}catch{/* Session itself remains server-owned. */}}
  async function reload(){
    const turn=++generation.current;
    try{
      const response=await fetch(API+'/api/auth/me',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(turn!==generation.current)return;
      if(response.status===404)throw new Error('账号接口尚未加载，请更新本机API后重试；不会进入匿名工作台。');
      if(response.status===401){if(current.current)setExpired(true);else setUser(null);setError('');return;}
      if(!response.ok)throw new Error('账号服务尚未就绪，请稍后重试；不会自动提交任务。');
      const value=parseAccount(await response.json());
      if(turn!==generation.current)return;
      current.current=value;setUser(value);setExpired(false);setError('');
    }catch(e){if(turn===generation.current)setError(e instanceof Error?e.message:'无法连接账号服务');}finally{if(turn===generation.current)setReady(true);}
  }
  useEffect(()=>{
    void reload();
    const needed=()=>{if(current.current)setExpired(true);};
    const changed=(e:StorageEvent)=>{if(e.key==='aicreater:account-changed')void reload();};
    const focus=()=>void reload();
    window.addEventListener(AUTH_REQUIRED,needed);window.addEventListener('storage',changed);window.addEventListener('focus',focus);
    return()=>{window.removeEventListener(AUTH_REQUIRED,needed);window.removeEventListener('storage',changed);window.removeEventListener('focus',focus);};
  },[]);
  return <AccountContext.Provider value={{user,ready,error,reload:()=>void reload(),accept}}>
    <div key={user?.id??'signed-out'} inert={expired||undefined}>{children}</div>
    {expired&&user&&<section className="session-dialog" role="dialog" aria-modal="true" aria-label="登录已过期">
      <h2><Lock size={20} className="modal-icon-warning" /> 登录已过期</h2>
      <p>当前输入仍保留。请使用原账号登录，再手动继续；不会重发生成或配音请求。</p>
      <AuthForm username={user.username} onDone={accept}/>
    </section>}
  </AccountContext.Provider>;
}

export function AccountGate({children}:{children:ReactNode}) {
  const session=useAccount(),path=usePathname(),router=useRouter();
  useEffect(()=>{if(session.ready&&!session.user&&!session.error)router.replace('/login?next='+encodeURIComponent(safeReturn(path+window.location.search)));},[session.ready,session.user,session.error,path,router]);
  if(session.error&&!session.user)return <main><h1>暂时无法进入课程</h1><p role="alert"><AlertCircle size={16} /> {session.error}</p><button onClick={session.reload}><RefreshCw size={13} /> 重试连接</button></main>;
  if(!session.ready||!session.user)return <main><p role="status"><Spinner size={16} className="icon-spin" /> 正在检查登录状态…</p></main>;
  // A transient session-check failure must not unmount an editor with unsaved input.
  return <>{session.error&&<p role="alert"><AlertCircle size={16} /> {session.error}<button onClick={session.reload}><RefreshCw size={13} /> 重试连接</button></p>}{children}</>;
}

export function AccountNav(){
  const {user,accept}=useAccount(),router=useRouter(),confirmDialog=useConfirm();const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <nav className="account-nav" aria-label="账号导航"><Link href="/courses"><BookOpen size={14} /> 我的课程</Link><span><User size={14} /> {user?.username}</span><Link href="/account"><Key size={14} /> 修改密码</Link>
    <button disabled={busy} onClick={async()=>{
      const ok = await confirmDialog({
        title: '确定退出登录？',
        message: '请先保存或复制未保存内容。退出将清空页面输入，本机草稿仍保留在当前浏览器。',
        confirmText: '退出登录',
        cancelText: '取消',
        variant: 'danger',
      });
      if(!ok)return;
      setBusy(true);setError('');
      try{await request('/api/auth/logout',{});accept(null);router.replace('/login');}
      catch(e){if(e instanceof Error&&e.cause===401){accept(null);router.replace('/login');}else{setError(e instanceof Error?e.message:'退出失败');setBusy(false);}}
    }}>{busy?<Spinner size={13} className="icon-spin" />:<LogOut size={13} />}{busy?'正在退出…':'退出登录'}</button>{error&&<p role="alert">{error}</p>}</nav>;
}

export function AuthForm({register=false,username:fixedUsername,onDone}:{register?:boolean;username?:string;onDone?:(user:Account)=>void}) {
  const session=useAccount(),router=useRouter();
  const [username,setUsername]=useState(fixedUsername??''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[next,setNext]=useState('/courses'),[hydrated,setHydrated]=useState(false);
  useEffect(()=>{setNext(safeReturn(new URLSearchParams(window.location.search).get('next')));setHydrated(true);},[]);
  return <form onSubmit={async e=>{
    e.preventDefault();if(busy||!hydrated)return;
    if(register&&password!==repeat){setError('两次密码不一致');return;}
    setBusy(true);setError('');
    try{const user=parseAccount(await request('/api/auth/'+(register?'register':'login'),{username,password}));setPassword('');setRepeat('');
      if(onDone)onDone(user);else{session.accept(user);router.replace(next);}
    }catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setBusy(false);}
  }}>
    {error&&<p role="alert" className="error">{error}</p>}
    <fieldset disabled={busy||!hydrated}><label>用户名<input required pattern="[a-zA-Z0-9_]{3,32}" minLength={3} maxLength={32} autoComplete="username" readOnly={!!fixedUsername} value={username} onChange={e=>setUsername(e.target.value)}/></label>
    <p className="hint">3–32位英文字母、数字或下划线，不区分大小写。</p>
    <label>密码<input required type="password" minLength={register?6:1} maxLength={128} autoFocus={!!fixedUsername} autoComplete={register?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {register&&<label>确认密码<input required type="password" minLength={6} maxLength={128} autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>}
    <button type="submit">{busy?'正在提交…':register?'注册并进入课程':'登录'}</button></fieldset>
    {!fixedUsername&&<p><Link href={(register?'/login':'/register')+'?next='+encodeURIComponent(next)}>{register?'已有账号？登录':'没有账号？注册'}</Link></p>}
    <p className="hint">本机试用版；暂不支持邮件找回密码，请通过本机维护重置。</p>
  </form>;
}
