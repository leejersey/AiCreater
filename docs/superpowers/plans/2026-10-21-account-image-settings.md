# Account GPT Image 2 Settings Implementation Plan

> Execute inline using test-driven-development; no delegation or paid calls authorized for this feature.

**Goal:** Personal center provides per-account GPT Image 2 Base URL/API key save, replace and delete.
**Architecture:** Existing session/CSRF boundary, accounts SQL table, server-only Fernet encryption using ACCOUNT_CREDENTIALS_KEY. GET returns URL/configured status only; empty key preserves existing secret only for unchanged URL. HTTPS only, no userinfo/query/fragment, reject explicit non-public IPs but do not resolve DNS or test connectivity when saving (user-approved proxy Fake-IP compatibility change). This does not implement image generation; future dispatch must revalidate and pin target IPs, disable redirects and proxies.
**Tech Stack:** FastAPI, psycopg, cryptography (explicit dependency), Next/React existing forms and request helper.

## Follow-up: proxy Fake-IP compatibility

User requested no network validation after a custom domain and api.openai.com resolved to 198.18.0.0/15 via the local proxy. Removed save-time getaddrinfo; retained HTTPS/URL/explicit private IP controls and encryption. Regression test asserts no DNS call even when resolution would fail. Saving is not a connectivity/model test. Request-time destination security remains mandatory before generation is connected. After initial implementation, the user separately authorized local API/web restart and stable encryption-key provisioning.

## Steps
- [x] RED: URL/encryption unit tests and disposable-PostgreSQL API isolation/save/delete tests in services/tests/test_image_settings.py.
- [x] Implement services/accounts/image_settings.py, accounts/schema.sql, services/api/accounts.py + error mapping; no secrets in GET or errors. Require explicit deployment encryption key (never random ephemeral key).
- [x] Add apps/web/app/account/ImageSettings.tsx and integrate personal center; account navigation label; frontend parser/component tests. Blank-key preserve, explicit deletion confirmation, no localStorage/key echo; refresh cleanup for unmount.
- [x] Run frontend, typecheck, disposable-PostgreSQL full suite; inspect diff and update docs. Existing uncommitted image work stays intact.

No service restart, production DB migration, actual credentials or provider requests during development. Missing encryption key makes save unavailable with explicit server configuration error; reading status and deleting still work. Deployments must back up encryption key separately from DB. Third-party endpoint can receive the user's API key in a future explicitly confirmed generation job; no promise of endpoint model compatibility here.

Verification: frontend full suite 533 passed and typecheck/diff check passed; disposable PostgreSQL full backend suite 466 passed, final expanded settings/storage focused suite 13 passed. URL controls/public DNS, absent/invalid encryption key, encrypted DB bytes, rotation failure, no key echo, no-store, cross-account isolation, origin/content type checks, clear/update/preserve covered. Encryption key withheld from Node media validator. Existing image-planning changes preserved; no commits, provider calls, live migrations, private env edits or service restarts. Browser interactions/production build not verified.

Security test incident: one failing assertion exposed ambient environment content, including an unrelated provider credential, in tool output. The test now uses only explicit fake credentials (`clear=True`); operator advised to rotate the affected Groq key. No real key value is recorded in this document.
