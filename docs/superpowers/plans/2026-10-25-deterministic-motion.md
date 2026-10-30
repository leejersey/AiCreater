# Deterministic Motion Boundary

## Direction

Continue the approved separation of motion/state from model-authored illustration.
Do not retry the retained model candidate or execute it. Keep the existing
source approval, geometry and visual acceptance gates unchanged.

## Increment 1: Offline foundation

- Add a strict immutable keyframe plan and a pure seek-safe evaluator.
- Produce world-space SVG transform/opacity attributes in trusted host code.
- Keep rigid children attached through parent-derived poses, not duplicate fades.
- Audit actual SVG group attributes through the TypeScript AST, not comments or
  unused variables. Provide an offline CLI for retained artifacts.
- Test malformed plans, seeking, gaps, parent composition and binding overrides.

## Explicit Limits

This is not yet a production generation mode. Version 1 supports translation,
uniform scale, opacity and static parent relationships; it does not model dynamic
grip/release, collision avoidance or full swept-geometry acceptance. Pose data
must still be reviewed. All evaluated groups are siblings in world space; do not
nest them and apply the parent transform twice.

The AST audit checks direct attribute syntax only. It does not prove that the
`motion` variable originated from the trusted evaluator, that every drawable is
visible, or that artwork cannot override appearance elsewhere. It is not a
security check or aesthetic approval.

## Remaining Integration

1. Introduce a versioned host-owned assembly boundary: generated artwork cannot
   replace motion calculation, object identity or timing.
2. Bind plan, illustration and assembly hashes into frozen artifacts and review
   the assembled source before local execution.
3. Express the RAG pickup/attachment phases without changing identity and test
   the actual assembled transforms, then obtain hash-specific render approval.
4. Only after screenshot/continuous-motion review, connect generation and repair
   entry points to this mode. Preserve the legacy path for existing artifacts.

No new provider calls are authorized by this document.

## Increment 2: Host Assembly

Continue the approved host-owned assembly direction with a data-only SVG format.
No model JavaScript/TSX is accepted by this new path.

- [x] Add failing tests for identity, prohibited code/URLs/transforms, duration
  binding and assembled source hashes.
- [x] Add motion-assembly.ts: validate illustration data, embed the trusted
  evaluator from its checked-in AST, construct all moving outer groups.
- [x] Replace evaluator Map constructors with object lookups so standalone
  source satisfies the existing guardrails.
- [x] Add visual:assemble-motion CLI with exclusive output publication and static
  TypeScript checking; never import or render the assembled source.
- [x] Run focused, scoped TypeScript and full Node regressions.

Layers are in paint order and map one-to-one to motion tracks. Artwork uses local
coordinates without transforms, styles, executable expressions, media or URLs.
Host code resolves theme tokens and owns identity, transform and opacity.
Artifact source embeds validated input and runtime, so existing source/brief
approval covers both. An input hash adds provenance, not replacement approval.

This increment does not change the workbench model protocol or add dynamic
parenting. Data-only artwork still needs geometric and aesthetic review.

## Increment 3: Timed Rigid Handoff

- [x] Add motion-plan:2 with explicit half-open attachment windows, parent IDs
  and local offsets. Keep motion-plan:1 unchanged and reject timed data in v1.
- [x] Validate reference graphs, nonoverlapping windows and world-pose agreement
  at attachment/release boundaries, including scale and opacity.
- [x] Embed the same trusted evaluator into assembled artifacts; test arbitrary
  seeking and boundary behavior without executing generated scenes.
- [x] Prepare an offline RAG mechanism fixture bound to the frozen design hash.
  Cover hold, lift, carry, attach, clearance route and hand return; do not call it
  a visual reproduction. Keep old approved artifacts unchanged.
- [x] Run regressions and freeze a new artifact for separate hash-specific still
  approval. No model/TTS requests or unapproved render.

In v2 an unattached track's keys are world-space. While attached, its complete
pose comes from the parent's world pose and an explicit local offset. Static
parentId and timed attachments cannot coexist on one track. At the start and
release, the authored unattached pose must match the attached world pose at that
exact frame. Dependency graphs are conservatively acyclic across all windows,
even when a time-dependent cycle might otherwise be harmless.

## Increment 4: Painted Geometry Repair and Host Audit

- [x] Reproduce the unsupported audit contract and missing repaired fixture in tests.
- [x] Add versioned assembly audit data referencing actual artwork nodes, with
  bounded static routes, phase-limited followers and obstacle annotations.
- [x] Derive a new RAG fixture without changing approved old artifacts or poses:
  remove suspension line, reserve glyph/heading space, rebuild notched portals.
- [x] Test actual painted portal dimensions against the complete swept payload,
  including the horizontal approach before the rise.
- [x] Freeze a new candidate after regressions; require a new hash approval before
  any screenshot execution. No model/TTS requests or production replacement.

Use the existing top-left motion anchor for visible routes and follow markers;
do not shift only the audit marker to make it pass. Metadata annotates existing
painted nodes, never invisible proxy obstacles. Keep geometry measurement and
raw warning rules unchanged, including expected conservative containment warnings.

## Increment 5: Whole-Paint Clearance

- [x] Add failing regression cases for the retained heading collision and paint
  crossing either inlet/outlet clear zone.
- [x] Add a scene-scoped conservative paint checker for the supported primitives
  and exact known path templates; reject unknown paths instead of skipping them.
- [x] Move the library heading above the full 938-frame hand/fragment sweep and
  replace crossing decoration with structured, inset line primitives.
- [x] Preserve all motion, audit references, approved sources and raw reports;
  run regressions and freeze a new candidate for separate screenshot approval.

Text bounds are deliberately conservative estimates, not measured font pixels.
The checker covers this fixture's moving gripper/fragment paint and every
generator-front decoration; the exact notched shell is verified separately.
This is not a general SVG collision engine or a replacement for render review.

## Increment 6: Opt-In Node Workbench Protocol

Continue the approved host assembly direction without changing the web default.
Add explicit host-motion generation to the Node workbench and CLI. One design
request plus one data request; repairs reuse the frozen design and data with
one request. Strict output schema and local parsers precede host compilation.
Freeze assembly data and its hash alongside source/design, preserve failure
accounting, and never fall back to model TSX. Existing source mode remains valid.

- [x] Add failing schema, generation, repair and fail-closed tests.
- [x] Add data output schema and bounded prompt with no executable source field.
- [x] Connect opt-in generation/repair and frozen provenance to the Node CLI.
- [x] Run focused, scoped TypeScript and full regression checks.

This increment does not expose a web/API selector, dispatch real model calls,
render new candidates, grant acceptance, or establish automatic visual quality.

## Increment 7: API, Queue and Web Mode Propagation

- [x] Add strict API mode selection while leaving the default source path intact.
- [x] Freeze host-motion in job snapshots and inherit it for design/data revisions.
- [x] Pass mode to Node generation; reject publication and repair mode mismatches.
- [x] Add a web selector, mode-specific budget confirmation and assembly hash view.
- [x] Verify offline, disposable-database, Node and service reload checks; record
  production build security-gate failure and blocked browser visual inspection.

Do not submit paid jobs, migrate existing records, bypass source approval,
change geometry/acceptance rules or interpret integration as visual success.

## Increment 8: Explicit Root Parent Semantics

- [x] Reproduce retained null-parent rejection with schema, parser, revision and
  workbench tests before changing the contract.
- [x] Allow parentId:null to mean no parent and canonicalize to absence, keeping
  malformed values, missing references, cycles and label ownership forbidden.
- [x] Align prompt/schema/parser; keep retained raw responses and historical
  canonical design hashes unchanged.
- [x] Prepare offline targeted revision feedback while preserving the real
  shelf/gripper layout finding and original failed job status.
- [x] Run focused, scoped TypeScript and full Node regressions.

No new provider requests, job submission, geometry waiver or source execution.

## Increment 9: Design-Bound Motion Identity and Time Contract

- [x] Reproduce renamed track/layer acceptance and workbench schema propagation
  gaps before implementation.
- [x] Bind output IDs, exact counts and complete coverage to the frozen design;
  keep brief-only schema callers compatible and local semantic guards intact.
- [x] State inclusive key-frame bounds versus exclusive window ends explicitly.
- [x] Replay the retained failed response without mutation or execution.
- [x] Finish full regression and scoped type checks; record actual results.

No provider calls, retries, candidate execution or acceptance changes. Newly
added provider schema constraints remain unverified against the real service.

## Increment 10: Data-Only Recovery From a Verified Frozen Design

- [x] Reproduce repair failing on malformed retained motion JSON.
- [x] Reuse the existing repair API/queue/CLI, with a host-only unpublished
  two-request failure branch that verifies the original design response hash.
- [x] Keep published integrity failures fatal; preserve existing valid assembly
  repair behavior and pass feedback even without a previous valid assembly.
- [x] Replay the real failed data job with an injected callback, no provider call.
- [x] Finish scoped TypeScript and full regressions; record actual results.

No new model budget, TTS, source execution, API job or acceptance changes.

## Increment 11: Explicit Motion and Drawing Field Ownership

- [x] Verify the retained response has 26 additional-property errors; keep the
  strict validator rather than deleting or relocating returned fields.
- [x] Add track/layer schema descriptions, explicit ownership in the prompt,
  and a schema-checked structural fragment (not a visual template).
- [x] Test omitted optional relations versus illegal layer fields and nulls.
- [x] Replay the unchanged real response; confirm it remains rejected.
- [x] Finish scoped TypeScript and full regressions; record results.

No provider calls or render approval. Better instructions are not evidence that
the model will comply; automatic visual quality remains unaccepted.
