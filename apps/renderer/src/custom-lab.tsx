import React,{useEffect,useState} from 'react';
import {Composition,registerRoot,useCurrentFrame,useVideoConfig,delayRender,continueRender,cancelRender} from 'remotion';
import '@fontsource/noto-sans-sc/400.css';
import brief from '../../../examples/custom-scenes/context-wallet/brief.json';
import WalletScene from '../../../examples/custom-scenes/context-wallet/WalletScene';
import {TemplateWalletScene,walletTheme} from '../../../examples/custom-scenes/context-wallet/template';
import GeneratedContextScene from '../../../examples/custom-scenes/generated-context/Scene';
import GeneratedLoopScene from '../../../examples/custom-scenes/generated-loop/Scene';
import contextDesign from '../../../examples/custom-scenes/generated-context/design.json';
import loopDesign from '../../../examples/custom-scenes/generated-loop/design.json';
import GeneratedLoopV2Scene from '../../../examples/custom-scenes/generated-loop-v2/Scene';
import loopV2Design from '../../../examples/custom-scenes/generated-loop-v2/design.json';
import ReviewedLoopScene from '../../../examples/custom-scenes/reviewed-loop/Scene';
import reviewedLoopDesign from '../../../examples/custom-scenes/reviewed-loop/design.json';

function FontReady({children,text=brief.narration}:{children:React.ReactNode;text?:string}) {
  const [handle]=useState(()=>delayRender('Loading local wallet comparison font'));
  useEffect(()=>{
    let active=true;
    Promise.all([
      document.fonts.load('400 88px "Noto Sans SC"',text+'上下文预算信息装入容量受阻筛选保留相关代码当前任务旧的日志无关文档更多信息'),
      document.fonts.ready,
    ]).then(()=>{if(active)continueRender(handle);}).catch(error=>{if(active)cancelRender(error);});
    return ()=>{active=false;};
  },[handle,text]);
  return <>{children}</>;
}

function CustomWallet() {
  const frame=useCurrentFrame(),{fps,width,height}=useVideoConfig();
  return <FontReady><WalletScene frame={frame} fps={fps} width={width} height={height} theme={walletTheme}/></FontReady>;
}
function TemplateWallet() {
  const frame=useCurrentFrame();
  return <FontReady><TemplateWalletScene frame={frame}/></FontReady>;
}
function GeneratedContext(){
 const frame=useCurrentFrame(),{fps,width,height}=useVideoConfig();
 return <FontReady text={contextDesign.brief.narration}><GeneratedContextScene frame={frame} fps={fps} width={width} height={height} theme={walletTheme}/></FontReady>;
}
function GeneratedLoop(){
 const frame=useCurrentFrame(),{fps,width,height}=useVideoConfig();
 return <FontReady text={loopDesign.brief.narration}><GeneratedLoopScene frame={frame} fps={fps} width={width} height={height} theme={walletTheme}/></FontReady>;
}
function GeneratedLoopV2(){
 const frame=useCurrentFrame(),{fps,width,height}=useVideoConfig();
 return <FontReady text={loopV2Design.brief.narration}><GeneratedLoopV2Scene frame={frame} fps={fps} width={width} height={height} theme={walletTheme}/></FontReady>;
}
function ReviewedLoop(){
 const frame=useCurrentFrame(),{fps,width,height}=useVideoConfig();
 return <FontReady text={reviewedLoopDesign.brief.narration}><ReviewedLoopScene frame={frame} fps={fps} width={width} height={height} theme={walletTheme}/></FontReady>;
}
function CustomLabRoot() {
  return <>
    <Composition id="TemplateWallet" component={TemplateWallet} width={brief.width} height={brief.height}
      fps={brief.fps} durationInFrames={brief.durationInFrames}/>
    <Composition id="CustomWallet" component={CustomWallet} width={brief.width} height={brief.height}
      fps={brief.fps} durationInFrames={brief.durationInFrames}/>
    <Composition id="GeneratedContext" component={GeneratedContext} width={1920} height={1080} fps={30} durationInFrames={contextDesign.brief.durationInFrames}/>
    <Composition id="GeneratedLoop" component={GeneratedLoop} width={1920} height={1080} fps={30} durationInFrames={loopDesign.brief.durationInFrames}/>
    <Composition id="GeneratedLoopV2" component={GeneratedLoopV2} width={1920} height={1080} fps={30} durationInFrames={loopV2Design.brief.durationInFrames}/>
    <Composition id="ReviewedLoop" component={ReviewedLoop} width={1920} height={1080} fps={30} durationInFrames={reviewedLoopDesign.brief.durationInFrames}/>
  </>;
}
registerRoot(CustomLabRoot);
