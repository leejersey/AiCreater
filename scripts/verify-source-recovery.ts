import {validateOwnedDirectory} from '../packages/custom-scenes/src/workbench';
import {loadSourceRecovery} from '../packages/custom-scenes/src/source-recovery-workbench';
import {designHash} from '../packages/custom-scenes/src/design';

async function main(){
 const [directory,generation_directory,sha256,recovery_sha256,...extra]=process.argv.slice(2);
 if(!directory||!generation_directory||extra.length||![sha256,recovery_sha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))throw Error('source_recovery: invalid verification arguments');
 await validateOwnedDirectory(directory);await validateOwnedDirectory(generation_directory);
 const loaded=await loadSourceRecovery(directory,{generation_directory,sha256,recovery_sha256});
 console.log(JSON.stringify({sha256,design_sha256:designHash(loaded.design),recovery_sha256}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'source_recovery: verification failed');process.exitCode=1;});
