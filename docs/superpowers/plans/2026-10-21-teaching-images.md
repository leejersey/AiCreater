# Teaching Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate AI-selected teaching objects into narration-driven tutorials without generating background slides or implicit paid requests.

**Architecture:** Extend existing private immutable media, scene bindings and visual actions. Separate image plans/candidates from renderable assets. Reuse queue, timestamps and version snapshots; implement in independently verified batches.

**Tech Stack:** JSON Schema, TypeScript/React/Remotion, Python/FastAPI/PostgreSQL/Celery, private object store, existing HTTP client.

Approved spec: `docs/superpowers/specs/2026-10-21-teaching-image-orchestration-design.md`.

## Batch 1 — image asset and narrated rendering contract (verified offline)

Files: `packages/video-schema/schema.json`, generated `packages/video-schema/src/types.ts`, `packages/video-schema/src/validate.ts`, `packages/video-schema/validate.py`; new schema image fixtures/tests; `apps/renderer/src/media.ts`, renderer tests; `services/projects/storage.py`, `services/projects/store.py`, API media response; `packages/video-components/src/{Video,SceneGraphics,layout}.tsx/ts`, new image component/layout and tests; web preview/editor types and scene asset filtering.

- [x] Write cross-language schema tests accepting PNG/JPEG image assets and bindings; reject mixed asset kinds, missing/duplicate targets, too many images, unsupported templates, wrong extension/size/pixel dimensions.
- [x] Run `node --import tsx --test packages/video-schema/tests/images.test.ts`; confirm missing-contract failures, then implement asset union and strict bindings and regenerate types (`npm run schema:types`). Rerun schema tests/typecheck.
- [x] Write renderer media tests using generated local PNG/JPEG; verify exact dimensions, checksum, type, static format, decode, file/pixel limits and reject animation/corruption. Implement with existing ffprobe/ffmpeg; no new imaging dependency.
- [x] Write image layout and frame/SSR tests proving each image is attached to a distinct element entrance/highlight rather than a fixed background; text and image boxes remain outside captions and mutually disjoint. Start with card_sequence/comparison_panel, default motifs; keep code integration for batch 2 rather than silently replacing variable/output panels.
- [x] Implement shared fixed image composition layout and Remotion Img loading, keep labels/actions separate, preserve ordinary no-image rendering. Browser and renderer share URL resolution; remote image source is never accepted from DSL.
- [x] Carry supported bindings and assets through edits, private asset route, immutable storage, versioning, previews and scene-render filtering; explicitly guard unsupported generation/regeneration/timing transformations until batch 2 preserves them. Add regression tests for filters, MIME and cross-account asset access.
- [x] Run targeted tests, `npm test`, `npm run typecheck`, backend unittest; inspect offline rendered sample if available. No paid requests or live-course writes.

Batch 1 verification: frontend/schema/renderer tests 528 passed; disposable-PostgreSQL backend discovery 453 passed; typecheck and git diff --check passed. Rendered a local synthetic two-object fixture at `output/workbench/teaching-images-qa/video.mp4` (132 frames, 1920×1080, H.264/AAC); inspected `contact.png` for staged entry/highlight. This is a silent offline fixture, not GPT-generated imagery or a teaching-quality acceptance sample. No live-course writes or paid requests; services were not restarted.

Current limits: 0–2 PNG/JPEG bindings, default card_sequence/comparison_panel, at most four teaching elements. Reuse existing element IDs/entrance/highlight. Narration changes, retiming, voice/regeneration and candidate acceptance on image scenes are explicitly rejected until batch 2, rather than silently deleting images. The UI does not yet offer AI image generation or candidate selection.

## Batch 2 — director plans and complete template/workflow preservation

- [x] Extend strict bounded director output with required image/no-image decisions for new protocols (old protocols remain compatible), brief purpose and 0–2 requirements; add fake-provider tests first. No extra planning model call.
- [x] Keep requirements metadata out of DSL/TTS, validate literal narration quotes and eligible targets, stable IDs and restricted layout slots. New :8/:9 jobs use one full quoted request; frozen compact/ordinary/material protocols remain supported, estimates/usage/hash/worker match. Scoped regeneration/candidate acceptance carries decisions as metadata.
- [ ] Add code image composition without hiding code, variable snapshots or output; validate supported limits. Wire images into all generation, timing, regeneration and candidate acceptance paths; stale anchor changes require review, never silent deletion/rebinding.
- [ ] Run no-image/Unicode/scoped-material/regeneration regressions and local two-object teaching sample.

Batch 2 planning checkpoint: fake-provider red→green plus native PostgreSQL tests verify 0–2 decisions, strict quotes/targets/layouts, scoped candidate publication, no TTS/DSL contamination, immutable version profile and needs_review on content changes. Workbench adds a read-only plan panel. Frontend full tests 531 passed; disposable-PostgreSQL full backend 460 passed; typecheck passed. No provider calls, live-course writes, service restart or browser interaction in this checkpoint. Code/image composition and existing-image transformation guards remain open; batch 2 is not complete. No real-model evidence of image-selection quality yet.

## Batch 3 — explicit paid image job

- [ ] Verify current official GPT Image 2 API, account access, parameters, response encoding and pricing; implement one-call provider against mock transport, never real network by default.
- [ ] Extend job SQL/API/worker/estimation/usage and frontend parsers together. Freeze per-requirement authorization and snapshot; exclusive attempt marker before submission, no automatic retry after ambiguous outcomes, cancellation/stale revision never auto-attaches.
- [ ] Validate/reencode returned PNG/JPEG within bounded memory/pixels, preserve immutable provenance and accepted reuse, scrub image API secrets from render/validator children.
- [ ] Test double-submit, replay, timeout, worker crash, cancellation, explicit paid retry and stale completion with fake provider/DB.

## Batch 4 — workbench and end-to-end acceptance

- [ ] Show image rationale, selected requirement count/prompt/price-or-unknown, explicit charge confirmation, task progress and candidate accept/reject/regenerate.
- [ ] Accept a candidate without changing narration/audio; immutable old-version image bindings remain stable. Switching narration invalidates anchor review rather than silently dropping assets.
- [ ] Run browser integration, full regression and no-cost render; update README and TODO with exact supported limits.
- [ ] Request separate explicit budget for one real image small-sample comparison; prior speech authorization does not cover images.

No background/parallel agents or paid image calls are authorized by this implementation request. Each batch is reported honestly; partial support is not described as the completed AI-image feature.
