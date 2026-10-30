# Visual-First Workflow

Goal: allow source-mode silent visual drafts before TTS, then explicitly retime to measured captions without a model request.

Architecture: reuse existing generate/repair/preview jobs, adding an explicit draft timing marker and a zero-request retime operation. Draft inputs depend on narration, not audio revisions. Draft previews use locally generated silence and cannot be accepted/exported. Retiming creates a new hash and maps measured caption boundaries onto the original source frame domain; it does not execute source. Formal approval and geometry gates stay unchanged.

- [x] Add estimated draft input contract and offline tests.
- [x] Add deterministic source retiming, monotonic mapping and frozen artifact tests.
- [x] Wire API/store/worker with draft acceptance/export guards and explicit free alignment.
- [x] Wire workbench draft generation, labels and alignment confirmation.
- [x] Run focused backend/frontend/renderer regression and type checks.
- [x] Verify local running API/UI without paid requests or executing generated scenes.

Constraints: no model/TTS calls in development, no mutation of the accepted RAG course, no automatic retries, preserve exact-hash execution approvals. If measured captions cannot be mapped reliably or merged design beats exceed contract bounds, fail with feedback and retain the draft.

Verification: full Node suite with project virtualenv on PATH:938 passed,1 skipped; final focused draft/retime suite:9 passed. Backend draft/routes/worker/offline-store:37 passed; disposable PostgreSQL store lifecycle:32 passed. Custom-scenes and web typechecks passed. Repository-wide typecheck still has three errors in untouched test files (label-layout.test.ts,workbench-cli.test.ts,beat-focus.test.ts). Live OpenAPI exposes timing_mode and align route; web HTTP200; paid-budget and non-draft alignment guards reject without new jobs. Existing RAG remains8/8 accepted current,66 jobs. No real model/TTS run or new generated-source execution was performed; real visual-first quality remains a separate acceptance test.
