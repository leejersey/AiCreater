import React,{useEffect,useState} from 'react';
import {AbsoluteFill,Audio,Sequence,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import '@fontsource/noto-sans-sc/400.css';
import {sceneTheme} from './theme';
import type {assembleTimeline} from './assembly';
import {assemblyCaptionLines} from './assembly-captions';

export type AssemblyTimeline=ReturnType<typeof assembleTimeline>;
type SceneComponent=React.ComponentType<{frame:number;fps:number;width:number;height:number;theme:typeof sceneTheme}>;
function Chapter({chapter,Scene}:{chapter:AssemblyTimeline['chapters'][number];Scene:SceneComponent}){
 const frame=useCurrentFrame();
 const cue=chapter.cues.find(c=>frame>=c.startFrame&&frame<c.endFrame);
 // Show the complete measured cue; never invent word timing by character count.
 const lines=cue?assemblyCaptionLines(cue.text):[];
 return <AbsoluteFill>
  <Scene frame={frame} fps={30} width={1920} height={1080} theme={sceneTheme}/>
  {chapter.audio.map((audio,i)=><Sequence key={i} from={audio.from} durationInFrames={audio.durationInFrames} layout="none"><Audio src={staticFile(audio.file)}/></Sequence>)}
  {cue&&<div data-assembly-caption style={{position:'absolute',left:80,right:80,bottom:4,height:96,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',fontSize:30,lineHeight:'45px',color:'#f1f5ff',background:'rgba(8,17,31,0.94)'}}><div>{lines.map((line,i)=><div data-caption-line key={i} style={{whiteSpace:'pre'}}>{line}</div>)}</div></div>}
 </AbsoluteFill>;
}
export function AssemblyVideo({timeline,scenes,fontText}:{timeline:AssemblyTimeline;scenes:SceneComponent[];fontText:string}){
 const [handle]=useState(()=>delayRender('Assembly Chinese fonts'));
 useEffect(()=>{let live=true;Promise.all([document.fonts.load('400 30px "Noto Sans SC"',fontText),document.fonts.ready]).then(()=>{if(live)continueRender(handle);}).catch(cancelRender);return()=>{live=false;};},[handle,fontText]);
 return <AbsoluteFill style={{background:sceneTheme.background,fontFamily:'"Noto Sans SC"',overflow:'hidden'}}>
  {timeline.chapters.map((chapter,i)=><Sequence key={chapter.chapter} from={chapter.from} durationInFrames={chapter.durationInFrames}><Chapter chapter={chapter} Scene={scenes[i]}/></Sequence>)}
 </AbsoluteFill>;
}
