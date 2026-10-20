# Read-only render info implementation — completed

User approved spec and authorized implementation. Self-review only: no authorized delegation/Git metadata, no dependencies.

- [x] 5offline endpoint tests red404 then green: success,4non-success states, bad/missing checksum, non-render/unknown/invalidID. Assert no private input and onlyJobs.get; no recovery/submission/file/storage side effects.
- [x] MinimalGET /api/renders/{job_id} in services/api/app.py usingpublic_job and fixedfiles URLs, valid64lowercaseSHA256 only. No SQL/worker/frontend/schema changes.
- [x] Fresh120offline Python+77temporaryPostgreSQL/API/jobs tests pass. Real DB queued query retains0attempts; existing download/cancel compatibility remains. No user DB used for tests; unchangedNode/build not repeated.
- [x] APIidentity/CWD and zeroactive checked; gracefulAPI-only restart23364→37066, healthready. Existingrender2b6394d9-c28e-4655-b97e-8a8b77d32a08 returns2download paths/checksums, jobs44→44/attempts44→44/no newprovider/render. Backupoutput/workbench/services-before-render-info.json, proofoutput/workbench/render-info-qa/{receipt.json,info.json}.
- [x] README/contract/spec/followup updated. No commit possible withoutGit metadata.

Limit: info is published metadata, not proof file remains local. Actualfiles download still verifies/restores/checksums. No newpaid20cases/nums pronunciation, single-sceneasyncpreview stillpending.
