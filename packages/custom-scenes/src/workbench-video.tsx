import React,{useEffect,useState} from 'react';
import {AbsoluteFill,Audio,Sequence,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import type {Decoration,SceneThemeProps} from '../../scene-themes/src/index';
import {workbenchCaptionLines,workbenchDisplayCaptions} from './workbench-captions';
import type {FrozenChapter,WorkbenchManifest} from './workbench';
type SceneComponent=React.ComponentType<{frame:number;fps:number;width:number;height:number;theme:SceneThemeProps}>;
// The theme as the host needs it: what the Scene receives, plus what only the host draws (decoration, caption bar, fonts).
export type HostTheme={props:SceneThemeProps;decoration:Decoration;caption:{background:string;foreground:string};faces:string[]};

const CAPTION_TOP=980; // decoration stays above the caption area
/** The theme's one signature texture. Drawn by the host, never by scenes, and left out of the frames the audit measures. */
export function ThemeDecoration({decoration,rule}:{decoration:Decoration;rule:string}){
 if(decoration==='none')return null;
 const area:React.CSSProperties={position:'absolute',left:0,top:0,width:1920,height:CAPTION_TOP,pointerEvents:'none'};
 if(decoration==='grid')return <div style={{...area,opacity:0.5,backgroundImage:`linear-gradient(${rule} 1px, transparent 1px),linear-gradient(90deg, ${rule} 1px, transparent 1px)`,backgroundSize:'64px 64px'}}/>;
 if(decoration==='scanlines')return <div style={{...area,height:1080,opacity:0.35,backgroundImage:'repeating-linear-gradient(0deg, rgba(0,0,0,0.55) 0px, rgba(0,0,0,0.55) 1px, transparent 1px, transparent 4px)'}}/>;
 return <svg style={area} width={1920} height={CAPTION_TOP}><filter id="theme-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#theme-grain)" opacity={0.07}/></svg>;
}

function Chapter({chapter,Scene,theme}:{chapter:FrozenChapter;Scene:SceneComponent;theme:HostTheme}){
 const frame=useCurrentFrame(),cue=workbenchDisplayCaptions(chapter.scene.captions).find(c=>frame>=c.start_frame&&frame<c.end_frame);
 // Scan lines sit over the picture like a screen; the other textures lie under it.
 const over=theme.decoration==='scanlines';
 return <AbsoluteFill>
  {!over&&<ThemeDecoration decoration={theme.decoration} rule={theme.props.rule}/>}
  <Scene frame={frame} fps={30} width={1920} height={1080} theme={theme.props}/>
  {over&&<ThemeDecoration decoration={theme.decoration} rule={theme.props.rule}/>}
  <Sequence from={chapter.scene.narration.audio_start_frame} durationInFrames={chapter.scene.duration_frames-chapter.scene.narration.audio_start_frame} layout="none"><Audio src={staticFile(chapter.audio)}/></Sequence>
  {cue&&<div data-workbench-caption style={{position:'absolute',left:80,right:80,bottom:4,height:96,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',fontSize:30,lineHeight:'45px',color:theme.caption.foreground,background:theme.caption.background,fontFamily:theme.props.fontBody}}><div>{workbenchCaptionLines(cue.text).map((line,i)=><div key={i} style={{whiteSpace:'pre'}}>{line}</div>)}</div></div>}
 </AbsoluteFill>;
}
export function WorkbenchVideo({manifest,scenes,fontText,theme}:{manifest:WorkbenchManifest;scenes:SceneComponent[];fontText:string;theme:HostTheme}){
 const [handle]=useState(()=>delayRender('Workbench host fonts'));
 useEffect(()=>{let live=true;Promise.all([...theme.faces.map(face=>document.fonts.load(face,fontText)),document.fonts.ready]).then(()=>{if(live)continueRender(handle);}).catch(cancelRender);return()=>{live=false;};},[handle,fontText,theme]);
 return <AbsoluteFill style={{background:theme.props.background,fontFamily:theme.props.fontBody,overflow:'hidden'}}>{manifest.chapters.map((chapter,i)=><Sequence key={i} from={chapter.from} durationInFrames={chapter.scene.duration_frames}><Chapter chapter={chapter} Scene={scenes[i]} theme={theme}/></Sequence>)}</AbsoluteFill>;
}
