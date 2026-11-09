import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {checkSource,literalStyles,literalTiming,usesTiming} from '../../../custom-scenes/src/contract';
import {SourceTypecheckError,typecheckSource} from '../../../custom-scenes/src/files';
import type {Cue} from '../../../custom-scenes/src/cues';
import type {ContentPart} from '../provider/types';
import {conciseError,sourceSha256,type StillsResult} from '../render/stills';
import {SCENE_FILE} from '../workspace';
import {describeLabel,outOfBounds} from '../render/labels';
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
  try{await typecheckSource(source,context.workspace.kit);}
  catch(error){
   if(!(error instanceof SourceTypecheckError))throw error;
   return failure(['typecheck failed (first 5 errors):',...error.diagnostics.map(d=>`- line ${d.line??'?'} TS${d.code}: ${d.message}`)].join('\n'));
  }
  return text('typecheck passed');
 },
};

/** Every cue midpoint first (where a beat must be visible), then cue starts and ends up to the cap; evenly spaced without cues. */
export function defaultFrames(duration:number,cues:Cue[]):number[]{
 const clamp=(f:number)=>Math.max(0,Math.min(duration-1,f));
 const spread=(list:number[],n:number)=>n<=0?[]:list.length<=n?list:Array.from({length:n},(_,i)=>list[Math.round(i*(list.length-1)/Math.max(1,n-1))]);
 if(!cues.length)return [...new Set([0,.25,.5,.75,1].map(t=>clamp(Math.round((duration-1)*t))))];
 const mids=[...new Set(cues.map(c=>clamp(Math.floor((c.startFrame+c.endFrame)/2))))];
 const edges=[...new Set(cues.flatMap(c=>[clamp(c.startFrame),clamp(c.endFrame-1)]))].filter(f=>!mids.includes(f));
 return [...new Set([...spread(mids,MAX_FRAMES),...spread(edges,MAX_FRAMES-Math.min(mids.length,MAX_FRAMES))])].sort((a,b)=>a-b);
}

// Below BLANK_INK a frame shows essentially nothing; below SPARSE_INK it shows a stray label at most.
// Measured on rag-ch1: an empty-looking passing scene had 0.00% on 9 of 12 frames; a readable one had 1.7–14.8%.
const BLANK_INK=0.001,SPARSE_INK=0.01,EDGE_FRAMES=15;
// Largest empty band, as a share of the 1920×980 area above the captions. Measured on reviewed RAG frames: full
// layouts leave 10–30%; the frames that looked unfinished left 45–72% of the height empty.
const EMPTY_ROWS=0.4,EMPTY_COLS=0.35;
function insideCue(frame:number,cues:Cue[],duration:number):boolean{
 if(!cues.length)return frame>=EDGE_FRAMES&&frame<duration-EDGE_FRAMES;
 return cues.some(c=>frame>=c.startFrame+EDGE_FRAMES&&frame<c.endFrame-EDGE_FRAMES);
}

/** Findings from the rendered pixels: frames that show nothing while a cue is being narrated. */
export function inkFindings(render:StillsResult,cues:Cue[],duration:number):AuditFinding[]{
 const out:AuditFinding[]=[];
 const add=(severity:AuditFinding['severity'],kind:string,detail:string,frame:number)=>{
  const existing=out.find(f=>f.kind===kind&&f.severity===severity);
  if(existing)existing.frames.push(frame);else out.push({severity,kind,target:'frame',detail,frames:[frame]});
 };
 const empty:string[]=[];
 for(const {frame,ink,space} of render.frames){
  if(ink===undefined)continue;
  const inside=insideCue(frame,cues,duration);
  if(ink<BLANK_INK)add(inside?'high':'low','blank-frame',inside
   ?'Nothing visible while this cue is narrated (under 0.1% of the canvas differs from the background). Check opacity, fade timing and positions.'
   :'Nothing visible at a cue edge; fine only if it is the middle of a deliberate fade.',frame);
  else if(ink<SPARSE_INK&&inside)add('medium','sparse-frame','Under 1% of the canvas is drawn while this cue is narrated; the beat is barely visible.',frame);
  else if(inside&&space){
   const rows=space.rows[1]-space.rows[0],cols=space.cols[1]-space.cols[0];
   const parts=[...(rows>=980*EMPTY_ROWS?[`y ${space.rows[0]}–${space.rows[1]} (${Math.round(rows/9.8)}% of the height)`]:[]),...(cols>=1920*EMPTY_COLS?[`x ${space.cols[0]}–${space.cols[1]} (${Math.round(cols/19.2)}% of the width)`]:[])];
   if(parts.length)empty.push(`frame ${frame}: nothing drawn in ${parts.join(' and in ')}`);
  }
 }
 if(empty.length)out.push({severity:'medium',kind:'empty-area',target:'frame',frames:render.frames.filter(f=>empty.some(e=>e.startsWith(`frame ${f.frame}:`))).map(f=>f.frame),
  detail:'A large part of the canvas above the captions stays empty while a cue is narrated. Enlarge or move the main object, or give the cue a second visual element; only a closing end card may stay this sparse.\n    '+empty.join('\n    ')});
 return out;
}

// label-obstacle is feedback only: labels drawn inside a nested object (a "?" on a card inside a sleeve)
// are reported against the outer obstacle, so the reviewed RAG scene would fail a hard gate on it.
export const SEVERITY:Record<string,'high'|'medium'|'low'>={
 'label-out-of-bounds':'high','label-overlap':'high','invalid-geometry':'high','missing-audit':'high','measurement-failed':'high',
 'label-obstacle':'medium','label-route':'medium','panel-overlap':'medium','missing-route':'medium','path-deviation':'medium',
 'audit-limit':'low',
};
const RANK={high:0,medium:1,low:2};
export type AuditFinding={severity:'high'|'medium'|'low';kind:string;target:string;detail:string;frames:number[]};

/** Merges identical findings across frames, most severe first. Pass cues and duration to include pixel findings. */
export function summarizeAudit(render:StillsResult,cues:Cue[]=[],duration?:number):{findings:AuditFinding[];unsupportedFrames:number[]}{
 const byKey=new Map<string,AuditFinding>();
 for(const {frame,audit} of render.frames)for(const issue of audit.issues){
  const key=`${issue.kind}\u0000${issue.target}\u0000${issue.detail}`;
  const existing=byKey.get(key);
  if(existing)existing.frames.push(frame);
  else byKey.set(key,{severity:SEVERITY[issue.kind]??'medium',kind:issue.kind,target:issue.target,detail:issue.detail,frames:[frame]});
 }
 const findings=[...byKey.values(),...(duration?inkFindings(render,cues,duration):[])].sort((a,b)=>RANK[a.severity]-RANK[b.severity]||a.frames[0]-b.frames[0]);
 return{findings,unsupportedFrames:render.frames.filter(f=>f.audit.unsupported).map(f=>f.frame)};
}

const TRANSITION_WINDOW=30;
/** True when every frame lies within a second of a hand-over between two consecutive cues. */
function atCueChange(frames:number[],cues:Cue[]):boolean{
 const changes=cues.slice(1).map((cue,i)=>[cues[i].endFrame-TRANSITION_WINDOW,cue.startFrame+TRANSITION_WINDOW]);
 return changes.length>0&&frames.every(f=>changes.some(([from,to])=>f>=from&&f<=to));
}

/** Measured position and text of the labels in a finding, at its first frame, so the model knows what to move and how far. */
function whereLabels(render:StillsResult,finding:AuditFinding):string{
 if(!finding.kind.startsWith('label-'))return '';
 const boxes=render.frames.find(f=>f.frame===finding.frames[0])?.audit.labelBoxes;
 const own=boxes?.[finding.target];
 if(!own)return '';
 const parts=[describeLabel(finding.target,own)];
 if(finding.kind==='label-out-of-bounds'){const by=outOfBounds(own);if(by)parts.push(`out ${by}`);}
 const other=/^Overlaps (\S+)/.exec(finding.detail)?.[1];
 if(finding.kind==='label-overlap'&&other&&boxes?.[other])parts.push(describeLabel(other,boxes[other]));
 return `\n    measured at frame ${finding.frames[0]}: ${parts.join('; ')}`;
}

export function formatAudit(render:StillsResult,cues:Cue[],duration:number):string{
 // With nothing rendered, "0 findings" would read as a clean scene. Say plainly that there is nothing to audit.
 if(!render.frames.length)return 'audit: not available, no frame rendered. Fix the render errors above first.';
 const {findings,unsupportedFrames}=summarizeAudit(render,cues,duration);
 const counts=(['high','medium','low'] as const).map(s=>`${findings.filter(f=>f.severity===s).length} ${s}`).join(' / ');
 const lines=[`audit of frames ${render.frames.map(f=>f.frame).join(', ')}: ${counts}`];
 let transitions=0;
 for(const f of findings.slice(0,40)){
  const transition=f.kind==='label-overlap'&&atCueChange(f.frames,cues);
  if(transition)transitions++;
  lines.push(`[${f.severity}] ${f.kind} ${f.target} — ${f.detail} (frames ${f.frames.join(', ')})${transition?' [at a cue change]':''}${whereLabels(render,f)}`);
 }
 if(findings.length>40)lines.push(`… ${findings.length-40} more findings; fix the ones above first`);
 if(findings.some(f=>/^(text|g|path|rect)\[\d+\]$/.test(f.target)))lines.push('hint: names like text[12] are elements without an id. Give every <text> and important <g> a descriptive id so findings point at them.');
 if(transitions)lines.push('hint: findings marked [at a cue change] mean outgoing text is still visible while incoming text appears in the same place. Moving labels a few pixels will not fix this: fade the old element fully out before the new one fades in, or give old and new content separate regions.');
 if(unsupportedFrames.length)lines.push(`coverage: frames ${unsupportedFrames.join(', ')} are partial (scene root is not a single <svg>).`);
 if(!findings.length)lines.push('no geometry findings. This does not judge composition or teaching quality; compare against the skill checklist.');
 return lines.join('\n');
}

export const renderStills:Tool={
 readOnly:false,
 spec:{name:'render_stills',description:`Typecheck scene/Scene.tsx, render sampled frames and return the geometry audit, all in one call. Defaults to the start, middle and end of every cue (max ${MAX_FRAMES}). Call this after every change.`,
  inputSchema:{type:'object',properties:{frames:{type:'array',items:{type:'integer',minimum:0},maxItems:MAX_FRAMES}},additionalProperties:false}},
 async run(input,context){
  const {brief,cues}=context.workspace;
  const source=await currentSource(context);
  const frames=input.frames?.length?[...new Set<number>(input.frames)].sort((a,b)=>a-b):defaultFrames(brief.durationInFrames,cues);
  const outside=frames.filter(f=>f>=brief.durationInFrames);
  if(outside.length)throw new ToolInputError(`frames ${outside.join(', ')} are outside 0..${brief.durationInFrames-1}`);
  const checked=await typecheck.run({},context); // a render of code that does not compile only produces a bundler stack trace
  if(checked.isError)return checked;
  let render:StillsResult;
  const previous=context.lastRender;
  // The loop's automatic check may already have rendered exactly this; do not pay for it twice.
  if(previous&&previous.sourceSha256===sourceSha256(source)&&previous.frames.length+previous.failures.length===frames.length&&frames.every(f=>previous.frames.some(r=>r.frame===f)||previous.failures.some(r=>r.frame===f)))render=previous;
  else{
   try{render=await context.renderer.render(source,frames,path.join(context.workspace.stillsDir,sourceSha256(source).slice(0,12)));}
   catch(error){context.lastRender=undefined;return failure(`render failed before any frame: ${conciseError(error)}`);}
  }
  context.lastRender=render;
  const lines=['typecheck passed',`rendered ${render.frames.length}/${frames.length} frames: ${render.frames.map(f=>f.frame).join(', ')||'none'}`];
  for(const f of render.failures)lines.push(`frame ${f.frame} failed: ${f.error}`);
  lines.push(formatAudit(render,cues,brief.durationInFrames));
  const literal=literalStyles(source);
  if(literal.length)lines.push(`[medium] literal-style — ${literal.length} color/font value${literal.length>1?'s are':' is'} written into the scene instead of read from theme, so ${literal.length>1?'they ignore':'it ignores'} the course theme: ${literal.slice(0,8).map(l=>`${l.text} (line ${l.line})`).join(', ')}${literal.length>8?', …':''}. Use theme.* (scene-contract, section Theme).`);
  const timed=cues.length<2||usesTiming(source),fixedFrames=literalTiming(source);
  if(!timed)lines.push('[high] timing — the scene does not read timing.cues. Time every narrated change from timing.cues[i].start / .end so the picture follows any voice-over (scene-contract, section Timing); finish requires it.');
  if(fixedFrames.length)lines.push(`[medium] literal-timing — ${fixedFrames.length} frame number${fixedFrames.length>1?'s':''} where a sentence boundary belongs: ${fixedFrames.slice(0,6).map(l=>`${l.text} (line ${l.line})`).join(', ')}${fixedFrames.length>6?', …':''}. Use timing.cues[i].start / .end (plus a small offset) instead.`);
  const findings=summarizeAudit(render,cues,brief.durationInFrames).findings;
  const clean=timed&&!render.failures.length&&!findings.some(f=>f.severity==='high');
  const empty=findings.some(f=>f.kind==='empty-area');
  const mustFix=[...(empty?['The empty-area finding: viewers notice a half-empty frame. Enlarge or spread the content of those cues (a closing end card may stay sparse).']:[]),
   ...(literal.length?['The literal-style finding: replace those values with theme tokens, so the scene follows the course theme.']:[]),
   ...(fixedFrames.length?['The literal-timing finding: replace those frame numbers with timing.cues, so the scene follows a new voice-over.']:[])];
  const fullSample=defaultFrames(brief.durationInFrames,cues).every(f=>frames.includes(f));
  if(clean&&fullSample){
   // Keep every gate-clean version outside the model's reach, so a later regression cannot lose it.
   const file=path.join(context.workspace.root,'checkpoints',`${render.sourceSha256.slice(0,12)}.tsx`);
   await mkdir(path.dirname(file),{recursive:true});await writeFile(file,source);
   context.cleanCheckpoint={sourceSha256:render.sourceSha256,file};
  }
  if(clean)lines.push(fullSample&&mustFix.length
   ?`No [high] findings: this version passes the final gates and is kept. Fix these medium findings before finishing: ${mustFix.join(' ')} Then check again and call finish.`
   :fullSample
   ?(context.capabilities.vision
    ?'No [high] findings: this version passes the final gates. Now look at it with view_frames and check it against the visual-review list; fix what fails, or call finish if it holds up. Medium findings are optional polish.'
    :'No [high] findings: this version passes the final gates. If every cue has its visual, call finish now. Medium findings are optional polish, and further rewrites risk new problems.')
   :'No [high] findings in these frames. Call render_stills without frames to check the full sample the gates use.');
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
 spec:{name:'audit_scene',description:'Repeat the audit of the last render (render_stills already includes it): blank frames during a cue, label overlaps, labels leaving the 1920×980 caption-safe area, labels over obstacles or routes, movers off their routes. Each line names the element id and frames.',
  inputSchema:{type:'object',properties:{},additionalProperties:false}},
 async run(_input,context){
  return text(formatAudit(await freshRender(context),context.workspace.cues,context.workspace.brief.durationInFrames));
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
  context.viewedSha256=render.sourceSha256;
  return{content};
 },
};
