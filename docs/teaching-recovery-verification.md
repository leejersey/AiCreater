# Recovery Verification Checkpoint

Date: 2026-10-29. Development checkpoint only, not stable-version acceptance.

| Verification | Result | Local log |
| --- | --- | --- |
| Root budget, durable planning, render queue and semantic render repair | 58 passed; 2 opt-in cases skipped | `/tmp/teaching-recovery-combined.log` |
| API admission, authenticated media/state behavior and worker wiring | 20 passed; 1 opt-in case skipped | `/tmp/teaching-recovery-api.log` |
| Owned execution and render adapter | 16 passed; 1 real-container case skipped | `/tmp/teaching-owned-unit-final.log` |
| Node recovery, revision and isolation lifecycle | 41 passed | `/tmp/teaching-recovery-node.log` |
| Custom-scene TypeScript checks | Passed | `/tmp/teaching-recovery-types.log` |
| Explicit real owned orphan cleanup | 1 passed | `/tmp/teaching-orphan-real.log` |
| Explicit synthetic audit → mock HTTP revision → real Docker render | 1 passed | `/tmp/teaching-repair-owned-real.log` |
| Explicit real API → worker → Docker → authenticated video | 1 passed | `/tmp/teaching-owned-api-real.log` |

The two new failure-state regressions were first observed failing: missing workflow
executor left a repair queued, and an unknown model call was shown as active revision.
Both now pass without consuming another model slot.

Tests use disposable databases and uniquely owned containers, not the current course.
No paid provider/TTS calls were made. A mocked provider is not a real-model validation;
synthetic visual diagnostics are not naturally occurring recovery evidence. No chapter
or course was newly accepted, and the default mode remains unchanged.

Outstanding: independent review of new recovery code, natural render-fault recovery,
audio/timeline rebinding, frozen chapter/course export, managed full-service startup,
workbench release gates and the approved-budget unseen-topic acceptance batch.
