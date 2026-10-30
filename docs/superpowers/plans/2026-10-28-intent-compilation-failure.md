# Actual Intent Compilation Failure

The user-triggered design revision job 1f8f643f-71ed-4ebb-9cd9-a8a2cef6856f used two model requests. Its design passed, but source compilation failed on undefined sheetY; no rendering occurred. Raw provider output, failure record and original source remain unchanged.

## Concrete Repair

- A separate manual offline candidate is saved at output/visual-agent/intent-revision-offline-v3.
- Frozen design, narration and cue times are unchanged. Fixed the undefined height, discontinuous lift, reverse insertion, incorrect whole-machine masking, tag clipping and missing route bindings. Preserved objects and labels; a visible branch selector follows its real route.
- Container rendering produced 27 zero-warning stills with 54 mover measurements and a 1920x1080 MP4 of 28.117 seconds. Frames 0,273,445,842 were visually inspected. Full audio/video decoding passed. This is a silent estimated-timing draft, not a voiced or accepted course chapter.
- Source, design and video hashes plus limitations are in provenance.json. No new model/TTS request was made, no production record was replaced, and no acceptance was registered.

## Program Changes

- SourceTypecheckError preserves bounded TypeScript diagnostic codes, line numbers and messages. A compiler failure is no longer reported as an undifferentiated execution failure.
- Future explicitly authorized code repair receives fresh compiler diagnostics alongside static motion findings. Repair feedback remains bounded and original artifacts remain retained.
- When the original automatic generation still has its one extra repair allowance, a compilation failure after two base calls can queue exactly one code repair. That repair has no remaining automatic allowance. A design repair that already consumed the shared extra call cannot also buy a code repair.
- Failure text no longer asks users to inspect local logs. The web UI does not duplicate the no-retry suffix or inherit an unrelated old geometry-repair stopped state for a newer failed generation.
- Scope limit: these changes do not establish reliable automatic visual generation. The real corrected MP4 is a manual revision and must not be described as automatic success.
- Verification: 63 backend store/worker/route tests, 80 focused web/workbench tests and six actual-sample/UI evidence tests passed. Renderer and web typechecks passed. Source files execute only in the restricted container during this repair; the final MP4 fully decodes and the original failed database task is unchanged.
- Renderer base is now pinned to the previously tested image digest to avoid a mutable Node tag silently replacing the runtime during a repair deployment.
