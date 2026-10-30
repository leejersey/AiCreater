# Skill topics

- `scene-contract` — what Scene.tsx must export, allowed imports and APIs, canvas and caption-safe area, and the data attributes the geometry audit reads. Read this before writing code.

Workflow: `get_timing` → `read_skill scene-contract` → `write_file` → `typecheck` → `render_stills` → `audit_scene` (and `view_frames` if available) → fix with `edit_file` → repeat.
