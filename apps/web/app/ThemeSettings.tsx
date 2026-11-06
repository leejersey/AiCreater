'use client';
import {useState} from 'react';
import type {Project} from '../lib/editor';
import {themeName,type ThemeSummary} from '../lib/themes';
import {ThemePicker} from './ThemePicker';
import {useConfirm} from './ConfirmContext';

/** One theme per course, optionally with its own accent color. Changing it is free: accepted chapters stay accepted, and
 * the next export renders in it. */
export function ThemeSettings({project,themes,disabled,act,onSave}:{project:Project;themes:ThemeSummary[];disabled:boolean;
 act:(fn:()=>Promise<unknown>)=>Promise<void>;onSave:(themeId:string,accent:string|null)=>Promise<void>}){
 const confirmDialog=useConfirm();
 const current=project.theme_id??themes.find(t=>t.default)?.id??'';
 const currentAccent=project.theme_accent??null;
 const [open,setOpen]=useState(false),[choice,setChoice]=useState(current),[accent,setAccent]=useState<string|null>(currentAccent);
 if(!themes.length)return null;
 const own=themes.find(t=>t.id===choice)?.preview.accent??'#000000';
 const changed=choice!==current||accent!==currentAccent;
 return <section aria-label="课程主题">
  <h3>课程主题</h3>
  <p className="hint">当前：{themeName(themes,current)}{currentAccent&&<>，强调色 <span className="theme-accent-chip" style={{background:currentAccent}}/>{currentAccent}</>}。主题决定背景、配色、字体与字幕条。</p>
  {!open?<button type="button" disabled={disabled} onClick={()=>{setChoice(current);setAccent(currentAccent);setOpen(true);}}>更换主题（免费）</button>:<>
   <ThemePicker themes={themes} value={choice} disabled={disabled} onChange={id=>{setChoice(id);setAccent(null);}}/>
   <label className="theme-accent-field">强调色（可选，例如品牌色）
    <span><input type="color" aria-label="强调色" disabled={disabled} value={accent??own} onChange={e=>setAccent(e.target.value.toLowerCase())}/>
    {accent?<>{accent} <button type="button" disabled={disabled} onClick={()=>setAccent(null)}>用主题自带颜色</button></>:<span className="hint">使用主题自带颜色</span>}</span>
   </label>
   <p className="hint">强调色需在该主题背景上清晰可读（对比度至少 3:1），保存时会检查。</p>
   <div className="vw-toolbar">
    <button type="button" disabled={disabled||!changed} onClick={()=>void act(async()=>{
     const ok=await confirmDialog({title:`使用「${themeName(themes,choice)}」主题${accent?`和强调色 ${accent}`:''}`,message:'更换主题不计费，也不会重新生成画面。',
      detail:'已确认的章节仍然有效；之后的整课导出按新主题渲染，之前导出的整课视频变为历史记录。各章已有的预览仍是原主题，可以逐章免费按新主题重渲染。',
      confirmText:'确认更换',variant:'info'});
     if(!ok)return;
     await onSave(choice,accent);setOpen(false);
    })}>保存主题</button>
    <button type="button" disabled={disabled} onClick={()=>setOpen(false)}>取消</button>
   </div>
  </>}
 </section>;
}
