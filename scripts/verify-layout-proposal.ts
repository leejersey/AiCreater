import {validateOwnedDirectory} from '../packages/custom-scenes/src/workbench';
import {verifyLayoutProposal} from '../packages/custom-scenes/src/layout-workbench';
async function main(){
 const [directory,generation_directory,design_sha256,layout_sha256,...extra]=process.argv.slice(2);
 if(!directory||!generation_directory||extra.length||![design_sha256,layout_sha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))throw Error('label_layout: invalid verification arguments');
 await validateOwnedDirectory(directory);await validateOwnedDirectory(generation_directory);
 const p=await verifyLayoutProposal(directory,{generation_directory,design_sha256,layout_sha256});
 console.log(JSON.stringify({design_sha256,layout_sha256,original_design_sha256:p.originalDesignSha256}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'label_layout: verification failed');process.exitCode=1;});
