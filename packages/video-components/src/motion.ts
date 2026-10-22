import type {Scene, Element, VisualAction} from '../../video-schema/src/types';

export const PAPER_CAMERA_FRAMES = 10;
export type Camera = {x: number; y: number; scale: number};
export const IDENTITY_CAMERA: Camera = {x: 960, y: 540, scale: 1};

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

export type EntranceState = {
  opacity: number;
  translateY: number;
  clipPath?: string;
  scale?: number;
  shiftX?: number;
  draw?: number;
  box?: number;
};

export function entranceAtFrame(frame: number, start: number, duration: number, entrance?: {kind: string; distance: number}, effect = 'fade_slide'): EntranceState {
  const progress = Math.max(0, Math.min(1, (frame - start) / duration));
  const eased = 1 - (1 - progress) ** 3;
  if(entrance?.kind==='wipe')return {opacity:progress>0?1:0,translateY:0,clipPath:`inset(0 ${(1-progress)*100}% 0 0)`};
  const slide = {opacity: eased, translateY: (entrance?.distance ?? 24) * (1 - eased)};
  if (effect === 'fade_slide') return slide;
  const base: EntranceState = {...slide, scale: 1, shiftX: 0, draw: eased, box: eased};
  if (effect === 'scale_pop') {
    const scale = progress >= 1 ? 1 : 0.72 + eased * 0.36;
    return {...base, opacity: Math.min(1, progress === 0 ? 0 : 0.35 + eased), translateY: (entrance?.distance ?? 16) * (1 - eased) * 0.35, scale};
  }
  if (effect === 'shake') {
    const amp = (1 - eased) * 10;
    return {...base, opacity: progress > 0 ? 1 : 0, translateY: 0, shiftX: Math.sin(progress * Math.PI * 6) * amp};
  }
  if (effect === 'draw') return {...base, opacity: progress > 0 ? 1 : 0, translateY: 0, draw: eased};
  if (effect === 'box') return {...base, opacity: 1, translateY: 0, box: eased};
  return slide;
}

export function sceneCamera(scene: {camera?: Camera | null}): Camera {
  const camera = scene.camera;
  if (!camera) return IDENTITY_CAMERA;
  return {x: camera.x, y: camera.y, scale: camera.scale};
}

export function smoothstep(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** 10-frame zoom/pan from the previous scene camera to the current one. */
export function blendCamera(from: Camera, to: Camera, localFrame: number): Camera {
  const t = smoothstep(localFrame / PAPER_CAMERA_FRAMES);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    scale: from.scale + (to.scale - from.scale) * t,
  };
}

export function cameraTransform(camera: Camera): {transformOrigin: string; transform: string} {
  return {
    transformOrigin: `${camera.x}px ${camera.y}px`,
    transform: `translate(${960 - camera.x}px, ${540 - camera.y}px) scale(${camera.scale})`,
  };
}
