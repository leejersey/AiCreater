# Scene Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. No delegation authorized; main session is sole writer.

**Goal:** Add, duplicate and remove scenes without paid calls, lost history or stale writes.

**Architecture:** Reuse Store transactions/project locks and existing React dirty/revision conventions. Add scenes.deleted_at with active-scene filtering; archived rows retain media/candidate/job references. No new dependency, consumer, cleanup or auto retry.

**Tech Stack:** PostgreSQL/psycopg, FastAPI/Pydantic, Next.js/React, node:test/unittest.

## 1. Backend red/green
Files: services/tests/test_projects.py, services/tests/test_api.py, services/projects/schema.sql, services/projects/store.py, services/projects/jobs.py, services/api/app.py.
- [x] Add real PostgreSQL tests for insertion/order/reuse/delete/history, invalid inputs/versions/limits/cross-project access, busy deletion and retry-after-delete, migration idempotency, concurrent stale operations; API strict request/confirmation tests.
- [x] Run `python3 services/tests/run_project_tests.py` before implementation; expect missing Store methods/API404.
- [x] Add tombstone column, shared active-scene lookup, three Store operations and strict routes; fence deleted scene callers and retries with project-before-job locking.
- [x] Rerun isolated tests; expected all pass with no provider execution.

## 2. Frontend red/green
Files: apps/web/tests/scene-management.test.ts, apps/web/app/SceneManagement.tsx, apps/web/app/page.tsx.
- [x] Add SSR tests for visible manual controls, disabled dirty/busy/max20/last-scene/active job constraints.
- [x] Observe missing component failure with `node --import tsx --test apps/web/tests/scene-management.test.ts`.
- [x] Implement append form and selected-scene copy/delete actions; bind existing act/dirty/refresh/selection/review protection, preserve inputs on409. Copy reuses media; delete requires explicit chapter confirmation and does not erase history.
- [x] Run `npm test && npm run typecheck`.

## 3. Completion
- [x] Self-review connected Store/Jobs callers and race/foreign-key paths; no independent subagent without authorization.
- [x] Run offline Python regressions, independent Next webpack production build, controlled browser interactions without provider requests. Do not build over live .next.
- [x] Update docs/api-reference.md, docs/TODO.md and evidence under output/workbench/scene-management-qa; distinguish code/build/controlled browser proof from original-runtime activation.
- [x] Report tests and pending boundaries. Evidence: output/workbench/scene-management-qa/receipt.json; code verified, original runtime not activated. No initial Git commit/worktree: repository has unborn HEAD and all preexisting source is untracked; no original project edits or paid20-group run.
