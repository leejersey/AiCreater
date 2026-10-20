# Safe Schema Diagnostics Implementation Plan

> Inline implementation approved by user m03251. No delegation or paid calls.

**Goal:** expose bounded schema field paths and rule names without retaining provider data.
**Architecture:** derive public field names from the checked-in schema; emit at most three sanitized diagnostics. ProviderError carries structured metadata, worker forwards it, Jobs sanitizes again before storing its JSON error. Existing error codes/retry policy unchanged; optional error.schema_errors only for storyboard_schema_error. No database migration or DSL changes.
**Tech Stack:** Python, jsonschema, unittest, existing PostgreSQL test runner.

- [x] Add offline regressions for missing/type/enum/extra fields, secret property paths, malformed metadata, child, persisted job errors and HTTP.
- [x] Fault-injection check: disable ProviderError metadata propagation; the regression assertion fails as expected. This check ran after implementation, not a claimed pre-implementation red run.
- [x] Implement small shared sanitizer and schema-error collection; avoid error.message/instance/schema values entirely. Generic root fallback retains validation failure if safe details are unavailable.
- [x] Forward optional metadata through ProviderError→child→Jobs.fail, preserving cancellation and attempt ownership.
- [x] Fresh 94 offline and 66 disposable PostgreSQL/API/job tests pass. No use of user database or provider credentials.
- [x] Update README and acceptance checkpoint; explicitly retain unresolved historical RAG cause.

Verification commands: `python3 -m unittest services.tests.test_generation services.tests.test_source_owned services.tests.test_storyboard_diagnostics services.tests.test_storyboard_finish services.tests.test_full_lessons services.tests.test_pipeline services.tests.test_storage services.tests.test_subtitle services.tests.test_timeline services.tests.test_teaching services.tests.test_state_diagram services.tests.test_teaching_acceptance services.tests.test_local_api services.tests.test_queue_pool services.tests.test_queue_smoke -v` and `python3 services/tests/run_project_tests.py`.

Follow-up activation: checked zero active persistent jobs; paused beat and gracefully restarted API/workflow worker, then restored beat. Fresh checks: API ready, web HTTP 200, workflow/render Celery ping successful; all tracked processes alive and job_attempts still 24 (zero new attempts). Updated output/workbench/services.json, retaining restart backup. No web changes/build run. Historical RAG details remain unrecoverable; this does not prove a real generation fix. No new paid call or automatic retry.

Scope: services/workflow/schema_diagnostics.py (new), storyboard.py, providers.py, worker.py, services/projects/jobs.py; diagnostics/job tests, docs. Existing CLI messages remain sanitized fixed schema-error text. No frontend changes required: API already returns job.error; existing UI continues showing generic error message. No raw response persistence or schema relaxation. No Git metadata exists, so no worktree/commit possible. Independent review not delegated without authorization.
