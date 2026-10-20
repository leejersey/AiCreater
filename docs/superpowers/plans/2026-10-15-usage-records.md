# Usage Records Implementation Plan

> Executed inline using executing-plans, authorized m02033. No delegation or first commit in unborn repo.

**Goal:** Per-attempt usage and frozen reference-price history with explicit unknowns.
**Architecture:** Nullable attempt JSONB, safe optional provider events through owned child file, fenced attempt recording, readonly project summary and existing-style React panel.
**Tech Stack:** Python/Decimal/FastAPI/psycopg, React/TypeScript, existing unittest/node:test. No new packages.
**Code outcome (historical):**244Node +190offlinePython +121real disposable-DB tests =555, typecheck/build and10controlled browser checks. No supplier calls/native mutations in that stage. See [code receipt](../../../output/workbench/usage-records-qa/receipt.json).
**Native outcome:** Authorized continuation m02359 completed nullable migration/API/UI activation;29 original usage GET checks and7 unmocked browser checks. All original fields/resources preserved, only new58NULL usage keys;13 source hashes still match verified delivery. No consumers, tasks, invented usage or supplier calls. Full555 tests not rerun for activation-only step. See [native receipt](../../../output/workbench/usage-records-activation/receipt.json).

###1. Red tests
- [x] services/tests/test_usage.py: frozen known/expired/unsupported rates, strictly sanitized counters, missing/bad usage, unknown subtotals, failed known usage, local fee.
- [x] services/tests/test_jobs.py and test_api.py: attempt initialization/retry history, recording ownership and no overwrite, parent success/error/timeout/cancel capture, readonly route and old NULL unknown.
- [x] apps/web/tests/usage.test.ts: strict finite data/formatter, known vs unknown, per-attempt UI/error/refresh handling. Run red before implementation.

###2. Backend and execution
- [x] services/projects/usage.py pure safe events/pricing/summary; share rate constants with estimates.py; jobs.sql nullable usage. Jobs.claim freeze, Jobs.record_usage update owning attempt only, Jobs.project_usage readonly.
- [x] services/workflow/providers.py optional sanitized events before network / after usage, generate.py optional pass-through. services/workflow/worker.py private atomic telemetry and finally persistence even on terminal/error/timeout paths; retain old signatures by default.
- [x] services/api/app.py no-store readonly usage route using current local boundary.

###3. UI
- [x] apps/web/lib/usage.ts validated schema/format and app/UsageRecords.tsx existing pattern. Add page.tsx keyed project panel, no new mutations or polling.

###4. Verify and deliver
- [x] python3 -m unittest services.tests.test_usage; npm test; python3 -m unittest discover -s services/tests; python3 services/tests/run_project_tests.py (owned disposable DB, no original profile or supplier).
- [x] npm run typecheck; independent Next webpack build and owned controlled browser panel success/unknown/old404/error/refresh/context cases; clean only own page/server/copy.
- [x] Update README/TODO/API/getting-started and output/workbench/usage-records-qa/receipt.json with actual counts, failures and untested native activation boundary.20paidcases remain last, no fees.

###5. Guarded original activation (m02359)
- [x] Recheck idle queue/zero consumers and recorded own controller/API/web UID,start,cwd,command,PGID,parent; private consistent backup before any stop/DDL.
- [x] Add nullable usage with no default, normal own supervisor reload API/web only; no worker/beat/containers or force kill.
- [x] GET original25 project histories/all58attempts; no-store,404/400/Host403/Origin403 and GET-only route. Native3000 manual refresh, historical unknown/no0, expand, switch/empty/reload; no mocks/HTTP mutations/localStorage edits.
- [x] Close only own scratch page, confirm normal browser finish; exact old-field comparison excluding ONLY newNULL usage, unchanged media/objects/config/containers/queue lengths and live owned identities. Update documentation and native receipt; actual supplier billing/paid20cases still deferred.
