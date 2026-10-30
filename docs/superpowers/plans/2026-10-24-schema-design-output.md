# Schema-Constrained Design Output

Approved continuation: local implementation and offline verification only. No provider generation requests, no TTS and no new source execution.

- [x] Verify official provider support: Chat Completions JSON mode guarantees JSON syntax, while Responses documents text.format=json_schema. Do not send unsupported json_schema response_format to Chat Completions or silently retry another endpoint.
- [x] Define an explicit new-design output schema, shared with the design prompt. New object records require states; every change requires descriptive from/to and reference fromState/toState. Bind exact brief and measured cues; bound objects/arrays; reject extra keys.
- [x] Route schema-bearing requests through Responses and validate returned JSON locally with existing AJV. Keep code generation/repair on the current Chat Completions path. Preserve raw output before rejecting truncation/schema mismatch; never execute a function call or automatically fall back.
- [x] Wire the workbench and standalone design CLI, and retain protocol/schema in private workbench request records.
- [x] Verify mocked request bodies, missing/extra fields, HTTP failure, incomplete/refusal/tool output and no retries. Targeted tests: 67 passed; scoped TypeScript passed.
- [x] Full Node regression: 685 passed, 1 optional smoke skipped, 0 failed (schema-output-node-tests.log). Backend scoped tests: 16 passed. Scoped TypeScript, historical hash and diff checks passed. API/web ready with no active project tasks. No provider/TTS requests.

Limits: real Responses/schema capability for the configured model has not been exercised with credentials. A rejected schema/unsupported model stops after that one request. JSON Schema does not prove state reference semantics, cross-beat continuity, layout, factual accuracy or aesthetics; existing parser/layout/source/hash/render/review gates remain. Historical artifacts are not upgraded or rewritten.

Subsequent separately authorized live test: `7b5fdb80-49dd-421e-abaa-3949d001160e` used one Responses design request; complete output passed local AJV Schema validation. Thus the configured provider accepted this schema in this run. The semantic parser rejected one step-3-label state discontinuity; no code call, layout approval or visual acceptance followed. No automatic retry or artifact rewrite.

References checked 2026-10-24:
- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/api/create-response/
