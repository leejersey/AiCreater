# Skill topics

- `scene-contract` — what Scene.tsx must export, allowed imports and APIs, canvas and caption-safe area, and the data attributes the geometry audit reads. Read this before writing code.
- `motion` — motion design: reveal items one per cue, focus and dimming, easing by meaning, drawing / growing / counting / camera moves, size and space, and what makes a scene look machine-made. Read this before the first draft.
- `kit` — ready parts you can import from `./kit`: boxes, self-drawing arrows, documents, cross / check / strike marks, growing bars, counters, spotlight, camera, and timing helpers. They carry the audit attributes and theme tokens. Read this before the first draft.
- `craft` — transitions between cues, spacing, and showing change instead of listing text. Read this before the first draft.
- `patterns` — how to show a problem, a mechanism, a comparison, a list of items, and a summary. Read this before the first draft and pick a pattern for each cue.
- `examples` — worked code from scenes that passed: a problem, a limit, an uncertainty and a fix as objects that change; fitting moments inside a cue; one thing becoming another; a search walking a route; near and far without numbers; a list built one item per cue. Read this before the first draft.
- `visual-review` — only if you have `view_frames`: what to look for in the rendered frames, and when to look.

Workflow: `get_timing` and one `read_skill` with `topics: ["scene-contract", "motion", "kit", "craft", "patterns", "examples"]` in the same reply → `write_file` (first draft) → `render_stills` (typechecks, renders and audits) → fix with `edit_file` → `render_stills` → … → `finish`.
