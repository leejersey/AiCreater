# Teaching Plan Provider

`services.visual.teaching_provider.TeachingPlanProvider(settings, client=None)` is
a synchronous callable for `TeachingPipeline.run(..., invoke=provider)`.
It is independent of the legacy storyboard adapters. No worker, API route or
running service is wired or changed by this module.

## Settings

Reuse `services.workflow.providers.Settings`. Its existing attributes are
`model` and **`llm_key`**, not `api_key`. Direct construction does not read
environment variables or `.env` files, and does not require TTS credentials.

For explicit worker configuration, use `TeachingPlanProvider.from_env(values=None)`.
It reads only `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` from the supplied mapping,
or from `os.environ` when the argument is `None`. An explicit empty mapping does
not fall back to the process environment. It never loads `.env` or probes HTTP.
The model defaults to `deepseek-flash` for a missing/blank value; surrounding
spaces are trimmed. ASCII control characters (including newline, tab and DEL)
are rejected before trimming with safe `StoreError('teaching_provider_config', ...)`.
A missing/blank key raises safe `StoreError('teaching_executor_disabled', ...)`.
The factory constructs `Settings(key, model, '', '', '', '', '')` and returns a
provider, without enabling any API feature flag or changing a service.

For offline tests, construct the existing dataclass directly:

```python
from services.workflow.providers import Settings
from services.visual.teaching_provider import TeachingPlanProvider

settings = Settings(
    llm_key='test-only-not-a-real-key',
    model='deepseek-flash',
    tts_key='', app_id='', access_key='', resource_id='', speaker='',
)
# client must be an httpx.Client backed by httpx.MockTransport in tests.
provider = TeachingPlanProvider(settings, client=client)
```

`Settings.from_env(...)` belongs to the existing combined LLM/TTS workflow and
validates TTS configuration too; it is unnecessary for this independent adapter.
Constructing a provider performs no HTTP request.

## Contract

- Input is the unmodified Node host `teaching-host-request:1` object: `stage`
  (`plan` or `revision`), `inputSha256`, `requestSha256`, `prompt`, `outputSchema`,
  and `schemaVersion`. The complete object is serialized in the user message.
- The system message requires one semantic plan matching `outputSchema`; it
  forbids source code, coordinates, timing, tools and execution/audit claims.
- One invocation sends at most one POST to
  `https://api.deepseek.com/chat/completions`, with `response_format` set to
  `json_object`, `stream: false`, and `max_tokens: 8192`. Existing flash model
  names use `thinking: {type: disabled}`, consistent with the other adapters.
- Timeout is fixed at 60 seconds per HTTPX timeout phase, including for injected
  clients. Redirect following and client-level authentication flows are disabled.
  There is no retry, fallback, repair or revision loop in this class.
- Input serialization is bounded to 16 MiB. Responses must have status 200 and
  media type `application/json`; decoded response bytes are bounded to 1 MiB
  while reading, even without a Content-Length header.
- Exactly one choice must finish with `stop`, with an assistant message and
  string content. Tool/function calls, refusals, truncation and other finish
  reasons are rejected. No tool schema is sent.
- Both the envelope and content are parsed strictly: each must be a complete
  JSON object. Arrays/scalars, trailing text or multiple objects, duplicate keys,
  non-finite numbers, Markdown fences and DSML wrappers are rejected without
  stripping, extraction heuristics or repairs. JSON whitespace is allowed.
- Output is the parsed plan dictionary, not the provider envelope. Schema,
  semantic validation and hash bindings remain the offline Node host's job.
  This transport alone does not mean a plan is compiled or accepted.
- Admission, total call budget and revision eligibility remain exclusively with
  `TeachingTasks`. The adapter has no ledger access.

An internally created `httpx.Client` is closed after each invocation, including
failures. An injected client is not closed; its response is always closed.
Injected clients/transports must not implement their own retries or side-effect
hooks. Use `MockTransport` for offline tests.

All failures cross the public boundary as `StoreError` with a fixed message and
`teaching_provider_*` code. Provider bodies, keys and underlying exception
messages are not logged or included in the displayed exception chain.

## Offline Verification

From the repository root, with Node available on PATH:

```sh
.venv/bin/python -m unittest services.tests.test_teaching_provider -v
```

All HTTP exchanges in this suite use `MockTransport`; a guard blocks accidental
default HTTPTransport access. One test runs the real local Node host request
builder without calling a model. No `.env`, database, Docker, git, dependency
installation or running service is needed.
