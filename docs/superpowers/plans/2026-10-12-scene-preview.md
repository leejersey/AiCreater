# Scene preview implementation plan — completed

Approved spec/user confirmation, direct TDD/self-review; no Git/delegation. No SQL/queue/dependency/template changes.

- [x] Red jobs/API/UI: missing submit_preview/route/canPreview; unknown render protocol unexpectedly ran. Tests first exposed required behavior.
- [x] Locked ready scene/revision, filtered one audio asset and scene, final+asset validation, deterministic frozen snapshot checksum/id; only durable job-owned scene-preview:1/kind render, no fake ordinary version rows.
- [x] Ordinary snapshot-render:1 intact; worker/child/publisher reject unknown protocol. Preview result scene metadata/checksum, ordinary result version_id unchanged; original attempts/cancel/files fences reused.
- [x] API/public scope and ready+saved button, existing Player retained, preview task label, local render retry prompt.
- [x] First regression had API queued-job cleanup omission, contaminating shared suite, and count of all historical versions. Corrected test isolation/project count, production claim unchanged. Fresh120offline Python+81disposableDB,156Node,typecheck/webbuild passed.
- [x] Idle identity/CWD/44attempts/0active verified, API/render/beat graceful restart. Initial script assumed celery_app; verified actual services.workflow.queue before stopping, corrected without side effects. Backup output/workbench/services-before-scene-preview.json.
- [x] Independent project c279fd40-f1a9-4df7-af36-f443d89f6166 with other scene needs_voice. Browser button disabled there, enabled selected ready scene1d460b2a-058c-4302-9fce-b6957dddbf98; one click job1bd289bd-ad91-42c8-be18-20d045a02da4 succeeded/attempt1.44→45 onlyrender. No model/voice/retry.
- [x] Output output/workbench/scene-preview-qa/preview.mp4,preview.srt,receipt.json,info.json,probe.json,opening.png,workbench.png.562frames/1080p/30fps/18.752s/8subtitles; downloaded SHA and full decode pass. Frozen checksum recalculated; scope and scene revision match, no false version_id. SourceWAV checksum and both source/test project unchanged, zero normal version rows for copy.0.5s actual frame shows topic, no obvious overlap/clipping.
- [x] ffmpeg-ss .5 invalid on current binary;0.5 fixed and repeated read-only verification, no second render. Browser development warning traced to Tabbit-injected data-tabbit-tray-* hydration attrs; not suppressed/modified in app. Finished task, retained QA tab.
- [x] Docs/contract/followup reflect scope and limitations; no independent review claimed.

Limits: ready only, assets verified, needs_voice/needs_timing no automatic paid fallback. Preview occupies render lane; numbering1/1 is selected scope, old whole-project versions immutable. nums voice/20paid acceptance/quantified sync/billing/licensing still separate.
