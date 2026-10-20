# Batch local timing implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; no delegation authorized. TDD and main-session review.

**Goal:** Explicit atomic submission of selected reviewed needs_timing chapters without voice/model calls.
**Architecture:** Share single-scene timing payload, lock project once, validate all payloads before same-transaction _submit. Existing worker/attempt/revision fences unchanged. Independent UI selection, one confirmation and one request, session-guarded results.
**Tech Stack:** Existing Python/psycopg/FastAPI and React/TypeScript/node:test; no packages/DDL.

- [x] Backend RED: services/tests/test_jobs.py tests real-PG selection, rollback on missing second cache and injected second insert failure, single/batch/concurrent dedup, terminal-state reuse, strict revision/identity/status checks. services/tests/test_api.py verifies202/private return/422/403.
- [x] Backend GREEN: services/projects/jobs.py extract _timing_payload(project,row), implement submit_batch_timing using batch-voice validation pattern and same transaction; services/api/app.py reuse batch request model for /projects/{id}/timing. Old single-scene behavior unchanged.
- [x] UI RED: apps/web/tests/course.test.ts selection guards and SSR controls; UI caller/controlled interaction checks. Run node_modules/.bin/tsx --test apps/web/tests/course.test.ts (expected missing batchTimingScenes/controls).
- [x] UI GREEN: apps/web/lib/course.ts pure batchTimingScenes; apps/web/app/CourseOverview.tsx separate revision-bound timing selection; apps/web/app/page.tsx explicit confirm then one request, errors preserve selection, stale-session results ignored,404 no fallback. Update test callers of CourseOverview.
- [x] Verify: temporary PG via existing services/tests/run_project_tests.py with /tmp group-selector wrapper retaining180s/group; npm test; npm run typecheck; python3 -m unittest discover -s services/tests -v. Real worker regression only on disposable data; no original consumers or queue writes.
- [x] Review, isolated build/UI checks, README/docs/TODO and output/workbench/batch-timing-qa/receipt.json. Report actual completed checks and outstanding checks, never count skips as passes. Native activation is separate and not authorized here.

**Outcome:** 258 Node + 190 offline Python + 132 real disposable-PG tests = 580 distinct passing cases, typecheck, private Next webpack build and10controlled browser checks. Offline132skips match PG test IDs exactly; groups69+63 retained180s/group. Own browser page/preview/private copy and PG containers cleaned normally. Late-session guard self-reviewed, not force-induced through busy UI. [Receipt](../../../output/workbench/batch-timing-qa/receipt.json).

Native loading remains pending; no original DB/queue writes, consumers or supplier calls. Native task submission/execution needs separate explicit scope, not a read-only check.

No HEAD: no worktree/commit/initial baseline. Existing untracked workspace preserved. No independent-review claim. Spec: ../specs/2026-10-16-batch-timing-design.md. No feature work beyond approved scope.
