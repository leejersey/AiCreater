# Retained Design Revision

Approved continuation: local implementation/testing only. Do not submit a paid revision or execute new generated code.

- [x] Add project-scoped explicit revise-design submission: only failed design-stage generate jobs with one recorded request; retain measured snapshot, source parent ID and user feedback. No new database kind or migration.
- [x] Worker reads the parent's complete private provider response and failure message from its owned directory. Reject truncation, symlinks, missing raw output and mismatched snapshots before provider dispatch.
- [x] Validate retained JSON against the new output schema without requiring semantic validity, so state/layout errors can actually be revised. Build a full-design revision prompt carrying original design and bounded feedback as reference data.
- [x] Preserve original files; write revision-input.json and all new output into a new job directory. One design request, then at most one code request only after parser/layout checks. Never automatic retry.
- [x] Add workbench action for failed design-stage jobs, distinct from single-call source repair. Explicit confirmation, stale/active guards and budget remain.
- [x] Targeted Node 45 passed; offline Python 20 passed; disposable PostgreSQL store/API 23 passed. Scoped TypeScript passed.
- [x] Full Node regression: 688 passed, 1 optional smoke skipped; initial 10-second diagnostic fixture deadline failure was isolated, given 30 seconds and strengthened to require exit code 1. Final focused tests: 27 passed. Awake real-render fixture: 1 passed (82s), covering audio/captions/duration/hash. API/web ready, both isolated workers pong. No new provider/TTS calls.

Final notes: actual retained 7b5fdb80 input was prepared read-only with all 12 objects, six measured cues and its original state error. Revision prompt includes up to 40 offline layout findings. All touched source type issues resolved; whole-repo tsc still reports the existing beat-focus.test.ts audio_start_frame 0 vs 6 fixture conflict. A follow-up render check was interrupted by system sleep; power logs confirmed long sleep periods, so the successful awake rerun is the verification record. Render environment behavior remains the original partial allowlist (NODE_ENV not forwarded or invented). Browser error-page policy prevented an automated live UI inspection; no browser bypass was attempted.

Limits: UI eligibility based on state/request count does not prove a complete usable raw design exists; the worker/schema preflight rejects unusable inputs without a provider call. Model feedback adherence and final visual quality require a separately authorized real revision. Revision does not execute source or waive exact-hash approval. Historical failures and old drafts stay untouched.
