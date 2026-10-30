import path from 'node:path';
import {renderTeachingIsolated,renderTeachingAudiovisualIsolated} from '../packages/custom-scenes/src/teaching-isolated-render';

async function main(){
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of process.stdin){const b=Buffer.from(chunk);size+=b.length;if(size>16*1024*1024)throw Error('Input exceeds limit');chunks.push(b);}
 const input=JSON.parse(Buffer.concat(chunks).toString());
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.output!=='string'||!path.isAbsolute(input.output))throw Error('Invalid render request');
 const keys=Object.keys(input).sort().join(',');
 if(keys!=='artifact,expectedSha256,output'&&(keys!=='audioFile,audiovisual,expectedSha256,output'||typeof input.audioFile!=='string'||!path.isAbsolute(input.audioFile)))throw Error('Invalid render request fields');
 const receipt=keys==='artifact,expectedSha256,output'?await renderTeachingIsolated(input.artifact,input.expectedSha256,input.output)
  :await renderTeachingAudiovisualIsolated(input.audiovisual,input.expectedSha256,input.audioFile,input.output);
 process.stdout.write('TEACHING_RESULT: '+JSON.stringify(receipt)+'\n');
}
main().catch(error=>{console.error('teaching_isolated: rendering or checks did not complete');process.exitCode=error instanceof Error&&error.message==='isolated render: cleanup-unconfirmed'?2:1;});
