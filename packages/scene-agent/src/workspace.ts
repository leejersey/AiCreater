// One run = one chapter = one directory. Every model-supplied path goes through resolve().
import {cp,lstat,mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseBrief,type SceneBrief} from '../../custom-scenes/src/contract';
import {parseCues,type Cue} from '../../custom-scenes/src/cues';
import {jobTheme,type SceneTheme} from '../../scene-themes/src/index';
import {currentKit} from '../../custom-scenes/src/kit';

export const SCENE_FILE='scene/Scene.tsx';
export const KIT_FILE='kit.tsx'; // the scene kit frozen for this run: read-only, imported by the scene as './kit'
const READABLE=[/^brief\.json$/,/^cues\.json$/,/^theme\.json$/,/^kit\.tsx$/,/^skill(\/.*)?$/,/^scene(\/.*)?$/];
const WRITABLE=[/^scene\/Scene\.tsx$/]; // the scene contract is a single self-contained file

export class WorkspaceError extends Error{}

// Measured cues are optional (silent drafts have none); when present they must cover the narration exactly.
function readCues(value:unknown,brief:SceneBrief):Cue[]{
 return value===undefined||(Array.isArray(value)&&value.length===0)?[]:parseCues(value,brief);
}

export type WorkspaceInput={brief:unknown;cues?:unknown;skillDir:string;initialSource?:string;theme?:SceneTheme;kit?:string};

export async function createWorkspace(directory:string,input:WorkspaceInput):Promise<Workspace>{
 const brief=parseBrief(input.brief);
 const cues=readCues(input.cues,brief);
 await mkdir(path.dirname(directory),{recursive:true});
 await mkdir(directory); // fails if it exists: a run never reuses another run's directory
 await writeFile(path.join(directory,'brief.json'),JSON.stringify(brief,null,2)+'\n');
 await writeFile(path.join(directory,'cues.json'),JSON.stringify(cues,null,2)+'\n');
 await writeFile(path.join(directory,'theme.json'),JSON.stringify(input.theme??jobTheme(undefined),null,2)+'\n');
 await writeFile(path.join(directory,KIT_FILE),input.kit??await currentKit());
 await cp(input.skillDir,path.join(directory,'skill'),{recursive:true,dereference:true});
 await mkdir(path.join(directory,'scene'));
 await mkdir(path.join(directory,'stills'));
 if(input.initialSource!==undefined)await writeFile(path.join(directory,SCENE_FILE),input.initialSource);
 return Workspace.open(directory);
}

export class Workspace{
 private constructor(readonly root:string,readonly brief:SceneBrief,readonly cues:Cue[],readonly theme:SceneTheme,readonly kit:string){}

 static async open(directory:string):Promise<Workspace>{
  const root=await realpath(directory);
  const brief=parseBrief(JSON.parse(await readFile(path.join(root,'brief.json'),'utf8')));
  const cues=readCues(JSON.parse(await readFile(path.join(root,'cues.json'),'utf8')),brief);
  // Workspaces from before themes have no theme.json: they were drawn in the default theme.
  let theme:unknown;
  try{theme=JSON.parse(await readFile(path.join(root,'theme.json'),'utf8'));}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  // Workspaces from before the kit have no kit.tsx; their scenes cannot import it, so the current copy is harmless.
  let kit:string;
  try{kit=await readFile(path.join(root,KIT_FILE),'utf8');}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;kit=await currentKit();}
  return new Workspace(root,brief,cues,jobTheme(theme),kit);
 }

 get stillsDir(){return path.join(this.root,'stills');}

 /** Resolves a workspace-relative path; rejects escapes, symlinks and paths outside the allow-list. */
 async resolve(relative:string,mode:'read'|'write'):Promise<{absolute:string;relative:string}>{
  if(typeof relative!=='string'||!relative.trim())throw new WorkspaceError('path is required');
  if(path.isAbsolute(relative)||relative.includes('\\')||relative.includes('\0'))throw new WorkspaceError(`path must be workspace-relative: ${relative}`);
  const normalized=path.posix.normalize(relative).replace(/\/+$/,'');
  if(normalized==='..'||normalized.startsWith('../'))throw new WorkspaceError(`path escapes the workspace: ${relative}`);
  const rules=mode==='write'?WRITABLE:READABLE;
  if(normalized!=='.'&&!rules.some(r=>r.test(normalized)))
   throw new WorkspaceError(mode==='write'?`only ${SCENE_FILE} is writable`:`not readable: ${normalized} (readable: brief.json, cues.json, theme.json, kit.tsx, skill/, scene/)`);
  const absolute=normalized==='.'?this.root:path.join(this.root,normalized);
  // No component may be a symlink, so a link planted inside the workspace cannot point outside it.
  let current=this.root;
  for(const part of normalized==='.'?[]:normalized.split('/')){
   current=path.join(current,part);
   try{if((await lstat(current)).isSymbolicLink())throw new WorkspaceError(`symlinks are not allowed: ${normalized}`);}
   catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')break;throw error;}
  }
  return{absolute,relative:normalized};
 }

 async readScene():Promise<string|undefined>{
  try{return await readFile(path.join(this.root,SCENE_FILE),'utf8');}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
 }
}
