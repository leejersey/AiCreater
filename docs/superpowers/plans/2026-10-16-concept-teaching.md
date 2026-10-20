# Concept Teaching Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, task-by-task. User approved the concept spec with “实现”. No delegation authorization; main-session review only. Workspace has no HEAD, so no worktree, baseline commit or Git commit.

**Goal:** Add source-bound generic concept scenes with real definition/support hierarchy, all existing local styles and safe existing editing/retiming.
**Architecture:** Extend the shared Schema and generated TS types; reuse Python visual validation for drafts and final DSL, TS validation for renderer. Reuse SceneGraphics/StyleTokens, add one concept layout branch and role labels. Existing worker, store transaction, audio and quote restoration remain the execution path. Increment outline/candidate protocol fingerprints so new planner semantics do not reuse old jobs.
**Tech Stack:** Existing JSON Schema, TypeScript/React/Remotion, Python/jsonschema/unittest, node:test, disposable PostgreSQL. No packages, migrations or new services.
**Outcome:** Code/isolation QA complete:276Node +197offlinePython +135real disposablePG =608distinct passes; every offline DB skip rerun by exact ID. Typecheck/private webpack build and9silent CLI exports passed,32source/test hashes unchanged across renders. Main-session review only; original services/data/queues/suppliers untouched. See [receipt](../../../output/workbench/concept-qa/receipt.json).

## 1. Contract and planning — RED then GREEN
- [x] Add `packages/video-schema/tests/concept-fixture.ts` and `concept.test.ts`, `services/tests/test_concept.py`: positive minimal/all roles/Unicode/example-before-definition, invalid role cardinality/context/content/cue order/time order, no decoration/topic/state fields; quote restoration, unmodified source and strict timing. Run focused tests and save expected failures before implementation.
- [x] Add enum/conditional `concept_role` in `packages/video-schema/schema.json`; regenerate `packages/video-schema/src/types.ts` with `npm run schema:types`. Add matching concept cardinality/excerpt checks to `packages/video-schema/src/validate.ts` and `packages/video-schema/validate.py`; include concept in existing spoken-order checks. Re-run focused tests.
- [x] Update `services/workflow/providers.py` domain/choice/concept instructions; quote-only and source_parts remain. Tests inspect actual shared request schema and restored drafts, not a separate fake planner.

## 2. Actual rendering and form — RED then GREEN
- [x] Add layout/markup/all-style/max-length/seek tests in `packages/video-components/tests/concept.test.ts`, and form/cue preservation/error tests in `apps/web/tests/concept.test.ts`; confirm expected failures.
- [x] Add definition-anchor/support layout in `packages/video-components/src/layout.ts` without changing legacy branches. Add role labels in `packages/video-components/src/SceneGraphics.tsx`, explicit label height in `packages/video-components/src/Video.tsx` overflow checks; allow concept in `packages/video-components/src/theme.ts`. Preserve actual cue visibility and use existing wipe/slide tokens.
- [x] `apps/web/lib/editor.ts`: validate readonly-role values and excerpt/order in cue form, preserve role on edits; `apps/web/app/SceneEditor.tsx` shows readonly role. No new role CRUD or advanced-JSON recovery format.

## 3. Store and task compatibility — RED then GREEN
- [x] Add disposable-DB tests to `services/tests/test_projects.py`: import concept with owned fixture audio, preserve roles/media/frozen version, valid cue change needs_timing, reject readonly-role changes and invalid excerpts with rollback. Existing form/snapshot/public API paths are unchanged.
- [x] `services/projects/store.py`: extend existing role/identity guard to concept_role; retain integer cue/no-op safeguards and transaction validation.
- [x] Add jobs dedup tests for older quoted v2 and numeric v1 fingerprints; increment new outline/candidate protocol to3 in `services/projects/jobs.py`. Old persisted jobs remain readable/executable through existing worker numeric-v1/quoted-v2 compatibility, no automatic retry/rewrite. Check public pricing estimator uses same shared storyboard_request; run its existing tests.

## 4. Complete verification, evidence and docs
- [x] Run `npm test`, `npm run typecheck`, `python3 -m unittest discover -s services/tests -v`; rerun every DB-skipped test on disposable PG using existing runner split into groups within its180s cap. Exact distinct test IDs, skips and groups recorded; no original DB or queue.
- [x] Produce clearly marked silent/manual-time history/physics/biology fixtures, validate all, render same-input new styles locally with existing CLI, inspect stills; use generated local silence, not an unrelated old voice. Verify frames/SRT/audio/source hashes and normal cleanup. These are visual/contract checks, not listening or factual acceptance.
- [x] Isolated Next build if form wiring changed; do not touch native.next or restart original services. Review diff/callers and docs; update spec status, README/getting-started/DSL and TODO with explicit native/paid limits; write `output/workbench/concept-qa/receipt.json` plus source hashes and cleanup evidence.

**Review checkpoint:** First ensure all caller/schema surfaces are covered. Do not add new concept routing APIs, converters, infrastructure or another executor. No real supplier calls, original tasks, consumer/beat startup, paid20cases, nums replacement, human0.5s claim or independent-review claim. Source excerpts/roles still need human meaning review; old deployments cannot consume new concept types.
