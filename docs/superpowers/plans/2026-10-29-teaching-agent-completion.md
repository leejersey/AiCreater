# Teaching Agent Completion

Status: implementation in progress; not released for user acceptance.

| Task | State | Evidence / Remaining Work |
| --- | --- | --- |
| 1 Failure baseline | Offline implementation verified | Six original evidence hashes preserved, sanitized layout/JSON reproductions and an explicitly observed missing-executor case; not historical full-scene replay. |
| 2 Real provider adapter | Offline implementation verified | Strict single-call DeepSeek semantic-plan adapter and configuration tests; real supplier acceptance still needs approved budget. |
| 3 Background planning | Implementation verified offline | HTTP admission only, durable unique jobs, transactional ownership/budget guards, deadline fencing, cancellation and cached render admission recovery. |
| 4 Unified repair | Implemented; acceptance open | Free recovery history is replayed before one root-budget semantic revision; mock-provider plus actual-container integration verified, natural visual-fault recovery still required. |
| 5 Recovery and cleanup | Implemented conservatively; acceptance open | Durable owned host execution and nonce-bound positive orphan cleanup verified in real Docker; ambiguous absence/unknown ownership remains fenced. |
| 6 Audio and subtitles | In progress | Post-draft free binding → owned audiovisual rendering → video/SRT API verified internally; audio-first production admission, workbench controls and two-order acceptance remain open. |
| 7 Chapter/course output | Partial | Frozen audiovisual chapter preview/API and prior-playable preservation exist; accepted chapters and full-course frozen export remain. |
| 8 Full service/preflight | Partial | Independent worker/beat TTL leases plus foundation/image admission checks; full managed startup and failure acceptance remain. |
| 9 Workbench routing | Partial | Async planning state and readiness gate wired in the experiment; main default/advanced-source separation not released. |
| 10 Internal acceptance | Pending | Historical, container, restart and 12 unseen-topic tests. |

No paid model/TTS calls during implementation. The 12-topic batch requires a separate confirmed monetary cap, at most 24 model and 12 TTS requests. Extra probes count against its approved cap. Never retry the current failed source task or edit generated video code/data/coordinates as an automatic success.

Final release requires at least 11/12 unseen cases within budget and visual quality, all safety/media gates, and no false-success cases. Existing fixtures and manually repaired samples do not satisfy this gate.

## Current Implementation Checkpoint

- A committed root slot precedes provider I/O. Planning ownership is checked in that same reservation transaction and immediately before I/O; cancellation retains the slot without invoking the provider. No transport retries or source fallback.
- Public /run only enqueues: HTTP 202 for queued/running, HTTP 200 with truthful status for existing terminal tasks. Compilation automatically admits the frozen render; a crash between stages recovers without a model call.
- The Celery workflow lane consumes plans only with AICREATER_TEACHING_PLAN_WORKER=1; rendering remains separately opt-in. Liveness runs outside the solo task loop, with database-clock expiry. Paid admission does not use Celery ping.
- Explicit production experiment factory: services.api.app:create_teaching_app. It requires configured provider and worker/dependency readiness; it has not been started against the current course. Default services.api.app:app is unchanged.
- The worklist is not complete. Do not invite user acceptance or change the default while Tasks 4-10 gates remain open.

## Recovery Checkpoint

- See `docs/teaching-render-revision.md` and `docs/teaching-execution-ownership.md` for
  boundaries, implementation and evidence. No generated lesson source/data was manually
  changed to count as automatic success.
- Provider responses in the render-revision integration are mocked. Its audit failure
  is synthetic even though compilation and the second Docker render are real.
- New recovery code has not received a completed independent review; tests do not replace
  that review or the remaining acceptance gates. Production audio binding, course export and managed
  full-service startup still remain before user testing.

## Audio Foundation Checkpoint

- See `docs/teaching-audio-binding.md`. No provider callback or source generation is
  involved in timing rebinding. Six structure fixtures recompile the same semantics.
- Existing measured-mode queue/API rejection remains in place until persistence,
  isolated media rendering and output verification are implemented and accepted.
- Free binding jobs now persist under the original root without modifying its input,
  model budget or old videos. Duplicate admission/claim, cancellation, interruption,
  stale content and corrupted evidence are covered by disposable-database tests.
- The explicit audiovisual container fixture now checks Chinese captions across all
  frames, decoded source-audio offset and SRT identity. It uses a local tone and fixed
  diagram, not real TTS/model output or a blind topic. No production success is registered.
