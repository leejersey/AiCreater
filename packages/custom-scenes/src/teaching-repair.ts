import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parseBrief,type SceneBrief} from './contract';
import {parseCues,type Cue} from './design';
import {parseTeachingPlan,teachingPlanHash,buildTeachingPlanPrompt,type TeachingPlan} from './teaching-plan';
import {compileTeachingMotion,TeachingMotionError} from './teaching-motion';
import {TeachingGeometryError} from './teaching-layout';
import {TeachingScheduleError} from './teaching-schedule';

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
type Diagnostic={stage:'schedule'|'layout'|'motion'|'component';code:string;detail:string};
export type TeachingRevisionRequest={schemaVersion:'teaching-plan-revision:1';repairVersion:'teaching-repair:1';inputSha256:string;basePlanSha256:string;plan:TeachingPlan;diagnostic:Diagnostic;requestSha256:string};

/** Pure host preparation: no provider, execution, artifact acceptance or budget mutation. */
export function prepareTeachingCompilation(value:unknown,input:SceneBrief,inputCues:Cue[]){
 const brief=parseBrief(input),cues=parseCues(inputCues,brief),plan=parseTeachingPlan(value,brief,cues);
 try{
  const compiled=compileTeachingMotion(plan,brief,cues);
  return freeze({status:'compiled' as const,compiled,modelCalls:0 as const,accepted:false as const});
 }catch(error){
  let diagnostic:Diagnostic,unsupported=false;
  if(error instanceof TeachingScheduleError){diagnostic={stage:'schedule',code:error.code,detail:error.message};unsupported=['unsupported','ownership','timing','capacity'].includes(error.code);}
  else if(error instanceof TeachingGeometryError){diagnostic={stage:'layout',code:error.code,detail:error.message};unsupported=/Only the 1920|Annotations exceed|exceeds the stage capacity|supports two to four|Too many filter/.test(error.message);}
  else if(error instanceof TeachingMotionError){diagnostic={stage:'motion',code:error.code,detail:error.message};unsupported=error.code==='payload';}
  else if(error instanceof Error&&error.message.startsWith('teaching_component:')){diagnostic={stage:'component',code:'text-capacity',detail:error.message};unsupported=/unsupported label glyph/.test(error.message);}
  else throw error;
  if(unsupported)return freeze({status:'unsupported' as const,diagnostic,modelCalls:0 as const,accepted:false as const,suggestion:'Split this content into supported chapters or provide a longer cue track; no objects or text were removed.'});
  const body={schemaVersion:'teaching-plan-revision:1' as const,repairVersion:'teaching-repair:1' as const,inputSha256:plan.inputSha256,basePlanSha256:teachingPlanHash(plan,brief,cues),plan,diagnostic};
  const request:TeachingRevisionRequest={...body,requestSha256:hash(body)};
  return freeze({status:'revision-required' as const,diagnostic,request,modelCalls:0 as const,accepted:false as const});
 }
}

/** Validate a proposed component repair; it still needs full compilation and DOM checks. */
export function validateTeachingRevision(request:TeachingRevisionRequest,value:unknown,brief:SceneBrief,cues:Cue[],expectedRequestSha256:string){
 if(typeof expectedRequestSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedRequestSha256)||request.requestSha256!==expectedRequestSha256)throw Error('teaching_repair: trusted request binding mismatch');
 const current=prepareTeachingCompilation(request.plan,brief,cues);
 if(current.status!=='revision-required'||!isDeepStrictEqual(current.request,request))throw Error('teaching_repair: revision binding mismatch');
 const plan=parseTeachingPlan(value,brief,cues),original=request.plan;
 const identity=(p:TeachingPlan)=>[...p.objects].sort((a,b)=>a.id.localeCompare(b.id)).map(({component,initialState,...o})=>o);
 if(plan.structure!==original.structure||!isDeepStrictEqual(identity(plan),identity(original))||!isDeepStrictEqual(plan.beats,original.beats)||!isDeepStrictEqual(plan.relations,original.relations))throw Error('teaching_repair: semantic content or action coverage changed');
 return freeze(plan);
}

export function buildTeachingRevisionPrompt(request:TeachingRevisionRequest,brief:SceneBrief,cues:Cue[],expectedRequestSha256:string){
 // Rebuild the request before exposing it to a future, separately budgeted provider call.
 validateTeachingRevision(request,request.plan,brief,cues,expectedRequestSha256);
 return buildTeachingPlanPrompt(brief,cues)+'\n\nREPAIR_CONSTRAINTS: Keep every object ID, meaning, full label, owner, relation and ordered cue action unchanged. Only choose compatible component references and their initial states. Never shorten text, remove objects or emit coordinates/code/audit overrides. If the content cannot fit, the host will reject it; do not hide the failure.\nUNTRUSTED_REPAIR_DATA\n'+JSON.stringify(request);
}
