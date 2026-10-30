import '../../../scripts/loopback.cjs';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia,makeCancelSignal} from '@remotion/renderer';
import {mkdir,mkdtemp,writeFile,readFile,rename,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validateTeachingArtifact,teachingRuntimeSnapshot} from './teaching-artifact';
import {summarizeTeachingRender,recordTeachingAudit,assertTeachingMedia,teachingSampledFrames,type TeachingFrameAudit} from './teaching-render-policy';
import {repositoryRoot} from './files';
import {renderTimeouts} from './render-timeout';
import {runTeachingRenderRecovery} from './teaching-render-recovery';

const exec=promisify(execFile),sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
/** Explicit free-recovery entry. Each round uses fresh files and the full existing renderer. */
export async function renderTeachingArtifactRecovering(value:unknown,expectedSha256:string,output:string){
 const artifact=await validateTeachingArtifact(value,expectedSha256),root=path.resolve(output);
 await mkdir(root);
 try{
  const result=await runTeachingRenderRecovery(artifact,expectedSha256,async(candidate,round)=>{
   const folder=path.join(root,'round-'+round+'-'+candidate.layoutVariant);
   try{
    const rendered=await renderTeachingArtifact(candidate,candidate.artifactSha256,folder);
    const report=JSON.parse(await readFile(path.join(folder,'continuous-report.json'),'utf8'));
    return {status:'preview-ready',report,media:rendered.media};
   }catch(error){
    const phase=existsSync(path.join(folder,'continuous-report.json'))?'continuous':'stills';
    const reportFile=path.join(folder,phase==='continuous'?'continuous-report.json':'stills-report.json');
    if(!existsSync(reportFile))throw error;
    return {status:'failed',phase,report:JSON.parse(await readFile(reportFile,'utf8'))};
   }
  });
  const last=result.history.at(-1);
  const previewPath=result.status==='preview-ready'&&last?path.join(root,'round-'+(result.history.length-1)+'-'+last.variant,'preview.mp4'):undefined;
  if(previewPath&&!existsSync(previewPath))throw Error('teaching_recovery: final preview file missing');
  const saved={...result,...(previewPath?{previewPath}:{})};
  await writeFile(path.join(root,'recovery-report.json'),JSON.stringify(saved,null,2));return saved;
 }catch(error){
  await writeFile(path.join(root,'recovery-failure.json'),JSON.stringify({status:'failed',accepted:false,error:error instanceof Error?error.message:String(error)},null,2));throw error;
 }
}
export async function renderTeachingArtifact(value:unknown,expectedSha256:string,output:string){
 const artifact=await validateTeachingArtifact(value,expectedSha256),destination=path.resolve(output);
 await mkdir(destination); // Reserve a fresh run and preserve all previous evidence.
 const temp=await mkdtemp(path.join(repositoryRoot,'.teaching-render-'));
 let browser:Awaited<ReturnType<typeof openBrowser>>|undefined;
 const {cancel,cancelSignal}=makeCancelSignal();const onStop=()=>cancel();
 const timer=setTimeout(onStop,renderTimeouts(artifact.brief.durationInFrames).cancelMs);
 process.once('SIGINT',onStop);process.once('SIGTERM',onStop);
 try{
  await writeFile(path.join(destination,'artifact.json'),JSON.stringify(artifact,null,2));
  const snapshot=await teachingRuntimeSnapshot();
  for(const part of ['runtime','fonts'] as const){
   const expected=artifact.binding[part];
   if(snapshot[part].length!==expected.length||snapshot[part].some((f,i)=>f.name!==expected[i].name||f.sha256!==expected[i].sha256))throw Error('teaching_render: runtime changed before snapshot');
   for(const file of snapshot[part]){const target=path.join(temp,part==='fonts'?'font':'',file.name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.bytes);}
  }
  await writeFile(path.join(temp,'artifact.json'),JSON.stringify(artifact));
  const entry=`import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Composition,registerRoot,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import './font/400.css';import artifact from './artifact.json';import {TeachingScene} from './teaching-scene';import {measureTeachingScene} from './teaching-scene-audit';
function Video(){const frame=useCurrentFrame(),root=useRef(null),released=useRef(false),[ready,setReady]=useState(false),[handle]=useState(()=>delayRender('bound teaching font and DOM audit'));
useEffect(()=>{let live=true;Promise.all([document.fonts.load('400 24px "Noto Sans SC"',${JSON.stringify(artifact.brief.title+artifact.compiled.objects.map(o=>o.asset.text.lines.join('')).join(''))}),document.fonts.ready]).then(()=>{if(live)setReady(true)}).catch(cancelRender);return()=>{live=false}},[]);
useLayoutEffect(()=>{if(!ready||!root.current)return;const svg=root.current.querySelector('svg');const audit=measureTeachingScene(svg,artifact,frame);console.info('TEACHING_AUDIT:'+JSON.stringify({artifactSha256:artifact.artifactSha256,audit}));if(!released.current){released.current=true;continueRender(handle)}},[ready,frame]);
return <div ref={root} style={{width:1920,height:1080,overflow:'hidden'}}><TeachingScene artifact={artifact} frame={frame}/></div>}
registerRoot(()=> <Composition id="TeachingScene" component={Video} width={1920} height={1080} fps={30} durationInFrames={${artifact.brief.durationInFrames}}/>);`;
  const entryPoint=path.join(temp,'index.tsx');await writeFile(entryPoint,entry);await mkdir(path.join(temp,'public'));
  const serveUrl=await bundle({entryPoint,publicDir:path.join(temp,'public'),outDir:path.join(temp,'bundle')});
  const chrome=process.env.REMOTION_BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if(!existsSync(chrome))throw Error('teaching_render: installed Chrome required; no automatic download');
  browser=await openBrowser('chrome',{browserExecutable:chrome});
  const composition=await selectComposition({serveUrl,id:'TeachingScene',puppeteerInstance:browser});
  const sampled=teachingSampledFrames(artifact);
  const stillAudits:Record<number,TeachingFrameAudit>={},videoAudits:Record<number,TeachingFrameAudit>={};
  const invalidLogs:string[]=[];
  const collect=(target:Record<number,TeachingFrameAudit>,wanted?:number)=>(log:{text:string})=>{
   if(!log.text.startsWith('TEACHING_AUDIT:'))return;
   try{
    if(log.text.length>128*1024)throw Error('Oversized audit log');
    const item=JSON.parse(log.text.slice(15));const a=item.audit as TeachingFrameAudit;
    if(item.artifactSha256!==artifact.artifactSha256||!a||!Number.isInteger(a.frame)||a.frame<0||a.frame>=artifact.brief.durationInFrames||!Array.isArray(a.issues))throw Error('Invalid bound audit');
    if(wanted!==undefined&&a.frame!==wanted)return;
    recordTeachingAudit(target,a);
   }catch(error){if(invalidLogs.length<20)invalidLogs.push(error instanceof Error?error.message:'Malformed audit log');}
  };
  const frameHashes:Record<string,string>={};
  process.stdout.write(JSON.stringify({structure:artifact.compiled.plan.structure,stage:'browser-stills',frames:sampled.length})+'\n');
  for(const frame of sampled){
   const file='frame-'+frame+'.png';
   await renderStill({serveUrl,composition,puppeteerInstance:browser,frame,imageFormat:'png',output:path.join(destination,file),timeoutInMilliseconds:30000,cancelSignal,logLevel:'error',onBrowserLog:collect(stillAudits,frame)});
   frameHashes[file]=sha(await readFile(path.join(destination,file)));
  }
  const preflight=summarizeTeachingRender(artifact,stillAudits,sampled);
  await writeFile(path.join(destination,'stills-report.json'),JSON.stringify({...preflight,invalidLogs,frameHashes},null,2));
  if(preflight.status!=='passed'||invalidLogs.length)throw Error('teaching_render: actual browser still audit failed');
  process.stdout.write(JSON.stringify({structure:artifact.compiled.plan.structure,stage:'continuous-preview',frames:artifact.brief.durationInFrames})+'\n');
  const pending=path.join(destination,'preview.pending.mp4');
  await renderMedia({serveUrl,composition,puppeteerInstance:browser,codec:'h264',pixelFormat:'yuv420p',concurrency:2,outputLocation:pending,timeoutInMilliseconds:30000,cancelSignal,logLevel:'error',onBrowserLog:collect(videoAudits)});
  const continuous=summarizeTeachingRender(artifact,videoAudits,Array.from({length:artifact.brief.durationInFrames},(_,i)=>i));
  await writeFile(path.join(destination,'continuous-report.json'),JSON.stringify({...continuous,invalidLogs},null,2));
  if(continuous.status!=='passed'||invalidLogs.length)throw Error('teaching_render: actual continuous-frame audit failed');
  const probe=await exec('ffprobe',['-v','error','-count_frames','-show_entries','format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,start_time','-of','json',pending],{timeout:60000,maxBuffer:128*1024});
  const media=JSON.parse(probe.stdout);assertTeachingMedia(media,artifact.brief.durationInFrames);
  const videoSha256=sha(await readFile(pending));await rename(pending,path.join(destination,'preview.mp4'));
  const report={status:'preview-ready',accepted:false,visual:'pending',artifactSha256:artifact.artifactSha256,frameHashes,videoSha256,media,sampledFrames:sampled,continuousFrames:Object.keys(videoAudits).length,
   scope:'Silent local host-rendered preview and actual DOM audits; no paid generation, production eligibility or blind-test acceptance'};
  await writeFile(path.join(destination,'report.json'),JSON.stringify(report,null,2));return report;
 }catch(error){
  await writeFile(path.join(destination,'failure.json'),JSON.stringify({status:'failed',accepted:false,artifactSha256:artifact.artifactSha256,error:error instanceof Error?error.message:String(error)},null,2));throw error;
 }finally{
  clearTimeout(timer);process.off('SIGINT',onStop);process.off('SIGTERM',onStop);
  try{if(browser)await browser.close({silent:true});}finally{await rm(temp,{recursive:true,force:true});}
 }
}
