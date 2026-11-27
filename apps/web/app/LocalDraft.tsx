'use client';
import {useEffect, useRef, useState} from 'react';
import {useAccount} from './AccountSession';
import {useConfirm} from './ConfirmContext';
import {DRAFT_EVENT, draftKey, listDrafts, readDraft, removeDraft, writeDraft, userDraftStorage,userDraftPrefix,
  type DraftData, type DraftKind, type DraftRecord, type DraftScope} from '../lib/drafts';

function announce(key: string) {window.dispatchEvent(new CustomEvent(DRAFT_EVENT,{detail:{key}}));}
/** autoRestore: a saved draft of the same revision fills the form straight away (with a way to discard it) instead of
 *  locking the form until the person chooses. */
export function useLocalDraft<K extends DraftKind>(scope: DraftScope & {kind: K}, revision: number, initial: DraftData[K], onRestore?: () => void, options?: {autoRestore?: boolean}) {
  const userId=useAccount().user?.id;
  const storage=()=>userId?userDraftStorage(window.localStorage,userId):window.localStorage;
  const key=draftKey(scope),eventKey=(userId?userDraftPrefix(userId):'')+key;
  const [value,setValue]=useState(initial), [ready,setReady]=useState(false);
  const current=useRef(initial), expected=useRef<string|null|undefined>(undefined), editedRef=useRef(false);
  const [pending,setPending]=useState<string|null>(null), [error,setError]=useState(''), [saved,setSaved]=useState(false), [edited,setEdited]=useState(false);
  const [restoredAt,setRestoredAt]=useState<number|null>(null), [discarded,setDiscarded]=useState<DraftData[K]|null>(null);
  useEffect(()=>{
    current.current=initial; setValue(initial); editedRef.current=false; setEdited(false); setReady(false); setSaved(false); setError(''); setRestoredAt(null); setDiscarded(null);
    try {
      const raw=storage().getItem(key); expected.current=raw;
      const found=options?.autoRestore?readDraft(raw,scope):null;
      // The draft is already in this browser, so restoring it neither saves nor risks anything: no lock, no prompt.
      if(found&&found.revision===revision){current.current=found.data;setValue(found.data);setPending(null);setSaved(true);setRestoredAt(found.updatedAt||Date.now());}
      else setPending(raw);
    }
    catch {expected.current=undefined; setError('无法读取本机草稿，输入不会可靠暂存；请复制文本备份。');}
    setReady(true);
    const changed=(event:Event)=>{
      if(event instanceof StorageEvent && event.key!==null && event.key!==eventKey) return;
      if(event instanceof CustomEvent && event.detail?.key!==eventKey) return;
      try {
        const raw=storage().getItem(key);
        if(raw===expected.current)return;
        if(editedRef.current && !(event instanceof CustomEvent && raw===null)) {
          setSaved(false);setError('其他页面的草稿已变化，本页输入保留；请先复制文本再重新打开。');return;
        }
        expected.current=raw;setPending(raw);setSaved(false);
      } catch {setSaved(false);setError('无法读取本机草稿；请复制当前输入。');}
    };
    window.addEventListener('storage',changed);window.addEventListener(DRAFT_EVENT,changed);
    return ()=>{window.removeEventListener('storage',changed);window.removeEventListener(DRAFT_EVENT,changed);};
    // Only a different form/revision resets input; polling creates new initial objects.
  },[key,revision,userId]);
  useEffect(()=>{
    if(!edited)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[edited]);
  function change(patch: Partial<DraftData[K]>) {
    const next={...current.current,...patch};current.current=next;setValue(next);editedRef.current=true;setEdited(true);setSaved(false);
    if(!ready || pending!==null || expected.current===undefined){setError('本机草稿尚未就绪，当前输入保留；请先处理恢复提示或复制备份。');return;}
    try {
      expected.current=writeDraft(storage(),scope,revision,next,expected.current);
      setError('');setSaved(true);announce(eventKey);
    } catch(e){setError(e instanceof Error && /其他页面|过大|字段/.test(e.message)?e.message:'本机暂存失败（浏览器限制或空间不足）；当前输入保留，请复制备份。');}
  }
  function clear() {
    setRestoredAt(null);setDiscarded(null);
    try {
      if(expected.current===undefined)throw new Error('本机草稿不可访问，无法确认清理；请重新打开检查。');
      removeDraft(storage(),scope,expected.current);expected.current=null;current.current=initial;setValue(initial);setPending(null);setSaved(false);setError('');editedRef.current=false;setEdited(false);announce(eventKey);
    } catch(e){setSaved(false);setError(e instanceof Error?e.message:'无法清理本机草稿，请重新打开检查。');}
  }
  const record=readDraft(pending,scope);
  function restore() {
    if(!record || record.revision!==revision)return;
    current.current=record.data;setValue(record.data);setPending(null);editedRef.current=true;setEdited(true);setSaved(true);setError('');onRestore?.();
  }
  /** Throw away an automatically restored draft, keeping it for one 「撤销」. */
  function discardRestored() {const data=current.current;clear();setDiscarded(data);}
  function undoDiscard() {if(discarded){const data=discarded;setDiscarded(null);change(data);}}
  return {value,change,clear,edited,blocked:!ready||pending!==null,
    notice:{ready,pending,record,revision,error,saved,restore,discard:clear,restoredAt,discarded:discarded!==null,discardRestored,undoDiscard}};
}

function draftSummary(record:DraftRecord|null):string{
  if(!record)return '';
  const data=record.data as Record<string,unknown>;
  const parts:string[]=[];
  if(typeof data.title==='string'&&data.title.trim())parts.push(`标题：「${data.title.trim()}」`);
  else if(typeof data.topic==='string'&&data.topic.trim())parts.push(`选题：「${data.topic.trim()}」`);
  if(typeof data.speaker==='string'&&data.speaker.trim())parts.push(`音色：${data.speaker.trim()}`);
  if(typeof data.source==='string'&&data.source.trim()){
    const snippet=data.source.trim().replace(/\s+/g,' ').slice(0,80);
    parts.push(`正文预览：${snippet}${data.source.trim().length>80?'…':''}`);
  }
  return parts.join(' · ');
}

type NoticeProps={ready:boolean;pending:string|null;record:DraftRecord|null;revision:number;error:string;saved:boolean;
  restore:()=>void;discard:()=>void;disabled?:boolean;restoredAt?:number|null;discarded?:boolean;discardRestored?:()=>void;undoDiscard?:()=>void};
export function DraftNotice({ready,pending,record,revision,error,saved,restore,discard,disabled,restoredAt,discarded,discardRestored,undoDiscard}:NoticeProps) {
  const summary=draftSummary(record);
  return <div aria-label="本机草稿提示" className="draft-notice">
    {error&&<p role="alert" className="error-text">{error}</p>}
    {!ready&&<p className="hint">正在检查本机草稿…</p>}
    {pending!==null&&<div className="draft-banner">
      <div className="draft-banner-head">
        <p className="unsaved">发现本机未保存草稿 · {record ? `r${record.revision}` : '格式损坏或不受支持'}。不自动保存到服务器。</p>
        {record?.updatedAt&&<span className="hint">暂存于 {new Date(record.updatedAt).toLocaleString('zh-CN')}</span>}
      </div>
      {summary&&<p className="draft-summary">{summary}</p>}
      {record&&record.revision!==revision&&<p className="error-text">当前已是r{revision}，版本不同；仅供复制，不会覆盖新版。</p>}
      <div className="draft-banner-actions">
        {record&&record.revision===revision&&<button type="button" className="btn-accent" disabled={disabled} onClick={restore}>恢复到表单（仍未保存）</button>}
        <button type="button" disabled={disabled} onClick={discard}>丢弃本机草稿</button>
      </div>
      <details className="draft-raw"><summary>查看／复制草稿文本</summary><textarea aria-label="待恢复草稿文本" readOnly rows={8} value={record?JSON.stringify(record.data,null,2):pending}/></details>
    </div>}
    {restoredAt&&!error&&<p className="hint draft-restored">已恢复 {new Date(restoredAt).toLocaleString('zh-CN')} 暂存在本机的草稿（尚未保存到服务器）。
      {discardRestored&&<button type="button" className="link-button" disabled={disabled} onClick={discardRestored}>丢弃，重新开始</button>}</p>}
    {discarded&&<p className="hint draft-restored">已丢弃本机草稿。{undoDiscard&&<button type="button" className="link-button" disabled={disabled} onClick={undoDiscard}>撤销</button>}</p>}
    {saved&&!error&&!restoredAt&&<p className="hint">已暂存到本机浏览器，尚非服务器保存；清理浏览器数据会丢失。</p>}
  </div>;
}

export function DraftShelf({busy,onOpen}:{busy:boolean;onOpen:(scope:DraftScope)=>void}) {
  const confirmDialog = useConfirm();
  const userId=useAccount().user?.id;
  const storage=()=>userId?userDraftStorage(window.localStorage,userId):window.localStorage;
  const [entries,setEntries]=useState<ReturnType<typeof listDrafts>>([]),[error,setError]=useState('');
  useEffect(()=>{
    const load=()=>{try{setEntries(listDrafts(storage()));setError('');}catch{setError('无法读取本机草稿列表；浏览器可能禁用存储。');}};
    load();window.addEventListener('storage',load);window.addEventListener(DRAFT_EVENT,load);
    return()=>{window.removeEventListener('storage',load);window.removeEventListener(DRAFT_EVENT,load);};
  },[userId]);
  if(!entries.length&&!error)return null;
  return <section aria-label="本机未保存草稿"><h2>本机未保存草稿 · {entries.length}</h2>
    <p className="hint">仅此浏览器/地址，包含文稿内容，不加密、不跨设备。打开对应表单后选择恢复；已移除章节或旧版本仍可在这里复制。</p>
    {error&&<p role="alert" className="error-text">{error}</p>}
    {entries.map(({scope,raw,record})=><details key={draftKey(scope)}><summary>{record?.label??scope.kind} · {record?`r${record.revision}`:'损坏/未知格式'}</summary>
      <textarea aria-label={'复制本机草稿 '+draftKey(scope)} readOnly rows={6} value={record?JSON.stringify(record.data,null,2):raw}/>
      <button disabled={busy} onClick={()=>onOpen(scope)}>打开对应表单</button>
      <button disabled={busy} onClick={async ()=>{
        const ok = await confirmDialog({
          title: '删除本机备份确认',
          message: '确定要删除这份本机备份吗？',
          detail: '仅删除这份本机备份，不会修改服务器或清除当前表单输入。后续编辑会重新暂存。',
          confirmText: '确认删除',
          variant: 'danger'
        });
        if(!ok)return;
        try{removeDraft(storage(),scope,raw);announce((userId?userDraftPrefix(userId):'')+draftKey(scope));}catch{setError('草稿已变化或存储受限，未删除；请重新打开检查并复制备份。');}
      }}>删除此本机备份</button>
    </details>)}
  </section>;
}
