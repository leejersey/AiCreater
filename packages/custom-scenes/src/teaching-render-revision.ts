import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateTeachingArtifact,type TeachingArtifact} from './teaching-artifact';
import {prepareTeachingRenderRecovery} from './teaching-render-recovery';
import {teachingLayoutVariants} from './teaching-layout';
import {parseTeachingPlan,teachingPlanHash,buildTeachingPlanPrompt,type TeachingPlan} from './teaching-plan';
import type {SceneBrief} from './contract';
import type {Cue} from './design';

type Issue={kind:string;target:string;detail:string};
export type TeachingRenderRevisionRequest={schemaVersion:'teaching-render-revision:1';repairVersion:'teaching-render-repair:1';
 inputSha256:string;basePlanSha256:string;sourceArtifactSha256:string;failedArtifactSha256:string;reportSha256:string;
 plan:TeachingPlan;diagnostics:Issue[];requestSha256:string};
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function fail(reason:string):never{throw Error('teaching_render_revision: '+reason);}
const unsupported=(reason:string)=>({status:'unsupported' as const,reason,modelCalls:0 as const,accepted:false as const});
const placement=new Set(['label-overlap','label-obstacle','label-route','label-occluded','label-clipped']);
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

/** Replays the complete free-recovery history before allowing any paid content repair. */
export async function prepareTeachingRenderRevision(value:unknown,expectedArtifactSha256:string,reportJson:string,expectedReportSha256:string){
 const original=await validateTeachingArtifact(value,expectedArtifactSha256);
 if(typeof reportJson!=='string'||Buffer.byteLength(reportJson)>8*1024*1024||!hash(expectedReportSha256)||sha(reportJson)!==expectedReportSha256)fail('Report binding mismatch');
 const report:unknown=JSON.parse(reportJson);
 if(!object(report)||!Array.isArray(report.history)||report.history.length<1||report.history.length>teachingLayoutVariants.length||report.modelCalls!==0||report.accepted!==false)fail('Malformed recovery history');
 let current:TeachingArtifact=original,last:Awaited<ReturnType<typeof prepareTeachingRenderRecovery>>|undefined;
 for(let i=0;i<report.history.length;i++){
  const entry=report.history[i];
  if(!object(entry)||entry.artifactSha256!==current.artifactSha256||entry.variant!==current.layoutVariant||!object(entry.recovery)||!object(entry.recovery.failure))fail('History artifact binding mismatch');
  const failure=entry.recovery.failure;
  if(failure.phase!=='stills'&&failure.phase!=='continuous')fail('Invalid audit phase');
  last=await prepareTeachingRenderRecovery(current,current.artifactSha256,failure.rawReport,failure.reportSha256 as string,failure.phase);
  if(!isDeepStrictEqual(last,entry.recovery))fail('Recovery history binding mismatch');
  if(i<report.history.length-1){
   if(last.status!=='candidate-ready')fail('Recovery history continued after stop');
   current=last.candidate;
  }
 }
 if(report.status!=='exhausted'||last?.status!=='exhausted')return unsupported('Free variants are unfinished, or the failure requires host investigation');
 const unique=new Map<string,Issue>();
 for(const audit of Object.values(last.failure.rawReport.frames))for(const issue of audit.issues){
  if(!placement.has(issue.kind))return unsupported('Only supported measured label-placement failures can revise content');
  const diagnostic={kind:issue.kind,target:issue.target,detail:issue.detail};unique.set(JSON.stringify(diagnostic),diagnostic);
 }
 if(!unique.size)return unsupported('No actionable measured placement failure');
 const body={schemaVersion:'teaching-render-revision:1' as const,repairVersion:'teaching-render-repair:1' as const,
  inputSha256:original.compiled.plan.inputSha256,basePlanSha256:teachingPlanHash(original.compiled.plan,original.brief,original.cues),
  sourceArtifactSha256:original.artifactSha256,failedArtifactSha256:current.artifactSha256,reportSha256:expectedReportSha256,
  plan:original.compiled.plan,diagnostics:[...unique.values()]};
 if(Buffer.byteLength(JSON.stringify(body))>120*1024)return unsupported('Diagnostic request exceeds its safe size limit; original evidence retained');
 return freeze({status:'revision-required' as const,request:{...body,requestSha256:sha(JSON.stringify(body))},modelCalls:0 as const,accepted:false as const});
}

function validateRequest(input:TeachingRenderRevisionRequest,brief:SceneBrief,cues:Cue[],expectedHash:string){
 if(!object(input)||!hash(expectedHash)||input.requestSha256!==expectedHash||
  Object.keys(input).sort().join(',')!=='basePlanSha256,diagnostics,failedArtifactSha256,inputSha256,plan,repairVersion,reportSha256,requestSha256,schemaVersion,sourceArtifactSha256'||
  input.schemaVersion!=='teaching-render-revision:1'||input.repairVersion!=='teaching-render-repair:1'||
  ![input.basePlanSha256,input.sourceArtifactSha256,input.failedArtifactSha256,input.reportSha256].every(hash))fail('Request binding mismatch');
 const plan=parseTeachingPlan(input.plan,brief,cues);
 if(input.inputSha256!==plan.inputSha256||input.basePlanSha256!==teachingPlanHash(plan,brief,cues)||!Array.isArray(input.diagnostics)||!input.diagnostics.length)fail('Plan binding mismatch');
 const diagnostics=input.diagnostics.map(issue=>{
  if(!object(issue)||Object.keys(issue).sort().join(',')!=='detail,kind,target'||typeof issue.kind!=='string'||!placement.has(issue.kind)||
   typeof issue.target!=='string'||issue.target.length>128||!plan.objects.some(o=>issue.target.startsWith('label-'+o.id+'-'))||
   typeof issue.detail!=='string'||issue.detail.length>2048)fail('Invalid placement diagnostic');
  return {kind:issue.kind,target:issue.target,detail:issue.detail};
 });
 const body={schemaVersion:input.schemaVersion,repairVersion:input.repairVersion,inputSha256:plan.inputSha256,
  basePlanSha256:input.basePlanSha256,sourceArtifactSha256:input.sourceArtifactSha256,failedArtifactSha256:input.failedArtifactSha256,
  reportSha256:input.reportSha256,plan,diagnostics};
 if(Buffer.byteLength(JSON.stringify(body))>120*1024||sha(JSON.stringify(body))!==expectedHash)fail('Request binding mismatch');
 return plan;
}

export function validateTeachingRenderRevision(request:TeachingRenderRevisionRequest,value:unknown,brief:SceneBrief,cues:Cue[],expectedHash:string){
 const original=validateRequest(request,brief,cues,expectedHash),plan=parseTeachingPlan(value,brief,cues);
 const identity=(p:TeachingPlan)=>[...p.objects].sort((a,b)=>a.id.localeCompare(b.id)).map(({component,initialState,...rest})=>rest);
 if(plan.structure!==original.structure||!isDeepStrictEqual(identity(plan),identity(original))||!isDeepStrictEqual(plan.relations,original.relations)||!isDeepStrictEqual(plan.beats,original.beats))fail('Semantic content or action coverage changed');
 return plan;
}

export function buildTeachingRenderRevisionPrompt(request:TeachingRenderRevisionRequest,brief:SceneBrief,cues:Cue[],expectedHash:string){
 validateRequest(request,brief,cues,expectedHash);
 return buildTeachingPlanPrompt(brief,cues)+'\nREPAIR_CONSTRAINTS: Keep every object ID, meaning, full label, owner, relation and ordered cue action unchanged. Only choose compatible component references and their initial states. Never shorten text, remove objects, emit coordinates/code or change audit rules. The host owns all geometry and time.\nUNTRUSTED_MEASURED_DIAGNOSTICS\n'+JSON.stringify(request);
}
