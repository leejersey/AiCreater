'use client';
import React,{useEffect} from 'react';
import type {Project} from '../lib/editor';
import {visualStyles} from '../../../packages/video-components/src/theme';
import {DraftNotice,useLocalDraft} from './LocalDraft';

export function VisualStyleSettings({project,dirty,busy,formEditing,onDirty,onSave,act}:{
  project:Project;dirty:boolean;busy:boolean;formEditing:boolean;onDirty:(value:boolean)=>void;
  onSave:(style:string)=>Promise<void|boolean>;act:(fn:()=>Promise<unknown>)=>Promise<void>;
}){
  const draft=useLocalDraft({kind:'visual-style',projectId:project.id,sceneId:'',label:project.title+' · 视觉风格'},
    project.revision,{visual_style:project.visual_style?.id??'legacy'},()=>onDirty(true));
  useEffect(()=>{if(formEditing&&!draft.edited&&!draft.blocked)onDirty(false);},[formEditing,draft.edited,draft.blocked,onDirty]);
  const disabled=busy||(dirty&&!formEditing)||!project.visual_style;
  return <section aria-label="项目视觉风格"><h3>视觉风格</h3>
    {!project.visual_style?<p className="hint">本地API尚未启用视觉风格设置，暂不可编辑。</p>:<>
      <p className="hint">独立于配色。保存后更新当前预览，不重新配音、不改教学内容或对齐；导出冻结实际风格参数，旧版本和排队任务不随当前选择变化。「纸质幻灯」建议配浅色教学/彩色信息图主题，呈现系列头、黄高亮与红印章气质。</p>
      <DraftNotice {...draft.notice} disabled={disabled}/>
      <form onSubmit={event=>{event.preventDefault();if(disabled||draft.blocked)return;void act(async()=>{
        if(await onSave(draft.value.visual_style)!==false)draft.clear();
      });}}><fieldset disabled={disabled||draft.blocked} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <label>视觉风格<select required value={draft.value.visual_style} onChange={event=>{draft.change({visual_style:event.target.value});onDirty(true);}}>
          {Object.entries(visualStyles).map(([id,style])=><option key={id} value={id}>{style.label}</option>)}
        </select></label>
        <button type="submit" disabled={!draft.edited}>保存风格（不重新配音）</button>
      </fieldset></form>
    </>}
  </section>;
}
