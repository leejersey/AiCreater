# Quoted Cue Implementation Plan

> Inline execution requested by user. TDD and completion-verification applied. No delegation authorized or Git metadata/worktree.

**Goal:** remove model arithmetic from new cue requests without changing saved canonical DSL.
**Architecture:** provider-only quote schema → lossless scene restoration → exact unique quote resolution → unchanged canonical validation; v1 jobs keep legacy calls, new v2 jobs dedup separately.
**Tech Stack:** existing Python/jsonschema/httpx/unittest/PostgreSQL, no new dependency.

- [x] Add services/tests/test_quoted_cues.py; initial seven tests fail for missing feature before production edits. Later add child privacy and v1/v2 routing coverage (nine tests in module).
- [x] services/workflow/storyboard.py: LEGACY_REFERENCE_SCHEMA and quote-only REFERENCE_SCHEMA; restore_storyboard(..., require_quotes=False) preserves old reads; exact find plus second search from start+1 catches overlapping ambiguity. Deep-copy input, restore narration exactly, replace quotes with canonical offsets, validate unchanged public rules. No semantic-error fallback.
- [x] services/workflow/providers.py: keyword-only cue_quotes=True for quote-only default; False retains old numeric prompt/schema for v1 workers. New responses cannot fall back to old format.
- [x] services/workflow/schema_diagnostics.py and worker.py: public quote field, fixed quote_blank/quote_not_found/quote_ambiguous reasons, child v1 option selection; failures never emit quotes or raw values.
- [x] services/projects/jobs.py: teaching-outline:2 / scene-candidate:2 and generation lookup version filter; frozen old jobs retained, dedup tests cover separate hash/version and repeated new submission.
- [x] Connected fixtures in generation/finish/pipeline/state/timeline/source tests: test-only quoted_wire helper converts canonical drafts to wire, leaving voice/storage fixtures canonical. API/persisted error coverage updated for quote reasons.
- [x] Fresh full offline suite: 106 tests OK. Owned disposable PostgreSQL/API/job suite: 70 tests OK; no user DB writes or provider calls.
- [x] Debug initial integration run: new protocol-generation test left queued task on a separate project outside fixture cleanup, causing nine downstream errors. Assign that project as fixture cleanup owner; rerun all tests successfully. No production queue relaxation.
- [x] Inline connected-call/compatibility review and README/acceptance updated. No live service restart, paid validation, frontend changes/build, migration, dependency or public schema/validator changes.

Verification:
`python3 -m unittest services.tests.test_quoted_cues services.tests.test_generation services.tests.test_source_owned services.tests.test_storyboard_diagnostics services.tests.test_storyboard_finish services.tests.test_full_lessons services.tests.test_pipeline services.tests.test_storage services.tests.test_subtitle services.tests.test_timeline services.tests.test_teaching services.tests.test_state_diagram services.tests.test_teaching_acceptance services.tests.test_local_api services.tests.test_queue_pool services.tests.test_queue_smoke -q`
`python3 services/tests/run_project_tests.py`

Production files: services/workflow/storyboard.py, providers.py, schema_diagnostics.py, worker.py; services/projects/jobs.py. Public packages/video-schema and frontend untouched. Rejection never clamps, rewrites narration or guesses first duplicate. Follow-up activation completed after user continued: identity/directory verified, zero active jobs, graceful API/workflow restart with beat resumed. Fresh API ready, web HTTP 200, workflow/render ping and tracked-process liveness passed; attempts remain 26, zero new execution. Receipt output/workbench/quoted-cue-activation.json; backup output/workbench/services-before-quoted-cues.json. Actual provider success and semantic instructional quality remain unverified; historical RAG counting mechanism unknown. A model can still produce absent/ambiguous quotes and fail safely.
