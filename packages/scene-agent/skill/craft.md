# Craft rules

Practical rules learned from rendered runs. They keep the picture readable; they are not a style.

## Transitions between cues

- Never crossfade text over text in the same place. Fade the outgoing element fully out before the incoming one fades in, or give old and new content separate regions of the canvas.
- A short gap (6–12 frames) with nothing new on screen reads better than two overlapping half-visible layers.
- An element that stays across cues should keep its position; move it on purpose, not by being re-created somewhere else.

## Layout

- Keep at least 24 px between separate text labels. Stacked captions with no gap read as one blurred line.
- Use the whole canvas above the caption area (y up to 980). A scene that fills only the top half looks unfinished.
- One idea per cue should dominate the frame; secondary labels stay smaller and muted.

## Showing, not listing

- Prefer an object that changes (a card that is crossed out, a lock that closes, a document that travels into a box) over a new text card for every sentence.
- Text on screen should be short labels and key terms, not the narration repeated.

## Facts

- Every number, date, statistic, product name or source on screen must come from the brief. The narration is about a general problem; an invented "2021 data" or "40%" turns a teaching scene into misinformation.
- If an example needs specifics the brief does not give, keep it generic: "过时的回答", "最新资料", not a made-up release date.

## Visibility

- Every cue must show something while it is narrated. The audit measures the rendered pixels and reports `blank-frame` when a cue's middle shows nothing: usually an opacity that never rises, a fade window that does not overlap the cue, or content positioned off the canvas.
