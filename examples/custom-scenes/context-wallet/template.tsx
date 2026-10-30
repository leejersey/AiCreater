import React from 'react';
import brief from './brief.json';
import type {Scene} from '../../../packages/video-schema/src/types';
import {SceneGraphics} from '../../../packages/video-components/src/SceneGraphics';
import {PaletteContext,VisualStyleContext,getVisualStyle,palettes} from '../../../packages/video-components/src/theme';
import {sceneTheme} from '../../../packages/custom-scenes/src/theme';

export const walletTheme=sceneTheme;
export const walletTemplateScene:Scene={
  id:'context-wallet-template',type:'card_sequence',duration_frames:brief.durationInFrames,
  narration:{text:brief.narration,audio_asset_id:'visual-only',audio_start_frame:6},
  elements:[
    {id:'budget',content:'有限的钱包',icon:'document',cue:{text_start:16,text_end:21}},
    {id:'noise',content:'被噪声淹没',icon:'warning',cue:{text_start:36,text_end:41}},
    {id:'retain',content:'只保留当下真正需要的',icon:'check',panel_style:'conclusion',cue:{text_start:42,text_end:52}},
  ],
  animations:[
    {target:'budget',effect:'fade_slide',start_frame:0,duration_frames:30},
    {target:'noise',effect:'fade_slide',start_frame:180,duration_frames:30},
    {target:'retain',effect:'fade_slide',start_frame:360,duration_frames:30},
  ],captions:[],
};

export function TemplateWalletScene({frame}:{frame:number}) {
  const t=walletTheme;
  const palette={...palettes.tech_explainer,background:t.background,text:t.foreground,muted:t.muted,
    accent:t.accent,secondary:t.secondary,source:t.accent,warning:t.secondary,card:'#122531',selected:'#163d38'};
  return <PaletteContext.Provider value={palette}><VisualStyleContext.Provider value={getVisualStyle('minimal')}>
    <div data-narration={brief.narration} style={{position:'absolute',inset:0,background:t.background,color:t.foreground,fontFamily:'"Noto Sans SC", sans-serif'}}>
      <div style={{position:'absolute',left:122,top:107,fontSize:88}}>上下文预算</div>
      <div style={{position:'absolute',left:128,top:238,fontSize:30,color:t.muted}}>信息有取舍，容量有边界</div>
      <SceneGraphics scene={walletTemplateScene} frame={frame}/>
    </div>
  </VisualStyleContext.Provider></PaletteContext.Provider>;
}
