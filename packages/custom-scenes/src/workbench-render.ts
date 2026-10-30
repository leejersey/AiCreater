import '../../../scripts/loopback.cjs';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderMedia,makeCancelSignal} from '@remotion/renderer';
import {mkdtemp,readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertApproval,parseArtifact} from './contract';
import {parseDesign,designHash} from './design';
import {readJson,repositoryRoot,typecheckSource} from './files';
import {validateWorkbenchScene,type WorkbenchManifest} from './workbench';
import {renderTimeouts} from './render-timeout';

export async function renderWorkbench(directory:string){
 const manifest=await readJson(path.join(directory,'composition.json')) as WorkbenchManifest;
 if(!manifest||!Array.isArray(manifest.chapters)||!manifest.chapters.length||manifest.chapters.length>20)throw Error('workbench: invalid render manifest');
 const temp=await mkdtemp(path.join(repositoryRoot,'.workbench-render-'));
 let browser:Awaited<ReturnType<typeof openBrowser>>|undefined;
 const {cancel,cancelSignal}=makeCancelSignal();const onInterrupt=()=>cancel();
 const timer=setTimeout(onInterrupt,renderTimeouts(manifest.durationInFrames).cancelMs);process.once('SIGTERM',onInterrupt);process.once('SIGINT',onInterrupt);
 try{
  const publicDir=path.join(temp,'public');await mkdir(publicDir);let duration=0;const imports:string[]=[],names:string[]=[],texts:string[]=[];
  for(const [i,chapter] of manifest.chapters.entries()){
   if(chapter.artifact!==`chapter-${i}/artifact.json`||!new RegExp(`^chapter-${i}/audio\\.(mp3|wav|m4a|aac|ogg|flac)$`).test(chapter.audio)||chapter.from!==duration)throw Error('workbench: unsafe render chapter');
   const artifact=parseArtifact(await readJson(path.join(directory,chapter.artifact)));
   // Verify the full brief/source hash immediately before materializing an executable import.
   assertApproval(artifact,chapter.sha256);
   const design=parseDesign(await readJson(path.join(directory,chapter.artifact+'.design.json')),artifact.brief);
   if(designHash(design)!==chapter.design_sha256)throw Error('workbench: render design mismatch');
   validateWorkbenchScene(chapter.scene,artifact,design);await typecheckSource(artifact.source);
   await writeFile(path.join(temp,`Scene${i}.tsx`),artifact.source);
   imports.push(`import Scene${i} from './Scene${i}';`);names.push(`Scene${i}`);texts.push(artifact.source,artifact.brief.narration);
   await mkdir(path.join(publicDir,`chapter-${i}`));await copyFile(path.join(directory,chapter.audio),path.join(publicDir,chapter.audio));duration+=chapter.scene.duration_frames;
  }
  if(manifest.durationInFrames!==duration)throw Error('workbench: render duration mismatch');
  const host=path.join(repositoryRoot,'packages/custom-scenes/src/workbench-video').split(path.sep).join('/');
  const entryPoint=path.join(temp,'index.tsx');
  await writeFile(entryPoint,`import React from 'react';import {Composition,registerRoot} from 'remotion';import {WorkbenchVideo} from ${JSON.stringify(host)};${imports.join('\n')}const manifest=${JSON.stringify(manifest)};const scenes=[${names.join(',')}];function Video(){return <WorkbenchVideo manifest={manifest} scenes={scenes} fontText={${JSON.stringify(texts.join(''))}}/>}registerRoot(()=> <Composition id="Workbench" component={Video} width={1920} height={1080} fps={30} durationInFrames={${duration}}/>);`);
  const serveUrl=await bundle({entryPoint,publicDir,outDir:path.join(temp,'bundle')});
  const chrome=process.env.REMOTION_BROWSER_EXECUTABLE??(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);
  browser=await openBrowser('chrome',{browserExecutable:chrome});
  const composition=await selectComposition({serveUrl,id:'Workbench',puppeteerInstance:browser});
  await renderMedia({serveUrl,composition,puppeteerInstance:browser,codec:'h264',pixelFormat:'yuv420p',outputLocation:path.join(directory,'video.mp4'),concurrency:2,timeoutInMilliseconds:20000,cancelSignal});
 }finally{clearTimeout(timer);process.off('SIGTERM',onInterrupt);process.off('SIGINT',onInterrupt);try{if(browser)await browser.close({silent:true});}finally{await rm(temp,{recursive:true,force:true});}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.length!==3){console.error('Usage: workbench-render owned-frozen-directory');process.exitCode=1;}
 else renderWorkbench(path.resolve(process.argv[2])).catch(async error=>{
  try{await writeFile(path.join(path.resolve(process.argv[2]),'render.failure.json'),JSON.stringify({error:(error instanceof Error?error.message:String(error)).slice(0,4000),stack:error instanceof Error?error.stack?.slice(0,8000):undefined}),{mode:0o600,flag:'wx'});}catch{}
  console.error('workbench: composition render failed; private render.failure.json retained');process.exitCode=1;
 });
}
