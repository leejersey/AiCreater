import {readFile,mkdtemp,writeFile,rm,mkdir,open,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import {constants} from 'node:fs';
import {parseArtifact,type SceneArtifact,checkSource,sourceHash} from './contract';

export const repositoryRoot=fileURLToPath(new URL('../../../',import.meta.url));
export class SourceTypecheckError extends Error{
 readonly code='source_typecheck';
 constructor(readonly diagnostics:{code:number;line:number|null;message:string}[]){
  super('custom_scene_typecheck: '+diagnostics.map(d=>d.message).join('; '));
 }
}
export async function readBoundedJsonBytes(file:string):Promise<Buffer>{
 const maximum=256*1024;
 const handle=await open(file,constants.O_RDONLY|constants.O_NONBLOCK|constants.O_NOFOLLOW);
 try{
  const info=await handle.stat();
  if(!info.isFile())throw Error('custom_scene: JSON evidence requires a regular file');
  if(info.size>maximum)throw Error('custom_scene: JSON evidence exceeds 256 KiB');
  const buffer=Buffer.alloc(maximum+1);let offset=0;
  while(offset<buffer.length){
   const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);
   if(!bytesRead)break;offset+=bytesRead;
  }
  if(offset>maximum)throw Error('custom_scene: JSON evidence exceeds 256 KiB');
  return buffer.subarray(0,offset);
 }finally{await handle.close();}
}
export async function readJson(file:string):Promise<unknown>{
  const data=await readFile(file);if(data.length>256*1024)throw Error('custom_scene: input exceeds 256 KiB');
  return JSON.parse(data.toString('utf8'));
}
export async function readArtifact(file:string):Promise<SceneArtifact>{return parseArtifact(await readJson(file));}
export async function ensureOutputAbsent(file:string):Promise<void>{
  try{await lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
  throw Error(`output_exists: ${file}`);
}
export async function publishText(file:string,content:string):Promise<void>{
  await mkdir(path.dirname(path.resolve(file)),{recursive:true});
  const handle=await open(file,'wx');
  try{await handle.writeFile(content);await handle.sync();}
  catch(error){await rm(file,{force:true});throw error;}
  finally{await handle.close();}
}
export async function typecheckSource(source:string):Promise<void>{
  checkSource(source);
  const temp=await mkdtemp(path.join(repositoryRoot,'.custom-check-'));
  try{
    const file=path.join(temp,'Scene.tsx'),check=path.join(temp,'check.tsx');
    await writeFile(file,source);
    await writeFile(check,'import Scene from "./Scene";import type {ComponentType} from "react";const checked:ComponentType<{frame:number;fps:number;width:number;height:number;theme:{background:string;foreground:string;muted:string;accent:string;secondary:string}}>=Scene;export default checked;');
    const program=ts.createProgram([file,check],{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,target:ts.ScriptTarget.ES2022,strict:true,skipLibCheck:true,esModuleInterop:true,noEmit:true,types:['node','react']});
    const errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
    if(errors.length)throw new SourceTypecheckError(errors.slice(0,5).map(d=>({code:d.code,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,message:ts.flattenDiagnosticMessageText(d.messageText,' ').slice(0,1500)})));
  }finally{await rm(temp,{recursive:true,force:true});}
}
export async function saveGeneratedCandidate(artifact:SceneArtifact,file:string):Promise<void>{
  await ensureOutputAbsent(file);await ensureOutputAbsent(file+'.check.json');
  await publishText(file,JSON.stringify(artifact,null,2)+'\n');
  try{await typecheckSource(artifact.source);}
  catch(error){
    await publishText(file+'.check.json',JSON.stringify({technical:'failed',visual:'pending',error:error instanceof Error?error.message:String(error)},null,2)+'\n');
    throw Error(`candidate_retained: ${file}; typecheck failed, repair locally before approval`);
  }
  await publishText(file+'.check.json',JSON.stringify({technical:'passed',visual:'pending',sha256:sourceHash(artifact)},null,2)+'\n');
}
