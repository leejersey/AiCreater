# Visual Workbench Integration

User approved direct integration of manuscript -> visual design -> scene code -> checks/revision -> preview -> voice/export. Implementation orders measured voice before visual code to prevent paid regeneration and time drift. The primary course route becomes the bespoke workbench; old template editing remains at an explicit legacy route, never an automatic fallback.

## Workflow

1. Existing project creation/authentication remains. New main course page loads a bespoke workbench. Prepare splits a new manuscript into narration chapters locally; existing chapter narration/audio is reused. Placeholder DSL exists only to reuse the proven voice/alignment jobs and is never presented as bespoke visuals.
2. Voice uses the existing explicit cost confirmation and queue. Ready scene captions determine immutable measured cues; no character-count audio timing.
3. Generate is an explicit maximum-two-request operation: visual design, then TSX. No automatic retries. A separate repair operation consumes at most one new explicitly confirmed request. Raw provider responses remain private, successes and failures retained.
4. Generated source, design and exact source hash appear for review. Source execution needs a separate explicit approval of that exact hash. A local render child receives no provider credentials. It is NOT a security sandbox; disclose this before approval. Source never executes inside the authenticated web origin.
5. Preview renders SVG geometry stills and a measured-audio MP4. Failed geometry blocks acceptance/export; no silent template fallback. First/middle/final frames are available for human review. Acceptance binds source/design/media fingerprint and current scene revision.
6. Export requires one current accepted preview per current chapter, freezes their sources/audio/captions, and renders a single composition to avoid audio concatenation drift. MP4 and SRT are authenticated downloads.

## Boundaries

New durable visual_jobs table, separate from existing template jobs, with queued/running/succeeded/failed/cancelled states, attempt fencing, heartbeat timeout, explicit cancellation and no automatic retries. Reuse Celery workflow/render lanes. Project owner authorization includes project_id on every visual route and additionally checks visual job belongs to it. No credentials or arbitrary filesystem paths cross the API. Revision/media fingerprint changes invalidate old generated scenes and approvals.

Existing original-directory stack is untouched. Changes and service reloads target the independent visual-lab stack only. No paid model/TTS test is authorized by implementation consent; real external validation needs a new bounded authorization.

## Shared Contract

API prefix `/api/projects/{project_id}/visual`:
- GET -> `{jobs:VisualJob[]}`; VisualJob `{id,project_id,scene_id,kind,state,stage,error,created_at,result,input_summary}`; result contains no absolute paths or provider responses.
- POST `/prepare` `{expected_revision}` -> existing Project. Only empty projects are populated; maximum20 chapters, maximum800 narration codepoints per chapter. No model.
- POST `/generate` `{scene_id,expected_revision,confirmed:true,max_requests:2}` -> VisualJob.
- POST `/{visual_id}/repair` `{confirmed:true,max_requests:1,feedback}` -> VisualJob.
- POST `/{visual_id}/preview` `{confirmed:true,sha256}` -> VisualJob; exact generated source approval, local execution warning.
- POST `/{visual_id}/accept` `{confirmed:true,sha256}` -> VisualJob; only geometry-passed current previews.
- POST `/export` `{expected_revision,confirmed:true}` -> VisualJob; all current chapter previews must be accepted.
- POST `/{visual_id}/cancel` `{}` -> VisualJob.
- GET `/{visual_id}/files/{name:path}` -> allowlisted frozen files with checked hashes, never arbitrary paths. `source.txt`, `design.json`, `stills/frame-N.png`, `video.mp4`, `video.srt`.

Node entry `scripts/visual-workbench.ts <generate|repair|preview|export> <input.json> <new-output-directory>` writes `result.json`; stdout only a small status. Inputs:
- generate: `{brief,cues}`. Result `{sha256,design_sha256,source,rationale,design,requests_dispatched}`; stores `artifact.json`, `artifact.json.design.json`, `source.txt`, `design.json`, provider responses.
- repair: `{previous_directory,feedback}`; reuse frozen design, previous source, bounded feedback; one request. Same generation result.
- preview: `{generation_directory,sha256,scene,audio_file}`; scene includes duration_frames, narration.audio_start_frame, captions. Copies verified audio supplied by parent. Result `{sha256,design_sha256,geometry,frames,frame_hashes,video?,srt?}`; frames relative `stills/frame-N.png`. Geometry failure still returns diagnostic result but no accepted movie.
- export: `{chapters:[{generation_directory,sha256,scene,audio_file}]}`. Result `{video:'video.mp4',srt:'video.srt',durationInFrames}`. A single course render with local Scene frame and host-owned real audio/captions.

Directories are parent-validated UUID-owned paths under output/visual-workbench; API input cannot select them. Node uses existing strict parsers, model adapter, typecheckSource, geometry render harness and approved coding reference. Exact hash checks before importing source. Each request is recorded to request-count.json BEFORE dispatch. No test-only fixture mode exposed through the production CLI.
