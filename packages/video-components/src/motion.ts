import type {Scene, Element} from '../../video-schema/src/types';

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
