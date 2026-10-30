# Custom Scene Lab Implementation Plan

> For agentic workers: execute this plan task by task with test-first checks and review checkpoints.

**Goal:** Add a local, opt-in path for agent-authored Remotion scenes and evaluate its visual quality with a same-narration wallet comparison, without changing the production DSL or paid workflow.

**Architecture:** A brief separates narration/facts from visual freedom. The generator emits a versioned artifact containing TSX plus its visual rationale. An external coding agent can supply the same artifact. Source checks and an exact source-hash approval gate precede local rendering; snapshots and a review checklist are produced for the next revision. This is a trusted local experiment, NOT a sandbox for hostile code.

**Tech Stack:** Existing TypeScript, React, Remotion bundler/renderer, Node test runner and FFmpeg. Existing audio/timing APIs remain untouched.

## Scope and acceptance
- Keep existing templates, schemas, TTS, Studio and server unchanged.
- No paid requests without explicit `--confirm-cost`; no keys copied from another checkout.
- Shared brief and frame timing for template and custom comparison.
- Custom scene uses frame-driven SVG changes, not a new hardcoded JSON template.
- Generated code is not imported into the web app/API. Local execution requires reviewed SHA-256; static checks are guardrails, not a security sandbox.
- Compile, render representative frames, export short MP4, provide revision prompt from review feedback.
- Production sandbox workers, automatic visual model judging, account integration and whole-course custom scene routing are later phases, not claimed complete here.
- The separate Studio imports only the checked-in, human-reviewed example, never arbitrary generated artifacts. All arbitrary artifact execution/preview requires exact hash approval; changing source invalidates approval.
- No API key is required for acceptance: pack source from an external coding agent, check, approve and render locally. Paid generation is optional.
- Compare accuracy, ease of understanding and visual expression using identical narration, duration and beats; a custom scene is not automatically considered better. The first comparison is silent unless a shared existing audio is supplied.

## Tasks
### 1. Artifact and brief contract
- [x] Add `packages/custom-scenes/src/contract.ts` and Node tests.
- [x] Validate dimensions, duration, nonempty narration, permitted source imports and required component export.
- [x] Test malformed output, narration preservation, stable hashes and dangerous imports before implementation; non-JSON responses fail closed.

### 2. Creation and review tools
- [x] Add `scripts/custom-scene.ts`: prepare prompt, optional paid generate, validate/check, review-feedback prompt.
- [x] Require explicit cost consent; use fixed DeepSeek HTTPS endpoint, environment key and timeout; publish artifacts without overwriting.
- [x] Add `scripts/render-custom-scene.ts`: exact hash approval, independent temporary working folder (not a sandbox), existing Remotion renderer, MP4 and five snapshots plus report.
- [x] Test no-cost default, missing approval, path/overwrite checks and artifact mutation detection.

### 3. Same-script visual proof
- [x] Add reviewed wallet brief, TSX and template fixture plus frame-driven tests.
- [x] Add separate Remotion Studio entry with TemplateWallet and CustomWallet compositions, no production routing changes.
- [x] Render both versions and inspect early/mid/final frames for text collisions, clipping and meaningful object state changes.

### 4. Verification and handoff
- [x] Run focused tests, scoped typecheck and existing regression suite; whole-repo typecheck retains one baseline error documented below.
- [x] Start the independent Studio and deliver local URL and comparison artifacts.
- [x] Document commands, workflow, external agent integration, exact limitations and next production phase.

## Verification (2026-10-23)

- `PATH="$PWD/.venv/bin:$PATH" npm test`: 564 passed, zero failed (including 22 new custom-scene tests).
- `PATH="$PWD/.venv/bin:$PATH" npm run test:workflow`: 482 tests, OK, 184 database-dependent tests skipped; no PostgreSQL was configured.
- `npm run custom:typecheck`: passed.
- `npm run typecheck`: baseline error in `packages/video-components/tests/beat-focus.test.ts:11`: test fixture uses audio_start_frame=0 while Scene requires literal 6. This pre-existing file was not changed.
- Both 18-second 1920x1080 / 30fps examples were rendered. Custom artifact passed pack, hash approval, semantic TypeScript check, five-frame rendering and MP4 export. Initial, middle and final frames inspected, no blank stage or clipping found; object movement is also covered by deterministic state tests.
- Browser QA: TemplateWallet and CustomWallet selectable in Studio, no page errors. Studio listens on 127.0.0.1:3100.
- No real model API requests, no new API charges; provider success, malformed brief, missing cost confirmation and failure-retention use controlled test responses.
- Existing dependency audit reports a critical Next.js 16.4.0 advisory; dependency upgrades were not mixed into this change. Next.js workbench was not started.
