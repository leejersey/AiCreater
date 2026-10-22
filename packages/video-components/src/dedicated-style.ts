import type {CSSProperties} from 'react';
import type {Scene} from '../../video-schema/src/types';
import {visualStyles,type StyleTokens,type Palette} from './theme';
import {activeStepAtFrame,entranceAtFrame,entranceSpan} from './motion';

export function dedicatedPanel(style:StyleTokens,p:Palette):CSSProperties{
  const legacy=style===visualStyles.legacy;
  return {position:'absolute',background:style.card.outline?p.background:p.card,border:`${legacy?2:style.card.borderWidth}px solid ${p.accent}${style.card.outline?'':'55'}`,borderRadius:legacy?18:style.card.radius,padding:legacy?24:Math.min(24,style.card.padding),boxSizing:'border-box',...(!legacy?{boxShadow:style.card.shadow}:{})};
}

// Moving a snapshot/time bar/chart mark would suggest a value or time that never existed.
export function dedicatedReveal(scene:Scene,frame:number,style:StyleTokens,id=activeStepAtFrame(scene,frame)?.id):CSSProperties{
  if(style===visualStyles.legacy||!id)return {};
  const a=scene.animations.find(a=>a.target===id)!;
  const motion=entranceAtFrame(frame,a.start_frame,a.duration_frames,style.entrance);
  // A completed inset still clips outlines outside the event box.
  return {opacity:motion.opacity,clipPath:frame>=a.start_frame+entranceSpan(a.duration_frames)?undefined:motion.clipPath};
}
