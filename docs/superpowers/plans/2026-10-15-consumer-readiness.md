# Consumer Response Indicator Implementation Plan

> Inline execution approved by user. TDD with self-review; no new dependencies, initial commit, worker, beat or paid calls.

**Goal:** Show bounded readonly workflow/render queue metadata observations without altering submission rules.
**Architecture:** Standalone Celery control inspector, local GET endpoint, independently refreshed React panel with validated payload.
**Tech Stack:** Existing Celery/Redis, FastAPI, React19/Next16, unittest and node:test.

- [x] Write services/tests/test_consumer_readiness.py: dual/single/no response; malformed payload; generic redacted failure; invalid local broker; disabled retries/bounded sockets; local GET/cache headers without DB. Observed missing module failure, then7 passed.
- [x] Implement services/workflow/readiness.py and GET /api/consumers in services/api/app.py. Probe queue subscriptions only; no dispatch, Jobs or worker imports. Focused tests green.
- [x] Write apps/web/tests/consumer-status.test.ts for strict payload parsing, three-state SSR, response time and no initial network access. Observed missing module failure;4 new tests pass.
- [x] Implement apps/web/lib/consumers.ts and apps/web/app/ConsumerStatus.tsx, insert component in page.tsx. One mount GET/manual refresh; bounded frontend fetch, cancel on unmount, no polling or stale positive display.
- [x] Run npm test (230), npm run typecheck, offline Python (171 passed,108 DB skipped), isolated PG/API/Jobs (108 passed). Actual metadata transport on disposable empty Redis returned not_detected in1.142s, stopped Redis unknown in0.001s; set_as_current=False proved to preserve current application identity by regression test and real transport check. No workers, business queue all0, original broker unused.
- [x] Independent Next webpack build and10 controlled no-fee browser checks: detected, empty replies, manual refresh, no background polling, invalid/failed API and timeout. Existing empty-source submit guard was correctly disabled; filled only owned fixture to prove no new submission blocking, never submitted. Only own temporary server/Redis/source copies/backup/page removed. Expected edited-fixture beforeunload warning recorded; task finish forcedCleanup=false.
- [x] Record output/workbench/consumer-readiness-qa/receipt.json and update docs/API/TODO. Native original8000 endpoint404: API not reloaded. New code/controlled browser verified, not original runtime activation. Fees/20-case/manual listening remain deferred.
