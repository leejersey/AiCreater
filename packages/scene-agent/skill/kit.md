# Scene kit

Tested parts you can import into Scene.tsx, so you spend turns on the idea instead of on arrowheads and audit markers:

```tsx
import {Box, Arrow, Doc, Cross, Check, Strike, Bar, Counter, Spotlight, Camera, ease, win, at, listOpacity} from './kit';
```

The full source sits beside your scene as `scene/kit.tsx` (`read_file scene/kit.tsx`); it cannot be edited. You do not need
to read it: the tables below list every part and prop. Use the kit where it fits and plain
SVG for everything else; a scene made only of boxes and arrows is still a diagram, so give each cue its own action.

## How the parts work

- Every part is a pure function of its props: pass `theme` and a `progress` from 0 to 1. You decide **when** it moves
  from `timing.cues` (with `win` / `ease` / `at`); the part decides **how** it looks at that progress.
- Colors and fonts come from `theme`; parts already carry `data-object`, `data-obstacle` and `data-route`, so the audit
  still checks your labels against them. Give every part a unique `id`: findings name it.
- Positions are in the 1920×1080 canvas; boxes, documents, marks and counters are centred on `(x, y)`.

## Timing helpers

| Helper | Returns |
| --- | --- |
| `ease(frame, a, b, curve?)` | 0→1 from frame a to b; default curve settle (`Easing.out(Easing.cubic)`) |
| `win(frame, a, dur, cueEnd, curve?)` | 0→1 from a over dur frames, always done 2 frames before `cueEnd` |
| `at(cue, f)` | the frame at fraction f of a cue (0 start, 1 end): phases that stretch with the sentence |
| `listOpacity(frame, cues, k, dim?)` | opacity of an item spoken in cue k: hidden before, 1 while spoken, `dim` (0.4) after |

## Parts

| Part | Props (besides `id`, `theme`, `progress`) | Use for |
| --- | --- | --- |
| `Box` | `x, y, w, h, title?, subtitle?, lit?, titleSize?` (40) | a node, stage, store, a concept; `lit` gives the accent outline and soft fill; rises and fades in with progress |
| `Arrow` | `from, to` (`{x,y}`), `bend?` (px, curves it), `dashed?`, `color?` | a connection or flow that draws itself, arrowhead at the end |
| `Doc` | `x, y, scale?, highlight?` | a document or page |
| `Cross` / `Check` | `x, y, size?` (56) | rejected / accepted, drawn stroke by stroke |
| `Strike` | `x1, x2, y` | a line struck through a label or an item |
| `Bar` | `x` (centre), `base` (baseline y), `w, h, label?, lit?` | a quantity growing from its baseline |
| `Counter` | `x, y, value, size?` (88), `suffix?`, `anchor?` | a number counting up; only numbers the brief gives |
| `Spotlight` | `x, y, w, h` (no id) | a soft accent area behind the focus; draw it before the focused part |
| `Camera` | `k` (scale, ≤ 1.6), `cx, cy`, children | push in on a detail: wrap the world in it |

## Example

Four cues: documents arrive, an index is built from them, the old way is crossed out, the new way is accepted.

```tsx
import React from 'react';
import {Easing} from 'remotion';
import {Box, Arrow, Doc, Cross, Check, win, at, listOpacity} from './kit';

export default function Scene({frame, theme, timing}: SceneProps) {
  const s = timing.cues;
  const docs = win(frame, s[0].start, 18, s[0].end);
  const flow = win(frame, at(s[1], 0.1), 24, s[1].end);
  const toOld = win(frame, s[2].start, 18, s[2].end);
  const wrong = win(frame, at(s[2], 0.4), 12, s[2].end, Easing.out(Easing.exp));
  const toNew = win(frame, s[3].start, 18, s[3].end);
  const right = win(frame, at(s[3], 0.4), 14, s[3].end, Easing.out(Easing.exp));
  return <svg width={1920} height={1080} viewBox="0 0 1920 1080">
    {[0, 1, 2].map(i => <Doc key={i} id={`doc-${i}`} x={220 + i * 120} y={500} scale={1.3} theme={theme} progress={docs}/>)}
    <Arrow id="to-index" from={{x: 540, y: 500}} to={{x: 770, y: 500}} theme={theme} progress={flow}/>
    <Box id="index" x={960} y={500} w={360} h={200} title="索引" titleSize={48} theme={theme} progress={flow}
      lit={frame >= s[1].start && frame < s[2].start}/>
    <Arrow id="to-old" from={{x: 1150, y: 440}} to={{x: 1290, y: 340}} theme={theme} progress={toOld} dashed/>
    <Box id="old-way" x={1500} y={320} w={400} h={160} title="逐篇比对" titleSize={44} theme={theme} progress={listOpacity(frame, s, 2)}/>
    <Cross id="old-way-x" x={1760} y={320} theme={theme} progress={wrong}/>
    <Arrow id="to-new" from={{x: 1150, y: 560}} to={{x: 1290, y: 660}} theme={theme} progress={toNew}/>
    <Box id="new-way" x={1500} y={680} w={400} h={160} title="按向量查" titleSize={44} theme={theme} progress={listOpacity(frame, s, 3)} lit={right > 0}/>
    <Check id="new-way-ok" x={1760} y={680} theme={theme} progress={right}/>
  </svg>;
}
```

(`SceneProps` here stands for the props type in `scene-contract`.)
