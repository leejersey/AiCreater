import path from 'node:path';
import {readJson} from '../packages/custom-scenes/src/files';
import {generateWorkbench,previewWorkbench,previewTransferWorkbench,exportWorkbench,validateOwnedDirectory,type ChapterInput,type TransferChapterInput,type GenerationMode} from '../packages/custom-scenes/src/workbench';
import {prepareTransferCandidate,prepareAutomaticTransferCandidate} from '../packages/custom-scenes/src/transfer-candidate';
import {prepareSourceRecovery,type RecoveryBinding} from '../packages/custom-scenes/src/source-recovery-workbench';
import {prepareLayoutProposal,type LayoutBinding} from '../packages/custom-scenes/src/layout-workbench';
import {retimeWorkbench} from '../packages/custom-scenes/src/visual-retime';

async function main(){
 const [command,inputFile,output,...extra]=process.argv.slice(2);
 if(!['generate','repair','preview','export','prepare-transfer','preview-transfer','recover-source','propose-layout'].includes(command)||!inputFile||!output||extra.length)throw Error('Usage: visual-workbench.ts <generate|repair|preview|export|prepare-transfer|preview-transfer|recover-source|propose-layout> <input.json> <new-output-directory>');
 await validateOwnedDirectory(path.resolve(output));
 const input=await readJson(inputFile) as Record<string,unknown>;
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('workbench: invalid input');
 if(command==='repair'&&input.operation==='retime'){
  if(Object.keys(input).sort().join(',')!=='design_sha256,generation_directory,operation,scene,sha256')throw Error('workbench: invalid retime input');
  await validateOwnedDirectory(input.generation_directory as string);
  await retimeWorkbench(input as unknown as Parameters<typeof retimeWorkbench>[0],path.resolve(output));
  console.log(JSON.stringify({status:'succeeded',execution:'not_run',modelRequests:0}));return;
 }
 if(command==='recover-source'||command==='propose-layout'){
  if(Object.keys(input).sort().join(',')!=='brief,cues,generation_directory')throw Error('workbench: unexpected recovery input');
  await validateOwnedDirectory(input.generation_directory as string);
  await (command==='recover-source'?prepareSourceRecovery:prepareLayoutProposal)(input as Parameters<typeof prepareSourceRecovery>[0],path.resolve(output));
  console.log(JSON.stringify({status:'review-required',execution:'not_run',modelRequests:0}));return;
 }
 if(command==='repair'&&Object.hasOwn(input,'layout_directory')){
  if(Object.keys(input).sort().join(',')!=='layout,layout_directory')throw Error('workbench: invalid layout adoption input');
  const binding=input.layout as Record<string,unknown>;
  if(!binding||typeof binding!=='object'||Object.keys(binding).sort().join(',')!=='design_sha256,generation_directory,layout_sha256'||!['design_sha256','layout_sha256'].every(k=>typeof binding[k]==='string'&&/^[a-f0-9]{64}$/.test(binding[k] as string)))throw Error('workbench: invalid layout approval');
  await validateOwnedDirectory(input.layout_directory as string);await validateOwnedDirectory(binding.generation_directory as string);
  await generateWorkbench({layout_directory:input.layout_directory as string,layout:binding as LayoutBinding},path.resolve(output));console.log(JSON.stringify({status:'succeeded'}));return;
 }
 if(command==='prepare-transfer'){
  if(Object.hasOwn(input,'preset'))await prepareAutomaticTransferCandidate(input,path.resolve(output));
  else await prepareTransferCandidate(input as Parameters<typeof prepareTransferCandidate>[0],path.resolve(output));
  console.log(JSON.stringify({status:'prepared',execution:'not_run'}));return;
 }
 const revision=command==='generate'&&Object.hasOwn(input,'previous_design');
 const keys=command==='generate'?(revision?['brief','cues','previous_design','feedback','diagnostic']:['brief','cues']):command==='repair'?['previous_directory','feedback']:['preview','preview-transfer'].includes(command)?['generation_directory','sha256','scene','audio_file']:['chapters'];
 if(command==='preview-transfer')keys.push('design_sha256','assembly_sha256','binding_sha256','audio_sha256');
 const allowed=command==='generate'?[...keys,'generation_mode']:command==='repair'?[...keys,'recovery']:command==='preview-transfer'?[...keys,'preset','origin_sha256']:command==='preview'?[...keys,'timing_mode','isolated_render']:keys;
 if(input.isolated_render!==undefined&&(command!=='preview'||input.isolated_render!==true))throw Error('workbench: invalid isolated render flag');
 if(input.timing_mode!==undefined&&(command!=='preview'||input.timing_mode!=='draft'||input.audio_file!==''))throw Error('workbench: invalid draft preview');
 if(Object.keys(input).some(k=>!allowed.includes(k))||keys.some(k=>!Object.hasOwn(input,k)))throw Error('workbench: unexpected input fields');
 if(command==='generate'){
  if(Object.hasOwn(input,'generation_mode')&&!['source','host-motion','host-intent','host-components'].includes(input.generation_mode as string))throw Error('workbench: invalid generation mode');
  await generateWorkbench({brief:input.brief,cues:input.cues,...(Object.hasOwn(input,'generation_mode')?{generation_mode:input.generation_mode as GenerationMode}:{}),...(revision?{previous_design:input.previous_design,feedback:input.feedback as string,diagnostic:input.diagnostic as string}:{})},path.resolve(output));
 }
 else if(command==='repair'){
  await validateOwnedDirectory(input.previous_directory as string);
  if(input.recovery){
   const recovery=input.recovery as Record<string,unknown>;
   if(!recovery||typeof recovery!=='object'||Object.keys(recovery).sort().join(',')!=='generation_directory,recovery_sha256,sha256'||!['sha256','recovery_sha256'].every(k=>typeof recovery[k]==='string'&&/^[a-f0-9]{64}$/.test(recovery[k] as string)))throw Error('workbench: invalid recovery approval');
   await validateOwnedDirectory(recovery.generation_directory as string);
  }
  await generateWorkbench({previous_directory:input.previous_directory as string,feedback:input.feedback as string,...(input.recovery?{recovery:input.recovery as RecoveryBinding}:{})},path.resolve(output));
 }else if(command==='preview'||command==='preview-transfer'){
  await validateOwnedDirectory(input.generation_directory as string);
  if(command==='preview-transfer')await previewTransferWorkbench(input as unknown as TransferChapterInput,path.resolve(output));
  else await previewWorkbench(input as unknown as ChapterInput,path.resolve(output));
 }else{
  if(!Array.isArray(input.chapters)||!input.chapters.length||input.chapters.length>20)throw Error('workbench: invalid chapters');
  for(const chapter of input.chapters){if(!chapter||typeof chapter!=='object'||Array.isArray(chapter)||Object.keys(chapter).some(k=>!['generation_directory','sha256','scene','audio_file','isolated_render'].includes(k))||(chapter.isolated_render!==undefined&&chapter.isolated_render!==true))throw Error('workbench: invalid chapter');await validateOwnedDirectory(chapter.generation_directory);}
  await exportWorkbench(input as unknown as {chapters:ChapterInput[]},path.resolve(output));
 }
 console.log(JSON.stringify({status:'succeeded'}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'workbench: failed');process.exitCode=1;});
