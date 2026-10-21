'use client';
import type {DraftScene} from '../lib/editor';
import {readGraphics} from '../lib/graphics-editor';
import {useConfirm} from './ConfirmContext';
export function GraphicsFields({scene,value,onChange}:{scene:DraftScene;value:string;onChange:(v:string)=>void}){
 const confirm=useConfirm();let g:ReturnType<typeof readGraphics>;
 try{g=readGraphics(value);}catch{return <label>图形草稿格式错误，原输入保留<textarea aria-label="图形草稿修复JSON" value={value} onChange={e=>onChange(e.target.value)}/></label>;}
 const send=(next:typeof g)=>onChange(JSON.stringify(next));
 const choose=(label:string,id:string,change:(id:string)=>void)=><label>{label}<select aria-label={label} value={id} onChange={e=>change(e.target.value)}><option value="">请选择步骤</option>{scene.elements.map(e=><option key={e.id} value={e.id}>{e.id} · {e.content}</option>)}</select></label>;
 const group=(label:string,ids:string[],change:(ids:string[])=>void,max:number)=><fieldset><legend>{label}（按原稿顺序）</legend>{ids.map((id,i)=><div key={i}>{choose(`${label} ${i+1}`,id,v=>change(ids.map((x,j)=>j===i?v:x)))}<button type="button" onClick={()=>change(ids.filter((_,j)=>j!==i))}>删除{label} {i+1}</button></div>)}<button type="button" disabled={ids.length>=max} onClick={()=>change([...ids,''])}>添加{label}</button></fieldset>;
 const mode=g.funnel?'funnel':g.dialogue?'dialogue':g.process?'process':'normal';
 return <fieldset><legend>画面表达与讲解动作</legend>
 <p className="hint">漏斗：2–3层＋1–3侧注；对话：1–3消息＋1状态；处理链：2–4阶段＋至多2参数。每个步骤须恰好分到一组，正文和来源须来自其原稿范围。</p>
 <p className="hint">只编排已有步骤，不生成新事实或执行工具。切换表达会清除旧分组和动作，但不删除步骤；修改后保留配音，需要本地重新对齐。</p>
 {['card_sequence','flow_diagram'].includes(scene.type)&&<label>画面表达<select aria-label="画面表达" value={mode} onChange={async e=>{
  const next=e.target.value;if(next===mode)return;
  if(!await confirm({title:'切换画面表达',message:'清除当前图形分组和动作，保留步骤文字及原稿？',confirmText:'确认切换'}))return;
  const ids=scene.elements.map(e=>e.id);
  send(next==='funnel'?{motif:'funnel',funnel:{layers:ids.slice(0,2),notes:ids.slice(2).map(element_id=>({element_id}))}}:next==='dialogue'?{motif:'dialogue_split',dialogue:{messages:ids.slice(0,-1),state:ids.at(-1)??''}}:next==='process'?{motif:'default',process:{stages:ids.slice(0,Math.min(4,ids.length)),details:ids.slice(4)}}:{});
 }}><option value="normal">普通图文（不使用语义分组）</option><option value="funnel">漏斗＋侧注</option>{scene.type==='card_sequence'&&<option value="dialogue">对话＋状态</option>}{scene.type==='flow_diagram'&&<option value="process">处理链＋参数</option>}</select></label>}
 {g.funnel&&<>{group('漏斗层',g.funnel.layers,layers=>send({...g,funnel:{...g.funnel,layers}}),3)}<fieldset><legend>漏斗侧注</legend>{g.funnel.notes.map((n:{element_id:string;target?:string;direction?:string},i:number)=>{
  const change=(note:typeof n)=>send({...g,funnel:{...g.funnel,notes:g.funnel.notes.map((x:typeof n,j:number)=>j===i?note:x)}});
  return <div key={i}>{choose(`侧注 ${i+1}`,n.element_id,element_id=>change({...n,element_id}))}<label>侧注 {i+1} 类型<select aria-label={`侧注 ${i+1} 类型`} value={n.direction??(n.target?'target':'plain')} onChange={e=>change({element_id:n.element_id,...(e.target.value==='target'?{target:''}:e.target.value==='plain'?{}:{direction:e.target.value})})}><option value="plain">文字说明</option><option value="target">指向层</option><option value="up">向上方向</option><option value="down">向下方向</option></select></label>{n.target!==undefined&&choose(`侧注 ${i+1} 指向层`,n.target,target=>change({...n,target}))}<button type="button" onClick={()=>send({...g,funnel:{...g.funnel,notes:g.funnel.notes.filter((_:unknown,j:number)=>j!==i)}})}>删除侧注 {i+1}</button></div>;
 })}<button type="button" disabled={g.funnel.notes.length>=3} onClick={()=>send({...g,funnel:{...g.funnel,notes:[...g.funnel.notes,{element_id:''}]}})}>添加侧注</button></fieldset></>}
 {g.dialogue&&<>{group('对话消息',g.dialogue.messages,messages=>send({...g,dialogue:{...g.dialogue,messages}}),3)}{group('前文消息',g.dialogue.context_messages??[],context_messages=>send({...g,dialogue:{...g.dialogue,context_messages}}),2)}<p className="hint">前文须属于消息组；其余非更新来源消息标为当前消息。旧稿未设置时保留原标签。</p>{choose('状态步骤',g.dialogue.state,state=>send({...g,dialogue:{...g.dialogue,state}}))}</>}
 {g.process&&<>{group('处理阶段',g.process.stages,stages=>send({...g,process:{...g.process,stages}}),4)}{group('参数片段',g.process.details,details=>send({...g,process:{...g.process,details}}),2)}<p className="hint">流程连线只能连接处理阶段；请在下方连线区同步调整。</p></>}
 <fieldset><legend>讲解动作（最多12项）</legend>{(g.visual_actions??[]).map((a:{kind:string;target:string;to?:string;source?:string;cue:{text_start:string|number;text_end:string|number}},i:number)=>{
 const change=(action:typeof a)=>send({...g,visual_actions:g.visual_actions.map((x:typeof a,j:number)=>j===i?action:x)});
 const cue=(id:string)=>scene.elements.find(e=>e.id===id)?.cue??a.cue;
 return <fieldset key={i}><legend>动作 {i+1}</legend><label>动作类型<select aria-label={`动作 ${i+1} 类型`} value={a.kind} onChange={e=>change({kind:e.target.value,target:a.target,cue:a.cue,...(e.target.value==='connect'?{to:''}:e.target.value==='update'?{source:''}:{})})}><option value="highlight">强调</option><option value="connect">连线</option><option value="update">更新内容</option></select></label>
 {choose(`动作 ${i+1} 目标`,a.target,target=>change({...a,target,...(a.kind==='highlight'?{cue:cue(target)}:{})}))}
 {a.kind==='connect'&&choose(`动作 ${i+1} 连接到`,a.to??'',to=>change({...a,to,cue:cue(to)}))}
 {a.kind==='update'&&choose(`动作 ${i+1} 内容来源`,a.source??'',source=>change({...a,source,cue:cue(source)}))}
 <label>动作 {i+1} 原稿起点<input inputMode="numeric" value={a.cue.text_start} onChange={e=>change({...a,cue:{...a.cue,text_start:e.target.value}})}/></label>
 <label>动作 {i+1} 原稿终点（不含）<input inputMode="numeric" value={a.cue.text_end} onChange={e=>change({...a,cue:{...a.cue,text_end:e.target.value}})}/></label>
 <button type="button" onClick={()=>send({...g,visual_actions:g.visual_actions.filter((_:unknown,j:number)=>j!==i)})}>删除动作 {i+1}</button></fieldset>;
 })}<button type="button" disabled={(g.visual_actions?.length??0)>=12||!scene.elements.length} onClick={()=>send({...g,visual_actions:[...(g.visual_actions??[]),{kind:'highlight',target:scene.elements[0].id,cue:scene.elements[0].cue}]})}>添加讲解动作</button></fieldset>
 </fieldset>;
}
