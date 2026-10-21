'use client';
import {useState} from 'react';
import {GraphicsFields} from './GraphicsFields';
import {graphicsText,graphicsPatch} from '../lib/graphics-editor';
import {CodeStateFields} from './CodeStateFields';
import {SceneRow, formSteps, scenePatch, updateStep, toggleCodeStateSteps, formEdgeError, codeStateFields, cueSteps, cuePreview, stepStartFrame} from '../lib/editor';
import {DraftNotice, useLocalDraft} from './LocalDraft';
import type {Element, VideoProject} from '../../../packages/video-schema/src/types';
import {conceptLabels} from '../../../packages/video-schema/src/concept';
import {MapPin, Sliders, FileText, PlusCircle, Trash2} from './Icons';
import {useConfirm} from './ConfirmContext';

export function PreviewSteps({row,video,busy,dirty,onSeek,draftPreview=false}:{row:SceneRow;video:VideoProject|null;busy:boolean;dirty:boolean;onSeek:(frame:number)=>void;draftPreview?:boolean}) {
  return <nav aria-label="步骤预览定位">
    <p className="hint">{draftPreview?'定位静音草稿的临时入场点，不代表真实配音时间；未保存时不可定位。':'定位已保存的步骤触发点，暂停且不自动播放；未保存或待配音/对齐时不可定位。'}</p>
    <div className="actions">{row.scene.elements.map((step,index)=>{
      const frame=(row.state==='ready'||draftPreview)&&video?stepStartFrame(video,row.scene.id,step.id):null;
      return <button type="button" key={step.id} title={step.content} disabled={busy||dirty||frame===null} onClick={()=>{if(!busy&&!dirty&&frame!==null)onSeek(frame);}}><MapPin size={12}/> 定位步骤{index+1}</button>;
    })}</div>
  </nav>;
}

export function SceneEditor({projectId, row, disabled, onDirty, save, act}: {projectId: string; row: SceneRow; disabled: boolean; onDirty: (v: boolean) => void; save: (changes: unknown) => Promise<void>; act: (fn: () => Promise<unknown>) => Promise<void>}) {
  const confirmDialog = useConfirm();
  const draft=useLocalDraft({kind:'scene',projectId,sceneId:row.id,label:'场景编辑 · '+row.scene.type+' · '+row.id},row.revision,
    {text:row.scene.narration.text,code:row.scene.code?.source??'',steps:JSON.stringify(row.scene.elements,null,2),edges:row.scene.edges??[],arrayName:row.scene.code?.array_name,rawStates:{},rawCues:{},graphics:graphicsText(row.scene)},()=>onDirty(true));
  const {text,code,steps,edges,arrayName,rawStates,rawCues={}}=draft.value;
  const setText=(text:string)=>draft.change({text}),setCode=(code:string)=>draft.change({code}),setSteps=(steps:string)=>draft.change({steps});
  const setEdges=(edges:typeof draft.value.edges)=>draft.change({edges});
  const setArrayName=(arrayName:string|undefined)=>draft.change({arrayName});
  const externalDisabled=disabled; disabled=disabled||draft.blocked;
  const [advanced,setAdvanced]=useState(false), [error,setError]=useState('');
  const edgeError=row.scene.type==='flow_diagram'?formEdgeError(row.scene.elements,edges):'';
  function changeEdges(next:typeof edges){setEdges(next);setError('');onDirty(true);}
  const [stateErrors,setStateErrors]=useState<Record<number,boolean>>({});
  const invalidState=Object.values(stateErrors).some(Boolean)||Object.entries(rawStates).some(([id,raw])=>{
    try{const index=formSteps(steps).findIndex(e=>e.id===id);updateStep(steps,index,codeStateFields(raw));return false;}catch{return true;}
  });
  let parsed: Element[] | undefined, cueElements: Element[] | undefined, parseError='', cueError='', mergedSteps=steps;
  try { parsed=formSteps(steps); } catch(e) { parseError=e instanceof Error?e.message:'步骤数据错误'; }
  if(parsed)try { mergedSteps=cueSteps(steps,text,row.scene.type,rawCues);cueElements=formSteps(mergedSteps); }
  catch(e) { cueError=e instanceof Error?e.message:'触发范围无效，原输入保留。'; }
  let graphicsError='';const graphics=draft.value.graphics??graphicsText(row.scene);
  const graphicsScene={...row.scene,narration:{text},elements:cueElements??parsed??row.scene.elements,...(row.scene.type==='flow_diagram'?{edges}:{})};
  try{graphicsPatch(graphicsScene,graphics);}catch(e){graphicsError=e instanceof Error?e.message:'图形配置错误';}
  function rawCue(step:Element) {
    return Object.hasOwn(rawCues,step.id)?rawCues[step.id]:{text_start:String(step.cue.text_start),text_end:String(step.cue.text_end)};
  }
  function changeCue(step:Element,field:keyof Element['cue'],value:string) {
    draft.change({rawCues:{...rawCues,[step.id]:{...rawCue(step),[field]:value}}});setError('');onDirty(true);
  }
  function change(index:number,values:Parameters<typeof updateStep>[2]) {
    try { setSteps(updateStep(steps,index,values));setError('');onDirty(true);return true; }
    catch(e) { setError(e instanceof Error?e.message:'修改失败；输入保留。');return false; }
  }
  return <form onSubmit={e=>{e.preventDefault();if(disabled||!parsed||invalidState||edgeError||cueError||graphicsError)return;void act(async()=>{await save({...scenePatch({...row.scene,code:row.scene.code?{...row.scene.code,array_name:arrayName}:undefined},text,code,mergedSteps,JSON.stringify(edges)!==JSON.stringify(row.scene.edges??[])?edges:undefined),...(graphics!==graphicsText(row.scene)?{graphics:graphicsPatch(graphicsScene,graphics)}:{})});draft.clear();});}}>
    <DraftNotice {...draft.notice} disabled={externalDisabled}/>
    {invalidState&&<p role="alert" className="error-text">数组快照存在无效输入，请修正后保存；原始文本已保留。</p>}
    <fieldset disabled={disabled} style={{border:0,padding:0,margin:0,minWidth:0}}>
    <label>口播<textarea disabled={disabled} rows={5} value={text} onChange={e=>{setText(e.target.value);onDirty(true);}}/></label>
    {row.scene.code&&<label>代码 · {row.scene.code.language}<textarea className="code" disabled={disabled} rows={9} spellCheck={false} value={code} onChange={e=>{setCode(e.target.value);onDirty(true);}}/></label>}
    {row.scene.code&&<><label className="check"><input type="checkbox" disabled={disabled||!parsed||invalidState} checked={arrayName!==undefined} onChange={async e=>{
      const nextChecked = e.target.checked;
      if(!nextChecked){
        const ok = await confirmDialog({
          title: '切回旧布局确认',
          message: '确定要关闭同屏模式切回旧布局吗？',
          detail: '切回旧布局会清除数组、指针、轮次、输入快照；变量、输出和代码保留。',
          confirmText: '确认切回',
          variant: 'warning'
        });
        if(!ok)return;
      }
      try{setSteps(toggleCodeStateSteps(steps,nextChecked));draft.change({arrayName:nextChecked?'':undefined,rawStates:{}});setStateErrors({});setError('');onDirty(true);}catch{setError('请先修正步骤JSON；原输入保留。');}
    }}/>数组 / 指针 / 循环同屏（不执行代码）</label>{arrayName!==undefined&&<><label>数组名称（1–8码点）<input disabled={disabled} value={arrayName} onChange={e=>{setArrayName(e.target.value);onDirty(true);}}/></label><p className="hint">同屏模式：≤6项数组、2个指针、3个变量；变量名≤6/值≤8码点，步骤标题≤20。初始只有空快照，必须手动填写并核对，保存不修改配音。</p></>}</>}
    <button type="button" disabled={disabled||invalidState||!!cueError} onClick={()=>{if(advanced&&!parsed){setError('请先修正高级JSON，原输入未清除。');return;}if(Object.keys(rawCues).length)draft.change({steps:mergedSteps,rawCues:{}});setAdvanced(!advanced);setError('');}}>{advanced?<><Sliders size={13}/> 切换步骤表单</>:<><FileText size={13}/> 切换高级JSON</>}</button>
    {cueError&&<p role="alert" className="error-text">{cueError}</p>}
    {(error||parseError)&&<p role="alert" className="error-text">{error||parseError}</p>}
    {advanced||!parsed?<label>步骤 / 高亮 / 变量 / 输出 / 状态 JSON<textarea className="code" disabled={disabled} rows={12} spellCheck={false} value={steps} onChange={e=>{draft.change({steps:e.target.value,rawStates:{},rawCues:{}});setError('');onDirty(true);}}/></label>:parsed.map((step,i)=><fieldset disabled={disabled} key={step.id}>
      <legend>步骤 {i+1} · {step.id}</legend>
      <label>步骤 {i+1} 触发起点（含，0起）<input inputMode="numeric" value={rawCue(step).text_start} onChange={e=>changeCue(step,'text_start',e.target.value)}/></label>
      <label>步骤 {i+1} 触发终点（不含）<input inputMode="numeric" value={rawCue(step).text_end} onChange={e=>changeCue(step,'text_end',e.target.value)}/></label>
      <p className="hint">口播共{Array.from(text).length}个Unicode码点。对应原文：{cueElements?<mark>{cuePreview(text,cueElements[i].cue)}</mark>:'范围无效，原输入保留。'}</p>
      {row.scene.type==='concept'&&<label>{`教学角色：${step.concept_role?conceptLabels[step.concept_role]:'请选择'}`}<select aria-label={`步骤 ${i+1} 教学角色`} value={step.concept_role??''} onChange={e=>change(i,{concept_role:e.target.value as Element['concept_role']})}>
        {!step.concept_role&&<option value="">请选择</option>}{Object.entries(conceptLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>}
      {step.role==='topic'&&<p className="hint">主题标题 · 提前显示（标记只读，需核对不是计算答案）</p>}
      <label>步骤 {i+1} 说明<input value={step.content} onChange={e=>change(i,{content:e.target.value})}/></label>
      {['title_reveal','card_sequence','flow_diagram','comparison_panel'].includes(row.scene.type)&&<details open={!!(step.icon||step.step||step.highlight||step.source_label||step.panel_style)}><summary>教学图文样式（复用原配音）</summary>
        <label>图标<select value={step.icon??''} onChange={e=>change(i,{icon:(e.target.value||undefined) as Element['icon']})}><option value="">无</option><option value="document">文档</option><option value="search">检索</option><option value="idea">概念</option><option value="code">代码</option><option value="check">确认</option><option value="warning">注意</option></select></label>
        <label>步骤编号（1–9，可留空）<input type="number" min={1} max={9} value={step.step??''} onChange={e=>change(i,{step:e.target.value===''?undefined:Number(e.target.value)})}/></label>
        <label>稿中来源标签（原口播中的原文，非已验证引用）<input maxLength={12} value={step.source_label??''} onChange={e=>change(i,{source_label:e.target.value||undefined})}/></label>
        <label className="check"><input type="checkbox" checked={step.panel_style==='conclusion'} disabled={disabled||step.role==='topic'} onChange={e=>change(i,{panel_style:e.target.checked?'conclusion':undefined})}/>结论面板（不会提前显示）</label>
        <label className="check"><input type="checkbox" checked={!!step.highlight} onChange={e=>change(i,{highlight:e.target.checked?{text_start:0,text_end:Math.min(2,[...step.content].length)}:undefined})}/>原文高亮</label>
        {step.highlight&&<><label>高亮起点（0起，Unicode码点）<input type="number" min={0} max={[...step.content].length-1} value={step.highlight.text_start} onChange={e=>change(i,{highlight:{...step.highlight!,text_start:Number(e.target.value)}})}/></label><label>高亮终点（不含）<input type="number" min={1} max={[...step.content].length} value={step.highlight.text_end} onChange={e=>change(i,{highlight:{...step.highlight!,text_end:Number(e.target.value)}})}/></label></>}
      </details>}
      {row.scene.code&&<>
        <div>高亮行（1起）</div><div className="line-options">{code.split('\n').slice(0,16).map((_,n)=><label className="check" key={n}><input type="checkbox" checked={step.code_lines?.includes(n+1)??false} onChange={e=>change(i,{code_lines:e.target.checked?[...(step.code_lines??[]),n+1].sort((a,b)=>a-b):(step.code_lines??[]).filter(v=>v!==n+1)})}/>第 {n+1} 行</label>)}</div>
        {(step.variables??[]).map((v,j)=><div key={j}>
          <label>步骤 {i+1} 变量 {j+1} 名称<input value={v.name} onChange={e=>change(i,{variables:step.variables!.map((old,k)=>k===j?{...old,name:e.target.value}:old)})}/></label>
          <label>步骤 {i+1} 变量 {j+1} 值<input value={v.value} onChange={e=>change(i,{variables:step.variables!.map((old,k)=>k===j?{...old,value:e.target.value}:old)})}/></label>
          <button type="button" onClick={()=>change(i,{variables:step.variables!.filter((_,k)=>k!==j)})}><Trash2 size={12}/> 删除变量 {j+1}</button>
        </div>)}
        <button type="button" disabled={disabled||(step.variables?.length??0)>=3} onClick={()=>change(i,{variables:[...(step.variables??[]),{name:'',value:''}]})}><PlusCircle size={13}/> 添加变量（最多3个）</button>
        {arrayName!==undefined&&<CodeStateFields key={step.id} step={step} index={i} disabled={disabled} text={Object.hasOwn(rawStates,step.id)?rawStates[step.id]:undefined} onText={value=>draft.change({rawStates:{...rawStates,[step.id]:value}})} change={values=>change(i,values)} onInvalid={v=>setStateErrors(old=>({...old,[i]:v}))} onDirty={()=>onDirty(true)}/>}
        <label>步骤 {i+1} 输出<input value={step.output??''} onChange={e=>change(i,{output:e.target.value})}/></label>
      </>}
    </fieldset>)}
    {['card_sequence','flow_diagram','comparison_panel'].includes(row.scene.type)&&<GraphicsFields scene={graphicsScene} value={graphics} onChange={graphics=>{draft.change({graphics});setError('');onDirty(true);}}/>}
    {graphicsError&&<p role="alert" className="error-text">{graphicsError}；原输入保留，请修正后保存。</p>}
    {row.scene.type==='flow_diagram'&&<fieldset disabled={disabled}><legend>流程连线</legend>
      <p className="hint">只连接现有节点，最多15条；可删除全部连线。重复或成环由服务端拒绝，原输入保留。仅改连线保留原配音与时间轴。</p>
      {edges.map((edge,i)=><div key={i}>
        <label>来源节点<select aria-label={`连线 ${i+1} 来源节点`} value={edge.from} onChange={e=>changeEdges(edges.map((old,j)=>j===i?{...old,from:e.target.value}:old))}>
          <option value="">请选择节点</option>{row.scene.elements.map(node=><option key={node.id} value={node.id}>{node.id} · {node.content}</option>)}
        </select></label>
        <label>目标节点<select aria-label={`连线 ${i+1} 目标节点`} value={edge.to} onChange={e=>changeEdges(edges.map((old,j)=>j===i?{...old,to:e.target.value}:old))}>
          <option value="">请选择节点</option>{row.scene.elements.map(node=><option key={node.id} value={node.id}>{node.id} · {node.content}</option>)}
        </select></label>
        <button type="button" onClick={()=>changeEdges(edges.filter((_,j)=>j!==i))}><Trash2 size={12}/> 删除连线 {i+1}</button>
      </div>)}
      <button type="button" disabled={disabled||edges.length>=15||row.scene.elements.length<2} onClick={()=>changeEdges([...edges,{from:'',to:''}])}><PlusCircle size={13}/> 新增连线</button>
      {edgeError&&<p role="alert" className="error-text">{edgeError}</p>}
    </fieldset>}
    <p className="hint">元素编号、顺序、主题标记只读，流程连线和概念教学角色可手工编辑。概念须恰好一个定义、至多一个总结；仅改角色保留配音和时间轴，仍需人工核对教学含义。仅改触发范围保留原配音，保存后待对齐，不能预览/导出当前稿；需显式本地重算时间轴（按原规则重建字幕与入场，缓存缺失会报错，不自动配音）。状态/时间线专用字段在高级JSON编辑，原数据保留。修改口播仍需重新配音。</p>
    <button className="primary" disabled={disabled||!parsed||invalidState||!!edgeError||!!cueError||!!graphicsError} type="submit">保存当前场景</button>
    </fieldset>
  </form>;
}
