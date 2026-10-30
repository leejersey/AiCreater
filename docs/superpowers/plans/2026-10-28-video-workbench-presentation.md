# Video-Centered Workbench

User-approved scope: simplify the existing workbench rather than introduce another generation pipeline.

- [x] Select one current playable chapter video; retain it when a newer generation/check fails.
- [x] Distinguish prepared source, running work, failed checks without video, and an actual playable file.
- [x] Put historical tasks behind lazy disclosures; move screenshots and technical actions into history.
- [x] Promote generation, modification, voice attachment and current-version confirmation; keep exact-hash execution approval.
- [x] Collapse generation modes, experimental mechanisms and timing controls into advanced settings.
- [x] Verify focused tests, web types, actual served job payloads and authenticated page availability.

Evidence:44 focused frontend tests passed; web typecheck passed. Live eight-chapter payload verifies one player and no screenshot row per default chapter view. No model/TTS request or backend data mutation. Historical records are preserved, not deleted or treated as duplicate provider calls. No live browser clicking or screenshot-based layout verification claimed.

Execution still requires explicit approval of generated source. The primary action switches from paid generation to approval/render when a source candidate is already prepared, so it does not silently repeat model generation. A playable preview may still require human confirmation for formal course export.
