import './loopback.cjs';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia,renderStill,openBrowser,makeCancelSignal} from '@remotion/renderer';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {assertApproval,sourceHash,sceneTheme} from '../packages/custom-scenes/src/contract';
import {readArtifact,repositoryRoot,typecheckSource} from '../packages/custom-scenes/src/files';
import {readJson} from '../packages/custom-scenes/src/files';
import {parseDesign,reviewFrames} from '../packages/custom-scenes/src/design';
import {createHash} from 'node:crypto';
import { summarizeGeometryCoverage, type GeometryAudit } from '../packages/custom-scenes/src/geometry-audit';
type FrameAudit=GeometryAudit&{unsupported?:true};

async function main(){
  const [input,out,...flags]=process.argv.slice(2);
  if(!input||!out||flags.some(f=>!/^--approve=[a-f0-9]{64}$/.test(f)&&f!=='--stills-only'&&!/^--design=.+/.test(f))||flags.filter(f=>f.startsWith('--approve=')).length>1||flags.filter(f=>f.startsWith('--design=')).length>1)throw Error('Usage: custom:render artifact.json new-output-directory --approve=SHA256 [--stills-only] [--design=design.json]');
  const artifact=await readArtifact(input);
  assertApproval(artifact,flags.find(f=>f.startsWith('--approve='))?.slice(10));
  const designFile=flags.find(f=>f.startsWith('--design='))?.slice(9);
  const design=designFile?parseDesign(await readJson(designFile),artifact.brief):undefined;
  await typecheckSource(artifact.source);
  const destination=path.resolve(out);
  await mkdir(path.dirname(destination),{recursive:true});
  await mkdir(destination); // A new directory reserves this run; never replace another result.
  const temp=await mkdtemp(path.join(repositoryRoot,'.custom-render-'));
  const brief=artifact.brief;
  const {cancel,cancelSignal}=makeCancelSignal();
  let cancelled=false;
  const onInterrupt=()=>{cancelled=true;cancel();};
  const checkpoint=()=>{if(cancelled)throw Error('custom_scene_cancelled');};
  const timer=setTimeout(onInterrupt,180000);
  process.on('SIGINT',onInterrupt);process.on('SIGTERM',onInterrupt);
  let browser:Awaited<ReturnType<typeof openBrowser>>|undefined;
  try{
    await writeFile(path.join(temp,'Scene.tsx'),artifact.source);
    await copyFile(path.join(repositoryRoot,'packages/custom-scenes/src/geometry-audit.ts'),path.join(temp,'geometry-audit.ts'));
    await writeFile(path.join(destination,'artifact.json'),JSON.stringify(artifact,null,2));
    if(design)await writeFile(path.join(destination,'design.json'),JSON.stringify(design,null,2));
    const entry=`import React,{useEffect,useLayoutEffect,useState,useRef} from 'react';import {Composition,registerRoot,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';import '@fontsource/noto-sans-sc/400.css';import Scene from './Scene';import {measureScene,hasCompleteSvgCoverage} from './geometry-audit';
function Wrapped(){
 const frame=useCurrentFrame();const root=useRef<HTMLDivElement>(null);const released=useRef(false);
 const [ready,setReady]=useState(false);const [handle]=useState(()=>delayRender('font and geometry'));
 useEffect(()=>{let live=true;Promise.all([document.fonts.load('400 44px "Noto Sans SC"',${JSON.stringify(artifact.source)}),document.fonts.ready]).then(()=>{if(live)setReady(true)}).catch(cancelRender);return()=>{live=false}},[handle]);
 useLayoutEffect(()=>{
  if(!ready||!root.current)return;
  const svg=root.current.querySelector('svg');const complete=hasCompleteSvgCoverage(root.current);
  const audit={...(svg?measureScene(svg):{issues:[],labels:0,movers:0,routes:0,obstacles:0}),...(!complete?{unsupported:true}:{})};
  console.info('SCENE_GEOMETRY:'+JSON.stringify({frame,audit}));
  if(!released.current){released.current=true;continueRender(handle)}
 },[ready,frame,handle]);
 return <div ref={root} style={{width:'100%',height:'100%',background:${JSON.stringify(sceneTheme.background)},fontFamily:'"Noto Sans SC"',overflow:'hidden'}}><Scene frame={frame} fps={30} width={1920} height={1080} theme={${JSON.stringify(sceneTheme)}}/></div>
}
registerRoot(()=> <Composition id="CustomScene" component={Wrapped} width={1920} height={1080} fps={30} durationInFrames={${brief.durationInFrames}}/>);`;
    const entryPoint=path.join(temp,'index.tsx');await writeFile(entryPoint,entry);
    const publicDir=path.join(temp,'public');await mkdir(publicDir);
    const serveUrl=await bundle({entryPoint,publicDir,outDir:path.join(temp,'bundle')});
    checkpoint();
    const chrome=process.env.REMOTION_BROWSER_EXECUTABLE??(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);
    browser=await openBrowser('chrome',{browserExecutable:chrome});
    checkpoint();
    const composition=await selectComposition({serveUrl,id:'CustomScene',puppeteerInstance:browser});
    const frames=design?reviewFrames(design):[...new Set([0,.25,.5,.75,1].map(t=>Math.round((brief.durationInFrames-1)*t)))];
    const frameHashes:Record<string,string>={};
    const audits:Record<number,FrameAudit>={};
    for(const frame of frames){checkpoint();await renderStill({serveUrl,composition,puppeteerInstance:browser,frame,imageFormat:'png',output:path.join(destination,`frame-${frame}.png`),timeoutInMilliseconds:20000,cancelSignal,onBrowserLog:log=>{
      if(!log.text.startsWith('SCENE_GEOMETRY:'))return;
      try{const item=JSON.parse(log.text.slice('SCENE_GEOMETRY:'.length)) as {frame:number;audit:FrameAudit};if(item.frame===frame&&Array.isArray(item.audit?.issues))audits[frame]=item.audit;}catch{}
    }});if(!audits[frame])audits[frame]={issues:[{kind:'missing-audit',target:'scene',detail:'Host audit did not complete for this frame'}],labels:0,movers:0,routes:0,obstacles:0};}
    for(const frame of frames){const file=`frame-${frame}.png`;frameHashes[file]=createHash('sha256').update(await readFile(path.join(destination,file))).digest('hex');}
    if(!flags.includes('--stills-only'))await renderMedia({serveUrl,composition,puppeteerInstance:browser,codec:'h264',pixelFormat:'yuv420p',outputLocation:path.join(destination,'video.mp4'),concurrency:2,cancelSignal,timeoutInMilliseconds:20000,onProgress:({progress})=>{if(progress===1)console.log('render 100%');}});
    checkpoint();
    const report={id:brief.id,sha256:sourceHash(artifact),durationInFrames:brief.durationInFrames,fps:30,technical:'passed',visual:'pending',narration:brief.narration,audio:'not included; silent visual experiment',frames:frames.map(f=>`frame-${f}.png`),checklist:['事实与原稿一致','每个节拍能看见具体对象发生变化','没有退化成文字框切换','文字与连线无碰撞、裁切','同稿对照是否更易理解；允许判定未改善'],trust:'Reviewed local source, NOT a security sandbox'};
    const summary=summarizeGeometryCoverage(audits);
    const {issueCount,motionChecks,unsupportedFrames,coverageGaps}=summary;
    const geometry={status:summary.status,issueCount,motionChecks,unsupportedFrames,...(coverageGaps.length?{coverageGaps}:{}),frames:audits,scope:'Sampled SVG geometry; declared routes/obstacles only; conservative text boxes, not aesthetic acceptance. Pure HTML remains partial.'};
    await writeFile(path.join(destination,'report.json'),JSON.stringify({...report,frameHashes,geometry,...(design?{designSha256:createHash('sha256').update(JSON.stringify(design)).digest('hex')}: {})},null,2)+'\n');
    console.log(JSON.stringify({directory:destination,...report,geometry:{status:geometry.status,issueCount,motionChecks}},null,2));
  }catch(error){await writeFile(path.join(destination,'failure.json'),JSON.stringify({error:error instanceof Error?error.message:String(error)}));throw error;}
  finally{clearTimeout(timer);process.off('SIGINT',onInterrupt);process.off('SIGTERM',onInterrupt);try{if(browser)await browser.close({silent:true});}catch{console.warn('custom_scene: browser cleanup failed');}finally{await rm(temp,{recursive:true,force:true});}}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
