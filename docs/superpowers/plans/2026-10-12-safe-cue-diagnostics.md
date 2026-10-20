# Safe cue diagnostics — approved minimal design and plan

User approved modification after offline investigation. No paid calls, protocol/prompt/schema relaxation, numerical offsets, provider values or automatic retries. No service restart until verification.

Design: optional error.cue_error={path,reason}, only for storyboard_invalid_cue. Path exactly /scenes/0..19/elements/0..5/cue; reason one of empty_or_reversed, out_of_bounds, blank_interval. Storyboard classifies the existing first cue failure using already schema-validated data. ProviderError and Jobs independently sanitize; child forwards only for the fixed matching code. No public DSL/database migration, frontend changes or shared Python/TypeScript validation changes. Existing cancellation/attempt fencing remain intact.

Steps:
- [x] Add tests for classification, privacy, child, persistence and HTTP.
- [x] Before production changes: diagnostic module ran 11 tests with two expected assertion failures (missing ProviderError cue_error and child metadata). Initial targeted invocation used the wrong class name, corrected to module invocation before confirming red.
- [x] Implement minimum carrier/filter/forwarding change. Fresh 97 offline tests and 68 isolated PostgreSQL/API/job tests pass.
- [x] Update acceptance documentation; historical actual cue remains unrecoverable.

Verification: `python3 -m unittest services.tests.test_generation services.tests.test_source_owned services.tests.test_storyboard_diagnostics services.tests.test_storyboard_finish services.tests.test_full_lessons services.tests.test_pipeline services.tests.test_storage services.tests.test_subtitle services.tests.test_timeline services.tests.test_teaching services.tests.test_state_diagram services.tests.test_teaching_acceptance services.tests.test_local_api services.tests.test_queue_pool services.tests.test_queue_smoke -q` (97 OK); `python3 services/tests/run_project_tests.py` (68 OK; owned container removed).

No paid requests or user-project writes. Follow-up activation approved by user continuing: zero active jobs, process identity/directory verified, graceful API/workflow restart and beat resumed. Fresh API ready, web HTTP 200, workflow/render ping and tracked-process liveness checks pass; attempts remain 25, zero new execution. Receipt output/workbench/cue-diagnostics-activation.json; backup output/workbench/services-before-safe-cue-diagnostics.json. No web build (no web changes). This repair exposes future failures safely, not a proven repair of the historical RAG generation.

Scope: services/workflow/{schema_diagnostics,providers,storyboard,worker}.py; services/projects/jobs.py; diagnostic/jobs/API tests. Direct single-agent work; no delegation requested. Existing live services not restarted automatically; no Git commit (repository has no Git metadata).
