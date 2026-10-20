'use client';
import {useEffect} from 'react';
import type {Project} from '../lib/editor';
import {isTeachingStyle, type TeachingStyle} from '../lib/teaching-style';
import {DraftNotice,useLocalDraft} from './LocalDraft';

function effectiveStyle(project: Project): TeachingStyle {
  return isTeachingStyle(project.teaching_style) ? project.teaching_style : 'popular';
}

export function TeachingStyleSettings({project,dirty,busy,formEditing,onDirty,onSave,act}:{
  project:Project;dirty:boolean;busy:boolean;formEditing:boolean;onDirty:(value:boolean)=>void;
  onSave:(style:TeachingStyle)=>Promise<void>;act:(fn:()=>Promise<unknown>)=>Promise<void>;
}){
  const draft=useLocalDraft({kind:'teaching-style',projectId:project.id,sceneId:'',label:project.title+' · 讲解风格'},
    project.revision,{teaching_style:effectiveStyle(project)},()=>onDirty(true));
  useEffect(()=>{if(formEditing&&!draft.edited&&!draft.blocked)onDirty(false);},[formEditing,draft.edited,draft.blocked,onDirty]);
  const disabled=busy||(dirty&&!formEditing);
  return <section aria-label="项目讲解风格"><h3>讲解风格</h3>
    <p className="hint">干货偏机制与术语；科普可偏比喻与概念。仅影响之后新生成的分镜；已有分镜、旧版本与排队任务不会自动改写。</p>
    <DraftNotice {...draft.notice} disabled={disabled}/>
    <form onSubmit={event=>{event.preventDefault();if(disabled||draft.blocked)return;void act(async()=>{
      const style=isTeachingStyle(draft.value.teaching_style)?draft.value.teaching_style:'popular';
      await onSave(style);draft.clear();
    });}}><fieldset disabled={disabled||draft.blocked} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <label>讲解风格<select required value={isTeachingStyle(draft.value.teaching_style)?draft.value.teaching_style:'popular'}
        onChange={event=>{draft.change({teaching_style:event.target.value});onDirty(true);}}>
        <option value="popular">科普</option>
        <option value="technical">知识干货</option>
      </select></label>
      <button type="submit" disabled={!draft.edited}>保存讲解风格（不计费）</button>
    </fieldset></form>
  </section>;
}
