// Renders sampled frames of a Scene.tsx and collects the in-browser geometry audit for each.
// Adapted from scripts/render-custom-scene.ts; keeps one browser per run and re-bundles only when the source changes.
import '../../../../scripts/loopback.cjs';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderStill,selectComposition,makeCancelSignal} from '@remotion/renderer';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {checkSource,type SceneBrief} from '../../../custom-scenes/src/contract';
import {fontImports,fontOverrideCss,jobTheme,sceneThemeProps,themeFonts,type SceneTheme} from '../../../scene-themes/src/index';
import {repositoryRoot} from '../../../custom-scenes/src/files';
import {currentKit} from '../../../custom-scenes/src/kit';
import type {GeometryAudit} from '../../../custom-scenes/src/geometry-audit';
import {decodePng,emptySpace,inkCoverage,type EmptySpace} from './ink';
import type {LabelBox} from './labels';
import type {Cue} from '../../../custom-scenes/src/cues';
import {sceneTiming,type SceneTiming} from '../../../custom-scenes/src/timing';

export type FrameAudit=GeometryAudit&{unsupported?:true;labelBoxes?:Record<string,LabelBox>};
// ink: share of pixels that differ from the background; space: the largest empty bands above the captions
export type RenderedFrame={frame:number;file:string;audit:FrameAudit;ink?:number;space?:EmptySpace};
export type FrameFailure={frame:number;error:string};
export type StillsResult={sourceSha256:string;frames:RenderedFrame[];failures:FrameFailure[]};

export interface StillRenderer{
 /** timing: the cue frames the scene receives (default: the brief's measured cues). */
 render(source:string,frames:number[],outDir:string,timing?:SceneTiming):Promise<StillsResult>;
 close():Promise<void>;
}

export const sourceSha256=(source:string)=>createHash('sha256').update(source).digest('hex');
const STILL_SCALE=0.5; // 960×540 PNGs; geometry is measured in SVG user units, independent of scale
const FRAME_TIMEOUT_MS=20000;

// The audit frames use the theme's background, fonts and colors but not its decoration, so blank and empty-area checks
// compare the picture against a flat background.
function entrySource(brief:SceneBrief,source:string,theme:SceneTheme){
 const props=sceneThemeProps(theme);
 return `import React,{useEffect,useLayoutEffect,useState,useRef} from 'react';import {Composition,registerRoot,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';${fontImports(theme)}import Scene from './Scene';import {measureScene,hasCompleteSvgCoverage} from './geometry-audit';import {measurePanels} from './panels';import {measureLabels} from './labels';
function Wrapped({timing}:{timing:any}){
 const frame=useCurrentFrame();const root=useRef<HTMLDivElement>(null);const released=useRef(false);
 const [ready,setReady]=useState(false);const [handle]=useState(()=>delayRender('font and geometry'));
 useEffect(()=>{let live=true;Promise.all([...${JSON.stringify(themeFonts(theme).faces)}.map(face=>document.fonts.load(face,${JSON.stringify(source)})),document.fonts.ready]).then(()=>{if(live)setReady(true)}).catch(cancelRender);return()=>{live=false}},[handle]);
 useLayoutEffect(()=>{
  if(!ready||!root.current)return;
  const svg=root.current.querySelector('svg');const complete=hasCompleteSvgCoverage(root.current);
  const base=svg?measureScene(svg):{issues:[],labels:0,movers:0,routes:0,obstacles:0};const audit={...base,issues:[...base.issues,...(svg?measurePanels(svg):[])],...(svg?{labelBoxes:measureLabels(svg)}:{}),...(!complete?{unsupported:true}:{})};
  console.debug('SCENE_GEOMETRY:'+JSON.stringify({frame,audit}));
  if(!released.current){released.current=true;continueRender(handle)}
 },[ready,frame,handle]);
 return <div ref={root} style={{width:'100%',height:'100%',background:${JSON.stringify(props.background)},fontFamily:${JSON.stringify(props.fontBody)},overflow:'hidden'}}>${fontOverrideCss(theme)?`<style>{${JSON.stringify(fontOverrideCss(theme))}}</style>`:''}<Scene frame={frame} fps={30} width={1920} height={1080} theme={${JSON.stringify(props)}} timing={timing}/></div>
}
registerRoot(()=> <Composition id="CustomScene" component={Wrapped as any} defaultProps={{timing:{durationInFrames:${brief.durationInFrames},cues:[]}}} width={1920} height={1080} fps={30} durationInFrames={${brief.durationInFrames}}/>);`;
}

// Trim bundler/browser errors to the part a model can act on: the message and the first Scene.tsx frames.
export function conciseError(error:unknown):string{
 const text=error instanceof Error?`${error.message}\n${error.stack??''}`:String(error);
 const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
 const head=lines[0]??'unknown error';
 const scene=lines.filter(l=>/Scene\.tsx/.test(l)&&l!==head).slice(0,3);
 return [head,...scene].join('\n').slice(0,1500);
}

export class RemotionStillRenderer implements StillRenderer{
 private browser?:Awaited<ReturnType<typeof openBrowser>>;
 private bundled?:{sha:string;serveUrl:string;temp:string};
 /** `kit`: the scene kit copy to bundle beside the scene (default: the repository's current one). */
 constructor(private readonly brief:SceneBrief,private readonly theme:SceneTheme=jobTheme(undefined),private readonly cues:Cue[]=[],private readonly kit?:string){}

 async render(source:string,frames:number[],outDir:string,timing:SceneTiming=sceneTiming(this.brief.durationInFrames,this.cues)):Promise<StillsResult>{
  const inputProps={timing};
  checkSource(source); // local execution is guarded by the source contract, not sandboxed
  const sha=sourceSha256(source);
  const serveUrl=await this.bundle(sha,source);
  this.browser??=await openBrowser('chrome',{logLevel:'error',browserExecutable:process.env.REMOTION_BROWSER_EXECUTABLE??(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
  const composition=await selectComposition({serveUrl,id:'CustomScene',puppeteerInstance:this.browser,inputProps,logLevel:'error'});
  await mkdir(outDir,{recursive:true});
  const result:StillsResult={sourceSha256:sha,frames:[],failures:[]};
  for(const frame of frames){
   let audit:FrameAudit|undefined;
   const file=path.join(outDir,`frame-${String(frame).padStart(4,'0')}.png`);
   const {cancelSignal,cancel}=makeCancelSignal();
   const timer=setTimeout(cancel,FRAME_TIMEOUT_MS+5000);
   try{
    await renderStill({serveUrl,composition,puppeteerInstance:this.browser,inputProps,frame,imageFormat:'png',scale:STILL_SCALE,output:file,timeoutInMilliseconds:FRAME_TIMEOUT_MS,cancelSignal,logLevel:'error',onBrowserLog:log=>{
     if(!log.text.startsWith('SCENE_GEOMETRY:'))return;
     try{const item=JSON.parse(log.text.slice('SCENE_GEOMETRY:'.length));if(item.frame===frame&&Array.isArray(item.audit?.issues))audit=item.audit;}catch{}
    }});
    const png=decodePng(await readFile(file));
    const ink=inkCoverage(png,this.theme.colors.background),space=emptySpace(png,this.theme.colors.background);
    result.frames.push({frame,file,ink,space,audit:audit??{issues:[{kind:'missing-audit',target:'scene',detail:'Geometry audit did not complete for this frame'}],labels:0,movers:0,routes:0,obstacles:0}});
   }catch(error){result.failures.push({frame,error:conciseError(error)});}
   finally{clearTimeout(timer);}
  }
  return result;
 }

 private async bundle(sha:string,source:string):Promise<string>{
  if(this.bundled?.sha===sha)return this.bundled.serveUrl;
  if(this.bundled)await rm(this.bundled.temp,{recursive:true,force:true});
  this.bundled=undefined;
  const temp=await mkdtemp(path.join(repositoryRoot,'.scene-agent-render-'));
  try{
   await writeFile(path.join(temp,'Scene.tsx'),source);
   await writeFile(path.join(temp,'kit.tsx'),this.kit??await currentKit());
   await copyFile(path.join(repositoryRoot,'packages/custom-scenes/src/geometry-audit.ts'),path.join(temp,'geometry-audit.ts'));
   await copyFile(path.join(repositoryRoot,'packages/scene-agent/src/render/panels.ts'),path.join(temp,'panels.ts'));
   await copyFile(path.join(repositoryRoot,'packages/scene-agent/src/render/labels.ts'),path.join(temp,'labels.ts'));
   const entryPoint=path.join(temp,'index.tsx');
   await writeFile(entryPoint,entrySource(this.brief,source,this.theme));
   const publicDir=path.join(temp,'public');await mkdir(publicDir);
   const serveUrl=await bundle({entryPoint,publicDir,outDir:path.join(temp,'bundle')});
   this.bundled={sha,serveUrl,temp};
   return serveUrl;
  }catch(error){await rm(temp,{recursive:true,force:true});throw error;}
 }

 async close(){
  try{if(this.browser)await this.browser.close({silent:true});}catch{}
  this.browser=undefined;
  if(this.bundled)await rm(this.bundled.temp,{recursive:true,force:true});
  this.bundled=undefined;
 }
}
