# Scene contract

## File and props

Write exactly one file, `scene/Scene.tsx`, that ends with `export default function Scene(props)`.

```tsx
import React from 'react';
import {interpolate, Easing, spring} from 'remotion';

type Theme = {
  background:string; surface:string; surface2:string;            // stage, cards, cards inside cards
  foreground:string; muted:string; faint:string; rule:string;     // text levels, lines
  accent:string; accentSoft:string; secondary:string;             // highlight, its translucent fill, second highlight
  positive:string; negative:string;                               // right / wrong, pass / fail
  fontDisplay:string; fontBody:string; fontMono:string;           // CSS font-family values
  radius:number; ruleWidth:number; ruleDash:string;               // card corners, divider width, strokeDasharray ("none" = solid)
  dark:boolean;
};
type SceneProps = {frame:number; fps:number; width:number; height:number; theme:Theme};

export default function Scene({frame, fps, width, height, theme}: SceneProps) {
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>…</svg>;
}
```

- Canvas is 1920×1080 at 30 fps. The background is already filled with `theme.background`.
- Render a single root `<svg>`. HTML outside it is not measured by the geometry audit.
- Everything must be a pure function of `frame`. Same frame, same picture.

## Theme

Each course has one theme, and the same scene must render in any of them. Every color and font comes from `theme`:

| Use | Token |
| --- | --- |
| headings, key labels | `fill={theme.foreground}` `fontFamily={theme.fontDisplay}` |
| body labels | `theme.foreground`, smaller and secondary: `theme.muted`, hints: `theme.faint`; `fontFamily={theme.fontBody}` |
| code, commands, numbers in a table | `fontFamily={theme.fontMono}` |
| cards and panels | `fill={theme.surface}` (nested: `theme.surface2`), `stroke={theme.rule}`, `rx={theme.radius}` |
| dividers, connectors, arrows | `stroke={theme.rule}` or `theme.muted`, `strokeWidth={theme.ruleWidth}`, `strokeDasharray={theme.ruleDash}` |
| the one thing to look at | `theme.accent`; a highlighted area behind it: `theme.accentSoft` |
| a second highlight, sparingly | `theme.secondary` |
| right / wrong, kept / dropped, pass / fail | `theme.positive` / `theme.negative` — never accent or secondary for "wrong" |

- Do not write colors (`#ef5350`, `rgb(…)`, `white`) or font names (`'Noto Sans SC'`, `sans-serif`) into the scene. The check reports them as `literal-style`.
- Text without `fontFamily` is already in `theme.fontBody`.
- Shades come from opacity, not new colors: `fill={theme.foreground} fillOpacity={0.06}`.
- Do not branch the layout on `theme.dark`. A layout that only works on dark backgrounds is a broken layout.
- The background (and any texture the theme has) is drawn for you. Do not paint a full-canvas background rectangle.

## Allowed and banned

- Imports: only `react` and `remotion`. No other modules, no dynamic `import()`.
- Not allowed: `useEffect`, `useLayoutEffect`, `Date`, `Math.random`/`random`, timers, `fetch`, `window`, `document`, `globalThis`, `process`, `new …`, `eval`/`Function`.
- No media or embedding: `<img>`, `<image>`, `<video>`, `<audio>`, `<iframe>`, `<foreignObject>`, `<style>`, `<script>`, `staticFile`.
- No external URLs or `data:` URIs in strings. `url(#gradientId)` references to your own `<defs>` are fine.
- No event handlers (`onClick`, …).

`typecheck` enforces these and reports the rule that failed.

## Caption-safe area

Narration captions occupy the bottom of the frame. Keep every text label inside x 0..1920, y 0..980.

## Geometry audit attributes

The audit measures every visible `<text>` and these markers (hidden elements, opacity ≤ 0.05, are skipped):

| Attribute | Put it on | The audit checks |
| --- | --- | --- |
| `data-object` | the `<g>` that groups one visual object | labels inside the same object may overlap that object's own obstacles |
| `data-obstacle` | solid shapes that labels must not cover | label over obstacle |
| `data-route` + `id` | a `<path>` that something travels along | labels crossing the route |
| `data-follow-path="routeId"` | the `<g>` of a mover, whose local (0,0) should sit on the route | mover drifting off its route |

Give important elements stable `id`s; findings name elements by id, so unnamed ones are hard to locate.
