# Motion Intent Compiler

Approved scope: an independent, offline deterministic compiler. No provider,
workbench mode change, legacy migration, scene execution or acceptance change.

Input `motion-intent:1` has a duration, named anchors and objects. An anchor has
a pose and optionally an owning object (local coordinates); otherwise it is a
world anchor. Each object starts at a named anchor and has an ordered action
list: move between two frames to an anchor, attach to an object at a frame,
or release at a frame. No executable expressions or arbitrary keys are allowed.

The compiler resolves object dependencies before children. A move targets the
anchor's world pose at arrival. Attach captures the current world pose in the
parent's coordinates; release derives its world pose from the parent. The host
inserts required hold and boundary keys and emits existing `motion-plan:2`.
Old `parseMotionPlan` remains the final authority and is not relaxed.

Reject unknown IDs, dependency cycles, malformed poses, out-of-order/overlapping
actions, move while attached, attach twice, release while free and inversion of
an invisible parent. Unreleased attachment ends at the exclusive duration.
No automatic snapping, repair or conversion of retained invalid plans.

This is not collision avoidance, docking geometry verification or visual QA.
An anchor can still be a bad artistic or geometric choice. Models/API must not
use this format until a separately reviewed integration is implemented.
