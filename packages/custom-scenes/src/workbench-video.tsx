import React,{useEffect,useState} from 'react';
import {AbsoluteFill,Audio,Sequence,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import '@fontsource/noto-sans-sc/400.css';
import {sceneTheme} from './theme';
import {workbenchCaptionLines,workbenchDisplayCaptions} from './workbench-captions';
import type {FrozenChapter,WorkbenchManifest} from './workbench';
type SceneComponent=React.ComponentType<{frame:number;fps:number;width:number;height:number;theme:typeof sceneTheme}>;
function Chapter({chapter,Scene}:{chapter:FrozenChapter;Scene:SceneComponent}){
 const frame=useCurrentFrame(),cue=workbenchDisplayCaptions(chapter.scene.captions).find(c=>frame>=c.start_frame&&frame<c.end_frame);
 return <AbsoluteFill>
  <Scene frame={frame} fps={30} width={1920} height={1080} theme={sceneTheme}/>
  <Sequence from={chapter.scene.narration.audio_start_frame} durationInFrames={chapter.scene.duration_frames-chapter.scene.narration.audio_start_frame} layout="none"><Audio src={staticFile(chapter.audio)}/></Sequence>
  {cue&&<div data-workbench-caption style={{position:'absolute',left:80,right:80,bottom:4,height:96,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',fontSize:30,lineHeight:'45px',color:'#f1f5ff',background:'rgba(8,17,31,0.94)'}}><div>{workbenchCaptionLines(cue.text).map((line,i)=><div key={i} style={{whiteSpace:'pre'}}>{line}</div>)}</div></div>}
 </AbsoluteFill>;
}
export function WorkbenchVideo({manifest,scenes,fontText}:{manifest:WorkbenchManifest;scenes:SceneComponent[];fontText:string}){
 const [handle]=useState(()=>delayRender('Workbench host fonts'));
 useEffect(()=>{let live=true;Promise.all([document.fonts.load('400 30px "Noto Sans SC"',fontText),document.fonts.ready]).then(()=>{if(live)continueRender(handle);}).catch(cancelRender);return()=>{live=false;};},[handle,fontText]);
 return <AbsoluteFill style={{background:sceneTheme.background,fontFamily:'"Noto Sans SC"',overflow:'hidden'}}>{manifest.chapters.map((chapter,i)=><Sequence key={i} from={chapter.from} durationInFrames={chapter.scene.duration_frames}><Chapter chapter={chapter} Scene={scenes[i]}/></Sequence>)}</AbsoluteFill>;
}
