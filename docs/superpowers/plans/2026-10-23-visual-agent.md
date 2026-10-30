# Visual Agent Implementation Plan

**Goal:** Turn an immutable narration brief and measured sentence cues into a reviewable visual design, then generate bespoke Remotion source from that design.

**Architecture:** Keep the existing template DSL unchanged. Extend the reviewed-local-source lane with a versioned design document, frame-bound narration cues, a two-stage model protocol, and source-bound visual review. The first acceptance cases are context budget and the agent loop. No automatic execution of model source and no production multi-user execution.

**Tech Stack:** Existing TypeScript, React, Remotion and DeepSeek adapter; no new dependencies.

- [x] Add failing tests for design validation, object references, measured cue timing, frozen brief, and source-bound review.
- [x] Add visual design contracts and design-to-code prompts, including the approved wallet reference and explicit mechanism choreography.
- [x] Add CLI design/code/review commands; retain each paid stage, reject collisions before requests, never automatically retry.
- [x] Exercise two topics through real generation. User explicitly approved four total paid requests: design + code for each topic, no paid retries. Preserve failures without claiming visual success.
- [x] Render approved local candidates to stills, review actual images, write source-bound observations and prepare a revision prompt. Any further paid revision requires new permission. Until re-rendered corrections pass human review, mark the result pending or revise, never accepted.
- [x] Run focused tests, custom typecheck, and regression tests; record evidence.

The user approved the design and implementation in this chat. Changes remain uncommitted for user review.
This iteration excludes whole-video routing, production queue integration and automatic batch execution. Those require both examples to pass the user's visual review and a separate implementation scope.

## Evidence

- Four paid requests completed, no retries. Context source initially failed compilation on a duplicate variable; retained and locally repaired.
- Local visual corrections: tray/paper layering and bounds; loop terminal bounds, return badge path, repeated task motion. These are explicitly local coding-agent changes, not unmodified model outputs.
- Revised still renders completed: context 10 frames; loop 25 frames. Both visual review records are `revise`, not `pass`. Next revision prompts are ready in `output/visual-agent/`.
- `PATH="$PWD/.venv/bin:$PATH" npm test`: 578 passed, 0 failed. Log: `/tmp/aicreater-visual-agent-final-tests.log`.
- `npm run custom:typecheck`: passed. This is the scoped check, not the known-failing pre-existing whole-repository typecheck.
- Browser: GeneratedContext and GeneratedLoop open without page errors; loop playback advanced to frame 45 and paused successfully.
- Independent review closed design/source binding and screenshot hash issues. No additional necessary issue found for this local trusted-source lane.
- Still awaiting user visual acceptance; no whole-video/production integration started.
