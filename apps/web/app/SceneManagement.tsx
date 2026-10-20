'use client';
import {DraftNotice, useLocalDraft} from './LocalDraft';
import {manualConceptElements, type Job, type Project, type SceneRow} from '../lib/editor';
import type {Element} from '../../../packages/video-schema/src/types';
import {conceptLabels} from '../../../packages/video-schema/src/concept';

type Props = {project: Project; row?: SceneRow; jobs: Job[]; busy: boolean; dirty: boolean; formEditing: boolean;
  onDirty: (value: boolean) => void; onCreate: (narration: string, content: string, conceptElements?: Element[]) => Promise<unknown>;
  onDuplicate: () => void; onDelete: () => void; act: (fn: () => Promise<unknown>) => Promise<void>};

export function SceneManagement({project, row, jobs, busy, dirty, formEditing, onDirty, onCreate, onDuplicate, onDelete, act}: Props) {
  const draft=useLocalDraft({kind:'append',projectId:project.id,sceneId:'',label:project.title+' · 新增场景'},project.revision,{content:'',narration:''},()=>onDirty(true));
  const {content,narration,sceneType='card_sequence',conceptSteps=[{content:'',concept_role:'definition'}]}=draft.value;
  const changeConcept=(next:typeof conceptSteps)=>{draft.change({conceptSteps:next});onDirty(true);};
  let conceptElements:Element[]|undefined,conceptError='';
  if(sceneType==='concept')try{conceptElements=manualConceptElements(narration,conceptSteps);}catch(e){conceptError=e instanceof Error?e.message:'概念摘录无效';}
  const setContent=(content:string)=>draft.change({content}),setNarration=(narration:string)=>draft.change({narration});
  const generating = jobs.some(j => j.kind === 'generate' && ['queued', 'running'].includes(j.state));
  const blocked = busy || dirty || generating;
  const sceneBusy = !!row && jobs.some(j => j.scene_id === row.id && ['queued', 'running'].includes(j.state));
  const formBlocked = draft.blocked || busy || generating || project.scenes.length >= 20 || (dirty && !formEditing);
  return <section aria-label="场景管理">
    <p className="hint">复制复用已有音频，不自动配音；删除只移除当前稿，保留旧版本、任务和媒体，无一键撤销。至少保留一章。</p>
    {row && <p className="hint">当前第{project.scenes.findIndex(s => s.id === row.id) + 1}章 · r{row.revision}</p>}
    <div className="actions">
      <button disabled={blocked || !row || project.scenes.length >= 20} onClick={onDuplicate}>复制当前场景</button>
      <button disabled={blocked || !row || project.scenes.length <= 1 || sceneBusy} onClick={onDelete}>删除当前场景</button>
    </div>
    {sceneBusy && <p className="hint">当前章任务未结束，不能删除；取消需等待消费者确认。</p>}
    {generating && <p className="hint">初始分镜生成未结束，暂不能更改章节结构。</p>}
    <details open={draft.notice.pending!==null||draft.edited}><summary>新增场景（不计费）</summary>
      <DraftNotice {...draft.notice} disabled={busy||generating||(dirty&&!formEditing)}/>
      <form onSubmit={event => {event.preventDefault();if(formBlocked||conceptError||!narration.trim()||(sceneType==='card_sequence'&&!content.trim()))return;void act(async()=>{await onCreate(narration,content,conceptElements);draft.clear();});}}>
        <fieldset disabled={formBlocked}>
          <label>场景类型<select value={sceneType} onChange={e=>{draft.change({sceneType:e.target.value as 'card_sequence'|'concept'});onDirty(true);}}><option value="card_sequence">要点卡片</option><option value="concept">概念解释</option></select></label>
          {sceneType==='card_sequence'?<label>展示要点<input required maxLength={40} value={content} onChange={e => {
            setContent(e.target.value); onDirty(true);
          }}/></label>:<>
            <p className="hint">按口播顺序填写1–6项连续原文摘录，每项1–40码点且唯一出现；恰好一个定义，至多一个总结。不改写原文，不自动补例子。</p>
            {conceptSteps.map((step,i)=><fieldset key={i}><legend>概念要点 {i+1}</legend>
              <label>要点 {i+1} 教学角色<select value={step.concept_role} onChange={e=>changeConcept(conceptSteps.map((s,j)=>j===i?{...s,concept_role:e.target.value as Element['concept_role']}:s))}>{Object.entries(conceptLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
              <label>要点 {i+1} 原文摘录<input required value={step.content} onChange={e=>changeConcept(conceptSteps.map((s,j)=>j===i?{...s,content:e.target.value}:s))}/></label>
              <button type="button" disabled={conceptSteps.length<=1} onClick={()=>changeConcept(conceptSteps.filter((_,j)=>j!==i))}>删除要点 {i+1}</button>
            </fieldset>)}
            <button type="button" disabled={conceptSteps.length>=6} onClick={()=>changeConcept([...conceptSteps,{content:'',concept_role:'feature'}])}>添加概念要点（最多6项）</button>
            {conceptError&&<p role="alert" className="error-text">{conceptError}</p>}
          </>}
          <label>新增场景口播<textarea required maxLength={4000} rows={5} value={narration} onChange={e => {
            setNarration(e.target.value); onDirty(true);
          }}/></label>
          <p className="hint">追加到末尾，初始待配音；全课最多20章、4000码点，超限不截断。</p>
          <button disabled={formBlocked || (sceneType==='card_sequence'&&!content.trim()) || !!conceptError || !narration.trim()} type="submit">保存新增场景（不计费）</button>
        </fieldset>
      </form>
    </details>
  </section>;
}
