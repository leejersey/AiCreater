import type {ConfirmOptions} from '../app/ConfirmContext';
import {visualAgentBody,AGENT_MAX_TURNS} from './visual-workbench';

/** The model the job will freeze: the course owner's own, or the server's DeepSeek. */
export type AgentModel={configured:boolean;model:string};
export function agentModelLabel(llm?:AgentModel):string{
 return llm?.configured?`你在个人中心配置的 ${llm.model}，费用由你的服务商收取`:'服务端 DeepSeek，开启思考';
}
export type VisualAction={path:string;body:Record<string,unknown>;confirmation:ConfirmOptions};
export async function confirmVisualAction(action:VisualAction,confirm:(options:ConfirmOptions)=>Promise<boolean>,submit:(path:string,body:Record<string,unknown>)=>Promise<unknown>):Promise<boolean>{
 if(!await confirm(action.confirmation))return false;
 await submit(action.path,action.body);return true;
}
export function visualAgentReviseAction(sceneId:string,revision:number,job:string,feedback:string,llm?:AgentModel):VisualAction{
 return {path:'/agent',body:visualAgentBody(sceneId,revision,{job,feedback}),confirmation:{title:'按意见修改本章视频（付费）',
  message:`Agent 从这个版本的画面代码出发，只按你的意见修改，其余保持不变；改完仍要通过全部自动检查，再用当前配音和字幕生成新视频。最多 ${AGENT_MAX_TURNS} 轮模型调用（${agentModelLabel(llm)}），每轮计费；未通过即停止，不自动重试，原版本保留。`,
  detail:'修改意见：'+feedback.trim(),
  confirmText:`确认最多 ${AGENT_MAX_TURNS} 轮付费调用`,variant:'warning'}};
}
export function visualAgentAction(sceneId:string,revision:number,llm?:AgentModel):VisualAction{
 return {path:'/agent',body:visualAgentBody(sceneId,revision),confirmation:{title:'Agent 生成本章视频（付费）',
  message:`由 Agent 根据本章口播与实测时间轴自行设计画面：写代码、渲染、自动检查并修正，通过检查后用当前配音和字幕生成视频。最多 ${AGENT_MAX_TURNS} 轮模型调用（${agentModelLabel(llm)}），每轮计费；未在上限内通过即停止，不自动重试。提交后再修改模型配置，这个任务会停止。画面代码在本机渲染，并非安全沙箱。`,
  confirmText:`确认最多 ${AGENT_MAX_TURNS} 轮付费调用`,variant:'warning'}};
}

export type AutopilotPlan={revision:number;chapters:{scene_id:string;index:number;steps:('voice'|'timing'|'agent')[]}[];
 voice:{status:string;maximum_cny:number|null;quantity:{characters:number}}|null;agent:{chapters:number;max_turns_each:number;max_turns_total:number};llm:{source:'account'|'env';model:string}};
/** The one confirmation for the whole course: what may be voiced and generated, and what it may cost. */
export function autopilotConfirmation(plan:AutopilotPlan):ConfirmOptions{
 const voiced=plan.chapters.filter(c=>c.steps.includes('voice'));
 const lines=[
  voiced.length?`配音 ${voiced.length} 章（第 ${voiced.map(c=>c.index+1).join('、')} 章）：${plan.voice?.maximum_cny!=null?`约 ¥${plan.voice.maximum_cny}（火山 TTS 公开价，${plan.voice.quantity.characters} 字）`:'费用暂无法估算'}。`:'无需配音。',
  plan.agent.chapters?`生成视频 ${plan.agent.chapters} 章：每章最多 ${plan.agent.max_turns_each} 轮模型调用，合计最多 ${plan.agent.max_turns_total} 轮（${agentModelLabel({configured:plan.llm.source==='account',model:plan.llm.model})}）。`:'',
  '按章节顺序一次一个任务自动推进；失败的章节不重试；提交后修改模型配置会让流水线停止；可随时停止。生成的视频仍需你逐章确认（可用连续审片）。',
 ].filter(Boolean);
 return {title:`整课自动生成 ${plan.chapters.length} 章（付费）`,message:lines.join('\n'),confirmText:`确认整课自动生成`,variant:'warning'};
}
