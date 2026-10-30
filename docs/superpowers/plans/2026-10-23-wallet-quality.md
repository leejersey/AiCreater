# Wallet Quality Baseline

**Goal:** Restore the user's approved wallet visual quality, then encode the observations in scene-generation and review rules before attempting generalisation.

**Scope:** Existing Remotion local trusted-source lane. No new paid calls, no full-video integration, no TTS changes.

- [x] Compare the generated source with the approved CustomWallet source.
- [x] Add failing tests for visible first-frame structure, real pocket occlusion, paper retention/removal, measured event order, and pass-evidence coverage.
- [x] Reuse approved geometry explicitly and retime its motion against unchanged 773-frame narration. Synchronise the design document with the local redesign.
- [x] Write recognition, layering, spatial cause/effect and final-state checks into both design/code prompts.
- [x] Add per-cue quarter/midpoint snapshots and require opening/middle/final evidence for a pass.
- [x] Render 19 stills, inspect actual images and create a source/design/image-bound local review. Final PNG SHA256 exactly matches the approved reference PNG.
- [x] Run regression tests and scoped typecheck: final 587 tests passed; custom typecheck passed. Added global middle-frame coverage for long tail pauses and paid-response failure protection after independent review. Log: `/tmp/aicreater-visual-quality-latest-tests.log`.
- [ ] User visual acceptance of this revised baseline.
- [x] Run independent new-topic validation under the separately approved two-request budget. Design succeeded; code response was incomplete JSON and no executable artifact was created. Validation did NOT pass. No paid retry was performed.
- [x] Fix provider observability exposed by the failure: retain content before parsing, distinguish length termination and invalid JSON, use a bounded 16384-token code budget. Original failure had no retained finish reason, so its cause is not asserted as certain.
- [ ] Successfully validate new-topic output under a future separately approved request; no claim that manual reference reuse or unit tests prove autonomous visual quality.

Artifacts: `output/visual-agent/context-quality-v2.json`, `context-quality-v2-stills/`, `context-quality-v2-review.json`. Previous candidates and reviews remain untouched.

The user explicitly authorised one code-only retry. It completed with finishReason=stop, compiled, and rendered 50 stills. The unmodified result is available as GeneratedLoopV2. Visual review remains revise: label overlap and measured payload/path deviations (31.5px on the ring, 94.4px on the return pipe). No further request or manual source repair was made. Final regression: 589 tests passed; scoped typecheck passed. Log: `/tmp/aicreater-loop-v2-final-tests.log`.
