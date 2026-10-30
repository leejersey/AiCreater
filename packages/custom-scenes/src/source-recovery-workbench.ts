import {createHash} from 'node:crypto';
import {mkdir,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {readBoundedJsonBytes,typecheckSource} from './files';
import {parseDesign,designHash} from './design';
import {proposeSourceRecovery} from './source-recovery';

export type RecoveryBinding={generation_directory:string;sha256:string;recovery_sha256:string};
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const read=async(directory:string,name:string)=>JSON.parse((await readBoundedJsonBytes(path.join(directory,name))).toString('utf8'));
async function evidence(directory:string,brief?:unknown,cues?:unknown){
 try{await lstat(path.join(directory,'result.json'));throw Error('source_recovery: failed parent required');}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const mode=await read(directory,'generation-mode.json');
 if(mode.generation_mode!=='source')throw Error('source_recovery: source mode required');
 const failure=await read(directory,'failure.json'),count=await read(directory,'request-count.json');
 if(failure.failed!==true||![1,2].includes(count.requests_dispatched)||failure.requests_dispatched!==count.requests_dispatched)throw Error('source_recovery: invalid failed request accounting');
 const design=parseDesign(await read(directory,'frozen-design.json'),brief as Parameters<typeof parseDesign>[1],cues as Parameters<typeof parseDesign>[2]);
 const bytes=await readBoundedJsonBytes(path.join(directory,`provider-${count.requests_dispatched}.json`));
 const proposal={...proposeSourceRecovery(JSON.parse(bytes.toString('utf8')),design),responseFileSha256:hash(bytes)};
 return {design,proposal};
}
export async function prepareSourceRecovery(input:{generation_directory:string;brief:unknown;cues:unknown},directory:string){
 const {design,proposal}=await evidence(input.generation_directory,input.brief,input.cues);
 await typecheckSource(proposal.candidate.source);
 await mkdir(directory,{mode:0o700});
 const result={sha256:proposal.candidateSha256,design_sha256:designHash(design),recovery_sha256:hash(JSON.stringify(proposal)),
  source:proposal.candidate.source,design,requests_dispatched:0,execution:'not_run',technical:'passed',visual:'pending',production_adopted:false,diagnostic:true,generation_mode:'source'};
 for(const [name,value] of Object.entries({'source-recovery.json':proposal,'result.json':result,'design.json':design}))await writeFile(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
 await writeFile(path.join(directory,'source.txt'),proposal.candidate.source,{mode:0o600,flag:'wx'});
 return result;
}
export async function loadSourceRecovery(directory:string,binding:RecoveryBinding){
 const {design,proposal}=await evidence(binding.generation_directory);
 const saved=await read(directory,'source-recovery.json'),result=await read(directory,'result.json');
 if(hash(JSON.stringify(saved))!==binding.recovery_sha256||hash(JSON.stringify(proposal))!==binding.recovery_sha256||
    proposal.candidateSha256!==binding.sha256||result.sha256!==binding.sha256||result.recovery_sha256!==binding.recovery_sha256||result.design_sha256!==proposal.designSha256||
    (await readBoundedJsonBytes(path.join(directory,'source.txt'))).toString('utf8')!==proposal.candidate.source||
    designHash(parseDesign(await read(directory,'design.json')))!==proposal.designSha256)throw Error('source_recovery: recovery origin or approval mismatch');
 return {artifact:proposal.candidate,design};
}
