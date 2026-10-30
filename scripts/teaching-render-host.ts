import path from 'node:path';
import {validateTeachingArtifact} from '../packages/custom-scenes/src/teaching-artifact';
import {renderTeachingArtifactRecovering} from '../packages/custom-scenes/src/teaching-render';
import {verifyTeachingRenderOutput} from '../packages/custom-scenes/src/teaching-render-receipt';

async function main(){
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of process.stdin){const b=Buffer.from(chunk);size+=b.length;if(size>16*1024*1024)throw Error('Input exceeds limit');chunks.push(b);}
 const input=JSON.parse(Buffer.concat(chunks).toString());
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='artifact,expectedSha256,output'||typeof input.output!=='string'||!path.isAbsolute(input.output))throw Error('Invalid host render request');
 const original=await validateTeachingArtifact(input.artifact,input.expectedSha256);
 const result=await renderTeachingArtifactRecovering(original,input.expectedSha256,input.output);
 const receipt=await verifyTeachingRenderOutput(original,result,input.output);
 process.stdout.write('TEACHING_RESULT: '+JSON.stringify(receipt)+'\n');
}
main().catch(()=>{console.error('teaching_render_host: local rendering or evidence validation failed');process.exitCode=1;});
