# Deterministic Transfer Component Binding

Status: free candidate preparation and separately hash-approved diagnostic-preview entry connected to API, queues and web controls. Not a new automatic model mode or production adoption. No new scene execution has been approved or performed during implementation.

## Contract

`bindTransferComponents(design, roles)` requires a parsed frozen visual design with separately declared fixed beam, moving head, sleeve, receiver and 1..4 documents. `roles` contains only `beamId`, `carrierId`, `sleeveId`, `receiverId`, `payloadIds` and `stages`. `stages` is the host-transfer:2 transfer schedule plus shared feed cue ID. All design objects must be bound exactly once. Unsupported parents, state machines, labels/path roles and extra objects fail rather than disappear. Object meanings become short display labels except the moving head, which deliberately has no internal text.

Each host asset factory supplies artwork, conservative stroke-inclusive body bounds, contact/slot geometry and references to actual painted obstacle leaves. The old seven-component catalog is unchanged. The head uses a 70% width jaw opening and contact at `(w/2,h-2)`. The sleeve reserves a label band below its pocket. The receiver has two real painted walls with an open horizontal channel; it does not draw a closed rectangle and merely waive its entry collision. The beam is a separate static track and a real checked obstacle.

The frozen head origin must match the computed park. Widths, heights, document spacing, cue times and narration are never adjusted by binding. Existing combined RAG beam/gripper designs therefore cannot be silently converted; they need a separately reviewed design. The overhead-lane solver may remain below an already-clear overhead obstacle, but every obstacle still undergoes full swept validation; this is not a general path search.

Text preflight uses a conservative 1.25em-per-character allowance for bounded basic Latin/CJK labels and rejects unsupported combining/control/emoji characters. It rejects the reviewed ten-wide-W overflow example without truncating the text. This is still an estimate, not font-metric or rendered glyph proof. All results remain `accepted=false` and require rendered text/geometry/visual QA later.

## Offline Workbench CLI

`scripts/visual-workbench.ts prepare-transfer <input.json> <new-UUID-owned-output-directory>` accepts exactly `{design,roles}`. It does not call a model or renderer. It binds the rig, runs the original motion/drawing/audit parser, assembles source and statically typechecks it.

The new directory contains:

- `design.json`: the supplied design, not overwritten in its original location.
- `binding.json`: rig, full assembly, design hash and bounded preflight scope.
- `candidate.json`: source artifact for human review, not `artifact.json`.
- `result.json`: source/assembly/binding/design hashes, zero model requests, `execution=not_run`, pending visual status and no production adoption.

Directory creation and file publication are exclusive; an existing directory is not overwritten. Generic workbench preview/export does not adopt these candidate directories. A separate hash-approved diagnostic entry is described below; production adoption/export remains unconnected. Do not copy candidate files into old generation metadata to bypass that boundary.

## Web And Queue

`POST /api/projects/{project_id}/visual/prepare-transfer` accepts `{scene_id,expected_revision,confirmed,design,roles}` only. Project ownership uses the existing API boundary. Explicit free preparation, an exact project revision, current measured audio/caption snapshot and exact design brief/cues are required. Compact UTF-8 design/roles input is bounded at 128 KiB, matching web import validation.

The durable `prepare-transfer` kind runs on the workflow lane, has a 240-second bounded attempt and no automatic retry. Its child environment excludes model/TTS credentials. The worker invokes only the free CLI, then a second trusted read-only verifier: reconstruct the host rig and source, compare actual design/assembly/binding/source hashes, and verify published text files. It does not evaluate Scene code. Source and design are published through the existing authenticated text/JSON allowlist, not executable media.

The web workbench has a JSON file input and a free preparation confirmation. Successful candidate tasks show their source/design/assembly/binding hashes and pending/not-adopted state. They have no generic generation-preview, repair, acceptance or export actions. A dedicated diagnostic approval button is available instead. The initial source-generation default is unchanged. This is manual frozen-design import, not evidence of automatic model reproduction or of the retained RAG design already matching this mechanism.

The schema migration adds the new job kind without deleting jobs. Migration from the old constraint and repeat application were tested in a temporary schema on the isolated database and rolled back; the running isolated application has subsequently applied the additive migration.

## Diagnostic Approval

`POST /api/projects/{project_id}/visual/{candidate_id}/preview-transfer` accepts only `{confirmed:true,sha256}`. It requires a current succeeded prepare-transfer parent, exact source hash and complete design/assembly/binding hashes, freezes the measured scene/audio/fingerprint, and enqueues `preview-transfer` on the render lane. This is separate from normal preview/accept/export. Source code runs only after the explicit approval, outside a security sandbox.

The parent process reconstructs and verifies the candidate, compares the published files and all hashes, and verifies the original audio. It passes the expected source/design/assembly/binding and audio checksum snapshot to the Node CLI. The CLI reloads a verified in-memory artifact/design snapshot, compares every expected hash before execution callbacks, freezes its audio, and checks the copied bytes before the first still. A changed thesis can leave scene source identical, so source hash alone is insufficient to establish this snapshot binding.

An `approval.json` receipt records source/design/assembly/binding/audio hashes with scope `diagnostic-preview-only`. The existing stills, geometry and media pipeline is reused. Failed geometry retains stills without calling video render. Passing geometry may produce the audio/caption diagnostic MP4 and SRT, still marked `diagnostic=true, production_adopted=false, requests_dispatched=0`. No acceptance action is exposed, and service-side acceptance/export reject this kind regardless of geometry or media success. Schema v3 preserves existing jobs and adds the diagnostic kind; leases and render-lane routing support it explicitly.

Tests use mock still/render callbacks, never Scene execution. They cover wrong source approval, same-source/different-design snapshots, changed frozen audio, failed/passed geometry branches, immutable approval hashes, candidate files/audio rechecks, and rejection of production acceptance. Actual screenshot, continuity, font bounds and sound synchronization remain unverified until a new exact-hash execution is approved.

## Automatic RAG Recipe

`POST /api/projects/{project_id}/visual/auto-transfer` accepts only `{scene_id,expected_revision,confirmed,preset:'rag-augmentation:1'}`. This is an explicitly chosen free host recipe, not model-authored design, not automatic selection for arbitrary topics, and not a replacement for the retained approved RAG scene. It reuses the prepare-transfer job kind and measured chapter snapshot; no paid provider is called.

The current Chinese workflow recipe requires one unambiguous ordered retrieval, augmentation and generation cue. Its versioned geometry is a separate fixed beam, narrow moving head, two document fragments, prompt sleeve and open receiver. Retrieval is represented statically; answer production is not animated. These limitations are recorded in origin metadata and the UI confirmation. Short, unsupported or ambiguous timing fails without fallback.

Original `design.cues`, narration and captions remain exact. Optional role `motionCues` declares four source-bound subwindows inside the augmentation cue, allowing two sequential pickup/handoff cycles without executing transport during the intro. The generation cue owns feed. Subwindows must reference real measured source cues, stay within them, use unique referenced IDs and form a valid nonoverlapping compiled clock. They replace only the corresponding physical motion-clock window, never the measured narration/caption record.

The augmentation interval is divided into six slots: pickup, handoff, retreat, pickup, handoff, retreat. The optional per-transfer `retreatEndFrame` is a half-open deadline; planner bounds and source-cue binding checks apply to it. The final retreat ends before the measured augmentation cue ends, rather than stretching toward generation across a narration gap. The head holds parked during the gap.

`origin.json` records the preset input, phase IDs and explicit limitations; its hash is part of publication. Verification regenerates the versioned recipe and compares the design, roles and origin, rather than trusting a claimed preset name. Recipe/origin hashes propagate through the diagnostic snapshot and approval receipt. A manual import cannot silently claim this origin, and the default source/model generation mode remains unchanged.

## Verification

Focused offline tests cover common geometry ports, actual open receiver, static beam, exact cue binding, all frozen IDs, refusal of an unsplit/shifted design, old planner regressions, source/design hashing, no overwrite and the CLI preparation path. They do not execute any Scene or use paid API calls. Full rendering/visual acceptance remains pending.
