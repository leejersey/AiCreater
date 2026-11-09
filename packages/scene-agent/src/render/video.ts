// Voiced chapter video for an agent scene: measured audio and captions, no visual design document.
// The agent's cues come from the same measured captions, so the binding is checked against the cues directly.
import '../../../../scripts/loopback.cjs';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderMedia,renderStill,selectComposition,makeCancelSignal} from '@remotion/renderer';
import {copyFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {checkSource,type SceneBrief} from '../../../custom-scenes/src/contract';
import type {Cue} from '../../../custom-scenes/src/cues';
import {repositoryRoot,typecheckSource} from '../../../custom-scenes/src/files';
import {renderTimeouts} from '../../../custom-scenes/src/render-timeout';
import {assertCaptionCueBinding,workbenchCaptionLines,type WorkbenchCaption} from '../../../custom-scenes/src/workbench-captions';
import {workbenchSrt,type WorkbenchManifest,type WorkbenchScene} from '../../../custom-scenes/src/workbench';
import {sourceSha256} from './stills';
import {sceneTiming} from '../../../custom-scenes/src/timing';
import {fontImports,hostTheme,jobTheme,type SceneTheme} from '../../../scene-themes/src/index';

export type AgentVideoInput={source:string;brief:SceneBrief;cues:Cue[];scene:WorkbenchScene;audioFile:string};
const AUDIO=/\.(mp3|wav|m4a|aac|ogg|flac)$/i;

/** One chapter: the measured scene must match the brief, and its captions must cover the cues exactly. */
function chapterScene(input:AgentVideoInput):WorkbenchScene{
 const {brief,cues,scene}=input;
 const duration=brief.durationInFrames;
 if(!scene||scene.duration_frames!==duration||scene.narration?.text!==brief.narration||!Number.isInteger(scene.narration?.audio_start_frame)||
  scene.narration.audio_start_frame<0||scene.narration.audio_start_frame>=duration||!Array.isArray(scene.captions))throw Error('agent video: measured scene does not match the brief');
 const captions:WorkbenchCaption[]=scene.captions.map(c=>({text:c.text,start_frame:c.start_frame,end_frame:c.end_frame}));
 assertCaptionCueBinding(captions,cues,brief.narration,duration);
 if(scene.narration.audio_start_frame>captions[0].start_frame)throw Error('agent video: audio starts after the first caption');
 for(const caption of captions)workbenchCaptionLines(caption.text);
 if(!AUDIO.test(path.extname(input.audioFile)))throw Error('agent video: unsupported audio');
 return{duration_frames:duration,narration:{text:brief.narration,audio_start_frame:scene.narration.audio_start_frame},captions};
}

/** Chapters back to back; each keeps its own measured audio and captions. */
export function courseManifest(inputs:AgentVideoInput[]):WorkbenchManifest{
 if(!inputs.length||inputs.length>20)throw Error('agent video: 1..20 chapters');
 let from=0;
 const chapters=inputs.map((input,i)=>{
  const scene=chapterScene(input);
  // The scene animates from these cue frames: the current voice-over's, whichever voice-over it was generated on.
  const chapter={artifact:`chapter-${i}/Scene.tsx`,sha256:sourceSha256(input.source),design_sha256:'',audio:`chapter-${i}/audio${path.extname(input.audioFile).toLowerCase()}`,from,scene,
   timing:sceneTiming(scene.duration_frames,input.cues)};
  from+=scene.duration_frames;
  return chapter;
 });
 return{durationInFrames:from,chapters};
}
export const agentChapter=(input:AgentVideoInput)=>courseManifest([input]);

/** Writes video.mp4 and video.srt for one chapter into `directory`. */
export function renderAgentVideo(input:AgentVideoInput,directory:string,theme:SceneTheme=jobTheme(undefined)){return renderCourseVideo([input],directory,theme);}

const chrome=()=>process.env.REMOTION_BROWSER_EXECUTABLE??(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);

/** Bundles the course host with each chapter's scene and audio in `theme`; the caller removes `temp`. */
async function bundleCourse(inputs:AgentVideoInput[],theme:SceneTheme){
 for(const input of inputs){checkSource(input.source);await typecheckSource(input.source);}
 const manifest=courseManifest(inputs);
 const temp=await mkdtemp(path.join(repositoryRoot,'.scene-agent-render-'));
 try{
  const publicDir=path.join(temp,'public');
  for(const [i,input] of inputs.entries()){
   await mkdir(path.join(publicDir,`chapter-${i}`),{recursive:true});
   await copyFile(input.audioFile,path.join(publicDir,manifest.chapters[i].audio));
   await writeFile(path.join(temp,`Scene${i}.tsx`),input.source);
  }
  const host=path.join(repositoryRoot,'packages/custom-scenes/src/workbench-video').split(path.sep).join('/');
  const names=inputs.map((_,i)=>`Scene${i}`);
  const entryPoint=path.join(temp,'index.tsx');
  await writeFile(entryPoint,`import React from 'react';import {Composition,registerRoot} from 'remotion';${fontImports(theme)}import {WorkbenchVideo} from ${JSON.stringify(host)};${names.map(n=>`import ${n} from './${n}';`).join('')}const manifest=${JSON.stringify(manifest)};function Video(){return <WorkbenchVideo manifest={manifest} scenes={[${names.join(',')}]} fontText={${JSON.stringify(inputs.map(i=>i.source+i.brief.narration).join(''))}} theme={${JSON.stringify(hostTheme(theme))}}/>}registerRoot(()=> <Composition id="AgentVideo" component={Video} width={1920} height={1080} fps={30} durationInFrames={${manifest.durationInFrames}}/>);`);
  const serveUrl=await bundle({entryPoint,publicDir,outDir:path.join(temp,'bundle')});
  return{manifest,temp,serveUrl};
 }catch(error){await rm(temp,{recursive:true,force:true});throw error;}
}

/** Writes video.mp4 and video.srt for chapters played back to back into `directory`, in one theme. */
export async function renderCourseVideo(inputs:AgentVideoInput[],directory:string,theme:SceneTheme=jobTheme(undefined)):Promise<{video:'video.mp4';srt:'video.srt';durationInFrames:number}>{
 const {manifest,temp,serveUrl}=await bundleCourse(inputs,theme);
 let browser:Awaited<ReturnType<typeof openBrowser>>|undefined;
 const {cancel,cancelSignal}=makeCancelSignal();
 const timer=setTimeout(cancel,renderTimeouts(manifest.durationInFrames).cancelMs);
 try{
  browser=await openBrowser('chrome',{logLevel:'error',browserExecutable:chrome()});
  const composition=await selectComposition({serveUrl,id:'AgentVideo',puppeteerInstance:browser,logLevel:'error'});
  await renderMedia({serveUrl,composition,puppeteerInstance:browser,codec:'h264',pixelFormat:'yuv420p',outputLocation:path.join(directory,'video.mp4'),concurrency:2,timeoutInMilliseconds:20000,cancelSignal,logLevel:'error'});
  await writeFile(path.join(directory,'video.srt'),workbenchSrt(manifest));
  return{video:'video.mp4',srt:'video.srt',durationInFrames:manifest.durationInFrames};
 }finally{
  clearTimeout(timer);
  try{if(browser)await browser.close({silent:true});}finally{await rm(temp,{recursive:true,force:true});}
 }
}

/** Finished-video frames (decoration and captions included) at `frames` of the course, as PNGs in `directory`. Local only. */
export async function renderCourseStills(inputs:AgentVideoInput[],frames:number[],directory:string,theme:SceneTheme,scale=0.5):Promise<string[]>{
 const {manifest,temp,serveUrl}=await bundleCourse(inputs,theme);
 let browser:Awaited<ReturnType<typeof openBrowser>>|undefined;
 try{
  browser=await openBrowser('chrome',{logLevel:'error',browserExecutable:chrome()});
  const composition=await selectComposition({serveUrl,id:'AgentVideo',puppeteerInstance:browser,logLevel:'error'});
  await mkdir(directory,{recursive:true});
  const files:string[]=[];
  for(const frame of frames){
   if(!Number.isInteger(frame)||frame<0||frame>=manifest.durationInFrames)throw Error(`frame ${frame} is outside the course`);
   const output=path.join(directory,`frame-${String(frame).padStart(5,'0')}.png`);
   await renderStill({serveUrl,composition,puppeteerInstance:browser,frame,imageFormat:'png',scale,output,timeoutInMilliseconds:20000,logLevel:'error'});
   files.push(output);
  }
  return files;
 }finally{
  try{if(browser)await browser.close({silent:true});}finally{await rm(temp,{recursive:true,force:true});}
 }
}
