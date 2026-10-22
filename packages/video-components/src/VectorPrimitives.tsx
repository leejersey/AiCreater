import React from 'react';
import type {Scene} from '../../video-schema/src/types';
import {usePalette, useVisualStyle} from './theme';
import {entranceAtFrame, type EntranceState} from './motion';

type Motion = EntranceState & {effect: string; label: string; id: string};

function useMotions(scene: Scene, frame: number): Motion[] {
  const style = useVisualStyle();
  const animations = new Map(scene.animations.map(a => [a.target, a]));
  return scene.elements.map(element => {
    const animation = animations.get(element.id)!;
    return {
      ...entranceAtFrame(frame, animation.start_frame, animation.duration_frames, style.entrance, animation.effect),
      effect: animation.effect,
      label: element.content,
      id: element.id,
    };
  });
}

function StrokeCurve({motions}: {motions: Motion[]}) {
  const palette = usePalette();
  const drawn = motions.filter(m => m.effect === 'draw');
  const draw = Math.max(...(drawn.length ? drawn : motions).map(m => m.draw));
  const d = 'M 220 760 C 520 760, 620 280, 960 420 S 1480 220, 1720 260';
  return <svg data-vector="stroke_curve" width={1920} height={1080} style={{position: 'absolute'}}>
    <path d={d} fill="none" stroke={palette.muted} strokeWidth={8} opacity={0.35}/>
    <path data-vector-stroke d={d} fill="none" stroke={palette.accent} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw}/>
    {motions.map((motion, i) => {
      const t = (i + 1) / (motions.length + 1);
      const x = 220 + (1720 - 220) * t;
      const y = 760 - 420 * Math.sin(t * Math.PI);
      return <g key={motion.id} data-vector-label={motion.id} opacity={motion.opacity} transform={`translate(${x + motion.shiftX} ${y}) scale(${motion.scale})`}>
        <circle r={14} fill={palette.accent}/>
        <text y={48} textAnchor="middle" fill={palette.text} fontSize={36} fontFamily='"Noto Serif SC", "Noto Sans SC"'>{motion.label}</text>
      </g>;
    })}
  </svg>;
}

function Gauge({motions}: {motions: Motion[]}) {
  const palette = usePalette();
  const lead = motions[motions.length - 1] ?? motions[0];
  const wobble = lead?.effect === 'shake' ? lead.shiftX : 0;
  const angle = -180 + 180 * (lead?.draw ?? 0) + wobble;
  const rad = (angle * Math.PI) / 180;
  const x2 = 960 + Math.cos(rad) * 280;
  const y2 = 640 + Math.sin(rad) * 280;
  return <svg data-vector="gauge" width={1920} height={1080} style={{position: 'absolute'}}>
    <path d="M 560 640 A 400 400 0 0 1 1360 640" fill="none" stroke={palette.muted} strokeWidth={28} strokeLinecap="round"/>
    <path data-vector-zone d="M 1120 640 A 400 400 0 0 1 1360 640" fill="none" stroke={palette.accent} strokeWidth={28} strokeLinecap="round"/>
    <line data-vector-needle x1={960} y1={640} x2={x2} y2={y2} stroke={palette.text} strokeWidth={10} strokeLinecap="round"/>
    <circle cx={960} cy={640} r={18} fill={palette.accent}/>
    {motions.map((motion, i) => <text key={motion.id} data-vector-label={motion.id} x={560 + i * 260} y={760} textAnchor="middle" fill={palette.text} fontSize={36} opacity={motion.opacity} fontFamily='"Noto Sans SC"'>{motion.label}</text>)}
  </svg>;
}

function TradeoffTriangle({motions}: {motions: Motion[]}) {
  const palette = usePalette();
  const corners = [{x: 960, y: 220}, {x: 420, y: 860}, {x: 1500, y: 860}];
  const active = motions.reduce((best, motion) => motion.opacity >= best.opacity ? motion : best, motions[0]);
  return <svg data-vector="tradeoff_triangle" width={1920} height={1080} style={{position: 'absolute'}}>
    <polygon points="960,220 420,860 1500,860" fill="none" stroke={palette.text} strokeWidth={6}/>
    <line x1={960} y1={860} x2={960} y2={760} stroke={palette.accent} strokeWidth={8}/>
    <polygon points="960,760 930,820 990,820" fill={palette.accent}/>
    {motions.slice(0, 3).map((motion, i) => {
      const corner = corners[i];
      const on = motion.id === active?.id;
      return <g key={motion.id} data-vector-label={motion.id} opacity={motion.opacity} transform={`translate(${motion.shiftX} 0) scale(${motion.scale})`}>
        <circle data-vector-corner={motion.id} cx={corner.x} cy={corner.y} r={on ? 22 : 12} fill={on ? palette.accent : palette.card} stroke={palette.text} strokeWidth={3}/>
        {motion.effect === 'box' && <rect data-vector-box={motion.id} x={corner.x - 90} y={corner.y - 70} width={180 * motion.box} height={48} fill="none" stroke={palette.accent} strokeWidth={4}/>}
        <text x={corner.x} y={corner.y + (i === 0 ? -36 : 56)} textAnchor="middle" fill={palette.text} fontSize={36} fontFamily='"Noto Serif SC", "Noto Sans SC"'>{motion.label}</text>
      </g>;
    })}
  </svg>;
}

function DotFunnel({motions}: {motions: Motion[]}) {
  const palette = usePalette();
  const layers = motions.slice(0, 4);
  return <svg data-vector="dot_funnel" width={1920} height={1080} style={{position: 'absolute'}}>
    {layers.map((motion, i) => {
      const width = 980 - i * 220;
      const y = 240 + i * 160;
      const count = 12 - i * 3;
      const kept = Math.max(1, Math.round(count * motion.draw));
      return <g key={motion.id} data-vector-layer={motion.id} opacity={motion.opacity}>
        <rect x={(1920 - width) / 2} y={y} width={width} height={110} rx={8} fill={palette.card} stroke={palette.text} strokeWidth={3}/>
        {Array.from({length: count}, (_, dot) => {
          const dropped = dot >= kept;
          return <circle key={dot} data-vector-dot={dropped ? 'out' : 'kept'} cx={(1920 - width) / 2 + 40 + dot * ((width - 80) / Math.max(1, count - 1))} cy={y + 55 + (dropped ? 28 : 0)} r={dropped ? 7 : 10} fill={dropped ? palette.muted : palette.accent} opacity={dropped ? 0.45 : 1}/>;
        })}
        <text x={960 + motion.shiftX} y={y + 150} textAnchor="middle" fill={palette.text} fontSize={32}>{motion.label}</text>
      </g>;
    })}
  </svg>;
}

export function VectorPrimitives({scene, frame}: {scene: Scene; frame: number}) {
  const motions = useMotions(scene, frame);
  const kind = scene.vector?.kind;
  if (kind === 'gauge') return <Gauge motions={motions}/>;
  if (kind === 'tradeoff_triangle') return <TradeoffTriangle motions={motions}/>;
  if (kind === 'dot_funnel') return <DotFunnel motions={motions}/>;
  return <StrokeCurve motions={motions}/>;
}
