# Visual review (models that can see frames)

The audit measures geometry; it cannot tell whether the picture teaches. Look at the frames with `view_frames` and judge them yourself. Check every viewed frame against this list and fix what fails with `edit_file`.

## What to look for

- **Empty canvas.** More than about a third of the area above the caption band (y < 980) empty in the middle of a cue. Move or enlarge the main object, or give the cue a second visual element.
- **Text cards instead of a mechanism.** A cue that is only a row or grid of icon + title cards. Turn at least the cue's key idea into an object that changes: something crossed out, moving, filling up, connecting, locking.
- **Missing visuals for named items.** Every item the narration names in this cue (a step, a component, a problem) has its own graphic, not only a label. A lone label with no shape next to it reads as a leftover.
- **Leftovers and stray marks.** Labels or shapes from an earlier cue still visible when they no longer mean anything; lines or underlines that cross a card border; empty dashed placeholders.
- **Hierarchy.** One thing dominates each cue; secondary text is smaller and muted. Several equally loud blocks mean the viewer does not know where to look.
- **The ending.** The last cue shows a clear summary or end card, centred, not a small text in a corner.

## How to work

- After the first clean `render_stills`, call `view_frames` (the defaults show an even sample; ask for specific frames to check one cue).
- Name the problems you see in one short sentence each, then fix the worst one or two per turn.
- Before `finish`, look at the frames of the final version. `finish` is rejected if the current version has not been viewed.
