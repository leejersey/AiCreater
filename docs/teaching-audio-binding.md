# Teaching Audio Binding

Status: timing/media verification, durable background binding, automatic post-draft
audiovisual dispatch and experimental video/subtitle API publication implemented.
Workbench controls and production audio-first plan admission remain disabled.
This document does not claim Task 6 complete.

## Contracts

`measured_timeline` consumes an existing server-owned teaching snapshot and a ready
chapter with audio and measured captions. It preserves original cue IDs and exact text,
uses measured caption boundaries, and binds audio identity/checksum, captions, offset
and chapter revision into a deterministic timeline hash. It handles both an original
draft timeline and an already measured timeline without calling a provider.

If an existing cue boundary is inside a measured caption, the current adapter cannot
prove its precise timestamp and returns unsupported. It does not estimate word times,
change cue IDs, merge semantic beats or call a model. A future word-alignment adapter
may resolve this using existing verified word timestamps; no such fallback is enabled.
Changed facts, materials, title, narration or visual goal cannot silently reuse a plan.

`retimeTeachingScene` validates the original frozen artifact, preserves semantic plan
content and cue identity, updates only the host input binding, then runs the existing
deterministic compiler on the new timeline. Insufficient action time, invalid ownership,
routes or layout still fail. It does not stretch serialized animation or edit source.
The host operation `retime` has a strict four-field request and never requests code.

`bind_teaching_audio` combines that new frozen artifact, original provenance and measured
timeline into `teaching-audio-binding:1`. It remains `metadata-only`, `not-run` and
`accepted=false`. This is not a receipt or playable-video claim.

`verify_bound_audio` separately checks project ownership/current asset identity, timeline
hash, audio bytes, exactly one audio stream, finite measured duration and metadata
agreement. ffprobe receives a bounded-time invocation and no provider credentials.
Its proof also is not a video receipt. Container staging must revalidate media bytes.

## Durable Background Binding

`TeachingMedia` persists a separate, free binding job under the existing root. The
original root snapshot, model-call ledger and cached plan remain immutable. The job
identity includes the source artifact hash and measured timeline hash, so concurrent
duplicates share one row and only one claimant can work. New audio can create another
binding without overwriting the old artifact or video. This does not allocate model slots.

The existing opt-in workflow worker consumes free media bindings before constructing a
paid provider. API admission is not yet exposed. Expired running leases are interrupted,
not reclaimed; missing workflow/scheduler heartbeats expire abandoned queued work, while
healthy busy workers retain it. Cancellation revokes publication, including a late result.
Input and source cache hashes are checked before work and again before durable completion.
Completed result hashes are checked when read, not just when written.

The persisted result is explicitly `audio-bound`, `video_ready=false`, `accepted=false`.
It includes both the recompiled package and media verification proof, not a render receipt.
Corrupt assets, changed narration, unknown plan outcomes and fake acceptance claims fail
without another provider call. The normal deletion guard covers queued/running bindings;
explicit cancellation removes this model-free work from that guard.

## Verification

- Python tests cover both timing orders, stable cue identity, caption subdivision,
  unsupported inner-caption boundaries, changed content, invalid offsets, overrun,
  duplicate IDs and corrupt assets.
- A real local PCM WAV is checked with ffprobe; forged duration, video-stream response
  and changed timeline are rejected. No speech service is used.
- A real offline Node host test rebinds an existing plan and verifies deterministic
  artifact/media provenance with no provider callback.
- Six Node structure cases recompile changed cue timing and reject semantic edits,
  bad source hashes and insufficient motion duration.

Checkpoint logs: 24 Python timing/draft/local-timing tests passed
(`/tmp/teaching-timing-python.log`); final media assertions separately reran all 9 new
timing tests (`/tmp/teaching-timing-media-final.log`). Sixteen Node artifact/revision/
retiming tests passed (`/tmp/teaching-timing-node.log`), 9 PostgreSQL pipeline tests
passed (`/tmp/teaching-timing-pipeline.log`), and custom-scene type checking passed
(`/tmp/teaching-timing-types.log`). No real-model or container audiovisual acceptance
is claimed by these tests.

Durable-binding checkpoint: 36 disposable-PostgreSQL media/root-budget/planning tests
passed (`/tmp/teaching-media-regression.log`), 16 API tests passed with one explicitly
skipped real-container case (`/tmp/teaching-media-api-regression.log`), and 14 timing/
worker-wiring unit tests passed (`/tmp/teaching-media-unit-final.log`). The media suite
uses the actual offline Node compiler and local ffprobe with generated PCM fixtures;
it does not render an audiovisual MP4 or use a speech/model provider. Hash corruption
and false-acceptance regressions were observed failing before the checks were added.
The new durable-binding code has not yet received independent review.

The explicit isolated renderer now stages frozen audio, burns/audits captions, writes a
bound SRT and rechecks audio offsets. See `docs/teaching-audiovisual-container.md` for the
fixed-fixture evidence and its limitations; this does not complete the durable queue path.

Remaining: expose the frozen audiovisual artifact through workbench controls, connect
production audio-first planning, and validate both production orders. Do not enable measured admission
or count this checkpoint as full audiovisual acceptance.
