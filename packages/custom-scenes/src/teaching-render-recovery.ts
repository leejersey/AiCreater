import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {freezeTeachingScene,validateTeachingArtifact,type TeachingArtifact} from './teaching-artifact';
import {teachingLayoutVariants,TeachingGeometryError} from './teaching-layout';
import {TeachingMotionError} from './teaching-motion';
import {TeachingScheduleError} from './teaching-schedule';
import {summarizeTeachingRender,teachingSampledFrames,assertTeachingMedia,type TeachingFrameAudit} from './teaching-render-policy';

const hash=(json:string)=>createHash('sha256').update(json).digest('hex');
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const fail=(reason:string):never=>{throw Error('teaching_recovery: '+reason);};
type Report={artifactSha256:string;requiredFrames:number[];frames:Record<number,TeachingFrameAudit>;invalidLogs:unknown[]};

function boundReport(value:unknown,expectedSha256:string,artifact:TeachingArtifact){
 let json:string|undefined;
 try{json=JSON.stringify(value);}catch{return fail('Invalid report data');}
 if(typeof json!=='string'||Buffer.byteLength(json)>16*1024*1024)return fail('Oversized report data');
 if(!/^[a-f0-9]{64}$/.test(expectedSha256)||hash(json)!==expectedSha256)fail('Report binding mismatch');
 const report=JSON.parse(json) as Report;
 if(report?.artifactSha256!==artifact.artifactSha256)fail('Artifact/report binding mismatch');
 if(!report.frames||typeof report.frames!=='object'||Array.isArray(report.frames)||Object.keys(report.frames).length>artifact.brief.durationInFrames||!Array.isArray(report.requiredFrames)||!Array.isArray(report.invalidLogs))fail('Malformed report coverage');
 for(const audit of Object.values(report.frames)){
  if(!audit||!['passed','failed'].includes(audit.status)||!Array.isArray(audit.issues)||audit.issues.length>200)fail('Malformed frame audit');
  for(const field of ['frame','labels','solids','foreground','routes','movers','occlusionChecks'] as const)if(!Number.isInteger(audit[field])||audit[field]<0)fail('Malformed measurement count');
  for(const issue of audit.issues)if(!issue||typeof issue.kind!=='string'||issue.kind.length>64||typeof issue.target!=='string'||issue.target.length>128||typeof issue.detail!=='string'||issue.detail.length>2048)fail('Malformed frame diagnostic');
 }
 return report;
}

/** Prepare a FREE host candidate from trusted raw evidence. This never renders or accepts it. */
export async function prepareTeachingRenderRecovery(value:unknown,expectedArtifactSha256:string,rawReport:unknown,expectedReportSha256:string,phase:'stills'|'continuous'){
 if(phase!=='stills'&&phase!=='continuous')fail('Unknown audit phase');
 const artifact=await validateTeachingArtifact(value,expectedArtifactSha256),report=boundReport(rawReport,expectedReportSha256,artifact);
 const required=phase==='stills'?teachingSampledFrames(artifact):Array.from({length:artifact.brief.durationInFrames},(_,i)=>i);
 const summary=summarizeTeachingRender(artifact,report.frames,required);
 const failure={reportSha256:expectedReportSha256,phase,status:summary.status,summary,rawReport:report};
 const base={failure,modelCalls:0 as const,accepted:false as const};
 if(!isDeepStrictEqual(report.requiredFrames,required)||report.invalidLogs.length||summary.missingFrames.length||summary.coverageIssues.length)return freeze({...base,status:'blocked' as const,reason:'Incomplete or inconsistent measurements; host investigation required'});
 if(summary.status==='passed')return freeze({...base,status:'not-failed' as const});
 if(Object.values(report.frames).some(a=>a.status==='failed'&&!a.issues.length))return freeze({...base,status:'blocked' as const,reason:'A failed frame has no actionable diagnostic; preserve it and stop'});
 const issues=Object.values(report.frames).flatMap(a=>a.issues);
 const labels=new Set(artifact.compiled.objects.flatMap(o=>o.asset.text.lines.map((_,i)=>'label-'+o.id+'-'+i)));
 const repairable=new Set(['label-overlap','label-obstacle','label-route','label-occluded','label-clipped']);
 if(!issues.length||issues.some(i=>!repairable.has(i.kind)||!labels.has(i.target)))return freeze({...base,status:'blocked' as const,reason:'Not a supported placement failure; do not spend a model request on a host measurement or rendering fault'});
 const attempts:{variant:string;status:'unchanged'|'compile-failed';detail?:string}[]=[];
 const geometry=(a:TeachingArtifact)=>({objects:a.compiled.objects.map(o=>({id:o.id,initial:o.initial})),transports:a.compiled.transports});
 for(const variant of teachingLayoutVariants.slice(teachingLayoutVariants.indexOf(artifact.layoutVariant)+1)){
  let candidate:TeachingArtifact;
  try{candidate=await freezeTeachingScene(artifact.compiled.plan,artifact.brief,artifact.cues,variant);}
  catch(error){
   if(!(error instanceof TeachingGeometryError||error instanceof TeachingMotionError||error instanceof TeachingScheduleError))throw error;
   attempts.push({variant,status:'compile-failed',detail:error.message});continue;
  }
  if(isDeepStrictEqual(geometry(candidate),geometry(artifact))){attempts.push({variant,status:'unchanged'});continue;}
  return freeze({...base,status:'candidate-ready' as const,candidate,attempts,requiredChecks:['browser-stills','continuous-frames','media-integrity'] as const});
 }
 return freeze({...base,status:'exhausted' as const,attempts,reason:'No distinct, numerically safe host variant remains; original failure retained'});
}

type RenderRound={status:'failed';phase:'stills'|'continuous';report:unknown}|{status:'preview-ready';report:unknown;media:unknown};
/** The callback is a trusted host renderer, never model-supplied code. No paid retry exists here. */
export async function runTeachingRenderRecovery(value:unknown,expectedArtifactSha256:string,renderRound:(artifact:TeachingArtifact,round:number)=>Promise<RenderRound>){
 let artifact=await validateTeachingArtifact(value,expectedArtifactSha256);
 const history:{artifactSha256:string;variant:string;recovery:Awaited<ReturnType<typeof prepareTeachingRenderRecovery>>}[]=[];
 for(let round=0;round<teachingLayoutVariants.length;round++){
  const outcome=await renderRound(artifact,round);
  const recovery=await prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,outcome.report,hash(JSON.stringify(outcome.report)),outcome.status==='preview-ready'?'continuous':outcome.phase);
  history.push({artifactSha256:artifact.artifactSha256,variant:artifact.layoutVariant,recovery});
  if(outcome.status==='preview-ready'){
   if(recovery.status!=='not-failed')return freeze({status:'blocked' as const,reason:'Renderer success contradicts complete frame evidence',history,accepted:false as const,modelCalls:0 as const});
   assertTeachingMedia(outcome.media,artifact.brief.durationInFrames);
   return freeze({status:'preview-ready' as const,artifactSha256:artifact.artifactSha256,history,accepted:false as const,modelCalls:0 as const});
  }
  if(recovery.status!=='candidate-ready')return freeze({status:recovery.status==='not-failed'?'blocked' as const:recovery.status,history,accepted:false as const,modelCalls:0 as const});
  artifact=recovery.candidate;
 }
 return freeze({status:'exhausted' as const,history,accepted:false as const,modelCalls:0 as const});
}
