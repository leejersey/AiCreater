import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {validateTeachingArtifact} from '../packages/custom-scenes/src/teaching-artifact';
import {renderTeachingArtifactRecovering} from '../packages/custom-scenes/src/teaching-render';
import {verifyTeachingRenderOutput} from '../packages/custom-scenes/src/teaching-render-receipt';
import {renderTeachingAudiovisual} from '../packages/custom-scenes/src/teaching-av-render';

async function main(){
 const [input,output,...extra]=process.argv.slice(2);
 if(extra.length||input!=='/work/job/input.json'||output!=='/work/job/render')throw Error('Invalid frozen container paths');
 const raw=await readFile(input);if(raw.length>16*1024*1024)throw Error('Input exceeds limit');
 const data=JSON.parse(raw.toString());
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid render data');
 if(Object.keys(data).sort().join(',')==='audiovisual,expectedSha256'){
  await renderTeachingAudiovisual(data.audiovisual,data.expectedSha256,'/work/job/audio.bin',output);
  return;
 }
 if(Object.keys(data).sort().join(',')!=='artifact,expectedSha256')throw Error('Invalid render data');
 const original=await validateTeachingArtifact(data.artifact,data.expectedSha256);
 const result=await renderTeachingArtifactRecovering(original,data.expectedSha256,output);
 const receipt=await verifyTeachingRenderOutput(original,result,output);
 await writeFile(path.join(output,'receipt.json'),JSON.stringify(receipt));
}
main().catch(()=>{console.error('teaching_container: frozen rendering or checks failed');process.exitCode=1;});
