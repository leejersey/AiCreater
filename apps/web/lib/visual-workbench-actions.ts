import type {ConfirmOptions} from '../app/ConfirmContext';
import {canProposeLayout,canApplyLayout,visualAgentBody,AGENT_MAX_TURNS} from './visual-workbench';
import {visualGenerateBody,canReviseDesign,canRecoverSource,canRepairRecoveredSource,visualGenerationActions,visualModeLabels,parseTransferImport,type VisualGenerationMode,type VisualJob} from './visual-workbench';

export type VisualAction={path:string;body:Record<string,unknown>;confirmation:ConfirmOptions};
export function visualProposeLayoutAction(job:VisualJob):VisualAction{
 if(!canProposeLayout(job))throw Error('当前任务不可建议布局');
 return {path:`/${job.id}/propose-layout`,body:{confirmed:true},confirmation:{title:'标签布局建议（免费）',message:'仅标签纵向布局建议：不调用模型或配音、不执行场景、不替换旧稿。提案未采用，不可预览或验收。',confirmText:'确认免费建议',variant:'info'}};
}
export function visualApplyLayoutAction(job:VisualJob):VisualAction{
 if(!canApplyLayout(job))throw Error('当前布局提案不可采用');
 const design=job.result!.design_sha256!,layout=job.result!.layout_sha256!;
 return {path:`/${job.id}/apply-layout`,body:{confirmed:true,max_requests:1,design_sha256:design,layout_sha256:layout},confirmation:{title:'采用布局并生成源码',message:'仅调用 1 次代码模型，复用提案设计与现有配音，不自动重试，旧稿保留。新源码须另行审阅并审批其哈希，本次不执行。',detail:`设计 SHA-256: ${design}\n布局提案 SHA-256: ${layout}`,confirmText:'确认 1 次代码模型调用',variant:'warning'}};
}
export function visualRecoverSourceAction(job:VisualJob):VisualAction{
 if(!canRecoverSource(job))throw Error('当前失败任务不可诊断');
 return {path:`/${job.id}/recover-source`,body:{confirmed:true},confirmation:{title:'免费源码离线诊断',
  message:'零模型离线诊断：不调用模型或配音、不执行场景、不替换原失败任务。诊断成功仅准备待审阅候选，未采用，不可预览或验收。',confirmText:'确认免费诊断',variant:'info'}};
}
export function visualRepairSourceAction(job:VisualJob,feedback:string):VisualAction{
 const text=feedback.trim();
 if(!canRepairRecoveredSource(job)||!text||[...text].length>8000)throw Error('无效的诊断候选修订请求');
 const sha=job.result!.sha256!,recovery=job.result!.recovery_sha256!;
 return {path:`/${job.id}/repair-source`,body:{confirmed:true,max_requests:1,feedback:text,sha256:sha,recovery_sha256:recovery},confirmation:{
  title:'付费修订诊断候选',message:'仅将候选作为一次付费代码修订起点：复用冻结设计，最多 1 次源码模型调用，不重新配音、不自动重试，旧稿保留，新源码须另行审批后才能执行。',
  detail:`SHA-256: ${sha}\n诊断 SHA-256: ${recovery}`,confirmText:'确认最多 1 次调用',variant:'warning'}};
}
export function visualAutomaticTransferAction(sceneId:string,revision:number):VisualAction{
 return {path:'/auto-transfer',body:{scene_id:sceneId,expected_revision:revision,confirmed:true,preset:'rag-augmentation:1'},confirmation:{
  title:'免费生成 RAG 机构候选',message:'采用 RAG 增强搬运固定预设，自动排布独立横梁、夹爪和材料，复用当前实测口播。检索仅静态展示，答案生成未动画化。不调用模型或配音、不执行场景、不替换旧稿；节拍不匹配即停止。',confirmText:'生成预设候选',variant:'info'}};
}
export function visualTransferAction(sceneId:string,revision:number,input:unknown):VisualAction{
 return {path:'/prepare-transfer',body:{scene_id:sceneId,expected_revision:revision,confirmed:true,...parseTransferImport(input)},confirmation:{
  title:'免费准备机构候选',message:'使用导入的机构设计与当前章节实测时间轴准备候选。不调用模型或配音，不执行场景、不渲染、不替换旧稿；设计不匹配时直接停止。',confirmText:'准备候选',variant:'info'}};
}
export function visualTransferPreviewAction(job:VisualJob):VisualAction{
 const sha=job.result?.sha256;
 if(job.kind!=='prepare-transfer'||job.state!=='succeeded'||job.current===false||!sha||!/^[a-f0-9]{64}$/.test(sha)||!job.result?.source||!job.result.binding_sha256)throw Error('尚无可审批的机构候选');
 return {path:`/${job.id}/preview-transfer`,body:{confirmed:true,sha256:sha},confirmation:{title:'批准候选诊断执行',
  message:'本次仅执行以下宿主装配源码，检查截图与几何；通过后生成带配音的诊断预览。本地执行不是安全沙箱，可能访问本机资源。零模型或配音请求，不替换旧稿、不登记验收、不加入整课导出。',
  detail:'请先审阅源码。本次仅批准该版本，内容变化须重新确认。\nSHA-256: '+sha,confirmText:'接受风险并诊断',variant:'danger'}};
}
export function visualGenerateAction(sceneId:string,revision:number,mode:VisualGenerationMode,draft=false):VisualAction{
 if(draft&&mode!=='source')throw Error('估时草稿仅支持自由画面源码');
 const stage=mode==='source'?'场景源码':mode==='host-components'?'组件选择与动作数据':mode==='host-intent'?'动作意图与绘图数据':'运动与绘图数据';
 return {path:'/generate',body:{...visualGenerateBody(sceneId,revision,mode),...(draft?{timing_mode:'draft'}:{})},confirmation:{title:draft?'付费视觉草稿':'付费视觉生成',message:`${draft?'估时无声草稿，不能验收或正式导出；不生成配音。':''}${visualModeLabels[mode]}：本次最多调用 2 次付费模型，视觉设计、${stage}。失败也可能计费，不自动重试或切换模式；新源码仍须审批。`,confirmText:'确认最多 2 次调用',variant:'warning'}};
}
export function visualCreateVideoAction(sceneId:string,revision:number,mode:VisualGenerationMode,draft=false,autoRepair=false):VisualAction{
 const original=visualGenerateAction(sceneId,revision,mode,draft);
 return {path:'/create-video',body:{...original.body,auto_repair_requests:autoRepair?1:0},confirmation:{title:'生成视频',
  message:`${draft?'按估计时间生成无声视频，不调用配音。':'复用已有配音。'}最多 2 次生成模型请求${autoRepair?'，画面异常时额外最多 1 次修复请求':''}，失败也可能计费。自动检查并在禁网、无宿主目录挂载的受限容器中渲染，不再逐份确认源码；检查失败则停止，不输出未通过检查的视频。`,confirmText:'开始生成视频',variant:'warning'}};
}
export function visualRenderVideoAction(job:VisualJob,autoRepair=false):VisualAction{
 if(!visualGenerationActions(job).review||!job.result?.sha256||!job.result.source)throw Error('尚无可生成的视频画面');
 return {path:`/${job.id}/render-video`,body:{confirmed:true,auto_repair_requests:autoRepair?1:0},confirmation:{title:'生成视频',
  message:'使用已准备的画面，自动检查并在受限容器中渲染，不在宿主机运行源码。'+(autoRepair?'若检查失败，最多调用 1 次付费模型修复后重新检查，失败停止。':'不调用模型或配音，检查失败停止。'),confirmText:'开始生成视频',variant:autoRepair?'warning':'info'}};
}
export function visualRepairAndRenderAction(job:VisualJob):VisualAction{
 const original=visualRepairVideoAction(job);
 return {...original,body:{...original.body,auto_render:true},confirmation:{title:'修复并生成视频',message:'读取现有问题报告，最多调用 1 次付费模型修复。完成后自动在受限容器中检查和渲染；失败停止，不追加调用，不重新配音，不要求逐份确认源码。',confirmText:'修复并生成视频',variant:'warning'}};
}
export function visualRepairDesignVideoAction(job:VisualJob):VisualAction{
 if(!canReviseDesign(job))throw Error('当前没有可继续修复的设计任务');
 return {path:`/${job.id}/repair-design-video`,body:{confirmed:true,max_requests:2},confirmation:{title:'修复设计并继续生成',message:'复用这次失败设计和原始诊断，由程序修订对象分类及布局。最多 2 次模型请求：设计修订一次，通过检查后源码一次；不重新配音，失败即停。通过后自动在受限容器中检查和生成视频。此次属于新确认的付费操作，不会因刷新状态反复调用。',confirmText:'确认最多 2 次调用',variant:'warning'}};
}
export function visualAlignDraftAction(job:VisualJob):VisualAction{
 const sha=job.result?.sha256;
 if(job.timing_mode!=='draft'||job.current===false||!visualGenerationActions(job).review||!sha||!/^[a-f0-9]{64}$/.test(sha))throw Error('尚无当前可对齐的视觉草稿');
 return {path:`/${job.id}/align`,body:{confirmed:true,sha256:sha},confirmation:{title:'免费对齐视觉草稿',message:'使用现有配音和实测字幕重映射草稿节拍。不调用模型或配音，不执行源码，不覆盖旧稿。映射失败立即停止；新源码须重新审批、预览和验收。',detail:'草稿 SHA-256: '+sha,confirmText:'确认免费对齐',variant:'info'}};
}
export function visualRepairAction(job:VisualJob,feedback:string):VisualAction{
 const text=feedback.trim();
 if(!visualGenerationActions(job).repair||!text||[...text].length>8000)throw Error('无效的视觉修订请求');
 const revision=canReviseDesign(job),mode=job.generation_mode??'source',maximum=revision?2:1;
 const output=mode==='host-components'?'组件选择与动作数据':'对应数据或源码';
 return {path:`/${job.id}/${revision?'revise-design':'repair'}`,body:{confirmed:true,max_requests:maximum,feedback:text},confirmation:{
  title:revision?'付费设计修订':'付费单次修复',
  message:`沿用父任务的${visualModeLabels[mode]}模式。${revision?`复用失败设计与错误反馈，设计修订通过校验后生成${output}。`:`复用已核验设计及可用产物，不重做设计；${mode==='host-components'?'修订组件选择与动作数据；':''}无可复用产物会在调用前停止。`}最多调用 ${maximum} 次模型，不自动重试或切换模式，旧稿保留，新源码仍须重新审批。`,
  confirmText:`确认最多 ${maximum} 次调用`,variant:'warning',
 }};
}
export function visualRepairVideoAction(job:VisualJob):VisualAction{
 if(job.kind!=='preview'||job.state!=='succeeded'||job.current===false||job.result?.geometry?.status!=='failed'||job.result.video)throw Error('当前没有可修复的画面检查');
 return {path:`/${job.id}/repair-video`,body:{confirmed:true,max_requests:1},confirmation:{title:'程序修复画面',message:'程序会读取这次检查报告并自动生成修复指令，最多调用 1 次付费代码模型。不重新配音、不要求你填写坐标，不重复渲染同一份失败代码；失败停止。新源码仍须另行审批后才能执行。',detail:'问题版本 SHA-256: '+job.result.sha256,confirmText:'确认最多 1 次付费修复',variant:'warning'}};
}
export function visualPreviewAction(job:VisualJob,autoRepair=false):VisualAction{
 const sha=job.result?.sha256;
 if(!visualGenerationActions(job).review||!sha||! /^[a-f0-9]{64}$/.test(sha)||!job.result?.source)throw Error('尚无可审批的源码');
 return {path:`/${job.id}/preview`,body:{confirmed:true,sha256:sha,...(autoRepair?{auto_repair_requests:1}:{})},confirmation:{title:'允许本地运行并预览',message:'预览需要在本机运行这份 AI 生成代码。这不是安全沙箱，代码可能访问本机资源。'+(autoRepair?'若画面检查失败，另授权程序最多调用 1 次付费代码模型修复，失败停止；新源码仍须另行审批后才能执行。':'不调用模型或配音，不自动修复。')+'确认信任其来源、接受风险并允许执行？',detail:'本次仅批准以下源码版本，内容变化后须重新确认。\nSHA-256: '+sha,confirmText:autoRepair?'确认执行及最多 1 次付费修复':'接受风险并运行',variant:'danger'}};
}
export async function confirmVisualAction(action:VisualAction,confirm:(options:ConfirmOptions)=>Promise<boolean>,submit:(path:string,body:Record<string,unknown>)=>Promise<unknown>):Promise<boolean>{
 if(!await confirm(action.confirmation))return false;
 await submit(action.path,action.body);return true;
}
export function visualAgentAction(sceneId:string,revision:number):VisualAction{
 return {path:'/agent',body:visualAgentBody(sceneId,revision),confirmation:{title:'Agent 生成本章视频（付费）',
  message:`由 Agent 根据本章口播与实测时间轴自行设计画面：写代码、渲染、自动检查并修正，通过检查后用当前配音和字幕生成视频。最多 ${AGENT_MAX_TURNS} 轮模型调用（DeepSeek，开启思考），每轮计费；未在上限内通过即停止，不自动重试。画面代码在本机渲染，并非安全沙箱。`,
  confirmText:`确认最多 ${AGENT_MAX_TURNS} 轮付费调用`,variant:'warning'}};
}
