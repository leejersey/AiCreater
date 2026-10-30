# Reviewed Scene Assembly Implementation Plan

**Goal:** Produce a two-chapter local Remotion preview, narrated MP4 and matching SRT without model requests.

**Architecture:** Keep production DSL and worker unchanged. Freeze explicitly approved source and measured media into a local directory, derive one chapter/caption/audio timeline, generate a trusted host entry and revalidate frozen inputs before render.

**Tech Stack:** Existing TypeScript, React, Remotion, FFmpeg/ffprobe; no dependencies.

User approved this scope with “实施”. Reuse current feature checkout and preserve its uncommitted work. Do not commit, push, or invoke providers.

## Tasks

- [x] Pure timeline and SRT: add packages/custom-scenes/src/assembly.ts and tests/assembly.test.ts. First prove missing implementation; then test measured rebasing, pause retention, source/design approval, cue mismatch, duplicate chapters and media paths.
- [x] Frozen assembly preparation: add packages/custom-scenes/src/assembly-files.ts, tests/assembly-files.test.ts and scripts/assemble-scenes.ts. First test missing implementation; freeze artifact/design/review/media, verify hashes, reject changed files and collisions. Generate entry with host-owned narration and captions.
- [x] Host: add packages/custom-scenes/src/AssemblyVideo.tsx. Render local-frame scenes in Sequence; captions use measured cue windows and deterministic text wrapping, never estimated word timing. Narration uses measured clip starts.
- [x] Render/preview: extend assembly CLI to render stills, MP4 and SRT to a new output directory after frozen-source and media checks. Bound render time and close browser. Expose generated entry for Remotion Studio.
- [x] Actual two-chapter integration: use ReviewedLoop plus GeneratedContext; latter remains pending user visual acceptance. Inspect chapter boundaries and caption changes, verify media streams/duration and sampled audio alignment. Record limits honestly.
- [x] Verify focused tests, scoped typecheck, existing regressions and browser errors. Update docs and evidence.
- [x] User listening/visual acceptance of the assembled two-chapter result: subsequent user response “没问题 继续”. Recorded against the frozen assembly hash in output/visual-agent/two-chapter-render/user-acceptance.json. No tool for semantic listening was used; user confirmation is separate from signal checks.

Commands: node --import tsx --test packages/custom-scenes/tests/assembly*.test.ts; npm run custom:typecheck; PATH="$PWD/.venv/bin:$PATH" npm test. Expected all green. CLI integration also tests wrong approval, media tampering and existing output without rendering.

## Evidence

- 628 full tests passed (21 assembly tests), 0 failures; custom:typecheck passed. Test log /tmp/aicreater-assembly-final-tests.log.
- Render output/visual-agent/two-chapter-render: 26 PNGs, narrated 1920x1080 MP4, 11-cue SRT and frozen timeline. Duration 102.741s vs expected 3082/30s. New strict finite-duration helper revalidated the completed output after an earlier process loaded the old helper.
- Input hash 2d542a3eefcf3ca9fd25339951cf4e2bc8e4224e3c19c2b5d0d3ad1c1e340825; original approved loop source unchanged.
- Browser crossed frame2309 into the next chapter with correct caption/audio source; zero page errors. Preview remains at http://localhost:3101/ReviewedAssembly.
- PCM normalized cross-correlation: 8kHz mono, 0.5-second window starting 0.5s into four clips, search +/-200ms at one-sample resolution. Correlations 0.9999873/0.9999729/0.9954471/0.9999752 and offsets 0/0/0.375/0ms. Earlier coarse 1ms search missed the submillisecond peak; no source or timeline retiming was needed.
- Independent review closed non-adjacent manifest, newline caption and nonfinite-duration findings. No outstanding code blocker found. No paid calls, production routing, model-generation batch or sandbox changes.
