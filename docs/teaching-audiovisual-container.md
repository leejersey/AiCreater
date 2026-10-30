# Isolated Audiovisual Rendering

Status: container rendering, durable post-draft audio-job dispatch and experimental
video/subtitle API publication are implemented. Workbench controls, production audio-first
admission and full acceptance remain open. This is not a new default or stable release.

## Frozen Contract

`teaching-audiovisual:1` binds an existing validated visual artifact, timeline/package
hashes, audio byte hash/length/duration/offset, exact measured captions, host line layout,
font coverage and audiovisual-renderer source hashes. The model does not supply any
rendering source, expression, coordinate or subtitle timing. Unknown fields, unsupported
glyphs, caption overflow, caption/content mismatch and audio overrun are rejected.

The visual artifact remains the inner deterministic artwork. The outer audiovisual
contract freezes the additional media rather than mutating a previously cached plan.
All outputs remain `accepted=false`. A changed runtime requires a new contract and an
explicitly updated isolated image, not silent acceptance of an old binding.

## Pipeline

1. The host validates the contract and audio bytes, then copies a frozen `audio.bin`
   into a fresh job. The existing container executor retains no network, host mounts,
   capabilities or provider credentials and preserves its ownership/cleanup rules.
2. The normal visual renderer completes still and continuous-frame audits first.
3. Chromium renders caption plates using the bound Chinese font. Every line's actual
   text and DOM bounds are checked inside the reserved y980–1076 band, below the scene.
4. FFmpeg composites in full-range RGB and converts once to output YUV; audio is padded
   and trimmed in 48 kHz samples with an exact 1600 samples per 30 fps frame offset.
5. The program checks actual video/audio streams, all decoded caption-band frames,
   caption-on/off boundaries and decoded waveform correlation at the frozen offset.
6. The host independently repeats returned visual/media/pixel/waveform checks. A failed
   check produces no success receipt. Diagnostic phase and original files are preserved.

`captions.srt` comes from the same frozen frame boundaries and host line layout. Its
exact bytes/hash are verified on return. There is no independently regenerated subtitle
track. Full-video speech quality and perceptual visual acceptance remain separate gates.

## Verification Scope

The explicit integration fixture is four seconds, 1920x1080/30 fps, Chinese captions,
one state-change diagram and a locally generated sine tone. No TTS, model provider,
existing course database, manually repaired lesson or blind topic is involved. It checks
all 120 caption-band frames and source-audio offset, not merely the existence of a track.
It is media infrastructure evidence, not automatic lesson-generation or quality success.

Development regression evidence preserves two rejected attempts: an output-frame cap
truncated audio, and mixed full/limited color ranges invalidated caption pixel matching.
The host renderer was fixed; no scene data, caption times or acceptance threshold was
manually altered to make a lesson pass. These are developer fixes, not autonomous recovery
successes. Higher-resolution pixel sampling retains fine Chinese strokes.

Limits: at most 120 captions, two readable lines per caption, bound glyph coverage,
1–120 second supported chapter timeline. Only the state-change audiovisual fixture has
been container-tested here; the six-structure/two-order matrix and unseen-topic tests
remain required. The new audiovisual code has not yet completed independent review.

## Checkpoint Evidence

- 31 contract/retiming/isolation lifecycle tests passed:
  `/tmp/teaching-av-unit-final.log`.
- Custom-scene type checking passed: `/tmp/teaching-av-types-final.log`.
- Final real audiovisual container fixture passed:
  `/tmp/teaching-av-final-real.log`; evidence folder `output/teaching-av-oW6HjA`.
  The MP4 and bound SRT are under that folder's UUID job `render/` directory.
- Real legacy silent-container compatibility fixture passed:
  `/tmp/teaching-av-silent-compat.log`.
- Original rejected development attempts remain in `output/teaching-av-B4mZSu`
  and `output/teaching-av-9Gjc5z`; they are not counted as successful generation.
- A prior successful audiovisual run was visually inspected via a decoded PNG in
  `output/teaching-av-PWPkg8/qa-frame.png`.

Zero model/TTS calls. No existing course/accepted video was changed. The teaching
renderer image alone was explicitly rebuilt; no service or default mode was switched.
The final check found no containers carrying the teaching-job label left behind.

## Durable Dispatch And API Checkpoint

Completed media bindings now automatically admit one audiovisual job into the existing
render queue. Frozen audiovisual data and the media-job reference are stored on the
render row; no extra model slot or source-generation stage is introduced. The worker uses
the existing owned subprocess/container bridge and publishes a joint video/SRT receipt.

A committed binding left behind before render admission is recovered by another worker
without rebinding or model I/O. A prior active or unconfirmed render blocks a different
admission. Unknown execution is not reclaimed. Cancellation, deadline and current-media
checks are repeated before publication. Changing the stored SRT invalidates the joint
receipt. Failed new versions retain the last verified video/SRT for readonly access;
`previous_video_ready` is distinct from the failed current job's `video_ready=false`.

The opt-in project-scoped API exposes POST/GET `/{teaching_id}/audio-binding` and
GET/HEAD `/{teaching_id}/subtitles` beside the existing video endpoint. The binding
endpoint uses existing audio only and performs no paid I/O. Client-supplied paths or
snapshots are rejected; responses omit raw artifacts, media paths and provider data.
These routes remain behind the teaching-plan experiment. They are not workbench buttons
or a default-mode cutover.

Playback state now exposes `playable_render_id`. Both the video and subtitle endpoints
accept an optional `render_id` scoped to the same project/root, so consumers can pin both
downloads to one receipt even if a newer render finishes between requests. An unknown
or foreign render is rejected; pinning does not bypass checksums or acceptance gates.
Without a pin, readonly requests select the last verified playable version. Failed-current
state remains separate from previous-playable availability.

The real PostgreSQL → free binding → owned bridge → Docker → media-publication test
passed (`/tmp/teaching-av-queue-real.log`) with a local PCM fixture and fake initial plan
provider. It is not an unseen-topic or actual-TTS acceptance. The API sequencing test
uses a fake renderer to isolate authentication/state/receipt behavior and is not counted
as a real-render success (`/tmp/teaching-av-api-green.log`).

Regression checkpoint: 35 connected queue/media/API tests passed with two explicit
container cases skipped (`/tmp/teaching-av-connected-regression.log`); 34 legacy render/
repair tests passed with two explicit container cases skipped
(`/tmp/teaching-av-legacy-regression.log`). Pinned-version API and previous-playable
assertions were separately rechecked (`/tmp/teaching-av-pinned-green.log`). Type checking
passed (`/tmp/teaching-av-connected-types.log`). Known admission I/O errors become terminal
admission failures rather than repeatedly attempting the same binding; the immutable
package remains saved (`/tmp/teaching-av-admission-green.log`).

No default/service switch or paid calls occurred. The new dispatch/publication changes
still require independent review and full two-order/six-structure acceptance. The main
workbench has not yet been given binding controls or pinned audiovisual download controls.
