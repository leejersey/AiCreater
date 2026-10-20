'use client';
import {useState} from 'react';
import {AccountGate,AccountNav,useAccount} from '../AccountSession';
import {request} from '../../lib/editor';
import {parseAccount} from '../../lib/accounts';
function Password(){
  const {accept}=useAccount();const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  return <><AccountNav/><main className="account-page"><h1>修改密码</h1><p>成功后其他登录会话失效，当前页面继续使用。</p>
    {error&&<p role="alert">{error}</p>}{saved&&<p role="status">密码已更新，其他会话已退出。</p>}
    <form onSubmit={async e=>{e.preventDefault();if(busy)return;if(password!==repeat){setError('两次新密码不一致');return;}setBusy(true);setError('');setSaved(false);
      try{accept(parseAccount(await request('/api/auth/password',{current_password:current,new_password:password})));setCurrent('');setPassword('');setRepeat('');setSaved(true);}
      catch(e){setError(e instanceof Error?e.message:'修改失败');}finally{setBusy(false);}
    }}><fieldset disabled={busy}><label>当前密码<input required type="password" maxLength={128} autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></label>
    <label>新密码<input required type="password" minLength={6} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <label>确认新密码<input required type="password" minLength={6} maxLength={128} autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>
    <button type="submit">{busy?'正在保存…':'更新密码'}</button></fieldset></form></main></>;
}
export default function Account(){return <AccountGate><Password/></AccountGate>;}
