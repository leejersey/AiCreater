# Skill topics

- `scene-contract` — what Scene.tsx must export, allowed imports and APIs, canvas and caption-safe area, and the data attributes the geometry audit reads. Read this before writing code.
- `craft` — transitions between cues, spacing, and showing change instead of listing text. Read this before the first draft.

Workflow: `get_timing` → `read_skill scene-contract` and `read_skill craft` → `write_file` (first draft) → `render_stills` (typechecks, renders and audits) → fix with `edit_file` → `render_stills` → … → `finish`.
