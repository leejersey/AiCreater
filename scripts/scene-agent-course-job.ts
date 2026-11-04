// Worker entry for a course export: tsx scripts/scene-agent-course-job.ts <input.json> <new output dir>
// Input: {theme?, chapters:[{kind:'agent',source_file,sha256,brief,cues,scene,audio_file}]}; theme absent = the default
// Every chapter is rendered from its accepted scene source, measured audio and captions. Local only: no model or TTS calls.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseBrief} from '../packages/custom-scenes/src/contract';
import {parseCues} from '../packages/custom-scenes/src/cues';
import {renderCourseVideo,type AgentVideoInput} from '../packages/scene-agent/src/render/video';
import {sourceSha256} from '../packages/scene-agent/src/render/stills';
import {jobTheme} from '../packages/scene-themes/src/index';

type Chapter={kind:'agent';source_file:string;sha256:string;brief:unknown;cues:unknown;scene:AgentVideoInput['scene'];audio_file:string};

async function load(chapter:Chapter,index:number):Promise<AgentVideoInput>{
 if(chapter.kind!=='agent')throw Error(`chapter ${index+1}: unknown kind`);
 const source=await readFile(chapter.source_file,'utf8');
 if(sourceSha256(source)!==chapter.sha256)throw Error(`chapter ${index+1}: agent source changed since it was accepted`);
 const brief=parseBrief(chapter.brief);
 return{source,brief,cues:parseCues(chapter.cues,brief),scene:chapter.scene,audioFile:chapter.audio_file};
}

async function main(){
 const [inputFile,outArg]=process.argv.slice(2);
 if(!inputFile||!outArg)throw Error('Usage: scene-agent-course-job <input.json> <new output dir>');
 const input=JSON.parse(await readFile(inputFile,'utf8')) as {chapters:Chapter[];theme?:unknown};
 if(!Array.isArray(input.chapters)||!input.chapters.length||input.chapters.length>20)throw Error('expected 1..20 chapters');
 const out=path.resolve(outArg);
 await mkdir(out);
 const chapters=await Promise.all(input.chapters.map(load));
 const result=await renderCourseVideo(chapters,out,jobTheme(input.theme));
 await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
