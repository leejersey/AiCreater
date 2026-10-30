# Motion Intent Compiler Implementation Plan

**Goal:** Derive consistent handoff poses from named targets and action events.
**Architecture:** New pure compiler, existing motion parser/evaluator, no changes
to model requests or workbench behavior.
**Tech Stack:** TypeScript, node:test, existing motion-plan:2.

## Task 1: Contract and Tests

Files: `packages/custom-scenes/tests/motion-intent.test.ts`.
- [x] Add tests for move/hold, relative targets, attach/carry/release, frame 430,
  nested dependencies, duration-end attachment and malformed/ambiguous input.
- [x] Run the new test file and observe missing compiler failure.

## Task 2: Compiler

File: `packages/custom-scenes/src/motion-intent.ts`.
- [x] Strictly parse bounded immutable input and resolve dependency order.
- [x] Compile named-target moves and capture/release transforms into old keys.
- [x] Run final parseMotionPlan; retain all its strict continuity checks.
- [x] Run focused tests, scoped type checks and inspect the implementation.

## Task 3: Verification and Documentation

- [x] Run `npm test` with bundled Node and local Python on PATH.
- [x] Document supported semantics and unsupported collision/visual guarantees.
- [x] Preserve old failed jobs, response bytes and all acceptance/approval gates.

No commits, real model calls, rendering or frontend integration in this phase.

Final verification: focused 10 passed; full Node 785 tests, 784 passed, 1 skipped,
0 failed; scoped TypeScript and git diff --check passed. Logs:
`/tmp/aicreater-motion-intent-focused-final.log` and
`/tmp/aicreater-motion-intent-full-final.log`. Read-only review found no confirmed
bug; all three requested boundary-test gaps were covered before the final run.
