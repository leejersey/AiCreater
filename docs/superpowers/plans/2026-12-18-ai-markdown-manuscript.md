# AI Markdown Manuscript Implementation Plan

**Goal:** AI jointly generates narration and visual materials; editable Markdown is parsed before saving so only narration reaches TTS/subtitles.

**Architecture:** Keep the existing plain-text API default. Add explicit `manuscript_format=markdown` with a bounded JSON section contract (stable ID, title, narration, materials, visual intent), rendered as a fixed Markdown dialect. Save the parsed document in project config, exclude it from video DSL, snapshot it into generation/regeneration jobs and render-version profiles. Material-backed jobs use the full quoted-source storyboard protocol, since compact source-excerpt plans cannot represent external material. Existing cue validation remains unchanged. Frontend new-course and legacy Workbench creation both retain the selected format in local drafts. No rich text editor or terminal renderer.

### Task 1: Contract and AI output
- [x] Add failing tests for JSON→Markdown→sections round-trip, strict malformed/fence validation and narration isolation.
- [x] Implement bounded parser/formatter and JSON-mode manuscript generation, preserving plain-text behavior.

### Task 2: Persistence and generation
- [x] Add API format validation, parse before persistence, retain original document as config metadata.
- [x] Exclude metadata from DSL/timing config; preserve it in version profile.
- [x] Snapshot scoped materials into generation and regeneration jobs; use protocol :7 (single full quoted-source call), including worker and cost estimation.
- [x] Test that model prompts contain materials but cue source and narration remain spoken text only.

### Task 3: UI and verification
- [x] Add format selector and AI-generated Markdown default for new drafts; old drafts remain plain-text.
- [x] Preserve format across both course creation entry points, local draft recovery, and show saved Markdown in original-manuscript panel.
- [x] Run backend tests, frontend tests and typecheck. Review diff for metadata leaks and narration contamination.

Verification: backend unittest discovery with disposable local PostgreSQL: 448 passed; npm test: 507 passed; npm run typecheck passed. Paid providers, actual voice/video rendering and browser interaction were not exercised. Commands/code remain inert.

Limits: 20 sections, 24,000 Markdown characters, 4,000 total narration code points. Markdown grammar uses `## [id] title`, followed by `### 口播`, `### 画面素材`, `### 画面意图`. Commands/code are inert; unverified outputs must be marked illustrative. Materials are input guidance, not instructions or execution evidence. Existing scene narration edits do not silently rebind changed source material; regeneration only receives materials whose original narration overlaps the target verbatim.
