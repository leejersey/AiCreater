# Scene Geometry Reliability

**Goal:** Correct the observed loop defects and automatically report comparable geometry failures in future renders.

**Architecture:** Preserve the original model sample. Add a locally corrected ReviewedLoop composition. A trusted render wrapper measures SVG text, declared obstacles, routes and moving anchors after fonts load. Store source-bound per-frame diagnostics in the render report and reject visual pass when diagnostics fail. This is geometric QA, not an aesthetic score or a security sandbox.

- [x] Add regression tests for path coordinates, source preservation, and audit integration.
- [x] Correct duplicate interpolation and move external labels into clear regions. Add explicit route/mover/obstacle metadata.
- [x] Add DOM geometry measurements and focused tests; inspect real browser results on original and corrected scenes.
- [x] Wire measurements into still rendering, source-bound reports and visual review gates.
- [x] Render original and corrected examples serially, inspect screenshots, verify preview and regressions.
- [x] Convert source-bound failed geometry reports into deduplicated revision prompts without a model request.

Evidence: original browser probes reproduced 31.49px and 94.42px path drift. Corrected render sampled 50 frames with zero reported issues and 32 declared path-follow checks. Reports remain in output/visual-agent/; these are local corrections, not proof of autonomous model quality.

Final verification: 607 tests passed; custom:typecheck and git diff --check passed. ReviewedLoop loaded in Chrome with no page errors. Inspected frames 0, 1154 and 2308; source/design/image-bound local review accepted. User aesthetic approval remains pending. The automatic revision-prompt CLI passed both real failed-report and regression checks; no provider call was made.

Subsequent user acceptance: the user explicitly confirmed the ReviewedLoop visuals in chat. This supersedes the pending user aesthetic status above for that sample only; autonomous generation and whole-video acceptance remain unproven.

No paid model calls. Whole-video integration and automatic model-source execution remain out of scope.
