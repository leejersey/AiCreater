# State and Independent Label Contract

Approved continuation: implement offline design constraints, no provider requests and no execution of new generated source.

- [x] Add optional bounded object states and fromState/toState references. Reject unknown/partial references, duplicate states and discontinuous transitions across ordered beats.
- [x] Preserve historical text-only designs and canonical hashes without inserting new fields.
- [x] Add kind=label for independent labels/status markers. Check any positive rectangle intersection with non-path artwork, without overlap or assembly exemptions. Keep caption safety; disallow label assembly parenting.
- [x] Update both design/code prompts; state variants keep one physical ID, and independent labels reserve readable space.
- [x] Verify targeted tests, historical hash and read-only replay of five step-marker collisions. Full Node regression: 679 passed, 1 optional smoke skipped, 0 failed. Backend scoped tests: 16 passed. Scoped TypeScript and diff checks passed. API/web ready with no active project tasks.

Limits: legacy objects may omit states/kind. State-reference checks apply when states are declared; this is not a new-version migration that forces all old/new records to carry states. The parser cannot determine that two differently named objects describe the same physical thing, or that a solid is actually a mislabeled label. Source can ignore a plan; actual rendering and human review remain required. Paths still use rendered stroke geometry rather than rectangle collision checks. No original model output is rewritten or accepted by this change.
