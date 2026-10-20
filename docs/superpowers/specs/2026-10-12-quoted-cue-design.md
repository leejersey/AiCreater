# Exact original-quote cue design

Approved by user after proposal: model quotes current-scene original phrase; program calculates offsets, refuses absent/ambiguous matches. No fees or production restart in implementation turn.

New provider-only cue is {quote: string}, with additionalProperties=false, 1–4000 code points. Source_part_ids continue restoring lossless narration. Search only the restored scene, exactly (no strip/normalization/fuzzy lookup). Reject whitespace-only quote, absence, or a second match including overlaps. On success replace quote with canonical Unicode-code-point [text_start,text_end). No quote/reference leaks into stored drafts, public DSL, voice jobs or snapshots.

Compatibility: existing canonical drafts remain readable and strictly validated; legacy numeric source-reference responses remain supported only for old protocol calls. New provider requests require quote-only reference responses, never accept numerical fallback. Preserve first-source-error behavior. Old v1 persisted generation/regeneration jobs retain v1 adapter; new jobs use teaching-outline:2 / scene-candidate:2. Dedup must include new protocol so old failed jobs are not reused. No automatic execution/retry of old jobs.

Diagnostics: unresolved quote errors use existing storyboard_invalid_cue with whitelisted path and fixed quote_blank, quote_not_found, quote_ambiguous reasons; no quoted text, label, IDs or offsets persisted in error. Schema field name quote is public, never its value. Existing numeric cue diagnostics unchanged. No new error codes/retry semantics, dependencies or migrations.

Tests: Chinese/emoji/CRLF/whitespace, repeated and overlapping matches, scene locality, raw input immutability, missing/mixed/numeric new response rejection, old canonical/wire compatibility, single-scene regeneration, prompt schema, child protocol selection, persisted dedup/version and HTTP diagnostics. Paid-generation success remains unproven and exact quotes can still fail.

No Git metadata available; no commit/worktree. No delegation authorized; review inline. Scope is adapter/restoration/metadata plus connected tests, not editor, renderer or public validators.
