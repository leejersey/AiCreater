# Motion design

How to make the picture move like a well-made explainer, not a slide deck. Adapted for this scene contract (one SVG,
Remotion `interpolate` / `Easing` / `spring`, cue frames from `timing.cues`, colors from `theme`). Read this before the
first draft, together with `craft` and `patterns`.

## The one rule: the picture acts out what is said

Each cue gets one visible action that matches its sentence: something appears, changes state, moves, is crossed out,
fills up, connects. A cue whose only change is new text is a slide. A scene whose elements all arrive in the first cue
and then sit still is a poster.

## Reveal step by step

- When the narration names items one by one ("首先…其次…最后…", "一是…二是…"), show **one item per cue**. Never bring
  all items in at once with a stagger.
- The item being spoken is lit (full opacity, `theme.accent` outline or fill); earlier items stay as context, dimmed to
  opacity 0.35–0.45 — not removed. The last cue may relight everything for the summary.
- Each cue puts at most 1–3 things in focus: one hero object, a number, or one comparison. Supporting labels stay small
  and `theme.muted`.

```tsx
const s = timing.cues;
const lit = (i:number) => frame >= s[i].start && (i === s.length - 1 || frame < s[i + 1].start);
const seen = (i:number) => frame >= s[i].start;
// opacity of item i: hidden before its cue, full while spoken, dimmed afterwards
const itemOpacity = (i:number) => !seen(i) ? 0 : lit(i) ? 1 : 0.4;
```

Fade between those states over ~10 frames rather than switching; see the `ease` helper below.

## Easing: smooth beats bouncy

Motion has a tone of voice. Use about three characters in a scene, picked by meaning, not at random.

| Character | Remotion | Use for |
| --- | --- | --- |
| settle (default) | `Easing.out(Easing.cubic)` | entrances, things arriving and stopping |
| snap | `Easing.out(Easing.exp)` | a key result landing, a strike-through, a highlight |
| calm | `Easing.inOut(Easing.sin)` | slow drift, camera moves, crossfades |
| exit | `Easing.in(Easing.cubic)` | things leaving (exits are ~0.7× the length of entrances) |
| mechanical | linear (no easing) | progress bars that fill at a constant rate, a scanning line |
| physical pop | `spring({frame: frame - start, fps, config: {damping: 200}})` | an object appearing with weight; keep damping high (≥ 120): no visible bounce |

Overshoot and bounce (`Easing.back`, low spring damping) are for an explicitly playful moment only, at most once.

```tsx
const ease = (from:number, to:number, curve = Easing.out(Easing.cubic)) =>
  interpolate(frame, [from, to], [0, 1], {easing: curve, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
```

**Durations** (30 fps): entrances 12–20 frames, emphasis 8–12, exits 8–12, camera moves 25–45. Follow the theme's mood
from the brief: calm or editorial themes take the long end, crisp or hacker themes the short end. Never longer than the
cue it belongs to: `Math.min(s[i].start + 18, s[i].end - 4)`.

**Stagger**: when a group does enter together (parts of one object, not items the narration lists), offset them by
2–4 frames and keep the whole group within 15 frames. Vary entrances across the scene: not every element should fade
up from below.

## Drawing and building

- **A line draws itself** (connectors, routes, outlines): give the path `pathLength={1}` and animate the dash, no
  measuring needed.

  ```tsx
  const p = ease(s[2].start, s[2].start + 24);
  <path id="route-a" data-route d="M 300 500 C 600 380 900 380 1200 500" pathLength={1}
    strokeDasharray={1} strokeDashoffset={1 - p} stroke={theme.accent} strokeWidth={theme.ruleWidth * 2} fill="none"/>
  ```

- **A bar grows** from its baseline: scale it, don't move it. `transform={`translate(${x} ${base}) scale(1 ${p}) translate(${-x} ${-base})`}`.
- **A number counts** to a value from the brief: `Math.round(interpolate(frame, [a, b], [0, value], {…}))`; render it
  large in `theme.fontMono` so digits don't jitter.
- **A thing travels** along a route: compute its point from the same path parameter you draw with, and mark the mover's
  `<g>` with `data-follow-path`.
- **A state changes** (wrong → crossed out, empty → full, locked → open): keep the object, change one property. That
  reads as cause and effect; replacing it with a new card does not.

## Focus and camera

- **Dim to focus**: lower the opacity of everything that is not being spoken about (0.3–0.4) instead of removing it,
  and lay a `theme.accentSoft` rectangle behind the focus.
- **Camera move**: wrap the scene's world in one `<g>` and animate `translate(…) scale(…)` on it to push in on a detail
  or pan to the next station. Keep the scale ≤ 1.6, move over 25–45 frames with the calm curve, and keep labels inside
  the caption-safe area at every scale.

  ```tsx
  const z = ease(s[3].start, s[3].start + 36, Easing.inOut(Easing.sin));
  const k = 1 + 0.4 * z, cx = 1300, cy = 420;            // push in on the detail at (1300, 420)
  <g transform={`translate(${cx * (1 - k)} ${cy * (1 - k)}) scale(${k})`}>{world}</g>
  ```

## Size and space

- Hero text 64–96 px, labels 28–40 px, nothing under 24 px. Viewers watch from a distance.
- The main object takes at least half the width; the scene uses the whole area above the captions (y ≤ 980) with
  80 px or more of margin at the edges. Empty is fine between objects, not as a half-blank frame.
- Short labels and key terms only; the narration carries the sentences.

## Avoid the "AI look"

None of these, even if they seem decorative:

- gradient backgrounds, glows that breathe on every element, constant pulsing or blinking;
- emoji or clip-art as icons — draw a simple shape, or use a labelled box;
- cards with a coloured left border, pill buttons, rounded cards for everything;
- the same entrance (fade-up) for every element in every cue;
- invented numbers, logos, user counts or dates; if the brief gives no figure, show the relation without one.

## Checklist before finish

- Every cue has its own visible action, timed from `timing.cues`.
- Listed items appear one per cue; earlier ones are dimmed, not gone.
- One focus per cue; accent only on it.
- At least two different entrance or emphasis techniques in the scene (draw, grow, count, cross out, move, push in).
- Durations fit their cues and the theme's mood; nothing bounces unless it is meant to be playful.
