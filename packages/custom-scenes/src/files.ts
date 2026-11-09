import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import {checkSource} from './contract';
import {SCENE_THEME_PROPS_TYPE} from '../../scene-themes/src/index';
import {SCENE_TIMING_TYPE} from './timing';
import {currentKit,usesKit} from './kit';

export const repositoryRoot=fileURLToPath(new URL('../../../',import.meta.url));
export class SourceTypecheckError extends Error{
 readonly code='source_typecheck';
 constructor(readonly diagnostics:{code:number;line:number|null;message:string}[]){
  super('custom_scene_typecheck: '+diagnostics.map(d=>d.message).join('; '));
 }
}
/** `kit` is the scene kit copy the scene is rendered with (default: the repository's current one). */
export async function typecheckSource(source:string,kit?:string):Promise<void>{
  checkSource(source);
  const temp=await mkdtemp(path.join(repositoryRoot,'.custom-check-'));
  try{
    const file=path.join(temp,'Scene.tsx'),check=path.join(temp,'check.tsx');
    await writeFile(file,source);
    if(usesKit(source))await writeFile(path.join(temp,'kit.tsx'),kit??await currentKit());
    await writeFile(check,'import Scene from "./Scene";import type {ComponentType} from "react";const checked:ComponentType<{frame:number;fps:number;width:number;height:number;theme:'+SCENE_THEME_PROPS_TYPE+';timing:'+SCENE_TIMING_TYPE+'}>=Scene;export default checked;');
    const program=ts.createProgram([file,check],{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,target:ts.ScriptTarget.ES2022,strict:true,skipLibCheck:true,esModuleInterop:true,noEmit:true,types:['node','react']});
    const errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
    if(errors.length)throw new SourceTypecheckError(errors.slice(0,5).map(d=>({code:d.code,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,message:ts.flattenDiagnosticMessageText(d.messageText,' ').slice(0,1500)})));
  }finally{await rm(temp,{recursive:true,force:true});}
}
