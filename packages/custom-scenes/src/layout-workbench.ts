import {createHash} from 'node:crypto';
import {mkdir,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {readBoundedJsonBytes} from './files';
import {parseDesign,designHash} from './design';
import {proposeLabelLayout} from './label-layout';

export type LayoutBinding={generation_directory:string;design_sha256:string;layout_sha256:string};
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const read=async(directory:string,name:string)=>JSON.parse((await readBoundedJsonBytes(path.join(directory,name))).toString('utf8'));
async function evidence(directory:string,brief?:unknown,cues?:unknown){
 try{await lstat(path.join(directory,'result.json'));throw Error('label_layout: failed parent required');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const mode=await read(directory,'generation-mode.json'),failure=await read(directory,'failure.json'),count=await read(directory,'request-count.json');
 if(mode.generation_mode!=='source'||failure.failed!==true||failure.code!=='layout_preflight'||failure.requests_dispatched!==1||count.requests_dispatched!==1)throw Error('label_layout: failed source design layout required');
 const design=parseDesign(await read(directory,'frozen-design.json'),brief as Parameters<typeof parseDesign>[1],cues as Parameters<typeof parseDesign>[2]);
 const bytes=await readBoundedJsonBytes(path.join(directory,'provider-1.json')),response=JSON.parse(bytes.toString('utf8'));
 if(response.finishReason!=='stop'||response.truncated||typeof response.content!=='string'||Buffer.byteLength(response.content)>128*1024)throw Error('label_layout: complete design response required');
 if(designHash(parseDesign(JSON.parse(response.content),design.brief,design.cues))!==designHash(design))throw Error('label_layout: original design mismatch');
 return {proposal:proposeLabelLayout(design),responseFileSha256:hash(bytes)};
}
function summary(bundle:Awaited<ReturnType<typeof evidence>>){
 const p=bundle.proposal;
 return {design_sha256:p.proposedDesignSha256,original_design_sha256:p.originalDesignSha256,layout_sha256:hash(JSON.stringify(bundle)),design:p.design,moves:p.moves,unresolved:p.unresolved,layout_preflight:p.layoutPreflight,
  requests_dispatched:0,execution:'not_run',technical:'passed',visual:'pending',production_adopted:false,diagnostic:true,generation_mode:'source'};
}
export async function prepareLayoutProposal(input:{generation_directory:string;brief:unknown;cues:unknown},directory:string){
 const bundle=await evidence(input.generation_directory,input.brief,input.cues),p=bundle.proposal,result=summary(bundle);
 await mkdir(directory,{mode:0o700});
 for(const [name,value] of Object.entries({'layout-proposal.json':bundle,'result.json':result,'design.json':p.design}))await writeFile(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
 return result;
}
export async function verifyLayoutProposal(directory:string,binding:LayoutBinding){
 const bundle=await evidence(binding.generation_directory),saved=await read(directory,'layout-proposal.json'),result=await read(directory,'result.json');
 if(hash(JSON.stringify(bundle))!==binding.layout_sha256||hash(JSON.stringify(saved))!==binding.layout_sha256||bundle.proposal.proposedDesignSha256!==binding.design_sha256||
    JSON.stringify(result)!==JSON.stringify(summary(bundle))||designHash(parseDesign(await read(directory,'design.json')))!==binding.design_sha256)throw Error('label_layout: origin or approval mismatch');
 return bundle.proposal;
}
export async function loadLayoutProposal(directory:string,binding:LayoutBinding){
 const proposal=await verifyLayoutProposal(directory,binding);
 if(proposal.layoutPreflight!=='passed'||!proposal.moves.length)throw Error('label_layout: unresolved or empty proposal cannot be adopted');
 return proposal.design;
}
