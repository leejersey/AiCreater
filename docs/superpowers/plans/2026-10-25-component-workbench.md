# Optional host-components workflow

Goal: expose the existing compact component experiment through the workbench without switching defaults or claiming automatic visual acceptance.

1. TS core: add host-components mode. Reuse compact design origin binding and original intent/assembly provenance and approval gates. Freeze the raw component envelope as frozen-intent.json; validate its mode/version, design hash, drawing, motion and straight-route preflight before assembly. Hash the exact validated envelope, not a converted payload.
2. Preserve read/repair/preview/export reconstruction. Repair inherits mode, reuses verified design, sends exactly one component request with retained data and feedback. Failed preflight retains raw provider output and design, no execution or silent fallback.
3. Python API/store/worker: optional new mode, same assembly+intent hash requirements as host-intent, default unchanged, revision/cost/approval guards unchanged.
4. Frontend: experimental selector and truthful confirmation; retain mode validation and both provenance hashes.
5. Add focused tests for full two-request generation, single-request repair, bad routes before source generation, wrong version/mode, hash tampering and existing-mode compatibility. Run offline tests/typechecks. No paid requests, Scene execution, automatic baseline adoption or service restart in this step.

Work allocation: parent edits TS workbench/CLI and core tests. Independent workers edit Python services/tests and web UI/tests respectively. No shared write files. No commits requested.
