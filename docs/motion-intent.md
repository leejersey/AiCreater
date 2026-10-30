# Offline Motion Intent Compiler

`packages/custom-scenes/src/motion-intent.ts` exports the pure function
`compileMotionIntent(unknown): MotionPlan`. It emits `motion-plan:2` and calls
the unchanged `parseMotionPlan` before returning. No provider, React, browser,
filesystem or renderer is used by the compiler.

## Input

```json
{
  "schemaVersion": "motion-intent:1",
  "durationInFrames": 60,
  "anchors": [
    {"id": "home", "pose": {"x": 100, "y": 100, "scale": 1, "opacity": 1}},
    {"id": "destination", "pose": {"x": 300, "y": 200, "scale": 1, "opacity": 1}}
  ],
  "objects": [{
    "id": "payload",
    "initialAnchor": "home",
    "actions": [{"kind": "move", "startFrame": 10, "endFrame": 30, "targetAnchor": "destination"}]
  }]
}
```

Anchors optionally have `objectId`; their pose is then local to that owner.
World anchors have no owner. Initial anchors are sampled at frame zero only;
they do not implicitly attach an object to an owner.

Actions are ordered per object:

- `move`: startFrame, endFrame, targetAnchor. The target is sampled at arrival;
  the existing smoothstep interpolator moves there and holds outside the move.
- `attach`: frame, parentId. The compiler derives a relative offset from the
  current world pose. An object remains attached until explicit release or the
  exclusive end of the composition.
- `release`: frame. The compiler computes the attached world pose and holds it
  after release, unless another action follows.

Attach can occur at a move's end. Release then attach to a different parent can
occur at the same frame. Zero-length attachment intervals are rejected. Frame
events are in 0..duration-1; implicit open attachment ends at duration.

## Guarantees and Limits

Input is copied and strictly checked: 1..3600 frames, 1..120 anchors, 1..60
objects, at most 60 actions per object, finite bounded poses and known IDs.
Legacy output key/attachment budgets still apply and may reject larger inputs.
No arbitrary fields, code, executable expressions or input mutation are allowed.
The returned plan is frozen by the old parser.

The compiler resolves dependencies before dependents. Initial-anchor owners,
target-anchor owners and attachment parents all form dependencies. This first
version conservatively rejects cycles even when a time-dependent schedule might
make them physically meaningful. Input object order does not affect poses.

Moving independently while attached, duplicate attachments, free releases,
overlapping/out-of-order actions and invisible-parent inversion are rejected.
Relative poses that cannot fit legacy scale/opacity/coordinate bounds are also
rejected; values are never silently clamped.

This is **not** a collision solver or proof of good visual design. Target anchors
may be off screen, inside obstacles or otherwise inappropriate; the existing
geometry and visual review remain necessary. No old rejected plan is converted,
snapped or patched. The compiler itself does not call providers or renderers;
the opt-in Node adapter is described below. Source execution approval remains
separate from compilation and static source generation.

Attach preserves the current offset; it does not prove the object is inside a
gripper or dock. Author a move to a suitable docking anchor before attaching.
The compiler guarantees numerical handoff continuity, not grasp/contact intent.

## Node Generation Protocol

Node `generateWorkbench` and `scripts/visual-workbench.ts generate` now accept
explicit `generation_mode: "host-intent"`. This is a new opt-in mode; source and
host-motion keep their previous response formats. Python API, the durable queue
and webpage now expose the same explicit mode. The default remains source;
repair and design revision inherit the parent, not the current selector value.

After the measured design passes layout preflight, new second responses use
`object_motion_data_v1` JSON Schema. Its `object-motion-data:1` payload contains
the exact canonical design SHA, anchors, one object list and root audit data.
Each object has id, initialAnchor, actions and artwork together. The host supplies
brief/duration and splits this list into the existing intent objects and drawing
layers. Every frozen design ID appears exactly once; both host-generated lists
therefore use the same identities. Motion keys are still host-computed. Drawing
primitives, paths, paint and audit references retain existing guards.

Historical `motion-intent-assembly:1` responses remain readable by frozen-data
recovery, not accepted as a fallback for a new data request. Invalid old responses
are never structurally repaired or converted automatically.

The host compiles the intent and validates the complete existing assembly before
generating source. No Scene is imported or executed. Success writes:

- `frozen-intent.json`: original validated data payload with its explicit version.
- `frozen-assembly.json`: compiled `motion-assembly:2` data.
- `result.json`: source/design SHA, assembly SHA and intent SHA.

Intent SHA hashes JSON.stringify of the validated versioned payload, not original response
bytes. Provider response files independently preserve those original bytes.
On later reads, intent is recompiled, compared with the frozen assembly and its
recorded intent SHA, then the assembly is regenerated into source for comparison.
The same source-binding check applies to the older host-motion assembly path.
Existing published source/brief hash approval and geometry gates are unchanged.
For a failed generation without final result metadata, the retained complete
provider response and durable request count supply provenance: its compiled
assembly and full validated intent hash must still match the frozen products.
This includes intent edits that do not affect motion, such as an unused anchor.

Repair inherits the parent's mode and uses one data request. A complete valid
candidate supplies PREVIOUS_INTENT_REFERENCE to the prompt, explicitly marked
as reference data; the returned payload must use the new object schema. An
unpublished two-request data failure may reuse only the verified design when no
frozen intent/assembly or source artifact exists. If any frozen product exists,
it must agree with the retained provider candidate; corruption cannot be hidden
by falling back to design-only recovery. A source mode marker cannot coexist
with motion frozen data, nor host-motion with intent data. Missing mode records
also reject frozen motion data rather than silently switching protocols.

Integration tests use injected request callbacks, including an authenticated
HTTP-to-queue-to-result test on disposable PostgreSQL. The webpage uses a shared
confirmation/submission controller tested for cancellation, inherited budgets
and captured exact preview hashes. Results without required intent/assembly
hashes cannot publish; all supplied hashes are type checked in every mode.
Before a repair starts, disk mode must match the frozen database mode. Preview
also checks intent and assembly metadata before media access; Node then verifies
the actual frozen data and source lineage.

Real provider acceptance, actual browser interaction/screenshots and visual
quality remain unverified. No automatic conversion of legacy failed jobs is
provided. Local execution is not an untrusted-code sandbox.

## Compact Design Output

New host-intent design requests use `visual_design_content_v1`, returning
`visual-design-content:1` with an exact `inputSha256` and the existing visual
fields. Brief, narration, measured cue text/frames and canvas parameters are
host-owned inputs, not response fields. Beats reference supplied cue IDs; every
ordered cue must still have exactly one beat. Required overlaps, object states,
transition continuity and layout checks are unchanged. Missing overlaps never
mean an empty relationship list.

The host saves canonical inputs in private `design-input.json` before dispatch,
validates the complete compact response and binding, and restores the existing
`visual-design:1` before freezing or running layout preflight. Raw provider
responses stay untouched. A private `design-origin.json` retains the original
design payload and host inputs, and is copied only after verification when a
repair reuses that design. Every host-intent read/recovery checks this origin
against the frozen design. Two-request roots additionally compare the original
provider response and compact input file. One-request failed repairs can reuse
their verified origin again without fabricating a second request count.
Changed/missing inputs stop before another request. Historical full design
responses without the compact input file remain readable; source and host-motion
still request their original full design schema.

Design revision can accept a schema-shaped compact response with semantic errors
as reference data only. Host binding and structural checks run before dispatch;
the corrected response must pass all semantic/layout checks anew. This does not
make an invalid original design accepted. Repairs reusing a valid frozen design
still issue only the data request. Provider strictness settings and retry policy
are unchanged; offline tests do not establish real provider acceptance.

## Anchor Coordinate Frames

`anchor.objectId` is a coordinate-frame dependency, not a label saying which
object uses or owns the anchor. Omit it for absolute world poses. A local anchor
expresses a point relative to the referenced object's pose at sample time; it
does not establish attachment. Initial anchors sample frame zero, move targets
sample arrival time, and attach/release control following separately.

Neither an initial anchor nor a move target may depend on that same object's
own local frame. Dependencies across anchor references and attachment parents
must remain globally acyclic even at different times. Another object's local
dock remains supported when acyclic, including parent motion during attachment
and preservation of the released world pose. Never remove `objectId` from an old
response mechanically: that changes local coordinates into world coordinates.

These constraints are now explicit in both intent prompts and shared schema
descriptions. The compiler and schema acceptance rules are unchanged; this is a
generation-guidance clarification, not a repair of saved failed responses.
