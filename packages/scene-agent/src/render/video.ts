// Voiced chapter video for an agent scene: measured audio and captions, no visual design document.
// The agent's cues come from the same measured captions, so the binding is checked against the cues directly.
import '../../../../scripts/loopback.cjs';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderMedia,selectComposition,makeCancelSignal} from '@remotion/renderer';
import {copyFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {checkSource,type SceneBrief} from '../../../custom-scenes/src/contract';
import type {Cue} from '../../../custom-scenes/src/design';
import {repositoryRoot,typecheckSource} from '../../../custom-scenes/src/files';
import {renderTimeouts} from '../../../custom-scenes/src/render-timeout';
import {assertCaptionCueBinding,workbenchCaptionLines,type WorkbenchCaption} from '../../../custom-scenes/src/workbench-captions';
import {workbenchSrt,type WorkbenchManifest,type WorkbenchScene} from '../../../custom-scenes/src/workbench';
import {sourceSha256} from './stills';

export type AgentVideoInput={source:string;brief:SceneBrief;cues:Cue[];scene:WorkbenchScene;audioFile:string};
const AUDIO=/\.(mp3|wav|m4a|aac|ogg|flac)$/i;

/** The measured scene must match the brief, and its captions must cover the cues exactly. */
export function agentChapter(input:AgentVideoInput):WorkbenchManifest{
 const {brief,cues,scene}=input;
 const duration=brief.durationInFrames;
 if(!scene||scene.duration_frames!==duration||scene.narration?.text!==brief.narration||!Number.isInteger(scene.narration?.audio_start_frame)||
  scene.narration.audio_start_frame<0||scene.narration.audio_start_frame>=duration||!Array.isArray(scene.captions))throw Error('agent video: measured scene does not match the brief');
 const captions:WorkbenchCaption[]=scene.captions.map(c=>({text:c.text,start_frame:c.start_frame,end_frame:c.end_frame}));
 assertCaptionCueBinding(captions,cues,brief.narration,duration);
 if(scene.narration.audio_start_frame>captions[0].start_frame)throw Error('agent video: audio starts after the first caption');
 for(const caption of captions)workbenchCaptionLines(caption.text);
 const ext=path.extname(input.audioFile).toLowerCase();
 if(!AUDIO.test(ext))throw Error('agent video: unsupported audio');
 return{durationInFrames:duration,chapters:[{artifact:'scene/Scene.tsx',sha256:sourceSha256(input.source),design_sha256:'',audio:`chapter-0/audio${ext}`,from:0,
  scene:{duration_frames:duration,narration:{text:brief.narration,audio_start_frame:scene.narration.audio_start_frame},captions}}]};
}

/** Writes video.mp4 and video.srt into `directory`. */
export async function renderAgentVideo(input:AgentVideoInput,directory:string):Promise<{video:'video.mp4';srt:'video.srt'}>{
 checkSource(input.source);
 await typecheckSource(input.source);
 const manifest=agentChapter(input);
 const temp=await mkdtemp(path.join(repositoryRoot,'.scene-agent-render-'));
 let browser:Awaited<ReturnType<typeof openBrowser>>|undefined;
 const {cancel,cancelSignal}=makeCancelSignal();
 const timer=setTimeout(cancel,renderTimeouts(manifest.durationInFrames).cancelMs);
 try{
  const publicDir=path.join(temp,'public');
  await mkdir(path.join(publicDir,'chapter-0'),{recursive:true});
  await copyFile(input.audioFile,path.join(publicDir,manifest.chapters[0].audio));
  await writeFile(path.join(temp,'Scene0.tsx'),input.source);
  const host=path.join(repositoryRoot,'packages/custom-scenes/src/workbench-video').split(path.sep).join('/');
  const entryPoint=path.join(temp,'index.tsx');
  await writeFile(entryPoint,`import React from 'react';import {Composition,registerRoot} from 'remotion';import {WorkbenchVideo} from ${JSON.stringify(host)};import Scene0 from './Scene0';const manifest=${JSON.stringify(manifest)};function Video(){return <WorkbenchVideo manifest={manifest} scenes={[Scene0]} fontText={${JSON.stringify(input.source+input.brief.narration)}}/>}registerRoot(()=> <Composition id="AgentVideo" component={Video} width={1920} height={1080} fps={30} durationInFrames={${manifest.durationInFrames}}/>);`);
  const serveUrl=await bundle({entryPoint,publicDir,outDir:path.join(temp,'bundle')});
  browser=await openBrowser('chrome',{logLevel:'error',browserExecutable:process.env.REMOTION_BROWSER_EXECUTABLE??(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
  const composition=await selectComposition({serveUrl,id:'AgentVideo',puppeteerInstance:browser,logLevel:'error'});
  await renderMedia({serveUrl,composition,puppeteerInstance:browser,codec:'h264',pixelFormat:'yuv420p',outputLocation:path.join(directory,'video.mp4'),concurrency:2,timeoutInMilliseconds:20000,cancelSignal,logLevel:'error'});
  await writeFile(path.join(directory,'video.srt'),workbenchSrt(manifest));
  return{video:'video.mp4',srt:'video.srt'};
 }finally{
  clearTimeout(timer);
  try{if(browser)await browser.close({silent:true});}finally{await rm(temp,{recursive:true,force:true});}
 }
}
