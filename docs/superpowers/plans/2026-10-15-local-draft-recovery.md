# Local Draft Recovery Implementation Plan

> Inline execution: no delegated agent, worktree or initial commit authorized. Apply executing-plans and test-driven-development principles in the current workspace.

**Goal:** Recover explicitly chosen unsaved browser form input without overwriting saved server revisions or automatically invoking an API.

**Architecture:** Pure localStorage helpers in apps/web/lib/drafts.ts; one client hook and notice/shelf in apps/web/app/LocalDraft.tsx. Existing form components own integration and existing revision/dirty/review gates. Hook initializes storage only after hydration and writes synchronously on user edits; persisted records never auto-apply.

**Tech Stack:** Existing React19/Next16, localStorage, node:test/tsx, Tabbit. No dependencies or schema changes.

### 1. Storage contract
- [x] Add apps/web/tests/drafts.test.ts: key isolation, revision conflict, malformed/unknown record retention, invalid JSON text roundtrip, concurrent expected-value comparison, storage errors.
- [x] Run `npx tsx --test apps/web/tests/drafts.test.ts`, observe missing module failure.
- [x] Implement apps/web/lib/drafts.ts with versioned records, guarded writes/deletes, shape validation and safe enumeration. Only permitted form fields accepted. Run focused tests green.

### 2. Form integration
- [x] Add shared client useLocalDraft, DraftNotice and DraftShelf in apps/web/app/LocalDraft.tsx. No localStorage access during SSR; no write on mount/restore. Surface failure and copy-only conflicts. Each origin-local key has only one record, compare raw record before writes/removal (best-effort, not an atomic cross-tab lock).
- [x] Add SSR tests proving no auto-recovery/server action or storage access.
- [x] Integrate page.tsx new-course fields plus project/scene navigation from shelf; preserve existing beforeunload and dirty gates.
- [x] Integrate SceneEditor.tsx and CodeStateFields.tsx, preserving raw invalid nested snapshot strings and invalid-state save guards after recovery.
- [x] Integrate ChartEditor.tsx (confirmation resets) and SceneManagement.tsx. Clear only after successful server save; failure/409 retains input and record.

### 3. Verification and delivery
- [x] Run `npm test && npm run typecheck`; read connected callers and review error/data-loss paths.226 tests pass; double-discard prompt reproduced then fixed with current dirtyRef.
- [x] Independent source-copy build `next build apps/web --webpack`, no .env/media copied; no manual original .next/runtime build or restart. Native original page subsequently confirmed auto-loaded UI read-only.
- [x] Browser test isolated production build with controlled no-charge API fixtures:13 checks for explicit restore, raw malformed JSON, nonfirst-scene navigation, cross-version copy-only, success cleanup,409, denied storage and no automatic API writes. Only owned3303 service and scratch pages/storage removed; both Tabbit tasks finished.
- [x] Record receipt under output/workbench/local-draft-qa; update docs/TODO.md, README.md and usage docs. Original3000 probe two native GETs only, no original input changes;20-case paid acceptance remains last.
