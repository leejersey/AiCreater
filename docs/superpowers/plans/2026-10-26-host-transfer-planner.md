# Deterministic pickup / handoff / feed

Approved scope: offline implementation only, reuse compileMotionIntent/evaluateMotion, no model or Scene execution.

First bounded mechanism: one carrier transports one staged bundle (1..4 aligned, separated papers) to a declared sleeve pocket, hands ownership to the sleeve, retreats, then the sleeve feeds horizontally through a declared receiver channel. Geometry is supplied by trusted host assets, never by model-authored coordinates. Model-facing choice is IDs/stage cue IDs; this module does not add a new provider protocol.

1. Add tests before implementation: centered contact, distinct payload offsets, atomic ownership handoff, sleeve-following cargo, deterministic/no mutation, rejection of formation, capacity, timing, viewport, aperture and obstacle violations.
2. Add transfer-planner.ts: strict bounded input Schema; solve contact/slot coordinates and a conservative overhead orthogonal corridor; distribute moves inside existing measured cue windows. Reject unsupported/blocked cases rather than inventing poses, changing timing or waiving collision rules.
3. Compile through the existing intent engine. Validate every integer frame and adjacent swept AABBs against the supplied rig, including exact pocket/channel-only interaction exceptions and narrow carrier contact depth. Return data only with accepted=false.
4. Test with safe fixtures and diagnose current RAG formation separately. All output is relative to supplied asset bounds/ports; it is not a render/visual/caption/full rigid-body proof and is not yet wired into the workbench.
5. Run focused tests and typecheck, independent read-only review, preserve existing modes and failed raw data. No automatic adoption of adjusted geometry, no new source or MP4.

## Sequential extension

Continue offline with `host-transfer:2`, retaining strict v1 compatibility. Replace the single pickup/handoff pair with `stages.transfers` (one `{payloadId,pickup,handoff}` per payload), followed by a shared feed cue. Each payload must fit the jaws individually; the whole staged formation must still fit the sleeve pocket. The host retains original relative horizontal offsets inside the sleeve rather than stacking papers or resizing them. The caller supplies measured ordered cue windows, not coordinates; missing/duplicate IDs, reused windows or insufficient retreat gaps fail.

Each cycle returns to the same clear overhead park, picks only the named payload, hands it to its computed sleeve slot, and retreats before the next cycle. Geometry checking covers deposited and unpicked papers throughout. Per-payload pickup/handoff event frames accompany aggregate first-pickup/last-handoff events. No new artwork, model calls, renderer execution or workbench mode switching. Actual integration must bind conservative geometry to a distinct moving gripper; the original combined full-width beam is not silently narrowed or accepted as that rig.
