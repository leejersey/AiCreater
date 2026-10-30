# Reviewed Scene Assembly

## Confirmed Baseline

The user explicitly accepted ReviewedLoop in this chat after inspecting the local preview. CustomWallet remains the approved wallet visual reference. Acceptance applies to those visual samples, not to every generated scene, autonomous generation reliability, or a production security boundary.

## Recommended First Scope

Build a local, reviewed-source assembly lane before modifying the production worker or template schema. First assemble two existing measured-duration candidates (ReviewedLoop and GeneratedContext) with existing narration, captions, and chapter pauses. GeneratedContext remains a candidate: approval of CustomWallet does not automatically approve GeneratedContext. The two-chapter result is a technical integration preview, not a complete five-minute lesson.

No paid requests, new TTS, automatic retries, queue changes, or remote code execution. Keep existing template rendering unchanged.

## Alternatives

1. Extend the existing template DSL with arbitrary source. Reuses the renderer but mixes executable code with data-only projects and expands the trust boundary. Not recommended for this step.
2. Create a separate local composition from explicitly reviewed artifacts. Reuses Remotion, fonts, narration assets and caption rendering, while keeping code approval explicit. Recommended.
3. Add generation and rendering directly to the production queue. Closest to final automation, but premature without worker isolation and end-to-end timing evidence.

## Data Flow

Existing audio manifest -> ordered chapter selection -> frozen chapter-local cues -> explicit artifact/design/review bindings -> local assembly manifest -> Remotion sequences -> preview, sampled stills, MP4 and SRT.

The assembly manifest records chapter order, artifact and design hashes, review references, audio assets/checksums, measured cues, local durations and derived global start frames. It references artifacts; it does not duplicate source or invent new visual content. A technical preview must clearly report any pending visual acceptance and cannot be labelled final accepted output.

The host owns audio and captions. Scene source receives its local frame and cannot play media. Caption times and scene boundaries derive from the same measured cues, with half-open frame intervals and explicit pause retention. Audio clips use measured segment offsets, not evenly divided estimates. Removing an unrelated chapter rebases retained chapter starts, not their internal timings. No speed changes or silent duration clamping.

## Checks And Failure Behavior

- Validate all artifacts, frozen designs and source approval before bundling. Recheck hashes at execution; arbitrary source remains trusted local code, not sandboxed code.
- Reject duplicate chapter IDs, invalid or overlapping cues, narration mismatch, missing media, unsupported dimensions/fps, incompatible durations and changed files.
- Preserve existing outputs; publish into a new directory only after successful verification. Retain diagnostics on failure without producing a misleading success record.
- Keep geometry reports separate from human aesthetic acceptance. Chapter review does not establish caption-layer or transition correctness; inspect assembled frames around chapter boundaries and caption changes.
- Sample first/middle/last and boundary frames; verify audio stream presence, expected duration and SRT timing. Listen to the exported chapter junction, not just inspect metadata.

## Acceptance

1. Two chapters preview in the declared order with the approved loop source unchanged.
2. Narration and captions follow measured chapter-local cues, including pauses, without cumulative drift.
3. MP4 has a valid audio stream; SRT times match the global timeline.
4. Changed source, changed media, unapproved source, mismatched cues and output collisions fail before rendering.
5. Existing template tests stay green. Browser and rendered integration evidence is recorded separately from model quality.

After this local gate, extend chapter coverage and only then design production routing, budgeted model jobs and isolated execution workers. Do not claim whole-video production integration is complete after the two-chapter preview.

Status: approved by the user with “实施”; implemented as the local two-chapter lane. Implementation plan and evidence are recorded in 2026-10-23-reviewed-scene-assembly.md. User listening/whole-assembly visual acceptance remains pending; production integration is not claimed.
