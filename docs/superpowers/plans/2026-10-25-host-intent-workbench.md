# Host Intent API and Workbench

Goal: expose Node host-intent as an explicit experimental choice throughout the
existing API, durable queue and browser UI. Default source remains unchanged.

- [x] Add failing API/worker/UI tests for the new mode and required intent hash.
- [x] Extend the strict enum, freeze/inherit mode, publish both data hashes and
  compare database/frozen intent metadata before preview media access.
- [x] Add the selector option, correct budget confirmation and reviewed hash view.
- [x] Verify offline, isolated PostgreSQL, full Node and scoped TypeScript checks.
- [x] Reload only this local environment while no jobs are queued/running;
  verify health and the served API enum without paid job submission.
- [x] Document runtime results and remaining real-provider/visual verification.

No provider/TTS requests or Scene execution. No old project changes, migrations,
default-mode change or geometry/approval relaxation. Respect browser URL policy.

Verification: offline Python 22 passed, disposable PostgreSQL 30 passed,
frontend focused/controller 17 passed, full Node 797 tests / 796 passed /
1 skipped / 0 failed. Custom and complete web TypeScript checks passed.
The actual served enum includes host-intent with default source. API/web stayed
ready after 20 seconds; both targeted consumers pong; no queued/running jobs.
No provider job or Scene execution was submitted. Browser interactive/visual
verification remains blocked by the existing URL policy. Next.js still reports
its existing security upgrade warning; no bypass, dependency upgrade or
production build success is claimed.
