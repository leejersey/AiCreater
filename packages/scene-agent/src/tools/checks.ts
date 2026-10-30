import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {checkSource} from '../../../custom-scenes/src/contract';
import {SourceTypecheckError,typecheckSource} from '../../../custom-scenes/src/files';
import type {Cue} from '../../../custom-scenes/src/design';
import type {ContentPart} from '../provider/types';
import {conciseError,sourceSha256,type StillsResult} from '../render/stills';
import {SCENE_FILE} from '../workspace';
import {failure,text,ToolInputError,type Tool,type ToolContext} from './types';

const MAX_FRAMES=12;
const MAX_VIEW=6;

async function currentSource(context:ToolContext):Promise<string>{
 const source=await context.workspace.readScene();
 if(source===undefined)throw new ToolInputError(`${SCENE_FILE} does not exist yet; create it with write_file`);
 return source;
}

export const typecheck:Tool={
 readOnly:true,
 spec:{name:'typecheck',description:'Check scene/Scene.tsx against the scene contract (allowed imports and APIs) and the TypeScript compiler. Line numbers refer to Scene.tsx.',
  inputSchema:{type:'object',properties:{},additionalProperties:false}},
 async run(_input,context){
  const source=await currentSource(context);
  try{checkSource(source);}
  catch(error){return failure(`contract: ${(error as Error).message}. See read_skill topic "scene-contract".`);}
  try{await typecheckSource(source);}
  catch(error){
   if(!(error instanceof SourceTypecheckError))throw error;
   return failure(['typecheck failed (first 5 errors):',...error.diagnostics.map(d=>`- line ${d.line??'?'} TS${d.code}: ${d.message}`)].join('\n'));
  }
  return text('typecheck passed');
 },
};

/** Cue starts, midpoints and last frames, so every narrated beat is sampled; evenly spaced without cues. */
export function defaultFrames(duration:number,cues:Cue[]):number[]{
 const picks=cues.length?cues.flatMap(c=>[c.startFrame,Math.floor((c.startFrame+c.endFrame)/2),c.endFrame-1]):[0,.25,.5,.75,1].map(t=>Math.round((duration-1)*t));
 let frames=[...new Set(picks.map(f=>Math.max(0,Math.min(duration-1,f))))].sort((a,b)=>a-b);
 if(frames.length>MAX_FRAMES)frames=Array.from({length:MAX_FRAMES},(_,i)=>frames[Math.round(i*(frames.length-1)/(MAX_FRAMES-1))]);
 return [...new Set(frames)];
}

// label-obstacle is feedback only: labels drawn inside a nested object (a "?" on a card inside a sleeve)
// are reported against the outer obstacle, so the reviewed RAG scene would fail a hard gate on it.
export const SEVERITY:Record<string,'high'|'medium'|'low'>={
 'label-out-of-bounds':'high','label-overlap':'high','invalid-geometry':'high','missing-audit':'high','measurement-failed':'high',
 'label-obstacle':'medium','label-route':'medium','missing-route':'medium','path-deviation':'medium',
 'audit-limit':'low',
};
const RANK={high:0,medium:1,low:2};
export type AuditFinding={severity:'high'|'medium'|'low';kind:string;target:string;detail:string;frames:number[]};

/** Merges identical findings across frames, most severe first. */
export function summarizeAudit(render:StillsResult):{findings:AuditFinding[];unsupportedFrames:number[]}{
 const byKey=new Map<string,AuditFinding>();
 for(const {frame,audit} of render.frames)for(const issue of audit.issues){
  const key=`${issue.kind}\u0000${issue.target}\u0000${issue.detail}`;
  const existing=byKey.get(key);
  if(existing)existing.frames.push(frame);
  else byKey.set(key,{severity:SEVERITY[issue.kind]??'medium',kind:issue.kind,target:issue.target,detail:issue.detail,frames:[frame]});
 }
 const findings=[...byKey.values()].sort((a,b)=>RANK[a.severity]-RANK[b.severity]||a.frames[0]-b.frames[0]);
 return{findings,unsupportedFrames:render.frames.filter(f=>f.audit.unsupported).map(f=>f.frame)};
}

export const renderStills:Tool={
 readOnly:false,
 spec:{name:'render_stills',description:`Render sampled frames of scene/Scene.tsx and measure their geometry. Defaults to the start, middle and end of every cue (max ${MAX_FRAMES}). Run typecheck first.`,
  inputSchema:{type:'object',properties:{frames:{type:'array',items:{type:'integer',minimum:0},maxItems:MAX_FRAMES}},additionalProperties:false}},
 async run(input,context){
  const {brief,cues}=context.workspace;
  const source=await currentSource(context);
  const frames=input.frames?.length?[...new Set<number>(input.frames)].sort((a,b)=>a-b):defaultFrames(brief.durationInFrames,cues);
  const outside=frames.filter(f=>f>=brief.durationInFrames);
  if(outside.length)throw new ToolInputError(`frames ${outside.join(', ')} are outside 0..${brief.durationInFrames-1}`);
  let render:StillsResult;
  try{render=await context.renderer.render(source,frames,path.join(context.workspace.stillsDir,sourceSha256(source).slice(0,12)));}
  catch(error){context.lastRender=undefined;return failure(`render failed before any frame: ${conciseError(error)}`);}
  context.lastRender=render;
  const {findings,unsupportedFrames}=summarizeAudit(render);
  const high=findings.filter(f=>f.severity==='high').length;
  const lines=[`rendered ${render.frames.length}/${frames.length} frames: ${render.frames.map(f=>f.frame).join(', ')||'none'}`];
  for(const f of render.failures)lines.push(`frame ${f.frame} failed: ${f.error}`);
  lines.push(`geometry: ${findings.length} distinct findings (${high} high). Call audit_scene for details.`);
  if(unsupportedFrames.length)lines.push(`note: frames ${unsupportedFrames.join(', ')} are not a single root <svg>; geometry coverage is partial there.`);
  return render.failures.length?failure(lines.join('\n')):text(lines.join('\n'));
 },
};

async function freshRender(context:ToolContext):Promise<StillsResult>{
 if(!context.lastRender)throw new ToolInputError('no render yet; call render_stills first');
 if(context.lastRender.sourceSha256!==sourceSha256(await currentSource(context)))throw new ToolInputError('scene/Scene.tsx changed since the last render; call render_stills again');
 return context.lastRender;
}

export const auditScene:Tool={
 readOnly:true,
 spec:{name:'audit_scene',description:'Report geometry findings from the last render: label overlaps, labels leaving the 1920×980 caption-safe area, labels over obstacles or routes, movers off their routes. Each line names the element id and frames.',
  inputSchema:{type:'object',properties:{},additionalProperties:false}},
 async run(_input,context){
  const render=await freshRender(context);
  const {findings,unsupportedFrames}=summarizeAudit(render);
  const counts=(['high','medium','low'] as const).map(s=>`${findings.filter(f=>f.severity===s).length} ${s}`).join(' / ');
  const lines=[`audit of frames ${render.frames.map(f=>f.frame).join(', ')}: ${counts}`];
  for(const f of findings.slice(0,40))lines.push(`[${f.severity}] ${f.kind} ${f.target} — ${f.detail} (frames ${f.frames.join(', ')})`);
  if(findings.length>40)lines.push(`… ${findings.length-40} more findings; fix the ones above first`);
  if(unsupportedFrames.length)lines.push(`coverage: frames ${unsupportedFrames.join(', ')} are partial (scene root is not a single <svg>).`);
  if(!findings.length)lines.push('no geometry findings. This does not judge composition or teaching quality; compare against the skill checklist.');
  return text(lines.join('\n'));
 },
};

export const viewFrames:Tool={
 readOnly:true,
 spec:{name:'view_frames',description:`Look at rendered frames from the last render (960×540 images, max ${MAX_VIEW}). Defaults to an even sample of the rendered frames.`,
  inputSchema:{type:'object',properties:{frames:{type:'array',items:{type:'integer',minimum:0},maxItems:MAX_VIEW}},additionalProperties:false}},
 async run(input,context){
  const render=await freshRender(context);
  const available=render.frames.map(f=>f.frame);
  let wanted:number[]=input.frames?.length?input.frames:available;
  const missing=wanted.filter(f=>!available.includes(f));
  if(missing.length)throw new ToolInputError(`frames ${missing.join(', ')} were not rendered; rendered: ${available.join(', ')}`);
  if(wanted.length>MAX_VIEW)wanted=Array.from({length:MAX_VIEW},(_,i)=>wanted[Math.round(i*(wanted.length-1)/(MAX_VIEW-1))]);
  const content:ContentPart[]=[];
  for(const frame of new Set(wanted)){
   const item=render.frames.find(f=>f.frame===frame)!;
   content.push({type:'text',text:`frame ${frame}`},{type:'image',mediaType:'image/png',data:(await readFile(item.file)).toString('base64')});
  }
  return{content};
 },
};
