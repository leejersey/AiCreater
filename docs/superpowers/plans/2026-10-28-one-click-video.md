# One-Click Video

Approved direction: one initial cost confirmation, then automatic source checks, restricted rendering and bounded repair. Do not remove execution controls while keeping the default render on the host.

- [x] Add a dedicated renderer image without environment files, private configuration or host directory mounts.
- [x] Run each automatic render in a fresh non-root container with network disabled, dropped capabilities, no-new-privileges, CPU/memory/PID limits and cancellation cleanup. Copy only the frozen job in and validated regular output files out.
- [x] Add create-video and render-video endpoints, retaining advanced explicit-hash preview separately. Refuse before model dispatch if the renderer image is unavailable.
- [x] Atomically queue isolated preview after automatic source generation; carry the exact frozen source hash internally.
- [x] Carry at most one explicitly authorized geometry-repair request, then automatically check the repaired source without renewing the repair allowance.
- [x] Replace the main source-approval action with generation; move source details behind a disclosure. Keep actual checks and failure states.
- [x] Regression tests: 60 backend/store/worker/route tests and 80 focused web/workbench tests passed (one opt-in integration skipped); renderer and web typechecks passed.
- [x] Build and verify the actual Linux renderer image.
- [x] Run the zero-provider isolation integration fixture through geometry checks, chapter MP4 and isolated course export. ffprobe confirms 1920x1080 video, audio stream and two-second duration.
- [x] Restart only the idle modified workbench/API and its workflow/render workers; verify HTTP 200 and both new endpoints. Original RAG course retains 66 jobs. An unconfirmed live request returns 422 with no new job.

Limits: this is container isolation, not a claim that arbitrary generated code is perfectly safe. The container has an ephemeral writable filesystem; no Docker socket or host source/media directories are mounted. Geometry acceptance is unchanged. Failures stop except for the specifically authorized bounded design-layout or rendered-geometry repair described below. Existing accepted courses and historical execution approvals are preserved. No paid provider requests are needed for this implementation verification.

## Design-Stage Closure

- Actual failed job a52cfb7e-460c-41d6-bd44-62be5255643c consumed one design call and no source call. The internal non-text intent-library pictograms were classified as an independent label, conflicting with classifier-shell. Do not waive label checks or move intentional internal artwork outside its owner.
- Automatic video jobs with one authorized repair now queue a targeted design revision on a first-call layout failure. The existing retained provider response and precise original diagnostics feed the revision. Only after full design checks pass is source requested; source success queues the existing isolated render.
- Budget invariant: first design (1) + design revision (1) + source (1) <= the original two base calls plus one extra repair. The revision child has zero remaining automatic repair allowance; subsequent layout/geometry failure stops. Terminal submissions are idempotent for the same parent.
- The previously stopped job is not retroactively charged or restarted. Its main UI action is Repair And Continue, using existing design/diagnostics, with a new explicit maximum-two-call confirmation and automatic isolated rendering on success. It does not request user coordinates or a fresh unrelated design.
- Newest design failure takes priority over older geometry repair history; the old unrelated repair-stopped banner no longer appears. Legacy public error text is normalized without mutating original stored evidence.
- Verification: 62 backend lifecycle/worker/route tests passed; 96 focused design/workbench/web tests passed, plus web and renderer type checks. No paid requests were dispatched while implementing this closure.

The existing dependency lock reports 12 npm audit advisories when installed in Linux (one moderate, ten high, one critical). Dependency upgrades were not folded into this workflow change, and no npm audit fix or forced upgrade was executed. This remains a separate security-hardening task; container isolation is defense in depth, not proof of perfect safety. Full new-topic paid generation was not run during this change.

Build: docker build -f docker/renderer.Dockerfile -t aicreater-renderer:local .

Opt-in test: RUN_ISOLATED_RENDER_TEST=1 node_modules/.bin/tsx --test packages/custom-scenes/tests/isolated-render-integration.test.ts
