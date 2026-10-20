# Manual cues implementation plan

> Execute directly in this session after approved design/user“实现”(m02593). No delegation; unborn Git HEAD prevents a safe worktree/commit. Preserve existing workspace. Design: ../specs/2026-10-16-manual-cues-design.md.

1. [x] Add failing isolated PG/API/Jobs tests for cue editing, retained audio/invalidated animations, revision/no-op/rollback, stale result rejection. Correct old read-only-cue fixture to an actually invalid range. Capture RED with disposable runner (no original DB).
2. [x] Minimal Store.edit_scene guard/state change; existing draft/final validators and publication guards remain authoritative. Run PG tests GREEN.
3. [x] Add failing frontend cue/SSR/draft tests; Unicode-safe merge/validation, raw invalid input persistence and old v1 compatibility.
4. [x] Wire SceneEditor existing form/save/advanced-mode switch; rawCues optional draft field, explicit retiming hints, no side-effect jobs. Run targeted GREEN, full Node/Python/typecheck, disposable DB and independent Next webpack build serially.
5. [x] Controlled scratch browser verification (no native course/media mutations) for editing/errors/restore/409/mode changes/no automatic jobs. Self-review affected callers, update README/API/guide/TODO and frozen evidence. Native backend reload remains a separate guarded step; no paid calls, consumers, new packages or schema migration.

**Outcome:** Code and isolated verification complete: 255 Node + 190 offline Python + 126 real disposable-PG cases = 571 distinct passing tests, typecheck, isolated Next webpack build and 10 controlled browser checks. All 126 offline skips were rerun in PG; two disjoint groups retained the existing 180s/group deadline after the initial whole-run timeout. Own test pages/preview/private build copy cleaned normally. Main-session review only; no independent reviewer or Git commit.

Code evidence: [receipt](../../../output/workbench/manual-cues-qa/receipt.json). Subsequent guarded native activation completed: normal owned-controller/API/web reload, no new migration; 19 native API + 6 no-mock browser checks with 3 successful saves only on an explicit temporary copy. Copy3scenes/page cleaned; original six tables/resources/queues exactly unchanged, source9files match tested delivery. See [native receipt](../../../output/workbench/manual-cues-activation/receipt.json). No consumers/tasks/supplier calls; paid20cases and human sync/listening remain last with explicit budget.
