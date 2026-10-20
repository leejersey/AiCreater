# Account and course workflow — execution record

Approved by user “推进” after the overall account/course proposal. Spec: `docs/superpowers/specs/2026-10-19-account-course-flow-design.md`.

**Boundary:** existing PostgreSQL/FastAPI/Next and editor only; no new services, dependencies, consumers or paid calls. Initial isolated delivery left the original API unchanged. Subsequent user-reported login redirect bug: original API now backed up and activated; old project content preserved, no legacy claim. Direct execution/self-review only, no delegated review or initial Git commit of this otherwise-untracked repository.

## 1. Authentication and ownership

- [x] Red→green password/native API tests before implementation.
- [x] `services/accounts/{auth.py,schema.sql,__main__.py}`: standard-library scrypt, hashed random sessions, bounded PostgreSQL rate windows, explicit transactional legacy claim and interactive password reset.
- [x] `services/api/accounts.py` and `services/api/app.py`: registration/login/me/logout/password; default-on authentication and deny-by-default per-resource authorization. Internal legacy contract tests explicitly opt out; deployed app has no environment auth bypass.
- [x] `services/projects/store.py`: owner bound atomically on create/import, filtered list with course state/counts and real revision-change timestamps; legacy timestamps remain unknown rather than fabricated.
- [x] Eight new native account cases cover 401/normalization/duplicate/cookie/expiry/revocation/rate/CSRF/all resource-family cross-account denial/no side effects/explicit all-or-nothing legacy claim. Existing queue fixture also scopes all leases/recovery to its own UUID; no fixture modifies unrelated projects.

## 2. Account UI and safe storage

- [x] `apps/web/app/AccountSession.tsx`, `/login`, `/register`, `/account`: real same-origin login/logout/password, safe return paths, hydrated form gate, in-place same-account expiry reauthentication without replay; switching identity clears editor memory. Temporary session-read errors do not unmount an active editor.
- [x] `apps/web/next.config.mjs`, `apps/web/lib/{accounts,editor,drafts}.ts`, `apps/web/app/LocalDraft.tsx`: existing Next rewrite and Cookie requests, 401 notification, per-user local drafts with anonymous namespace left untouched. No migration of old anonymous drafts.
- [x] Four new Node cases include red→green request/session signalling, return-path restrictions, draft isolation and account/course-summary validation.

## 3. My courses and free create

- [x] `/courses`: own-course search/empty/loading/error/status/updated time and continue-edit links.
- [x] `/courses/new`: title/manuscript free save, existing local draft safeguards, route into edit without any generated/voice task. Existing style/voice defaults are configured in the editor after create, not duplicated into a second settings form.
- [x] `/`: routes to login/my courses. Removed the original 404 legacy-editor compatibility after the user-reported bypass; missing auth route fails closed with an explicit error. Regression test red→green; actual original browser verifies anonymous root/protected-list redirects, hydrated login form, and owned-page 404 fault injection without anonymous editor.

## 4. Independent editor

- [x] `apps/web/app/Workbench.tsx` reuses the full editor at `/courses/[id]`; mixed course-list/create form stays only in legacy mode. Route editor keeps scene navigation, prioritized preview/teaching edit, advanced execution status collapsed.
- [x] Scene query URL and popstate/dirty guards; project loading/no-permission/error handling, explicit server-saved vs local-only state. Saved scene selection survives reload.
- [x] Existing cost confirmation/revision/candidate/timing/preview/freeze/export semantics retained; no engine replacement or new render/voice work. Unvoiced scenes currently show content draft only, NOT a fabricated video/animation preview.

## 5. Verification and remaining gates

- [x] Fresh final `npm test`: **419/419**; `npm run typecheck`: passed.
- [x] Fresh final full Python discovery on a task-owned native PostgreSQL: **348/348**, no skips. Together **767** distinct Node/Python tests, not old 755 evidence relabelled. Database removed; no providers/containers/consumers.
- [x] Fresh final Next production build in a private source copy: passed; no .env copied, original .next unchanged, copy removed. Routes `/`, `/account`, `/courses`, `/courses/[id]`, `/courses/new`, `/login`, `/register` all built.
- [x] Real isolated-browser smoke without API mocks: new root→login→register, own course list, free create, manual concept, scene URL/reload, draft restore, expired session preserves input and reauth does not replay create, save and password change. Temporary DB/API/Next/page/cookie cleared, no original services restarted, jobs/attempts/provider calls zero.
- [ ] Complete two-account/logout/back-forward UI chain: native two-account all-resource denial and logout/revocation are green, but the longer browser chain was interrupted by tool cancellation at logout. Read-only recovery/owned cleanup recorded; not counted as full UI success. Narrower smoke has a clean passed receipt and does not erase this gap.
- [x] README/getting-started/API/TODO/changelog and `output/workbench/account-course-flow/receipt.json` record status and risks.
- [x] Original account API activation after login-bug report: private pg_dump backup, verified supervisor/idle state, graceful existing API/web reload; anonymous me/projects return401. Original six-table existing field values and312media/config hashes preserved. Local webpack comparison removes observed Turbopack refresh loop without adding dependencies/services. 420Node and typecheck passed; no rerun of prior348Python or production build. Evidence: `output/workbench/login-redirect-fix/receipt.json`.
- [ ] Legacy-course claim remains explicit and pending:25original courses remain unowned; ask for username/course list before claim, never assign to first registrant. New accounts may see an empty list; course data is retained.

Remaining prior objectives: actual model/provider-voice concept course, efficiency and fixed 20-case formal teaching acceptance need a budget; human sync/nums work remains deferred. No public hosting, HTTPS/session hardening, email/SMS/social login, teams, quotas or billing platform in this local trial.
