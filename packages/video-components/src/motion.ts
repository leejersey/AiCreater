import type {Scene, Element, VisualAction} from '../../video-schema/src/types';

export function actionProgressAtFrame(action:VisualAction,frame:number):number {
  return Math.max(0,Math.min(1,(frame-action.start_frame)/action.duration_frames));
}

export function visualSceneAtFrame(scene:Scene,frame:number):Scene {
  const updates=(scene.visual_actions??[]).filter(a=>a.kind==='update'&&a.start_frame<=frame);
  if(!updates.length)return scene;
  const content=new Map(scene.elements.map(e=>[e.id,e.content]));
  const replacements=new Map(updates.map(a=>[a.target,content.get(a.source!)!]));
  return {...scene,elements:scene.elements.map(e=>replacements.has(e.id)?{...e,content:replacements.get(e.id)!,highlight:undefined}:e)};
}

export function activeStepAtFrame(scene: Scene, frame: number): Element | undefined {
  const starts = new Map(scene.animations.map(a => [a.target, a.start_frame]));
  let active: Element | undefined;
  for (const step of scene.elements) if (starts.get(step.id)! <= frame) active = step;
  return active;
}

export function entranceAtFrame(frame: number, start: number, duration: number, entrance?: {kind: string; distance: number}) {
  const progress = Math.max(0, Math.min(1, (frame - start) / duration));
  if(entrance?.kind==='wipe')return {opacity:progress>0?1:0,translateY:0,clipPath:`inset(0 ${(1-progress)*100}% 0 0)`};
  const eased = 1 - (1 - progress) ** 3;
  return {opacity: eased, translateY: (entrance?.distance ?? 24) * (1 - eased)};
}
