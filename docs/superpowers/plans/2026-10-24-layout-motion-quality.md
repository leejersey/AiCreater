# Layout and Motion Quality Regression

Approved continuation: improve the agent's layout and motion rules using the failed RAG chapter, not by silently editing its retained source.

- [x] Reproduce RAG plan collisions in offline fixtures.
- [x] Add explicit, validated intentional-overlap declarations without changing historical design hashes.
- [x] Stop new generation before the code request on unsafe undeclared layout or caption-area intrusion.
- [x] Send conservative layout findings to code and repair prompts; add shared-parent, world-pose handoff and phase-boundary rules.
- [x] Return a fixed actionable layout-failure message through the worker/store boundary.
- [x] Complete regression checks and reload isolated workers. Node: 664 passed, 1 optional smoke skipped. PostgreSQL store/API: 20 passed. Scoped TypeScript check passed.
- [x] Separately authorize a bounded model run, reusing existing audio: task `3f65b9db-7553-4b81-839b-0f0ee4f01a61` stopped after one design request at layout preflight, without code or retries.
- [x] Distinguish explicitly classified stroke-only paths from solid plan bounds; preserve legacy hashes and caption safety. Offline replay reduces five findings to the one remaining solid intersection, without altering retained output.
- [x] Verify path-classification update: Node 667 passed, 1 optional smoke skipped; scoped TypeScript and diff checks passed. No provider calls in this update.
- [ ] Obtain separate authorization before another model run; render any new generated source only after exact-hash approval.

Follow-up: another authorized design-only run stopped on a missing cabinet/mouth assembly declaration. Added optional, validated permanent-part `parentId`; only direct assembly pairs are exempt, never siblings or caption bounds. No historical output inferred or rewritten. 52 scoped tests and TypeScript passed; no provider calls in this follow-up. Model compliance and rendered quality remain unverified.

Limits: plan rectangles do not prove source compliance or good aesthetics. Explicit depth declarations can describe intentional overlap but do not automatically validate it. Retained RAG source, audio, diagnostics and acceptance state remain unchanged.
