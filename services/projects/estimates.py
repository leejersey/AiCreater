"""Read-only reference prices; no provider requests, task dispatch or billing cap."""
from datetime import date
from decimal import Decimal, ROUND_CEILING

from services.projects.jobs import Jobs
from services.projects.store import StoreError, identifier, revision

PRICES_CHECKED_ON = date(2026, 10, 15)
TTS_SOURCE = 'https://docs.volcengine.com/docs/DoubaoVoice/Billinginstructions-21?lang=zh'
DISCLAIMER = '仅公开按量参考价，非供应商账单、非扣费上限；未扣免费额度、套餐或折扣，重试可能再计费。'
QUANTITIES = ('calls', 'reused_jobs', 'characters', 'input_tokens_min', 'input_tokens_max', 'output_tokens_max')
TTS_RATES = {'per_10000': '3'}


def _amount(value):
    return float(value.quantize(Decimal('.000001'), rounding=ROUND_CEILING))


def _result(status, notes, minimum=None, maximum=None, sources=(), **quantity):
    return {'status': status, 'currency': 'CNY', 'minimum_cny': minimum, 'maximum_cny': maximum,
            'quantity': {key: quantity.get(key, 0) for key in QUANTITIES},
            'prices_checked_on': PRICES_CHECKED_ON.isoformat(), 'sources': list(sources),
            'notes': list(notes) + [DISCLAIMER]}


def estimate_payload(payload, *, reused=False, now=None):
    if reused:
        return _result('no_new_call', ['复用已登记任务：本次不新增调用；不包含已有任务未来执行的费用，显式重试另算。'], 0, 0, reused_jobs=1)
    kind = payload.get('kind')
    if kind == 'timing':
        return _result('no_new_call', ['本地音频缓存对齐，不新增模型或配音调用费；不包含机器成本。'], 0, 0)
    if not 0 <= ((now or date.today()) - PRICES_CHECKED_ON).days <= 30:
        return _result('unknown', ['参考价格已过期或本机日期异常，请先核对官方价格。'], calls=1)
    if kind != 'voice':
        return _result('unknown', ['未核对此任务的价格，暂无法估算。'], calls=1)
    if payload.get('protocol_version') != 'native-voice:1' or payload.get('profile', {}).get('voice', {}).get('resource_id') != 'seed-tts-2.0':
        return _result('unknown', ['未核对当前配音型号/协议的价格，暂无法估算。'], calls=1)
    text = payload.get('scene', {}).get('narration', {}).get('text')
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        return _result('unknown', ['配音文本数量无法可靠计算。'], calls=1)
    cost = _amount(Decimal(len(text)) * Decimal(TTS_RATES['per_10000']) / Decimal(10000))
    return _result('estimated', ['seed-tts-2.0公开按量参考价：3元/万字符；含字母、标点、空格和换行，按Unicode码点参考。'],
                   cost, cost, [TTS_SOURCE], calls=1, characters=len(text))


def combine_estimates(quotes):
    unknown = any(q['status'] == 'unknown' for q in quotes)
    status = 'unknown' if unknown else 'estimated' if any(q['status'] == 'estimated' for q in quotes) else 'no_new_call'
    def total(key):
        return None if unknown else _amount(sum((Decimal(str(q[key])) for q in quotes), Decimal(0)))
    return {'status': status, 'currency': 'CNY', 'minimum_cny': total('minimum_cny'), 'maximum_cny': total('maximum_cny'),
            'quantity': {key: sum(q['quantity'][key] for q in quotes) for key in QUANTITIES},
            'prices_checked_on': PRICES_CHECKED_ON.isoformat(),
            'sources': list(dict.fromkeys(url for q in quotes for url in q['sources'])),
            'notes': list(dict.fromkeys(note for q in quotes for note in q['notes']))}


def estimate_project(store, model, project_id, expected_revision, operation, scenes):
    revision(expected_revision)
    if operation != 'voice' or not isinstance(scenes, list) or len(scenes) != 1:
        raise StoreError('validation', 'Invalid estimate selection')
    with store.connection() as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        project = store._read(conn, project_id)
        if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
        item = scenes[0]
        if not isinstance(item, dict) or set(item) != {'scene_id', 'expected_revision'}: raise StoreError('validation', 'Invalid scene selection')
        scene_id = identifier(item['scene_id']); revision(item['expected_revision'])
        row = next((s for s in project['scenes'] if s['id'] == scene_id), None)
        if row is None: raise StoreError('validation', 'Scene does not belong to project')
        if row['revision'] != item['expected_revision']: raise StoreError('conflict', 'Scene revision changed')
        payload = {'kind': 'voice', 'scene_id': row['id'], 'base_revision': row['revision'],
            'scene': Jobs._draft_scene(row['scene']), 'profile': store.profile_for(project), 'protocol_version': 'native-voice:1'}
        existing = conn.execute('SELECT id FROM jobs WHERE input_hash=%s', [Jobs.input_hash(payload)]).fetchone()
        return combine_estimates([estimate_payload(payload, reused=bool(existing))])


def estimate_retry(store, job_id):
    with store.connection() as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        job = Jobs._read(conn, job_id)
        return estimate_payload(job['input'])
