// Worker entry for a course export that contains at least one Agent chapter:
// tsx scripts/scene-agent-course-job.ts <input.json> <new output dir>
// Input: {chapters:[{kind:'agent',source_file,sha256,brief,cues,scene,audio_file} |
//                   {kind:'workbench',generation_directory,sha256,scene,audio_file}]}
// Every chapter is rendered from its scene source, measured audio and captions; designs are only read to recover
// the cues of older workbench chapters. Local only: no model or TTS calls.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {assertApproval,parseBrief} from '../packages/custom-scenes/src/contract';
import {parseCues} from '../packages/custom-scenes/src/design';
import {frozen} from '../packages/custom-scenes/src/workbench';
import {renderCourseVideo,type AgentVideoInput} from '../packages/scene-agent/src/render/video';
import {sourceSha256} from '../packages/scene-agent/src/render/stills';

type Chapter=
 |{kind:'agent';source_file:string;sha256:string;brief:unknown;cues:unknown;scene:AgentVideoInput['scene'];audio_file:string}
 |{kind:'workbench';generation_directory:string;sha256:string;scene:AgentVideoInput['scene'];audio_file:string};

async function load(chapter:Chapter,index:number):Promise<AgentVideoInput>{
 if(chapter.kind==='agent'){
  const source=await readFile(chapter.source_file,'utf8');
  if(sourceSha256(source)!==chapter.sha256)throw Error(`chapter ${index+1}: agent source changed since it was accepted`);
  const brief=parseBrief(chapter.brief);
  return{source,brief,cues:parseCues(chapter.cues,brief),scene:chapter.scene,audioFile:chapter.audio_file};
 }
 if(chapter.kind==='workbench'){
  // Same frozen artifact and approval check as the existing export, before any source is executed.
  const {artifact,design}=await frozen(chapter.generation_directory);
  assertApproval(artifact,chapter.sha256);
  return{source:artifact.source,brief:artifact.brief,cues:design.cues,scene:chapter.scene,audioFile:chapter.audio_file};
 }
 throw Error(`chapter ${index+1}: unknown kind`);
}

async function main(){
 const [inputFile,outArg]=process.argv.slice(2);
 if(!inputFile||!outArg)throw Error('Usage: scene-agent-course-job <input.json> <new output dir>');
 const input=JSON.parse(await readFile(inputFile,'utf8')) as {chapters:Chapter[]};
 if(!Array.isArray(input.chapters)||!input.chapters.length||input.chapters.length>20)throw Error('expected 1..20 chapters');
 const out=path.resolve(outArg);
 await mkdir(out);
 const chapters=await Promise.all(input.chapters.map(load));
 const result=await renderCourseVideo(chapters,out);
 await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
