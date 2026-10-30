# Full Course Generation Run

User authorized at most 12 model requests, no retries. Use existing measured audio, preserve the accepted two-chapter assembly, and do not merge failed new chapters into a final lesson.

- [x] Prepare six immutable briefs and 22 measured cues.
- [x] Dispatch exactly six design requests. Four original results passed schema; tools and delegation failed. All raw responses retained.
- [x] Review design semantics and geometry. Record local corrections separately for tools, code-search, delegation-safety and ending; no extra model requests. Opening docking risk remains for actual-frame review.
- [x] Dispatch exactly six code requests, no retries. All twelve provider responses finished with stop; transport success is not artifact acceptance.
- [x] Finish local compile/structure-only corrections, retaining original responses and explicit provenance.
- [x] Inspect actual stills and geometry reports serially for all six candidates. Fix checker false positives with regression tests, not by weakening known-issue gates.
- [x] Save source/design-bound revise records and prompts for failed geometry. Report failures honestly; whole-course assembly is allowed only after new chapters pass review.
- [x] Freeze eight reviewed chapters with the original 33 measured audio clips; verify all hashes and narration cues.
- [x] Start a full-course local preview and export MP4/SRT to a separate output directory.
- [x] Verify final media metadata and late-course audio timing, then record remaining human visual/listening acceptance.

Current evidence and per-stage artifacts are in output/visual-agent/full-course-inputs/. This run is a bounded generation-quality test, not proof that the agent reliably reaches the accepted hand-reviewed baseline. No request beyond twelve is authorized.

## Local Review Phase

- Exactly 12 provider responses retained, all finishReason=stop. No provider retry. See paid-run-ledger.json.
- First diagnostic renders: opening20, less32, tools26, search20, delegation26, ending19 frames. All had reported findings; these are occurrences, not counts of distinct real defects. Less included 32 false positives from an invisible font-size-zero placeholder.
- Fixed the audit false positive with red/green regression coverage; nonfinite/negative text boxes still fail. Physical obstacles are not discarded.
- Separate local visual corrections retain original sources and immutable narration/cues. Re-rendering is in progress, with source hashes and provenance; it must not be represented as original model output quality.
- Fed observed failures back into future design/code prompts: positive parking boxes, common route endpoints, changed query before changed result, identity continuity, sub-phase completion inside cue, typed helpers and exact artifact keys. Tests prove presence and contracts, not better model output; no paid calls were made to validate the updated prompts.
- Added a 2 MiB bounded frozen-course manifest reader without changing 256 KiB single-scene input limits. Added bounded duration-aware local rendering cancellation (10 minute floor, 4x runtime, 30 minute cap); both had failing regression tests before implementation.
- Final six local revisions have zero sampled geometry findings, source/design/image-bound local reviews and explicit provenance. Safety gate additionally verifies blocked, cleared and passed states; it is not a security-policy implementation.
- Verification: 633 repository tests pass with the project's .venv Python on PATH; 16 local visual regression tests pass, including every-frame paper/post/shutter collision checks; scoped custom-scene TypeScript check passes. The system Python lacks jsonschema, so use the existing project environment rather than interpreting those dependency failures as product regressions.
- Eight-chapter frozen assembly hash: 26069e2332d2e233404cd425caf784b22a7ab3ac9c425f4b81b9b5dd4e664b67. 11743 frames, 30 fps, all eight source/design-bound reviews pass. Local preview at localhost:3101/ReviewedAssembly was reloaded and late-course seeking showed the ending chapter with its matching caption.
- Assembly inspection caught a 49-character caption leaving its punctuation alone on a second line, plus tight CJK glyph line height. Added a failing caption regression before balancing lines and explicitly rendering each row in a 96px caption-safe band with 45px line height. Browser measurement now reports scrollHeight=clientHeight=96 with both rows contained. The initial full render was cancelled and marked non-deliverable; the separate v2 export preserves the original audio and SRT timing.

## Final Delivery

- Output: output/visual-agent/full-course-render-v2/video.mp4 and video.srt; 81 stills, render report, timeline and audio-check.json retained in the same directory.
- ffprobe: H.264, 1920x1080, 30/1 fps, 11743 video frames; AAC 48000Hz stereo; duration 391.445 seconds; size 42590192 bytes.
- All 33 sentence captions are present verbatim in the SRT. The display balances long cues into two explicit rows; timing records are unchanged. No English word is split across the display rows in this course.
- Full-decode 8000Hz mono PCM cross-correlation checks the first and last audio clip of all eight chapters (16 samples): minimum correlation 0.9903076912, maximum absolute offset 0.375ms. Compressed-input seeking initially produced a false mismatch; full decoding before window slicing resolved it without changing the video.
- Exactly 12 paid model requests total for this run, zero retries and zero additional requests for local correction/export. Human acceptance of the full course's visuals, semantics and listening remains pending. This is model generation plus local coding-agent revision, not autonomous-model quality acceptance; the production generation queue is unchanged.
