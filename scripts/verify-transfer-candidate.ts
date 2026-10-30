import {verifyTransferCandidate} from '../packages/custom-scenes/src/transfer-candidate';
const [directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw Error('Usage: verify-transfer-candidate.ts <absolute-directory>');
verifyTransferCandidate(directory).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('transfer_candidate: verification failed');process.exitCode=1;});
