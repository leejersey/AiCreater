import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateTeachingArtifact,type TeachingArtifact} from './teaching-artifact';
import {summarizeTeachingRender,teachingSampledFrames,assertTeachingMedia} from './teaching-render-policy';

export async function verifyTeachingRenderOutput(original:TeachingArtifact,result:{status:string;artifactSha256?:string;previewPath?:string},output:string){
 if(result.status!=='preview-ready'||!result.previewPath)throw Error('Render checks did not pass');
 const file=path.resolve(result.previewPath),folder=path.dirname(file);
 if(!file.startsWith(path.resolve(output)+path.sep))throw Error('Preview escaped render folder');
 const load=async(name:string)=>JSON.parse(await readFile(path.join(folder,name),'utf8'));
 const rendered=await validateTeachingArtifact(await load('artifact.json'),result.artifactSha256!);
 if(!isDeepStrictEqual(rendered.compiled.plan,original.compiled.plan)||!isDeepStrictEqual(rendered.brief,original.brief)||!isDeepStrictEqual(rendered.cues,original.cues))throw Error('Recovery changed frozen semantic input');
 for(const [name,required] of [['stills-report.json',teachingSampledFrames(rendered)],['continuous-report.json',Array.from({length:rendered.brief.durationInFrames},(_,i)=>i)]] as const){
  const report=await load(name);
  if(report.artifactSha256!==rendered.artifactSha256||!Array.isArray(report.invalidLogs)||report.invalidLogs.length||!isDeepStrictEqual(report.requiredFrames,required)||summarizeTeachingRender(rendered,report.frames,required).status!=='passed')throw Error('Render evidence is incomplete');
 }
 const report=await load('report.json');assertTeachingMedia(report.media,rendered.brief.durationInFrames);
 const hash=createHash('sha256').update(await readFile(file)).digest('hex');
 if(report.status!=='preview-ready'||report.artifactSha256!==rendered.artifactSha256||report.videoSha256!==hash)throw Error('Preview receipt mismatch');
 return {status:'preview-ready' as const,inputSha256:original.artifactSha256,artifactSha256:rendered.artifactSha256,previewFile:path.relative(output,file),videoSha256:hash,accepted:false as const};
}
