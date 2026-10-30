# Programmatic Picture Repair

Goal: failed picture checks become machine-readable repair work, not user-authored coordinate instructions or repeated renders of unchanged source.

- [x] Diagnose the actual intent-recognition sample:four previews share source e176562d65047575c4ca5013072399b5f681868a2a853678e11ef00b57946af1,39 repeated geometry findings and zero measured movers.
- [x] Build bounded, deduplicated repair feedback from source-bound geometry; retain original failure and coverage gaps.
- [x] Reuse current terminal previews instead of enqueueing identical checks repeatedly.
- [x] Add explicit report-driven one-model repair endpoint, without user-written repair text.
- [x] Allow a preview to preauthorize at most one automatic repair; default API allowance is zero.
- [x] Atomically queue the repair after failed geometry only when that preview's stored allowance is one.
- [x] Do not execute repaired source or inherit its old source approval. No repair loop or automatic additional budget.
- [x] Replace the failed-check primary action with programmatic repair, and expose the optional one-repair fee in the preview confirmation.

Checks:45 combined disposable PostgreSQL/store/route/feedback tests,40 focused backend tests,51 frontend tests, web typecheck. No paid requests dispatched during development; the actual failed sample is not yet repaired or accepted. New source still needs exact-hash approval and a fresh successful check. The optional main-UI repair setting is shown and explicitly confirmed before being sent; advanced inspection defaults to no model repair. A consumed allowance is idempotent even after the repair finishes: repeated original-preview approvals cannot buy another repair. Failed consumed repairs stop; starting a fresh generation is a separate confirmed paid action.

## Approved Live Repair

- One explicitly approved request was dispatched for intent-recognition chapter 1, job `97537599-e896-4ed0-80b8-1e4f7a75aa1c`; no retries or TTS calls.
- API generation state is succeeded/current, but this means a source artifact was produced, not that picture quality passed.
- Source hash: `a7f4dbd147e9c94c9aac003dd0fa9063c45b441d6550e83511223c46a829eeb7`.
- Static automated review is partial-coverage. Manual review blocks execution: a world-coordinate route is nested under its moving transform, and opacity is used instead of actual exit clipping.
- Evidence: `output/visual-workbench/97537599-e896-4ed0-80b8-1e4f7a75aa1c/manual-static-review.json` and `static-review.json`.
- No new scene execution, screenshots, geometry pass, MP4, production replacement or acceptance. The one-request repair allowance is exhausted.

## Offline Follow-Up

- Added AST detection for an audit route nested under its own transformed mover, including hidden paths without data-route. Shared stable-parent routes remain valid.
- Source-mode generation and repair now save static-review.json after type checking and stop before result publication when explicit motion/occlusion findings require revision. Partial coverage is still recorded as partial, never promoted to visual acceptance.
- A later explicitly budgeted source repair recomputes and carries the previous source's static findings into its existing request; this adds no model request or automatic retry.
- Rechecking the retained real repair artifact produces revise-required with one route-mismatch finding, zero model requests and no scene execution. Original reports and successful artifact-generation history are preserved.
- This does not prove or automatically repair the opacity-versus-clipping defect. That remains a manual static finding until a corrected candidate and approved rendered checks exist.
- Verification: custom-scenes regression suite 358 passed, 1 skipped; custom:typecheck passed. The focused failed-generation/repair test also confirms that diagnostics reach the next existing request, no result is published for the rejected source, and no automatic retry occurs. No paid model/TTS request was made in this offline follow-up.

## Offline Sample Candidate

- A separate manually repaired source is in output/visual-agent/intent-outlet-offline-v1; this is not automatic-model success or a production replacement.
- Stable world-space tag-run, a fixed real outlet clip, and a fully concealed initial tag replace the rejected nested route and opacity reveal. Frozen design and cue times are unchanged.
- Packed artifact hash: 8c780ae075a3d7363ed5fe2eeb53fe6ae1bead880e6f7af36f721066b08266c8. Source guardrails and candidate typecheck passed; six focused regression tests passed. Static review has zero explicit findings, partial coverage remains.
- No new model/TTS calls or candidate execution. Pending exact-hash approval for screenshot/geometry diagnostics; no MP4 or acceptance authorized.
