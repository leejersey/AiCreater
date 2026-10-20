# Per-attempt usage records

Approved by user m02033. Minimal metadata ledger, NOT a supplier bill, hard cap or automatic reconciliation. No paid calls or20-case acceptance.

- Add nullable job_attempts.usage JSONB. At claim, freeze whitelisted public reference rates/source/date and pending/local state in the same transaction. Old NULL attempts remain historical unknown; retries append attempts and never rewrite prior rows.
- Providers optionally report a sanitized submitted event and valid token counters / completed TTS submitted Unicode character count. Record model response usage before response/storyboard validation, and TTS before downstream alignment. Never persist credentials, source text, raw responses or arbitrary provider fields.
- Child atomically writes bounded safe usage telemetry in its own private attempt directory. Parent reads after child stop on success/error/cancel/timeout, saves only to matching attempt/job under lock. Parent death may lose telemetry: frozen pending record remains unknown, never inferred free. Recording does not weaken job publication/lease fencing.
- Submitted/unreported, malformed metadata, unsupported models, expired prices and old NULL records show pending verification. Valid returned model tokens / completed TTS calls use attempt-time frozen reference rates; all amounts remain reference only. Local timing/render have0 new supplier fee, machine cost excluded. A failed/cancelled job may have observed usage and reference expense.
- Readonly no-store GET /api/projects/{id}/usage returns attempt history and known-reference subtotal plus unknown count, without starting recovery/worker/provider. Read all project attempts initially; no fake historical backfill.
- Project UI loads only metadata, manual refresh, late-response/unmount guard, stale/error state; shows known portion separately from unknown, per-attempt state/quantities/date/reference range. Existing dirty forms and paid actions unchanged. No secrets/response dump.
- Original DB/API activation is a separate guarded step after code and isolated tests. No dependency, initial Git commit or delegation; no auth/catalog/budget features.
