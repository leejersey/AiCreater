import {mkdir,writeFile,readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {bindTransferComponents} from './transfer-component-rig';
import {assembleMotionScene,motionAssemblyHash} from './motion-assembly';
import {sourceHash,parseArtifact} from './contract';
import {typecheckSource} from './files';
import {parseDesign,type VisualDesign} from './design';
import {buildRagTransferDesign} from './rag-transfer-recipe';

/** Prepare review files only. This is not an adopted workbench generation or execution approval. */
export async function prepareTransferCandidate(input:{design:VisualDesign;roles:Parameters<typeof bindTransferComponents>[1]},directory:string){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='design,roles')throw Error('transfer_candidate: unexpected input fields');
 return prepare(input,directory);
}
export async function prepareAutomaticTransferCandidate(input:unknown,directory:string){
 const built=buildRagTransferDesign(input);return prepare({design:built.design,roles:built.roles},directory,built.origin);
}
async function prepare(input:{design:VisualDesign;roles:Parameters<typeof bindTransferComponents>[1]},directory:string,origin?:ReturnType<typeof buildRagTransferDesign>['origin']){
 const binding=bindTransferComponents(input.design,input.roles),artifact=await assembleMotionScene(binding.assembly);
 await typecheckSource(artifact.source);
 const result={schemaVersion:'host-transfer-candidate:1',design_sha256:binding.designSha256,assembly_sha256:motionAssemblyHash(binding.assembly),
  binding_sha256:createHash('sha256').update(JSON.stringify(binding)).digest('hex'),source_sha256:sourceHash(artifact),requests_dispatched:0,
  technical:'passed',execution:'not_run',visual:'pending',accepted:false,production_adopted:false,
  ...(origin?{preset:origin.preset,origin_sha256:createHash('sha256').update(JSON.stringify(origin)).digest('hex')}:{})};
 await mkdir(path.dirname(directory),{recursive:true});await mkdir(directory,{mode:0o700});
 for(const [name,value] of [['design.json',input.design],['binding.json',binding],['candidate.json',artifact],['result.json',result]] as const)
  await writeFile(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
 await writeFile(path.join(directory,'source.txt'),artifact.source,{mode:0o600,flag:'wx'});
 if(origin)await writeFile(path.join(directory,'origin.json'),JSON.stringify(origin,null,2)+'\n',{mode:0o600,flag:'wx'});
 return result;
}

/** Rebuild trusted data and source without evaluating Scene code or granting approval. */
export async function loadTransferCandidate(directory:string){
 if(!path.isAbsolute(directory)||await realpath(directory)!==path.resolve(directory))throw Error('transfer_candidate: invalid directory');
 const read=async(name:string)=>{
  const file=path.join(directory,name),info=await lstat(file);
  if(!info.isFile()||info.size>1024*1024)throw Error('transfer_candidate: invalid review file');
  return await readFile(file,'utf8');
 };
 const design=parseDesign(JSON.parse(await read('design.json'))),binding=JSON.parse(await read('binding.json'));
 const expected=bindTransferComponents(design,binding.roles),artifact=parseArtifact(JSON.parse(await read('candidate.json'))),result=JSON.parse(await read('result.json'));
 const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 let originExists=false;
 try{await lstat(path.join(directory,'origin.json'));originExists=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(result.preset!==undefined||result.origin_sha256!==undefined||originExists){
  const origin=JSON.parse(await read('origin.json')),rebuilt=buildRagTransferDesign(origin.input);
  if(result.preset!=='rag-augmentation:1'||result.origin_sha256!==digest(origin)||digest(origin)!==digest(rebuilt.origin)||
   digest(parseDesign(rebuilt.design))!==digest(design)||digest(rebuilt.roles)!==digest(binding.roles))throw Error('transfer_candidate: recipe origin mismatch');
 }
 const rebuilt=await assembleMotionScene(expected.assembly);
 if(digest(binding)!==digest(expected)||result.binding_sha256!==digest(expected)||result.design_sha256!==expected.designSha256||
  result.assembly_sha256!==motionAssemblyHash(expected.assembly)||result.source_sha256!==sourceHash(artifact)||sourceHash(artifact)!==sourceHash(rebuilt)||
  await read('source.txt')!==artifact.source)throw Error('transfer_candidate: review binding mismatch');
 return {artifact,design,source_sha256:sourceHash(artifact),design_sha256:expected.designSha256,assembly_sha256:motionAssemblyHash(expected.assembly),binding_sha256:digest(expected),
  ...(result.preset?{preset:result.preset as 'rag-augmentation:1',origin_sha256:result.origin_sha256 as string}:{})};
}
export async function verifyTransferCandidate(directory:string){
 const {artifact:_artifact,design:_design,...hashes}=await loadTransferCandidate(directory);return hashes;
}
