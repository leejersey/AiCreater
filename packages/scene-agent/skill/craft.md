# Craft rules

Practical rules learned from rendered runs. They keep the picture readable; they are not a style.

## Transitions between cues

- Never crossfade text over text in the same place. Fade the outgoing element fully out before the incoming one fades in, or give old and new content separate regions of the canvas.
- A short gap (6–12 frames) with nothing new on screen reads better than two overlapping half-visible layers.
- An element that stays across cues should keep its position; move it on purpose, not by being re-created somewhere else.

## Layout

- Cards and panels must not partly cover each other. Either place one fully inside the other, or keep a gap; the audit reports `panel-overlap` with the shapes' ids.
- Keep at least 24 px between separate text labels. Stacked captions with no gap read as one blurred line.
- Use the whole canvas above the caption area (y up to 980). A scene that fills only the top half looks unfinished. The audit reports `empty-area` with the empty band's coordinates when more than 40% of the height or 35% of the width stays empty during a cue; draw the main object large (at least half the width) rather than a small panel in the middle.
- One idea per cue should dominate the frame; secondary labels stay smaller and muted.

## Color

- One idea per cue gets `theme.accent`; everything else is foreground, muted or faint. Two accents compete.
- Right and wrong are `theme.positive` and `theme.negative`, so a cross reads as wrong in every theme.

## Showing, not listing

- Prefer an object that changes (a card that is crossed out, a lock that closes, a document that travels into a box) over a new text card for every sentence.
- Text on screen should be short labels and key terms, not the narration repeated.

## Facts

- Every number, date, statistic, product name or source on screen must come from the brief. The narration is about a general problem; an invented "2021 data" or "40%" turns a teaching scene into misinformation.
- If an example needs specifics the brief does not give, keep it generic: "过时的回答", "最新资料", not a made-up release date.

## Visibility

- Every cue must show something while it is narrated. The audit measures the rendered pixels and reports `blank-frame` when a cue's middle shows nothing: usually an opacity that never rises, a fade window that does not overlap the cue, or content positioned off the canvas.
