"""Token use of the content model calls (topics, breakdowns, manuscripts, hooks, polishing…), for 个人中心 and the
cost hints before a paid call. Observations only, never a supplier bill: yuan are shown only with the DeepSeek prices
configured in .env (services.visual.costs), and an account's own model is billed by its own provider.

The API and the runner install a sink writing to the llm_usage table; without one (tests, scripts) nothing is kept.
The person is taken from the call (user_id) or from the request the call runs in (request_scope, filled by the API's
access check)."""
import contextvars
import logging

log = logging.getLogger(__name__)
request_scope = contextvars.ContextVar('usage_request_scope', default=None)
_sink = None


def install(store):
    """Keep usage rows in `store` (one short insert per call; a failure never fails the call)."""
    global _sink
    def sink(row):
        with store.connection() as conn:
            conn.execute('''INSERT INTO llm_usage(owner_id, kind, source, model, input, cached_input, output)
                VALUES (%(owner_id)s, %(kind)s, %(source)s, %(model)s, %(input)s, %(cached_input)s, %(output)s)''', row)
    _sink = sink


def uninstall():
    global _sink
    _sink = None


def tokens(payload):
    """(input, cached input, output) from an OpenAI-compatible response body, or None."""
    usage = payload.get('usage') if isinstance(payload, dict) else None
    if not isinstance(usage, dict): return None
    def count(v): return v if type(v) is int and v >= 0 else 0
    cached = count(usage.get('prompt_cache_hit_tokens')) or count((usage.get('prompt_tokens_details') or {}).get('cached_tokens'))
    return count(usage.get('prompt_tokens')), cached, count(usage.get('completion_tokens'))


def record(llm, kind, response, user_id=None):
    if _sink is None: return
    try:
        counted = tokens(response.json())
        if not counted or not any(counted): return
        scope = request_scope.get() or {}
        owner = user_id or scope.get('user_id')
        _sink({'owner_id': str(owner) if owner else None, 'kind': str(kind)[:40], 'source': 'account' if llm.source == 'account' else 'server',
               'model': str(llm.model)[:100], 'input': counted[0], 'cached_input': counted[1], 'output': counted[2]})
    except Exception as problem:  # usage is a nicety: never fail the call for it
        log.warning('event=usage_record_failed kind=%s error=%s', kind, type(problem).__name__)


class RequestScope:
    """ASGI middleware: one usage scope per request, so calls made while serving it know whose they are."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http': return await self.app(scope, receive, send)
        token = request_scope.set({})
        try: await self.app(scope, receive, send)
        finally: request_scope.reset(token)
