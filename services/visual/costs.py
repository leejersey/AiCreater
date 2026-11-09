"""What a course has used so far, and what the next Agent run may use at most.

Voice is priced with the checked TTS rate (services.projects.estimates). DeepSeek prices are not kept in code: set
DEEPSEEK_PRICE_INPUT / DEEPSEEK_PRICE_CACHED_INPUT / DEEPSEEK_PRICE_OUTPUT (CNY per million tokens, from your provider's
price page) to see yuan; without them only token counts are shown. A course owner's own model is billed by their
provider, so it is never priced here."""
import json
import os
from decimal import Decimal, InvalidOperation

from services.projects.estimates import TTS_RATES, _amount
from services.projects.store import ROOT
from services.visual.store import AGENT_MODEL

PRICE_KEYS = {'input': 'DEEPSEEK_PRICE_INPUT', 'cached_input': 'DEEPSEEK_PRICE_CACHED_INPUT', 'output': 'DEEPSEEK_PRICE_OUTPUT'}


def deepseek_prices(env=None):
    """CNY per million tokens, or None unless all three are set to valid non-negative numbers."""
    env = os.environ if env is None else env
    try: prices = {k: Decimal(env.get(name, '').strip()) for k, name in PRICE_KEYS.items()}
    except InvalidOperation: return None
    return prices if all(p.is_finite() and p >= 0 for p in prices.values()) else None


def agent_output_cap():
    """The configured Agent's output-token budget per run (its cost ceiling for output)."""
    models = json.loads((ROOT / 'packages/scene-agent/models.json').read_text(encoding='utf-8'))
    return int(models[AGENT_MODEL]['budget']['maxOutputTokensTotal'])


def course_costs(store, project_id, env=None):
    prices = deepseek_prices(env)
    with store.connection() as conn:
        store._read(conn, project_id)
        voices = conn.execute("""SELECT input FROM jobs WHERE project_id=%s AND kind='voice' AND state='succeeded'""", [project_id]).fetchall()
        agents = conn.execute("""SELECT input,result FROM jobs WHERE project_id=%s AND kind='agent' AND result ? 'usage'""", [project_id]).fetchall()
    characters = sum(len(((v['input'] or {}).get('scene') or {}).get('narration', {}).get('text', '')) for v in voices)
    server = {'input': 0, 'cached_input': 0, 'output': 0}; own = {'input': 0, 'cached_input': 0, 'output': 0}
    for row in agents:
        usage = (row['result'] or {}).get('usage') or {}
        bucket = own if ((row['input'] or {}).get('llm') or {}).get('source') == 'account' else server
        bucket['input'] += int(usage.get('inputTokens') or 0); bucket['cached_input'] += int(usage.get('cachedInputTokens') or 0)
        bucket['output'] += int(usage.get('outputTokens') or 0)
    def priced(tokens):
        if prices is None: return None
        fresh = max(tokens['input'] - tokens['cached_input'], 0)
        return _amount((Decimal(fresh) * prices['input'] + Decimal(tokens['cached_input']) * prices['cached_input']
                        + Decimal(tokens['output']) * prices['output']) / Decimal(1_000_000))
    cap = agent_output_cap()
    return {'voice': {'characters': characters, 'cny': _amount(Decimal(characters) * Decimal(TTS_RATES['per_10000']) / Decimal(10000))},
            'agent': {'server': {**server, 'cny': priced(server)}, 'own_model': own},
            'prices': {'deepseek_configured': prices is not None},
            'next_agent': {'max_output_tokens': cap,
                           'max_output_cny': _amount(Decimal(cap) * prices['output'] / Decimal(1_000_000)) if prices else None}}
