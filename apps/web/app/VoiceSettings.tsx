'use client';
import type {Project} from '../lib/editor';
import {DraftNotice,useLocalDraft} from './LocalDraft';
import {useConfirm} from './ConfirmContext';

export function VoiceSettings({project,dirty,busy,formEditing,onDirty,onSave,act}:{
  project:Project;dirty:boolean;busy:boolean;formEditing:boolean;onDirty:(value:boolean)=>void;
  onSave:(speaker:string)=>Promise<void>;act:(fn:()=>Promise<unknown>)=>Promise<void>;
}) {
  const confirmDialog = useConfirm();
  const draft=useLocalDraft({kind:'voice',projectId:project.id,sceneId:'',label:project.title+' · 项目音色'},
    project.revision,{speaker:project.voice?.speaker??''},()=>onDirty(true));
  const disabled=busy||(dirty&&!formEditing)||!project.voice;
  return <section aria-label="项目配音设置">
    <h3>项目音色</h3>
    {!project.voice?<p className="hint">本地API尚未启用项目音色设置，暂不可编辑。</p>:<>
      <p className="hint">当前：{project.voice.speaker} · {project.voice_configured?'本项目独立设置':'继承本地默认'}。仅影响后续配音；已有音轨、旧版本与排队任务不会自动改写。旧音色任务完成后不覆盖当前音轨。</p>
      <p className="hint">填写供应商公开音色ID，不是密钥；需你确认该音色对当前账号与资源有权限。这里不联网验证、不付费试听；保存不自动配音或克隆音色。</p>
      <DraftNotice {...draft.notice} disabled={disabled}/>
      <form onSubmit={event=>{event.preventDefault();if(disabled||draft.blocked)return;void act(async()=>{
        const ok = await confirmDialog({
          title: '保存项目音色设置',
          message: '保存本项目音色设置（不计费）？',
          detail: '仅影响后续配音，已有音轨保留；不会自动重新配音，旧任务结果不会覆盖新音色。',
          confirmText: '确认保存',
          variant: 'info'
        });
        if(!ok)return;
        await onSave(draft.value.speaker);draft.clear();
      });}}>
        <fieldset disabled={disabled||draft.blocked} style={{border:0,padding:0,margin:0,minWidth:0}}>
          <label>项目音色ID<input required maxLength={200} pattern={'[A-Za-z0-9_\\-]{1,200}'} value={draft.value.speaker}
            onChange={event=>{draft.change({speaker:event.target.value});onDirty(true);}}/></label>
          <button type="submit" disabled={!draft.edited}>保存音色设置（不计费）</button>
        </fieldset>
      </form>
    </>}
  </section>;
}
