// Scene kit: tested building blocks for Scene.tsx. `import {Box, Arrow, ease} from './kit';`
// Every part takes the theme and a 0..1 progress; timing stays in the scene (from timing.cues). Parts carry the
// data attributes the geometry audit reads, so overlaps are still measured. Pure functions of their props.
import React from 'react';
import {interpolate, Easing} from 'remotion';

export type KitTheme = {
  background: string; surface: string; surface2: string; foreground: string; muted: string; faint: string; rule: string;
  accent: string; accentSoft: string; secondary: string; positive: string; negative: string;
  fontDisplay: string; fontBody: string; fontMono: string; radius: number; ruleWidth: number; ruleDash: string; dark: boolean;
};
type Point = {x: number; y: number};
const CLAMP = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

// ---- timing helpers ------------------------------------------------------------------------------------------------

/** 0→1 between frames a and b with an easing (default: settle). */
export function ease(frame: number, a: number, b: number, curve: (t: number) => number = Easing.out(Easing.cubic)): number {
  return interpolate(frame, [a, Math.max(a + 1, b)], [0, 1], {...CLAMP, easing: curve});
}
/** 0→1 starting at frame a, lasting dur frames, but always finished 2 frames before cueEnd. */
export function win(frame: number, a: number, dur: number, cueEnd: number, curve?: (t: number) => number): number {
  return ease(frame, a, Math.min(a + dur, cueEnd - 2), curve);
}
/** A frame at fraction f of a cue (0 = its start, 1 = its end): phases that stretch with the sentence. */
export function at(cue: {start: number; end: number}, f: number): number {
  return cue.start + (cue.end - cue.start) * f;
}
/** Opacity of a listed item spoken in cue k: hidden before, 1 while spoken, `dim` once the next item is spoken. */
export function listOpacity(frame: number, cues: {start: number; end: number}[], k: number, dim = 0.4): number {
  const shown = win(frame, cues[k].start, 12, cues[k].end);
  const next = cues[k + 1];
  return next ? shown * (1 - (1 - dim) * win(frame, next.start, 10, next.end)) : shown;
}

// ---- parts ---------------------------------------------------------------------------------------------------------

/** A card or node: surface, outline (accent when lit), title and optional subtitle, centred at (x, y). */
export function Box({id, x, y, w, h, theme, title, subtitle, lit = false, progress = 1, titleSize = 40}: {
  id: string; x: number; y: number; w: number; h: number; theme: KitTheme; title?: string; subtitle?: string;
  lit?: boolean; progress?: number; titleSize?: number;
}) {
  const p = Math.max(0, Math.min(1, progress));
  return <g data-object id={id} opacity={p} transform={`translate(${x} ${y + 24 * (1 - p)})`}>
    <rect data-obstacle id={`${id}-shape`} x={-w / 2} y={-h / 2} width={w} height={h} rx={theme.radius}
      fill={lit ? theme.accentSoft : theme.surface} stroke={lit ? theme.accent : theme.rule} strokeWidth={theme.ruleWidth * (lit ? 2 : 1)}/>
    {title && <text id={`${id}-title`} x={0} y={subtitle ? -6 : titleSize * 0.35} textAnchor="middle" fill={theme.foreground}
      fontFamily={theme.fontDisplay} fontSize={titleSize}>{title}</text>}
    {subtitle && <text id={`${id}-subtitle`} x={0} y={titleSize * 0.35 + 30} textAnchor="middle" fill={theme.muted}
      fontFamily={theme.fontBody} fontSize={Math.round(titleSize * 0.65)}>{subtitle}</text>}
  </g>;
}

/** A connector that draws itself from `from` to `to` (straight, or curved by `bend` px), with an arrowhead. */
export function Arrow({id, from, to, theme, progress = 1, bend = 0, dashed = false, color}: {
  id: string; from: Point; to: Point; theme: KitTheme; progress?: number; bend?: number; dashed?: boolean; color?: string;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const cx = mx - ((to.y - from.y) / len) * bend, cy = my + ((to.x - from.x) / len) * bend;
  const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
  const stroke = color ?? theme.muted;
  // Arrowhead along the curve's final direction (control point → end).
  const ang = Math.atan2(to.y - cy, to.x - cx), s = 12 + theme.ruleWidth * 2;
  const head = `M ${to.x} ${to.y} L ${to.x - s * Math.cos(ang - 0.45)} ${to.y - s * Math.sin(ang - 0.45)} L ${to.x - s * Math.cos(ang + 0.45)} ${to.y - s * Math.sin(ang + 0.45)} Z`;
  return <g id={id} opacity={p > 0 ? 1 : 0}>
    <path id={`${id}-route`} data-route d={d} pathLength={1} fill="none" stroke={stroke} strokeWidth={theme.ruleWidth * 2}
      strokeLinecap="round" strokeDasharray={dashed ? "0.06 0.04" : 1} strokeDashoffset={dashed ? 0 : 1 - p}
      opacity={dashed ? p : 1}/>
    <path d={head} fill={stroke} opacity={p > 0.92 ? (p - 0.92) / 0.08 : 0}/>
  </g>;
}

/** A document glyph (page with text lines), centred at (x, y). */
export function Doc({id, x, y, theme, scale = 1, progress = 1, highlight = false}: {
  id: string; x: number; y: number; theme: KitTheme; scale?: number; progress?: number; highlight?: boolean;
}) {
  const p = Math.max(0, Math.min(1, progress));
  return <g data-object id={id} opacity={p} transform={`translate(${x} ${y}) scale(${scale * (0.9 + 0.1 * p)})`}>
    <rect data-obstacle x={-40} y={-52} width={80} height={104} rx={Math.min(theme.radius, 8)} fill={highlight ? theme.accentSoft : theme.surface}
      stroke={highlight ? theme.accent : theme.rule} strokeWidth={theme.ruleWidth * 1.5}/>
    {[-24, -6, 12, 30].map((ly, k) => <line key={k} x1={-24} y1={ly} x2={k === 3 ? 6 : 24} y2={ly} stroke={theme.muted} strokeWidth={4} strokeLinecap="round"/>)}
  </g>;
}

/** A cross that draws itself (wrong, rejected), in theme.negative. */
export function Cross({id, x, y, size = 56, theme, progress = 1}: {id: string; x: number; y: number; size?: number; theme: KitTheme; progress?: number}) {
  const a = Math.max(0, Math.min(1, progress * 2)), b = Math.max(0, Math.min(1, progress * 2 - 1)), h = size / 2;
  return <g id={id} transform={`translate(${x} ${y})`} stroke={theme.negative} strokeWidth={Math.max(5, size / 9)} strokeLinecap="round">
    <line x1={-h} y1={-h} x2={-h + size * a} y2={-h + size * a} opacity={a > 0 ? 1 : 0}/>
    <line x1={h} y1={-h} x2={h - size * b} y2={-h + size * b} opacity={b > 0 ? 1 : 0}/>
  </g>;
}

/** A check mark that draws itself (right, accepted), in theme.positive. */
export function Check({id, x, y, size = 56, theme, progress = 1}: {id: string; x: number; y: number; size?: number; theme: KitTheme; progress?: number}) {
  const p = Math.max(0, Math.min(1, progress)), s = size / 56;
  return <path id={id} transform={`translate(${x} ${y}) scale(${s})`} d="M -26 2 L -8 20 L 28 -18" pathLength={1}
    strokeDasharray={1} strokeDashoffset={1 - p} fill="none" stroke={theme.positive} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round"/>;
}

/** A line struck through something (x1..x2 at y), drawn left to right. */
export function Strike({id, x1, x2, y, theme, progress = 1}: {id: string; x1: number; x2: number; y: number; theme: KitTheme; progress?: number}) {
  const p = Math.max(0, Math.min(1, progress));
  return <line id={id} x1={x1} y1={y} x2={x1 + (x2 - x1) * p} y2={y} stroke={theme.negative} strokeWidth={6} strokeLinecap="round" opacity={p > 0 ? 1 : 0}/>;
}

/** A bar growing up from its baseline (x is the bar's centre), with an optional label under it. */
export function Bar({id, x, base, w, h, theme, progress = 1, label, lit = false}: {
  id: string; x: number; base: number; w: number; h: number; theme: KitTheme; progress?: number; label?: string; lit?: boolean;
}) {
  const p = Math.max(0, Math.min(1, progress));
  return <g data-object id={id}>
    <rect data-obstacle x={x - w / 2} y={base - h * p} width={w} height={Math.max(0.001, h * p)} rx={Math.min(theme.radius, w / 4)}
      fill={lit ? theme.accent : theme.muted} fillOpacity={lit ? 0.9 : 0.55}/>
    {label && <text x={x} y={base + 40} textAnchor="middle" fill={theme.muted} fontFamily={theme.fontBody} fontSize={28}>{label}</text>}
  </g>;
}

/** A number counting up to `value` (only values the brief gives), in the theme's monospace font. */
export function Counter({id, x, y, value, theme, progress = 1, size = 88, suffix = '', anchor = 'middle'}: {
  id: string; x: number; y: number; value: number; theme: KitTheme; progress?: number; size?: number; suffix?: string; anchor?: 'start' | 'middle' | 'end';
}) {
  const p = Math.max(0, Math.min(1, progress));
  const decimals = Number.isInteger(value) ? 0 : 1;
  return <text id={id} x={x} y={y} textAnchor={anchor} fill={theme.foreground} fontFamily={theme.fontMono} fontSize={size}
    opacity={p > 0 ? 1 : 0}>{(value * p).toFixed(decimals)}{suffix}</text>;
}

/** A soft accent area behind the focus (draw it before the focused part). */
export function Spotlight({x, y, w, h, theme, progress = 1}: {x: number; y: number; w: number; h: number; theme: KitTheme; progress?: number}) {
  return <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={theme.radius + 8} fill={theme.accentSoft} opacity={Math.max(0, Math.min(1, progress))}/>;
}

/** Camera: scales its children by k around (cx, cy). Push in on a detail with k up to 1.6. */
export function Camera({k = 1, cx = 960, cy = 490, children}: {k?: number; cx?: number; cy?: number; children?: React.ReactNode}) {
  return <g transform={`translate(${cx * (1 - k)} ${cy * (1 - k)}) scale(${k})`}>{children}</g>;
}
