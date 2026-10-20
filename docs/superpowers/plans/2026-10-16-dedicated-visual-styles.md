# Dedicated Visual Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, inline task-by-task. User approved scope; no delegation authorization or initial HEAD, so no worktree/baseline commit or independent-review claim.

**Goal:** Connect whiteboard/minimal to code/classic+C, state/array+object+stack, timeline and chart/bar+line+proportion+matrix without changing teaching geometry/timing or legacy output.
**Architecture:** Reuse VisualStyleContext. One small shared panel/entrance style helper only where repeated; keep data/coordinate/activeStep functions in their current components. Validate nine supported scene types only after render paths connect.
**Tech Stack:** Existing React/TS/Remotion, node:test, static SSR, local renderer/ffprobe. No packages, DSL/backend/migration, native services, queues or providers.
**Outcome:** Complete within approved local scope:302Node, typecheck, isolated build;9types/15scenes×3actual1080frame exports, audio/SRT equal;50legacySSR and10before/afterPNG exact. Representative visual review caught completed clip hiding current marker; fixed via RED/GREEN then fresh full verification. [Receipt](../../../output/workbench/dedicated-styles-qa/receipt.json). Native/chooser/freeze/real-voice acceptance not included.

## 1. Tests and before-change baseline

Files: create packages/video-components/tests/dedicated-fixture.ts and dedicated-styles.test.ts; update style-tokens.test.ts unsupported expectation; QA under output/workbench/dedicated-styles-qa.
- [x] Build strictly parsed fixtures for10dedicated variants plus5existing generic scene types, synthetic silence/timing only.
- [x] Before code changes capture legacy SSR hashes and representative rendered PNGs with same source/fixture/font environment.
- [x] Add focused RED tests: all dedicated variants respond to non-color tokens, preserve geometry/current state, seek boundaries and no future values. `node_modules/.bin/tsx --test packages/video-components/tests/dedicated-styles.test.ts` expected missing visual differences/support.

## 2. Minimal component wiring

Files: modify src/CodeLesson.tsx, CodeStateLesson.tsx, StateLesson.tsx, TimelineLesson.tsx, DataChart.tsx; add src/dedicated-style.ts only for shared panel/step/SVG reveal; modify src/theme.ts. Preserve old helper signatures and CSS under legacy; use capped safe padding, not generic grid gaps or numeric interpolation.
- [x] Code/classic+C and state: actual shape/fill/border/spacing/entry tokens, readonly source/state values and distinct pointer/TOP/current marks.
- [x] Timeline: unchanged axis/lanes/durations/short markers and execute/wait; safe opacity/clip reveal for new styles, no new-style translation of time bars.
- [x] Charts: unchanged coordinates/zero/proportion/matrix scale+text; safe SVG reveal and actual frame/marker styling. No transparent-only future labels.
- [x] Expand explicit supported list to9types, still fail unknown style/type. Focused tests GREEN, legacy SSR hashes exact and selected PNG baseline compare.

## 3. Verification and delivery

Files: docs spec/plan, README.md, docs/getting-started.md, docs/teaching-templates.md, docs/TODO.md; artifacts proof, hashes, cleanup and receipt.
- [x] Full `npm test` and `npm run typecheck` pass, cue start/partial/end and random backseek covered; six-item/empty states, zero data, short events and four chart forms plus existing boundary regressions. Not every extreme combination physically rendered; Python/PG not rerun.
- [x] Same mixed project actual CLI legacy/whiteboard/minimal MP4/SRT; compare decoded audio, captions, frame counts and selected before/after legacy stills. Visual review representative frames for clipping and semantic marks.
- [x] Isolated Next webpack build in owned source copy without.env; do not touch original.next or launch native preview.
- [x] Fresh source hash/check proof, cleanup own build/browser/temp files, docs/receipt with explicit silent-fixture and no-native/no-paid boundaries. New workbench selector/frozen style still pending.
