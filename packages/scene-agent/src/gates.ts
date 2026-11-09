// Final gates: objective checks that do not depend on model ability. Everything else is feedback.
import {checkSource,usesTiming} from '../../custom-scenes/src/contract';
import {perturbedCues,sceneTiming} from '../../custom-scenes/src/timing';
import {SourceTypecheckError,typecheckSource} from '../../custom-scenes/src/files';
import path from 'node:path';
import {conciseError,sourceSha256} from './render/stills';
import {defaultFrames,summarizeAudit} from './tools/checks';
import type {ToolContext} from './tools/types';
import {SCENE_FILE} from './workspace';

export type GateResult={passed:boolean;sourceSha256?:string;checks:{gate:string;passed:boolean;detail:string}[]};

export async function runGates(context:ToolContext):Promise<GateResult>{
 const checks:GateResult['checks']=[];
 const add=(gate:string,passed:boolean,detail:string)=>{checks.push({gate,passed,detail});return passed;};
 const source=await context.workspace.readScene();
 if(!add('scene-exists',source!==undefined,source===undefined?`${SCENE_FILE} does not exist`:'present'))return{passed:false,checks};
 const sha=sourceSha256(source!);
 try{checkSource(source!);add('contract',true,'allowed imports and APIs only');}
 catch(error){add('contract',false,(error as Error).message);return{passed:false,sourceSha256:sha,checks};}
 try{await typecheckSource(source!);add('typecheck',true,'0 errors');}
 catch(error){
  add('typecheck',false,error instanceof SourceTypecheckError?error.diagnostics.map(d=>`line ${d.line??'?'}: ${d.message}`).join('; '):(error as Error).message);
  return{passed:false,sourceSha256:sha,checks};
 }
 // Always render the full default sample at the gate, so a model cannot pass on a hand-picked subset of frames.
 const {brief,cues}=context.workspace;
 const frames=defaultFrames(brief.durationInFrames,cues);
 const previous=context.lastRender;
 let render=previous&&previous.sourceSha256===sha&&frames.every(f=>previous.frames.some(r=>r.frame===f))?previous:undefined;
 if(!render){
  try{render=await context.renderer.render(source!,frames,path.join(context.workspace.stillsDir,sha.slice(0,12)));context.lastRender=render;}
  catch(error){add('render',false,conciseError(error));return{passed:false,sourceSha256:sha,checks};}
 }
 add('render',render.failures.length===0,render.failures.length?render.failures.map(f=>`frame ${f.frame}: ${f.error}`).join('; '):`${frames.length} frames rendered`);
 const high=summarizeAudit(render,cues,brief.durationInFrames).findings.filter(f=>f.severity==='high');
 add('audit',high.length===0,high.length?high.map(f=>`${f.kind} ${f.target} (frames ${f.frames.join(', ')})`).join('; '):'no high findings (geometry and blank frames)');
 // The picture must survive a new voice-over: it reads its cue frames from timing, and still passes on another timing.
 if(cues.length>=2){
  if(!add('timing',usesTiming(source!),usesTiming(source!)?'cue frames read from timing.cues':'the scene does not read timing.cues; time every narrated change from timing.cues[i].start / .end (scene-contract, section Timing)'))
   return{passed:false,sourceSha256:sha,checks};
  const moved=perturbedCues(cues,brief.durationInFrames);
  const movedFrames=defaultFrames(brief.durationInFrames,moved);
  try{
   const retimed=await context.renderer.render(source!,movedFrames,path.join(context.workspace.stillsDir,sha.slice(0,12)+'-retime'),sceneTiming(brief.durationInFrames,moved));
   const bad=[...retimed.failures.map(f=>`frame ${f.frame}: ${f.error}`),
    ...summarizeAudit(retimed,moved,brief.durationInFrames).findings.filter(f=>f.severity==='high').map(f=>`${f.kind} ${f.target} (frames ${f.frames.join(', ')})`)];
   add('retime',bad.length===0,bad.length?`on another voice-over timing (each sentence ±30% longer or shorter): ${bad.join('; ')}. Something is still timed by fixed frame numbers or by durations that do not fit a shorter sentence.`:'passes on another voice-over timing');
  }catch(error){add('retime',false,`on another voice-over timing: ${conciseError(error)}`);}
 }
 return{passed:checks.every(c=>c.passed),sourceSha256:sha,checks};
}
