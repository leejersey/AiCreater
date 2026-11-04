'use client';
import {useState} from 'react';
import type {Project} from '../lib/editor';
import {themeName,type ThemeSummary} from '../lib/themes';
import {ThemePicker} from './ThemePicker';
import {useConfirm} from './ConfirmContext';

/** One theme per course. Changing it is free: accepted chapters stay accepted, and the next export renders in it. */
export function ThemeSettings({project,themes,disabled,act,onSave}:{project:Project;themes:ThemeSummary[];disabled:boolean;
 act:(fn:()=>Promise<unknown>)=>Promise<void>;onSave:(themeId:string)=>Promise<void>}){
 const confirmDialog=useConfirm();
 const current=project.theme_id??themes.find(t=>t.default)?.id??'';
 const [open,setOpen]=useState(false),[choice,setChoice]=useState(current);
 if(!themes.length)return null;
 return <section aria-label="课程主题">
  <h3>课程主题</h3>
  <p className="hint">当前：{themeName(themes,current)}。主题决定背景、配色、字体与字幕条。</p>
  {!open?<button type="button" disabled={disabled} onClick={()=>{setChoice(current);setOpen(true);}}>更换主题（免费）</button>:<>
   <ThemePicker themes={themes} value={choice} disabled={disabled} onChange={setChoice}/>
   <div className="vw-toolbar">
    <button type="button" disabled={disabled||choice===current} onClick={()=>void act(async()=>{
     const ok=await confirmDialog({title:`更换为「${themeName(themes,choice)}」主题`,message:'更换主题不计费，也不会重新生成画面。',
      detail:'已确认的章节仍然有效；之后的整课导出按新主题渲染，之前导出的整课视频变为历史记录。各章已有的预览仍是原主题，可以逐章免费按新主题重渲染。',
      confirmText:'确认更换',variant:'info'});
     if(!ok)return;
     await onSave(choice);setOpen(false);
    })}>保存主题</button>
    <button type="button" disabled={disabled} onClick={()=>setOpen(false)}>取消</button>
   </div>
  </>}
 </section>;
}
