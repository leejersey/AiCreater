# Local Timing Implementation Plan — completed

Inline execution authorized by user's 开始, following approved spec. No delegation or Git metadata; direct TDD/self-review.

- [x] Cache unit tests red (missing module), then bounded audio/words reader, root/symlink/size/checksum protection; missing/tampered/invalid source/duration never calls HTTP/TTS. Legacy1ms round/ceil calibration separately red/green, frozen duration preserved.
- [x] Disposable PostgreSQL jobs/API red (missing submit_timing/route), then v5 migration guards, local-timing:1 frozen task, stage, sanitized nonretryable cache error and API.
- [x] Worker uses existing workflow lane/deadline; timing child receives no model/voice credentials and does not call providers. Publisher reuses revision/profile/attempt/cancellation checks, exact audio identity and local-only validation (no object-store downloads/uploads).
- [x] Durable tests cover needs_timing→ready, dedup, bad state/cache, stale result detached, audio replacement rejected, cancelled/old attempt unable to attach, initialize with timing row, forbidden object IO and excluded secrets.
- [x] UI policy tests red missing exports then green; separate paid voice/local timing, review/dirty/saved guard and local retry prompt. No editor overhaul/free cue editing/global opening/pronunciation changes.
- [x] Fresh112offline Python+76disposable PostgreSQL/API/jobs tests pass;141Node, typecheck and web build pass. Self-reviewed callers/constraints/file/secret/publication boundaries; no independent review claimed.
- [x] Identity/CWD/active0 checked, idle graceful API/workflow/beat restart loads route/worker/v5. Restart itself attempts41 unchanged; backup output/workbench/services-before-local-timing.json.
- [x] Real browser on independent RAG copy b17da34f-ca45-4e13-8b6e-b6506f4ba2c4: manual candidate changes one cue, first scene needs_timing/r2; one free timing job75bf48a4-a981-4850-81f5-9dd254753176 succeeds/attached/r2/ready; projectr3. Nine audio checksums, narration/other8scenes, originalr1 and frozen snapshotd076469b-6f2d-43a0-9f80-92c2c5d9a010 unchanged. Attempts41→42 only timing, no model/voice/render. Receipt/screenshot output/workbench/local-timing-qa/.
- [x] Browser first wait used wrong combined label and timed out after job already succeeded; subsequent read-only verify/reselection used actual labels, no retry. Test-fixture errors (wrong narration key/short cue-invalid text/API error shape/import/backoff) corrected without relaxing domain checks. No business failure hidden.
- [x] README/contract/followup/spec/current acceptance updated. No commit/worktree possible without Git metadata.

Limit: local original audio and *-words.json required; lost/imported sidecar fails, no ASR/download/paid fallback. Retiming replaces current caption/animation timing. nums pronunciation remains deferred, accepted movies untouched,20-case/quantified synchronization/licensing/budget remain separate.
