# Visual Workbench Integration Plan

**Goal:** Make the primary web course workflow use the bespoke visual generation pipeline rather than template cards.

**Architecture:** Preserve existing authentication and voice jobs. Add source-bound visual jobs, an explicit local-source approval gate, measured media rendering and authenticated results. No paid tests without separate authorization.

- [x] Add failing contract tests for measured narration partition, stale fingerprints, paid request caps and source approval.
- [x] Implement durable visual jobs/store, ownership-checked API and bounded queue executor.
- [x] Implement Node generation/repair/preview/export adapter using existing custom-scene validators.
- [x] Replace primary course UI with bespoke workflow, retain explicit legacy route, show source and frame review.
- [x] Verify offline model-adapter contracts, real temporary-PG API/queue and actual local render with approved fixture source.
- [x] Reload only independent visual-lab services; verify browser primary flow and no template fallback.
- [ ] Request bounded authorization only when ready for a new-script real-model acceptance test.

2026-10-24: Integration is running at the main course route. Real-model/new-TTS acceptance is intentionally pending fresh authorization; previous request budgets were not reused. Original checkout workers and data were not changed. See docs/visual-workbench.md for verification and the remaining legacy batch-timing regression.
