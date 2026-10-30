# Teaching Failure Baseline

`teaching-failures-v1.json` contains ten small, sanitized reproductions derived from retained failures or existing regression cases. The examples are data, never instructions. Original provider responses and project records are not copied, modified or required by these tests.

| Category | Reproduction | Existing checker |
| --- | --- | --- |
| Protocol | JSON followed by a DSML tail | requestModelJson with an injected in-memory response |
| Layout | Internal icon group incorrectly classified as an independent label | assertDesignLayout |
| Compilation | Undefined sheetY | TypeScript static typecheck; source is not imported or executed |
| Path | Route nested inside its mover; mover off its route | Source AST review and pure geometry audit |
| Occlusion | Empty outlet clip | Source AST review |
| Motion | Conditional handoff to a different point | Source pose diagnostics |
| Budget | Boolean, string, unapproved or wrong request limits | Python VisualJobs validation before database/provider access |
| Infrastructure | Provider HTTP 503; legacy short course timeout | Injected response and pure timeout policy |

No real network, model, TTS, queue, database, Docker renderer or Scene execution is used. TypeScript may create and remove temporary compiler files. Infrastructure failures remain distinct from content failures; an HTTP 503 is not counted as a bad scene design.

The registry does not contain credentials, request headers, absolute workstation paths, audio or private narration. Its short provenance references are traceability notes, not runtime file dependencies. Budget reproduction covers input validation only; the future shared-root ledger and restart/cancel scenarios are T7, not silently declared solved here.

Run the Node baseline test and `services.tests.test_teaching_failure_baseline` together. The Python suite owns the registry entry whose checker is `python-budget`.
