# Source-owned storyboards Implementation Plan

> Inline execution; no authorized subagent, no Git repository. User approved the fragment-reference approach (m03023). No paid provider call in this stage.

**Goal:** prevent the model from rewriting narration while preserving the existing public DSL and strict checks.
**Architecture:** deterministically split the original into lossless sentence/line fragments. Provider-only schema replaces narration with source_part_ids. References must cover every part exactly once in source order. Program reconstructs narration then invokes unchanged canonical validators. Regeneration receives one part containing the original scene.
**Tech Stack:** Python/jsonschema/httpx, existing seven-template DSL.

- [x] Add failing tests for lossless splitting (spaces, CRLF, emoji, final newline), references reordered/omitted/duplicated/unknown/boolean, invented narration, original-scene regeneration and old canonical draft compatibility.
- [x] services/workflow/storyboard.py: source_parts(), provider-only schema, restore_storyboard(). IDs 1..N integers; no fuzzy matching, no edits to source; semantic errors fixed source_reference code. Use at most200 parts by joining adjacent tiny chunks when necessary; never fixed number of scenes. Long single paragraphs get sentence boundaries, unbroken text remains one part.
- [x] services/workflow/providers.py: structured source_parts request; prompt explains concatenated fragment cue offsets; original_scene retained as reference, only one source part for regeneration. Only restore after complete JSON response; keep all budgets/auth/error safeguards.
- [x] services/projects/jobs.py: add one fixed source_reference diagnostic, no direct paid retry.
- [x] Update HTTP mock responses to fragment wire format and request assertions; do not alter valid final DSL/fixtures/worker voice paths. Run provider and all offline tests, temporary PostgreSQL, compile checks; unchanged web/schema rendering does not need a new template version.
- [x] Review exact compatibility and document limits. Guard idle owned service upgrade, preserve archives; no new generation/voice jobs.

A fragment can contain teaching markup or code as inert narration text. Splitting is not fact validation; missing or incorrect cue/diagram/code still rejects. Model generation remains subject to output limits. Existing drafts/candidates/voice inputs use the unchanged canonical schema; exact legacy canonical responses remain supported under unchanged strict source/schema/visual validation; no normalization or fuzzy repair. New reference-shaped responses reject generated narration. No automatic retry, source normalization or swallowed extra fields.

## Verification

9 new source-owned tests (lossless CRLF/emoji/trailing whitespace, bounded200 parts, whole manuscript grouping, omissions/reordering/duplicates/unknown/bool/float references, extra narration/invalid cue, exact legacy fallback, real HTTP mock adapter and worker JSON boundary, one-part regeneration). Initial red import missing; minimal implementation then updated 3 request assertions in services/tests/test_generation.py. Worker test initially double-opened real MockTransport client; corrected test ownership, not production.

Fresh discover152:88 offline PASS,64 PG skipped and separately real temporary PostgreSQL64/64 PASS; compile PASS. No Node/Next rerun because frontend/DSL/render unchanged. source_parts()/restore_storyboard() use copies and the final canonical validator; wire fields never persisted or returned by worker/API. New source_reference code is fixed, sanitized and non-retryable.

After checking all projects idle and owned PIDs, API/solo workflow+render workers/beat safely upgraded, health ready. output/workbench/services-before-source-owned-storyboards.json and services.json track ownership. No new generation/voice job, no deleted files/volumes or changed template version.

Limits: no ASCII-period splitting (avoid code/decimal corruption); unpunctuated manuscript remains one fragment, add explicit manuscript breaks to permit finer scenes. More than200 tiny parts are joined losslessly. Model cues/diagram/code may still be invalid or factually wrong, and8192 output tokens may still be insufficient. Real provider success and complete2–3minute lesson acceptance remain unverified; a future paid attempt needs explicit authorization.
