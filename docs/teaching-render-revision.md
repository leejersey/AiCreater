# Semantic Revision After Render Diagnostics

Status: implemented; internal acceptance remains open. This is not a default-mode release.

The renderer first exhausts its deterministic free layout variants. The host replays the
entire saved recovery history against the frozen artifact and rejects missing measurement
coverage, altered report hashes, unfinished variants and runtime/measurement failures.
Only supported label-placement failures can request a semantic revision.

The revision consumes the existing root `revision` slot. Together with initial planning,
the root still permits at most two model dispatches. A compile-time revision therefore
leaves no additional paid render-repair slot. Cancellation, stale input and changed
evidence are checked in the reservation transaction and immediately before provider I/O.

Revision cannot remove objects or text, change meaning, ownership, relations or cue actions.
It may choose another supported component and compatible initial state. The complete
semantic checks and deterministic compiler run again. An unchanged artifact is rejected.
The new frozen artifact gets a separate render attempt; the old failure and its evidence
remain intact. There is no free-source fallback and no generated-code editing.

Queued repair without healthy workflow/scheduler leases expires after two minutes.
Running repair lease expiry is interrupted, not retried. Unknown model outcomes cannot
be presented as an actively progressing repair.

## Evidence

- Node tests replay and authenticate complete synthetic recovery histories and reject
  tampering, incomplete variants, runtime faults and semantic deletion.
- PostgreSQL tests cover root budget sharing, distinct frozen attempts, cancellation,
  evidence changes and queue/state failure handling.
- An opt-in integration passes synthetic audit evidence through a mock HTTP provider,
  the real compiler and an actual isolated Docker render using exactly two root slots.
  This proves integration only: it is not a natural visual-fault recovery or a blind test.

Remaining acceptance: naturally occurring browser diagnostics repaired automatically,
real paid provider acceptance within an approved batch budget, and unseen-topic quality.
