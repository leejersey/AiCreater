# Scene contract

## File and props

Write exactly one file, `scene/Scene.tsx`, that ends with `export default function Scene(props)`.

```tsx
import React from 'react';
import {interpolate, Easing, spring} from 'remotion';

type Theme = {background:string; foreground:string; muted:string; accent:string; secondary:string};
type SceneProps = {frame:number; fps:number; width:number; height:number; theme:Theme};

export default function Scene({frame, fps, width, height, theme}: SceneProps) {
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>…</svg>;
}
```

- Canvas is 1920×1080 at 30 fps. The background is already filled with `theme.background`.
- Render a single root `<svg>`. HTML outside it is not measured by the geometry audit.
- Everything must be a pure function of `frame`. Same frame, same picture.

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
