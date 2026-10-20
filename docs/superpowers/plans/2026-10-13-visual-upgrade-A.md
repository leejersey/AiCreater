# Visual upgrade A implementation plan

Approved scope: docs/superpowers/specs/2026-10-13-visual-upgrade-A.md; inline execution, no delegation/Git or paid calls.

- [x] RED: shared schema/Unicode/unsafe metadata, provider restoration and timing preservation, theme revision/frozen snapshot/no audio change, API strict body, rendering/layout and editor tests.
- [x] Add three theme IDs while keeping tech_explainer legacy unchanged; optional icon/step/highlight/source_label/panel_style fields. Shared Python/TS semantic checks and generated types. Keep topic role unchanged; conclusion is visual style, never early.
- [x] Central palette context shared by all seven existing templates; compose SVG icon, step badge, highlighted text, source label and conclusion panel. Reserve layout space only for enriched elements; no clipping or text loss. Legacy layout unchanged.
- [x] Store.set_theme + revision-checked PATCH /api/projects/{id}/theme; UI theme selection disabled for dirty/busy. Optional metadata editable through existing form/JSON; semantic edits require review as before. Generator prompt optional metadata, source restoration unchanged.
- [x] Run offline/integration/Node/typecheck/build. Use independent real-voiced scene copy to exercise API/UI/render for three themes, compare checksums/originals and count only render jobs.
- [x] Document receipt/limits. Deliver A only; B and C remain explicitly pending.

Completed A, pending user visual acceptance:126 offlinePython/83disposableDB/163Node/typecheck/build. Browser selected three themes on independent real-voiced QA copy;3local renders verified hashes and identical decoded audio, originals/oldversion unchanged,45→48attempts/0voice/generate. Evidence output/workbench/visual-A-qa/receipt.json;B/C remain pending. Pure decorative edits reused original timing/ready, no timing job needed. Only self-review, no Git commit or delegation.

No SQL/dependencies, paid providers, new templates, raw SVG/HTML/links or auto source inference. Added display fields fit only the four graphic templates; state/code/timeline theme tokens still supported. Source labels must literally occur in narration; label denotes script-described source, not independently verified retrieval. New theme IDs freeze style choices; retain legacy profile versions for additive backward-compatible fields, no breaking rewrite of old snapshots.
