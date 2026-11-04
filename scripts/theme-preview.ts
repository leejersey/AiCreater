// Renders finished-video frames of a course in one or more themes, from accepted scene sources. Local only, no model calls.
//   tsx scripts/theme-preview.ts <course-input.json> <out dir> [--themes=a,b] [--per-chapter=2]
// <course-input.json> has the course export job's input shape: {chapters:[{kind:'agent',source_file,sha256,brief,cues,scene,audio_file}]}.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseBrief} from '../packages/custom-scenes/src/contract';
import {parseCues} from '../packages/custom-scenes/src/cues';
import {courseManifest,renderCourseStills,type AgentVideoInput} from '../packages/scene-agent/src/render/video';
import {sourceSha256} from '../packages/scene-agent/src/render/stills';
import {builtinThemes} from '../packages/scene-themes/src/index';

async function main(){
 const args=process.argv.slice(2),flags=Object.fromEntries(args.filter(a=>a.startsWith('--')).map(a=>a.slice(2).split('=') as [string,string]));
 const [inputFile,outDir]=args.filter(a=>!a.startsWith('--'));
 if(!inputFile||!outDir)throw Error('Usage: theme-preview <course-input.json> <out dir> [--themes=a,b] [--per-chapter=2]');
 const input=JSON.parse(await readFile(inputFile,'utf8'));
 const chapters:AgentVideoInput[]=await Promise.all(input.chapters.map(async(c:any,i:number)=>{
  const source=await readFile(c.source_file,'utf8');
  if(sourceSha256(source)!==c.sha256)throw Error(`chapter ${i+1}: source changed`);
  const brief=parseBrief(c.brief);
  return{source,brief,cues:parseCues(c.cues,brief),scene:c.scene,audioFile:c.audio_file};
 }));
 // Frames inside each chapter, away from the edges: where its picture is built up and a caption is showing.
 const per=Number(flags['per-chapter']??2),manifest=courseManifest(chapters);
 const frames=manifest.chapters.flatMap(ch=>Array.from({length:per},(_,k)=>ch.from+Math.round(ch.scene.duration_frames*(k+1)/(per+1))));
 const themes=builtinThemes(),ids=flags.themes?flags.themes.split(','):[...themes.keys()];
 const index:Record<string,string[]>={};
 for(const id of ids){
  const theme=themes.get(id);if(!theme)throw Error(`unknown theme ${id}`);
  const started=Date.now();
  index[id]=(await renderCourseStills(chapters,frames,path.join(outDir,id),theme)).map(f=>path.relative(outDir,f));
  console.log(`${id}: ${frames.length} frames in ${Math.round((Date.now()-started)/1000)} s`);
 }
 await writeFile(path.join(outDir,'index.json'),JSON.stringify({frames,themes:index},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
