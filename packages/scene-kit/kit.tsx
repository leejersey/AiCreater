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

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const textWidth = (s: string, size: number) => Array.from(s).reduce((n, ch) => n + (ch.charCodeAt(0) > 127 ? size : size * 0.6), 0);

/** A compact pill badge centred at (x, y) for tags like "旧方案", "实测", "推荐". */
export function Badge({id, x, y, text, theme, tone = 'accent', progress = 1, fontSize = 24}: {
  id: string; x: number; y: number; text: string; theme: KitTheme; tone?: 'accent' | 'positive' | 'negative' | 'muted'; progress?: number; fontSize?: number;
}) {
  const p = clamp01(progress);
  const w = Math.max(84, Math.ceil(textWidth(text, fontSize) + fontSize * 1.4));
  const h = Math.round(fontSize * 1.75);
  const color = tone === 'positive' ? theme.positive : tone === 'negative' ? theme.negative : tone === 'muted' ? theme.muted : theme.accent;
  const fill = tone === 'accent' ? theme.accentSoft : theme.surface2;
  return <g data-object id={id} opacity={p} transform={`translate(${x} ${y + 10 * (1 - p)})`}>
    <rect data-obstacle id={`${id}-pill`} x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={fill} stroke={color} strokeWidth={theme.ruleWidth * 1.5}/>
    <text id={`${id}-text`} x={0} y={fontSize * 0.36} textAnchor="middle" fill={color} fontFamily={theme.fontDisplay} fontSize={fontSize} fontWeight={600}>{text}</text>
  </g>;
}

/** A KPI / metric highlight card centred at (x, y) with animated number count-up and optional delta tag. */
export function MetricCard({id, x, y, w, h, label, value, suffix = '', delta, deltaTone = 'positive', theme, lit = false, progress = 1}: {
  id: string; x: number; y: number; w: number; h: number; label: string; value: number; suffix?: string; delta?: string;
  deltaTone?: 'positive' | 'negative' | 'accent'; theme: KitTheme; lit?: boolean; progress?: number;
}) {
  const p = clamp01(progress);
  const decimals = Number.isInteger(value) ? 0 : 1;
  const valSize = Math.min(82, Math.max(44, Math.round(h * 0.34)));
  const deltaColor = deltaTone === 'negative' ? theme.negative : deltaTone === 'accent' ? theme.accent : theme.positive;
  return <g data-object id={id} opacity={p} transform={`translate(${x} ${y + 22 * (1 - p)})`}>
    <rect data-obstacle id={`${id}-shape`} x={-w / 2} y={-h / 2} width={w} height={h} rx={theme.radius}
      fill={lit ? theme.accentSoft : theme.surface} stroke={lit ? theme.accent : theme.rule} strokeWidth={theme.ruleWidth * (lit ? 2 : 1)}/>
    <text id={`${id}-label`} x={0} y={-h / 2 + 44} textAnchor="middle" fill={theme.muted} fontFamily={theme.fontBody} fontSize={26}>{label}</text>
    <text id={`${id}-value`} x={0} y={delta ? 16 : 26} textAnchor="middle" fill={lit ? theme.accent : theme.foreground}
      fontFamily={theme.fontMono} fontSize={valSize} fontWeight={700}>{(value * p).toFixed(decimals)}{suffix}</text>
    {delta && <text id={`${id}-delta`} x={0} y={h / 2 - 26} textAnchor="middle" fill={deltaColor}
      fontFamily={theme.fontMono} fontSize={24} fontWeight={600} opacity={clamp01((p - 0.5) * 2)}>{delta}</text>}
  </g>;
}

/** A code / command terminal window centred at (x, y) with typewriter progress and optional highlighted line. */
export function Terminal({id, x, y, w, h, title = 'terminal', lines, theme, progress = 1, fontSize = 24, highlightLine}: {
  id: string; x: number; y: number; w: number; h: number; title?: string; lines: string[]; theme: KitTheme;
  progress?: number; fontSize?: number; highlightLine?: number;
}) {
  const p = clamp01(progress);
  const topH = 44;
  const lineH = Math.round(fontSize * 1.55);
  // A monospace glyph is about 0.6em wide (a CJK one about 1em): longer lines end in … instead of leaving the window.
  const room = w - 52, fit = (line: string) => {
    let width = 0, out = '';
    for (const c of Array.from(line)) {
      const cw = (c.charCodeAt(0) > 0x2e80 ? 1 : 0.6) * fontSize;
      if (width + cw > room - fontSize * 0.6) return out + '…';
      width += cw; out += c;
    }
    return out;
  };
  const fitted = lines.map(fit);
  const totalChars = fitted.reduce((n, l) => n + Array.from(l).length, 0) || 1;
  let budget = Math.ceil(totalChars * p);
  const shown = fitted.map(line => {
    const chars = Array.from(line);
    const take = Math.max(0, Math.min(chars.length, budget));
    budget -= take;
    return chars.slice(0, take).join('');
  });
  return <g data-object id={id} opacity={Math.min(1, p * 4)} transform={`translate(${x} ${y + 18 * (1 - p)})`}>
    <rect data-obstacle id={`${id}-frame`} x={-w / 2} y={-h / 2} width={w} height={h} rx={theme.radius}
      fill={theme.surface} stroke={theme.rule} strokeWidth={theme.ruleWidth * 1.5}/>
    <rect x={-w / 2} y={-h / 2} width={w} height={topH} rx={theme.radius} fill={theme.surface2}/>
    <line x1={-w / 2} y1={-h / 2 + topH} x2={w / 2} y2={-h / 2 + topH} stroke={theme.rule} strokeWidth={theme.ruleWidth}/>
    {[0, 1, 2].map(i => <circle key={i} cx={-w / 2 + 24 + i * 22} cy={-h / 2 + topH / 2} r={6}
      fill={i === 0 ? theme.negative : i === 1 ? theme.secondary : theme.positive} opacity={0.85}/>)}
    <text id={`${id}-title`} x={0} y={-h / 2 + 29} textAnchor="middle" fill={theme.muted} fontFamily={theme.fontMono} fontSize={20}>{title}</text>
    {shown.map((line, i) => {
      const ly = -h / 2 + topH + 34 + i * lineH;
      if (ly > h / 2 - 14) return null;
      const isLit = highlightLine === i;
      return <g key={i}>
        {isLit && <rect x={-w / 2 + 12} y={ly - fontSize} width={w - 24} height={lineH} rx={6} fill={theme.accentSoft}/>}
        <text id={`${id}-line-${i}`} x={-w / 2 + 26} y={ly} textAnchor="start"
          fill={isLit ? theme.accent : theme.foreground} fontFamily={theme.fontMono} fontSize={fontSize}>{line}</text>
      </g>;
    })}
  </g>;
}

/** A horizontal or vertical timeline starting at (x, y) over `length` px; highlights `activeIndex`. */
export function Timeline({id, x, y, length, steps, activeIndex = -1, theme, progress = 1, vertical = false}: {
  id: string; x: number; y: number; length: number; steps: {label: string; note?: string}[]; activeIndex?: number;
  theme: KitTheme; progress?: number; vertical?: boolean;
}) {
  const p = clamp01(progress);
  const count = Math.max(1, steps.length);
  const gap = count > 1 ? length / (count - 1) : 0;
  const x2 = vertical ? x : x + length, y2 = vertical ? y + length : y;
  return <g data-object id={id} opacity={p > 0 ? 1 : 0}>
    <line data-route id={`${id}-track`} x1={x} y1={y} x2={x2} y2={y2} stroke={theme.rule} strokeWidth={theme.ruleWidth * 2} strokeLinecap="round"/>
    <line id={`${id}-fill`} x1={x} y1={y} x2={x + (x2 - x) * p} y2={y + (y2 - y) * p} stroke={theme.accent} strokeWidth={theme.ruleWidth * 2.5} strokeLinecap="round"/>
    {steps.map((step, i) => {
      const ratio = count > 1 ? i / (count - 1) : 0;
      const nodeP = clamp01((p - ratio * 0.7) / 0.3);
      const nx = vertical ? x : x + i * gap;
      const ny = vertical ? y + i * gap : y;
      const isActive = i === activeIndex;
      const isDone = activeIndex >= 0 && i < activeIndex;
      const dotColor = isActive ? theme.accent : isDone ? theme.positive : theme.muted;
      return <g key={i} id={`${id}-step-${i}`} opacity={nodeP}>
        {isActive && <circle cx={nx} cy={ny} r={22} fill={theme.accentSoft}/>}
        <circle data-obstacle cx={nx} cy={ny} r={12} fill={theme.surface} stroke={dotColor} strokeWidth={theme.ruleWidth * 2.2}/>
        <text id={`${id}-label-${i}`} x={vertical ? nx + 34 : nx} y={vertical ? ny + 8 : ny - 28}
          textAnchor={vertical ? 'start' : 'middle'} fill={isActive ? theme.accent : theme.foreground}
          fontFamily={theme.fontDisplay} fontSize={28} fontWeight={isActive ? 700 : 600}>{step.label}</text>
        {step.note && <text id={`${id}-note-${i}`} x={vertical ? nx + 34 : nx} y={vertical ? ny + 38 : ny + 44}
          textAnchor={vertical ? 'start' : 'middle'} fill={theme.muted} fontFamily={theme.fontBody} fontSize={22}>{step.note}</text>}
      </g>;
    })}
  </g>;
}

/** Side-by-side A vs B comparison panel centred at (x, y) with a central VS badge. */
export function CompareCard({id, x, y, w, h, leftTitle, leftItems, rightTitle, rightItems, leftTone = 'negative', rightTone = 'positive', theme, progress = 1}: {
  id: string; x: number; y: number; w: number; h: number; leftTitle: string; leftItems: string[]; rightTitle: string; rightItems: string[];
  leftTone?: 'negative' | 'muted'; rightTone?: 'positive' | 'accent'; theme: KitTheme; progress?: number;
}) {
  const p = clamp01(progress);
  const gap = 36;
  const colW = (w - gap) / 2;
  const leftColor = leftTone === 'negative' ? theme.negative : theme.muted;
  const rightColor = rightTone === 'positive' ? theme.positive : theme.accent;
  const drawCol = (side: 'left' | 'right', cx: number, title: string, items: string[], color: string, lit: boolean) => {
    const startY = -h / 2 + 104;
    const stepY = Math.min(64, Math.max(42, Math.floor((h - 130) / Math.max(1, items.length))));
    return <g key={side} id={`${id}-${side}`}>
      <rect data-obstacle id={`${id}-${side}-box`} x={cx - colW / 2} y={-h / 2} width={colW} height={h} rx={theme.radius}
        fill={lit ? theme.accentSoft : theme.surface} stroke={color} strokeWidth={theme.ruleWidth * (lit ? 2 : 1.3)}/>
      <text id={`${id}-${side}-title`} x={cx} y={-h / 2 + 52} textAnchor="middle" fill={color}
        fontFamily={theme.fontDisplay} fontSize={34} fontWeight={700}>{title}</text>
      <line x1={cx - colW / 2 + 28} y1={-h / 2 + 74} x2={cx + colW / 2 - 28} y2={-h / 2 + 74} stroke={theme.rule} strokeWidth={theme.ruleWidth}/>
      {items.map((item, i) => {
        const ip = clamp01((p - 0.15 - i * 0.15) / 0.3);
        return <text key={i} id={`${id}-${side}-item-${i}`} x={cx - colW / 2 + 34} y={startY + i * stepY} textAnchor="start"
          fill={theme.foreground} fontFamily={theme.fontBody} fontSize={26} opacity={ip}>• {item}</text>;
      })}
    </g>;
  };
  return <g data-object id={id} opacity={Math.min(1, p * 3)} transform={`translate(${x} ${y + 20 * (1 - p)})`}>
    {drawCol('left', -(colW + gap) / 2, leftTitle, leftItems, leftColor, false)}
    {drawCol('right', (colW + gap) / 2, rightTitle, rightItems, rightColor, true)}
    <circle cx={0} cy={0} r={30} fill={theme.background} stroke={theme.accent} strokeWidth={theme.ruleWidth * 2}/>
    <text x={0} y={10} textAnchor="middle" fill={theme.accent} fontFamily={theme.fontDisplay} fontSize={24} fontWeight={700}>VS</text>
  </g>;
}

/** A quote / takeaway callout card centred at (x, y) with an accent left bar and multi-line text. */
export function QuoteCard({id, x, y, w, h, lines, author, theme, progress = 1, fontSize = 36}: {
  id: string; x: number; y: number; w: number; h: number; lines: string[]; author?: string; theme: KitTheme; progress?: number; fontSize?: number;
}) {
  const p = clamp01(progress);
  const lineH = Math.round(fontSize * 1.45);
  const totalH = lines.length * lineH;
  const startY = -totalH / 2 + fontSize * 0.75 - (author ? 14 : 0);
  return <g data-object id={id} opacity={p} transform={`translate(${x} ${y + 20 * (1 - p)})`}>
    <rect data-obstacle id={`${id}-box`} x={-w / 2} y={-h / 2} width={w} height={h} rx={theme.radius}
      fill={theme.surface} stroke={theme.rule} strokeWidth={theme.ruleWidth * 1.5}/>
    <rect x={-w / 2} y={-h / 2 + 16} width={8} height={h - 32} rx={4} fill={theme.accent}/>
    {/* The opening quote is drawn, not typed: as text the audit would measure it as a label overlapping the first line. */}
    <g opacity={0.35} fill={theme.accent} transform={`translate(${-w / 2 + 30} ${-h / 2 + 22})`}>
      {[0, 22].map(dx => <path key={dx} d={`M ${dx} 18 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 Z M ${dx} 18 Q ${dx} 4 ${dx + 14} 0 L ${dx + 14} 5 Q ${dx + 6} 8 ${dx + 5} 16 Z`}/>)}
    </g>
    {lines.map((line, i) => <text key={i} id={`${id}-line-${i}`} x={-w / 2 + 54} y={startY + i * lineH} textAnchor="start"
      fill={theme.foreground} fontFamily={theme.fontDisplay} fontSize={fontSize} fontWeight={600}>{line}</text>)}
    {author && <text id={`${id}-author`} x={w / 2 - 36} y={h / 2 - 28} textAnchor="end" fill={theme.muted}
      fontFamily={theme.fontBody} fontSize={24}>— {author}</text>}
  </g>;
}

/** A dialogue / audience-comment speech bubble centred at (x, y) with a left or right pointer tail. */
export function SpeechBubble({id, x, y, w, h, speaker, lines, side = 'left', tone = 'surface', theme, progress = 1}: {
  id: string; x: number; y: number; w: number; h: number; speaker?: string; lines: string[];
  side?: 'left' | 'right'; tone?: 'surface' | 'accent' | 'negative'; theme: KitTheme; progress?: number;
}) {
  const p = clamp01(progress);
  const fill = tone === 'accent' ? theme.accentSoft : theme.surface;
  const stroke = tone === 'negative' ? theme.negative : tone === 'accent' ? theme.accent : theme.rule;
  const tailX = side === 'left' ? -w / 2 + 44 : w / 2 - 44;
  const tail = `M ${tailX - 14} ${h / 2 - 1} L ${tailX + (side === 'left' ? -18 : 18)} ${h / 2 + 22} L ${tailX + 16} ${h / 2 - 1} Z`;
  const fontSize = 28;
  const lineH = 40;
  const startY = speaker ? -h / 2 + 78 : -((lines.length - 1) * lineH) / 2 + 10;
  return <g data-object id={id} opacity={p} transform={`translate(${x} ${y + 16 * (1 - p)})`}>
    <rect data-obstacle id={`${id}-box`} x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.max(14, theme.radius)}
      fill={fill} stroke={stroke} strokeWidth={theme.ruleWidth * 1.6}/>
    <path d={tail} fill={fill} stroke={stroke} strokeWidth={theme.ruleWidth * 1.4} strokeLinejoin="round"/>
    {speaker && <text id={`${id}-speaker`} x={-w / 2 + 28} y={-h / 2 + 38} textAnchor="start" fill={stroke === theme.rule ? theme.accent : stroke}
      fontFamily={theme.fontDisplay} fontSize={22} fontWeight={600}>{speaker}</text>}
    {lines.map((line, i) => <text key={i} id={`${id}-line-${i}`} x={-w / 2 + 28} y={startY + i * lineH} textAnchor="start"
      fill={theme.foreground} fontFamily={theme.fontBody} fontSize={fontSize}>{line}</text>)}
  </g>;
}
