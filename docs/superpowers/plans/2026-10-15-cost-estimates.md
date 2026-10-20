# Cost Estimates Implementation Plan

> Inline execution approved by user m01392. No delegation or initial commit (unborn repository). Existing tooling and TDD; no provider calls.

**Goal:** Fresh reference cost before paid confirmation, no hard cap.
**Architecture:** Shared exact storyboard request builder; readonly backend estimate service/routes; validated browser confirmation formatter with timeout and unchanged submission guards.
**Tech Stack:** Python/Decimal, FastAPI/psycopg, TypeScript/React19; existing unittest/node:test.

- [x] Backend red: services/tests/test_cost_estimates.py missing feature failure captured. Eight pure/route tests cover Unicode, complete request accounting, unknown/expired prices, legacy frozen retry, aggregate reuse, readonly transaction and strict local routes.49 focused provider/estimator regressions pass.
- [x] Extracted services/workflow/providers.py storyboard_request; existing production outbound request/validation retained. Added services/projects/estimates.py and shared Jobs.input_hash; two strict no-store API routes. No migrations, dependencies, credentials or external estimation access.
- [x] Frontend red missing module captured. Six tests cover finite strict schema, small nonzero prices, unknown/free distinction, quantity/source/date, cancel/timeout/conflict/context. Added apps/web/lib/cost-estimates.ts and integrated four paid actions plus paid retry in page.tsx; no action POST before explicit confirmation.
- [x]236Node,179offlinePython,110isolatedPG/API/Jobs pass; typecheck and independent Next16 webpack production build pass. Two new real DB quote-vs-submission dedup tests originally left queued test jobs, contaminating later global serial-claim tests; added per-created-job cleanup, full110 passed. No production claim change.
- [x] Owned3305 fixture browser11checks,10metadata requests,9paid dialogs all cancelled,0business mutations/0pageerrors; unknown/404/bad JSON/5s abort/409/selection/retry paths covered. Saved transcripts/screenshot and verified final frontend build hashes. Only own scratch page/server/source copy removed; macOS /private realpath normalized after initial cleanup guard refusal, never forced kill.
- [x] Updated TODO/API/getting-started/README and output/workbench/cost-estimates-qa/receipt.json. At code delivery only original API GET openapi was performed; original guarded load was pending then. Subsequent activation is complete: original controller normal reload,11 native API checks,3 real dialogs cancelled,no mock/business writes/fees; before/after persistent snapshots identical. See output/workbench/cost-estimates-activation/receipt.json. Fee ledger/hardcap not in scope,20paidcases/manual listening still deferred.
