# Skill topics

- `scene-contract` — what Scene.tsx must export, allowed imports and APIs, canvas and caption-safe area, and the data attributes the geometry audit reads. Read this before writing code.
- `craft` — transitions between cues, spacing, and showing change instead of listing text. Read this before the first draft.
- `patterns` — how to show a problem, a mechanism, a comparison, a list of items, and a summary. Read this before the first draft and pick a pattern for each cue.
- `examples` — worked code for drawing a problem, a limit, an uncertainty and a fix as objects that change, instead of icon cards. Read this before the first draft.
- `visual-review` — only if you have `view_frames`: what to look for in the rendered frames, and when to look.

Workflow: `get_timing` → `read_skill scene-contract`, `read_skill craft`, `read_skill patterns` and `read_skill examples` → `write_file` (first draft) → `render_stills` (typechecks, renders and audits) → fix with `edit_file` → `render_stills` → … → `finish`.
