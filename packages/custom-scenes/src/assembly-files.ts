import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseArtifact,assertApproval,type SceneArtifact} from './contract';
import {parseDesign,reviewScene,designHash,type VisualDesign,type VisualReview} from './design';
import {readJson,ensureOutputAbsent,repositoryRoot,typecheckSource} from './files';
import {assembleTimeline,type AssemblyChapterInput} from './assembly';
import {assemblyCaptionLines} from './assembly-captions';

type FrozenChapter={chapter:string;artifact:SceneArtifact;design:VisualDesign;approval:string;review?:VisualReview};
type Frozen={schemaVersion:'scene-assembly:1';audioManifest:unknown;chapters:FrozenChapter[];media:{file:string;sha256:string;seconds:number}[]};
const digest=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
export function assemblyRenderTimeout(frames:number):number{
 if(!Number.isSafeInteger(frames)||frames<=0)throw Error('assembly: invalid render duration');
 return Math.min(1800000,Math.max(600000,Math.ceil(frames/30*4000)));
}
export function verifyAssemblyVideoMetadata(value:unknown,frames:number):void{
 const r=value as {format?:{duration?:unknown};streams?:{codec_type?:string;width?:number;height?:number}[]};
 const seconds=Number(r?.format?.duration);
 if(!Number.isSafeInteger(frames)||frames<=0||!Number.isFinite(seconds)||seconds<=0||Math.abs(seconds-frames/30)>.1
  ||!Array.isArray(r?.streams)||!r.streams.some(s=>s.codec_type==='audio')
  ||!r.streams.some(s=>s.codec_type==='video'&&s.width===1920&&s.height===1080))throw Error('assembly: rendered media verification failed');
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('assembly: expected object');return value as Record<string,unknown>;}
function string(value:unknown):string{if(typeof value!=='string'||!value.length||value.length>4096)throw Error('assembly: invalid string');return value;}
function probe(file:string):number{
 const result=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',file],{encoding:'utf8',timeout:30000,maxBuffer:65536}));
 const seconds=Number(result.format?.duration);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>120||!result.streams?.some((s:{codec_type:string})=>s.codec_type==='audio'))throw Error('assembly: invalid media duration or stream');
 return seconds;
}
function entryFor(chapters:FrozenChapter[],timeline:ReturnType<typeof assembleTimeline>){
 const host=path.join(repositoryRoot,'packages/custom-scenes/src/AssemblyVideo');
 return `import React from 'react';import {Composition,registerRoot} from 'remotion';import {AssemblyVideo,type AssemblyTimeline} from ${JSON.stringify(host)};\n${chapters.map((_,i)=>`import Scene${i} from './scene-${i}';`).join('\n')}\nconst timeline:AssemblyTimeline=${JSON.stringify(timeline)};\nconst scenes=[${chapters.map((_,i)=>`Scene${i}`).join(',')}];\nfunction Film(){return <AssemblyVideo timeline={timeline} scenes={scenes} fontText={${JSON.stringify(chapters.map(c=>c.artifact.source+c.artifact.brief.narration).join(''))}}/>;}\nregisterRoot(()=> <Composition id="ReviewedAssembly" component={Film} width={1920} height={1080} fps={30} durationInFrames={${timeline.durationInFrames}}/>);\n`;
}
function chaptersFrom(value:unknown):FrozenChapter[]{
 if(!Array.isArray(value)||value.length<1||value.length>8)throw Error('assembly: invalid chapters');
 return value.map(v=>{const r=object(v),artifact=parseArtifact(r.artifact),design=parseDesign(r.design,artifact.brief),approval=string(r.approval);assertApproval(artifact,approval);
  return {chapter:string(r.chapter),artifact,design,approval,...(r.review?{review:reviewScene(r.review,artifact,design)}:{})};
 });
}
export async function prepareAssembly(configFile:string,out:string){
 await ensureOutputAbsent(out);
 const config=object(await readJson(configFile)),base=path.dirname(path.resolve(configFile));
 if(config.schemaVersion!=='scene-assembly-input:1'||Object.keys(config).some(k=>!['schemaVersion','audioManifest','chapters'].includes(k))||!Array.isArray(config.chapters)||!config.chapters.length||config.chapters.length>8)throw Error('assembly: invalid config');
 const manifestFile=path.resolve(base,string(config.audioManifest)),audioRoot=await realpath(path.dirname(manifestFile));
 const manifest=object(await readJson(manifestFile));
 const chapters:FrozenChapter[]=[];
 for(const item of config.chapters){
  const r=object(item);if(Object.keys(r).some(k=>!['chapter','artifact','design','approval','review'].includes(k)))throw Error('assembly: unexpected chapter fields');
  const artifactFile=path.resolve(base,string(r.artifact)),artifact=parseArtifact(await readJson(artifactFile)),design=parseDesign(await readJson(path.resolve(base,string(r.design))),artifact.brief);
  const frozenDesign=parseDesign(await readJson(artifactFile+'.design.json'),artifact.brief);
  if(designHash(design)!==designHash(frozenDesign))throw Error('assembly: frozen design mismatch');
  const approval=string(r.approval);assertApproval(artifact,approval);
  chapters.push({chapter:string(r.chapter),artifact,design,approval,...(r.review?{review:reviewScene(await readJson(path.resolve(base,string(r.review))),artifact,design)}:{})});
 }
 const originalTimeline=assembleTimeline(manifest,chapters);
 for(const c of originalTimeline.chapters)for(const cue of c.cues)assemblyCaptionLines(cue.text);
 const selected=new Set(chapters.map(c=>c.chapter));
 const allRows=(manifest.segments as Record<string,unknown>[]).map(r=>({...r}));
 const rows=allRows.filter(r=>selected.has(String(r.chapter)));
 const media:Frozen['media']=[],buffers:Buffer[]=[];
 for(const row of rows){
  const relative=string(row.audio),file=await realpath(path.resolve(audioRoot,relative));
  if(!file.startsWith(audioRoot+path.sep))throw Error('assembly: media path outside root');
  if((await stat(file)).size>50*1024*1024)throw Error('assembly: media too large');
  const data=await readFile(file),seconds=probe(file);
  if(Math.abs(seconds-Number(row.duration))>.05)throw Error('assembly: measured media duration mismatch');
  const frozenFile=`audio/${media.length}${path.extname(relative).toLowerCase()}`;
  row.audio=frozenFile;media.push({file:frozenFile,sha256:digest(data),seconds});buffers.push(data);
 }
 const frozen:Frozen={schemaVersion:'scene-assembly:1',audioManifest:{segments:allRows},chapters,media};
 const timeline=assembleTimeline(frozen.audioManifest,chapters);
 for(const chapter of chapters)await typecheckSource(chapter.artifact.source);
 await mkdir(path.dirname(path.resolve(out)),{recursive:true});await mkdir(out);
 try{
  await mkdir(path.join(out,'public','audio'),{recursive:true});
  for(let i=0;i<media.length;i++)await writeFile(path.join(out,'public',media[i].file),buffers[i],{flag:'wx'});
  for(let i=0;i<chapters.length;i++)await writeFile(path.join(out,`scene-${i}.tsx`),chapters[i].artifact.source,{flag:'wx'});
  await writeFile(path.join(out,'assembly.json'),JSON.stringify(frozen,null,2),{flag:'wx'});
  await writeFile(path.join(out,'entry.tsx'),entryFor(chapters,timeline),{flag:'wx'});
  return {timeline,sha256:digest(JSON.stringify(frozen))};
 }catch(error){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error)}));throw error;}
}
export async function verifyAssembly(directory:string){
 const bytes=await readFile(path.join(directory,'assembly.json'));
 if(bytes.length>2*1024*1024)throw Error('assembly: frozen manifest exceeds 2 MiB');
 const raw=object(JSON.parse(bytes.toString('utf8')));
 if(raw.schemaVersion!=='scene-assembly:1'||!Array.isArray(raw.media))throw Error('assembly: invalid frozen manifest');
 const chapters=chaptersFrom(raw.chapters),timeline=assembleTimeline(raw.audioManifest,chapters as AssemblyChapterInput[]);
 for(const c of timeline.chapters)for(const cue of c.cues)assemblyCaptionLines(cue.text);
 const expected=new Map(timeline.chapters.flatMap(c=>c.audio.map(a=>[a.file,a.durationSeconds] as const)));
 if(raw.media.length!==expected.size)throw Error('assembly: media inventory mismatch');
 const seen=new Set<string>();
 for(const item of raw.media){const media=object(item),file=string(media.file);
  if(!expected.has(file)||seen.has(file)||!/^audio\/\d+\.(mp3|wav)$/.test(file))throw Error('assembly: invalid media inventory');seen.add(file);
  const full=path.join(directory,'public',file),data=await readFile(full);
  if(digest(data)!==media.sha256)throw Error('assembly: media hash mismatch');
  const seconds=probe(full);if(Math.abs(seconds-expected.get(file)!)>.05||seconds!==media.seconds)throw Error('assembly: media duration mismatch');
 }
 for(let i=0;i<chapters.length;i++)if(await readFile(path.join(directory,`scene-${i}.tsx`),'utf8')!==chapters[i].artifact.source)throw Error('assembly: source hash mismatch');
 if(await readFile(path.join(directory,'entry.tsx'),'utf8')!==entryFor(chapters,timeline))throw Error('assembly: host entry hash mismatch');
 return {timeline,chapters,sha256:digest(JSON.stringify(raw))};
}
