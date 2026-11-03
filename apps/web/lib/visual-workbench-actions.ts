import type {ConfirmOptions} from '../app/ConfirmContext';
import {visualAgentBody,AGENT_MAX_TURNS} from './visual-workbench';

export type VisualAction={path:string;body:Record<string,unknown>;confirmation:ConfirmOptions};
export async function confirmVisualAction(action:VisualAction,confirm:(options:ConfirmOptions)=>Promise<boolean>,submit:(path:string,body:Record<string,unknown>)=>Promise<unknown>):Promise<boolean>{
 if(!await confirm(action.confirmation))return false;
 await submit(action.path,action.body);return true;
}
export function visualAgentAction(sceneId:string,revision:number):VisualAction{
 return {path:'/agent',body:visualAgentBody(sceneId,revision),confirmation:{title:'Agent 生成本章视频（付费）',
  message:`由 Agent 根据本章口播与实测时间轴自行设计画面：写代码、渲染、自动检查并修正，通过检查后用当前配音和字幕生成视频。最多 ${AGENT_MAX_TURNS} 轮模型调用（DeepSeek，开启思考），每轮计费；未在上限内通过即停止，不自动重试。画面代码在本机渲染，并非安全沙箱。`,
  confirmText:`确认最多 ${AGENT_MAX_TURNS} 轮付费调用`,variant:'warning'}};
}
