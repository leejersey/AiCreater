"""What is running for an account (the task tray) and what it has used (个人中心, cost hints before paid calls).

Tasks: course jobs (voice, timing, Agent, export, restyle) and breakdowns that are queued or running, plus those that
ended in the last RECENT_MINUTES so the page can say they finished. Usage: voice priced with the checked TTS rate,
Agent and content-model tokens priced only with the DeepSeek prices configured in .env; an account's own model is
counted but never priced (its provider bills it)."""
from datetime import date, datetime, time, timezone
from decimal import Decimal

from services.projects.estimates import TTS_RATES, _amount
from services.visual.costs import deepseek_prices

RECENT_MINUTES = 15
JOB_LABELS = {'voice': '配音', 'timing': '实测对齐', 'agent': 'Agent 生成画面', 'export': '整课导出', 'restyle': '换主题重渲染'}
AVERAGE_OF = 10


def _iso(value):
    return value.isoformat() if value else None


def tasks(store, owner_id):
    owner = 'p.owner_id=%s' if owner_id else 'p.owner_id IS NULL'
    args = [owner_id] if owner_id else []
    with store.connection() as conn:
        jobs = conn.execute(f'''SELECT j.id, j.kind, j.state, j.project_id, j.scene_id, j.created_at, j.started_at, j.ended_at, p.title,
                (SELECT count(*) FROM scenes o JOIN scenes s ON s.id=j.scene_id WHERE o.project_id=s.project_id AND o.deleted_at IS NULL
                 AND o.position<=s.position) AS chapter
            FROM jobs j JOIN projects p ON p.id=j.project_id
            WHERE {owner} AND (j.state IN ('queued','running') OR j.ended_at > now() - %s::interval)
            ORDER BY j.created_at DESC LIMIT 40''', args + [f'{RECENT_MINUTES} minutes']).fetchall()
        owner_b = 'owner_id=%s' if owner_id else 'owner_id IS NULL'
        breakdowns = conn.execute(f'''SELECT id, state, source, created_at, started_at, finished_at FROM breakdowns
            WHERE {owner_b} AND (state IN ('queued','running') OR finished_at > now() - %s::interval)
            ORDER BY created_at DESC LIMIT 20''', args + [f'{RECENT_MINUTES} minutes']).fetchall()
    out = [{'id': str(j['id']), 'kind': j['kind'], 'state': j['state'],
            'label': JOB_LABELS.get(j['kind'], j['kind']) + (f' · 第 {j["chapter"]} 章' if j['scene_id'] and j['chapter'] else ''),
            'title': j['title'], 'href': f'/courses/{j["project_id"]}', 'created_at': _iso(j['created_at']),
            'started_at': _iso(j['started_at']), 'ended_at': _iso(j['ended_at'])} for j in jobs]
    out += [{'id': str(b['id']), 'kind': 'breakdown', 'state': b['state'], 'label': '拆解对标', 'title': b['source'].get('title') or '未命名',
             'href': '/studio?tab=breakdowns', 'created_at': _iso(b['created_at']), 'started_at': _iso(b['started_at']),
             'ended_at': _iso(b['finished_at'])} for b in breakdowns]
    out.sort(key=lambda t: t['created_at'] or '', reverse=True)
    return {'tasks': out, 'active': sum(t['state'] in ('queued', 'running') for t in out)}


def _priced(prices, fresh, cached, output):
    if prices is None: return None
    return (Decimal(fresh) * prices['input'] + Decimal(cached) * prices['cached_input'] + Decimal(output) * prices['output']) / Decimal(1_000_000)


def usage(store, owner_id, *, today=None, env=None):
    """Today's and this month's use: voice yuan, Agent and content tokens (yuan for the server model when priced)."""
    prices = deepseek_prices(env)
    today = today or date.today()
    starts = {'today': datetime.combine(today, time.min).astimezone(timezone.utc),
              'month': datetime.combine(today.replace(day=1), time.min).astimezone(timezone.utc)}
    owner = 'p.owner_id=%s' if owner_id else 'p.owner_id IS NULL'
    owner_u = 'owner_id=%s' if owner_id else 'owner_id IS NULL'
    args = [owner_id] if owner_id else []
    out = {'prices': {'deepseek_configured': prices is not None}}
    with store.connection() as conn:
        for period, start in starts.items():
            voices = conn.execute(f'''SELECT j.input FROM jobs j JOIN projects p ON p.id=j.project_id
                WHERE {owner} AND j.kind='voice' AND j.state='succeeded' AND j.ended_at >= %s''', args + [start]).fetchall()
            agents = conn.execute(f'''SELECT j.input, j.result FROM jobs j JOIN projects p ON p.id=j.project_id
                WHERE {owner} AND j.kind='agent' AND j.result ? 'usage' AND j.ended_at >= %s''', args + [start]).fetchall()
            content = conn.execute(f'''SELECT source, sum(input) AS input, sum(cached_input) AS cached, sum(output) AS output, count(*) AS calls
                FROM llm_usage WHERE {owner_u} AND created_at >= %s GROUP BY source''', args + [start]).fetchall()
            characters = sum(len(((v['input'] or {}).get('scene') or {}).get('narration', {}).get('text', '')) for v in voices)
            buckets = {'server': {'input': 0, 'cached_input': 0, 'output': 0}, 'account': {'input': 0, 'cached_input': 0, 'output': 0}}
            agent = {k: dict(v) for k, v in buckets.items()}
            for row in agents:
                u = (row['result'] or {}).get('usage') or {}
                b = agent['account' if ((row['input'] or {}).get('llm') or {}).get('source') == 'account' else 'server']
                b['input'] += int(u.get('inputTokens') or 0); b['cached_input'] += int(u.get('cachedInputTokens') or 0); b['output'] += int(u.get('outputTokens') or 0)
            texts = {k: {**dict(v), 'calls': 0} for k, v in buckets.items()}
            for row in content:
                texts[row['source']].update(input=int(row['input']), cached_input=int(row['cached']), output=int(row['output']), calls=int(row['calls']))
            def cny(t):
                value = _priced(prices, max(t['input'] - t['cached_input'], 0), t['cached_input'], t['output'])
                return None if value is None else _amount(value)
            voice_cny = _amount(Decimal(characters) * Decimal(TTS_RATES['per_10000']) / Decimal(10000))
            agent_cny, text_cny = cny(agent['server']), cny(texts['server'])
            out[period] = {'voice': {'characters': characters, 'cny': voice_cny},
                           'agent': {'server': {**agent['server'], 'cny': agent_cny}, 'own_model': agent['account']},
                           'content': {'server': {**texts['server'], 'cny': text_cny}, 'own_model': texts['account']},
                           'total_cny': None if prices is None else _amount(Decimal(str(voice_cny)) + Decimal(str(agent_cny)) + Decimal(str(text_cny)))}
    return out


def estimate(store, owner_id, kinds, env=None):
    """What a paid call of these kinds used on average lately (this account's last AVERAGE_OF of each kind, server model)."""
    prices = deepseek_prices(env)
    owner = 'owner_id=%s' if owner_id else 'owner_id IS NULL'
    args = [owner_id] if owner_id else []
    total = {'input': 0, 'cached_input': 0, 'output': 0}; samples = 0
    with store.connection() as conn:
        for kind in kinds:
            rows = conn.execute(f'''SELECT input, cached_input, output FROM llm_usage WHERE {owner} AND kind=%s AND source='server'
                ORDER BY created_at DESC LIMIT %s''', args + [kind, AVERAGE_OF]).fetchall()
            if not rows: continue
            samples = max(samples, len(rows))
            for key in total: total[key] += round(sum(r[key] for r in rows) / len(rows))
    if not samples: return {'samples': 0, 'tokens': None, 'cny': None}
    value = _priced(prices, max(total['input'] - total['cached_input'], 0), total['cached_input'], total['output'])
    return {'samples': samples, 'tokens': total['input'] + total['output'], 'cny': None if value is None else _amount(value)}
