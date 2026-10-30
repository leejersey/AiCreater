import {mkdir,writeFile,readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {validateTeachingArtifact} from './teaching-artifact';
import {runIsolatedRender} from './isolated-render';
import {repositoryRoot} from './files';
import {verifyTeachingRenderOutput} from './teaching-render-receipt';
import {validateTeachingAudiovisual} from './teaching-audiovisual';
import {verifyTeachingAudiovisualOutput} from './teaching-av-render';

export async function renderTeachingIsolated(value:unknown,expectedSha256:string,output:string){
 const artifact=await validateTeachingArtifact(value,expectedSha256),root=path.resolve(output);
 await mkdir(root); // A fresh immutable job; never overwrite an earlier run.
 await writeFile(path.join(root,'input.json'),JSON.stringify({artifact,expectedSha256}));
 await runIsolatedRender([path.join(repositoryRoot,'scripts/teaching-render-container.ts'),path.join(root,'input.json'),path.join(root,'render')],root,1500000);
 const receipt=JSON.parse(await readFile(path.join(root,'render','receipt.json'),'utf8'));
 if(receipt?.status!=='preview-ready'||receipt.inputSha256!==artifact.artifactSha256||typeof receipt.previewFile!=='string'||path.isAbsolute(receipt.previewFile))throw Error('Invalid container receipt');
 const result=await verifyTeachingRenderOutput(artifact,{status:receipt.status,artifactSha256:receipt.artifactSha256,previewPath:path.resolve(root,'render',receipt.previewFile)},path.join(root,'render'));
 if(result.videoSha256!==receipt.videoSha256)throw Error('Container receipt checksum mismatch');
 return {...result,previewFile:path.join('render',result.previewFile)};
}

export async function renderTeachingAudiovisualIsolated(value:unknown,expectedSha256:string,audioFile:string,output:string){
 const audiovisual=await validateTeachingAudiovisual(value,expectedSha256),info=await lstat(audioFile);
 if(!info.isFile()||info.isSymbolicLink()||info.size!==audiovisual.audioBytes)throw Error('Invalid frozen audio file');
 const bytes=await readFile(audioFile);
 if(createHash('sha256').update(bytes).digest('hex')!==audiovisual.audioSha256)throw Error('Audio checksum mismatch');
 const root=path.resolve(output);await mkdir(root);
 await writeFile(path.join(root,'audio.bin'),bytes,{flag:'wx'});
 await writeFile(path.join(root,'input.json'),JSON.stringify({audiovisual,expectedSha256}),{flag:'wx'});
 await runIsolatedRender([path.join(repositoryRoot,'scripts/teaching-render-container.ts'),path.join(root,'input.json'),path.join(root,'render')],root,1500000);
 const result=await verifyTeachingAudiovisualOutput(audiovisual,expectedSha256,path.join(root,'audio.bin'),path.join(root,'render'));
 return {...result,previewFile:path.join('render',result.previewFile)};
}
