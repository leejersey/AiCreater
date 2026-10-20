"""Read-only reference prices; no provider requests, task dispatch or billing cap."""
import copy
from datetime import date
from decimal import Decimal, ROUND_CEILING
import math

from services.projects.jobs import Jobs
from services.projects.store import StoreError, identifier, revision
from services.workflow.providers import ProviderError, storyboard_request

PRICES_CHECKED_ON = date(2026, 10, 15)
LLM_SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'
TTS_SOURCE = 'https://docs.volcengine.com/docs/DoubaoVoice/Billinginstructions-21?lang=zh'
DISCLAIMER = '仅公开按量参考价，非供应商账单、非扣费上限；未扣免费额度、套餐或折扣，重试可能再计费。'
QUANTITIES = ('calls', 'reused_jobs', 'characters', 'input_tokens_min', 'input_tokens_max', 'output_tokens_max')
LLM_RATES = {'cached_min': '.02', 'cached_max': '.04', 'uncached_min': '1', 'uncached_max': '2', 'output_min': '4', 'output_max': '8'}
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
    if kind in ['render', 'timing']:
        return _result('no_new_call', ['本地渲染/音频缓存对齐，不新增模型或配音调用费；不包含机器成本。'], 0, 0)
    if not 0 <= ((now or date.today()) - PRICES_CHECKED_ON).days <= 30:
        return _result('unknown', ['参考价格已过期或本机日期异常，请先核对官方价格。'], calls=1)
    if kind == 'voice':
        if payload.get('protocol_version') != 'native-voice:1' or payload.get('profile', {}).get('voice', {}).get('resource_id') != 'seed-tts-2.0':
            return _result('unknown', ['未核对当前配音型号/协议的价格，暂无法估算。'], calls=1)
        text = payload.get('scene', {}).get('narration', {}).get('text')
        if not isinstance(text, str) or not text.strip() or len(text) > 4000:
            return _result('unknown', ['配音文本数量无法可靠计算。'], calls=1)
        cost = _amount(Decimal(len(text)) * Decimal(TTS_RATES['per_10000']) / Decimal(10000))
        return _result('estimated', ['seed-tts-2.0公开按量参考价：3元/万字符；含字母、标点、空格和换行，按Unicode码点参考。'],
                       cost, cost, [TTS_SOURCE], calls=1, characters=len(text))
    protocols = {'generate': ['teaching-outline:1', 'teaching-outline:2', 'teaching-outline:3'], 'regenerate': ['scene-candidate:1', 'scene-candidate:2', 'scene-candidate:3']}
    if kind not in protocols or payload.get('protocol_version') not in protocols[kind] or payload.get('model') != 'deepseek-flash':
        return _result('unknown', ['未核对当前模型/任务协议的价格，暂无法估算。'], calls=1)
    try:
        original = None
        if kind == 'regenerate':
            original = {k: copy.deepcopy(v) for k, v in payload['scene'].items() if k in ['id', 'type', 'narration', 'elements', 'edges', 'code', 'structure', 'timeline', 'chart']}
            original['narration'] = {'text': original['narration']['text']}
        text = payload['source_text'] if original is None else original['narration']['text']
        body, _ = storyboard_request(text, payload['model'], original, cue_quotes=payload['protocol_version'].endswith((':2', ':3')))
        contents = [message['content'] for message in body['messages']]
        lower = math.ceil(sum(len(content) for content in contents) / 4)
        upper = sum(len(content.encode('utf-8')) for content in contents) + 32
    except (KeyError, TypeError, ValueError, UnicodeError, ProviderError):
        return _result('unknown', ['当前请求无法可靠计算token数量。'], calls=1)
    # shortcut: byte/character heuristics, replace with the provider tokenizer when available.
    minimum = _amount((Decimal(lower) * Decimal(LLM_RATES['cached_min']) + Decimal(LLM_RATES['output_min'])) / Decimal(1000000))
    maximum = _amount((Decimal(upper) * Decimal(LLM_RATES['uncached_max']) + Decimal(body['max_tokens']) * Decimal(LLM_RATES['output_max'])) / Decimal(1000000))
    return _result('estimated', [
        'deepseek-flash公开参考：缓存命中输入0.02–0.04、未命中1–2、输出4–8元/百万token，覆盖峰谷价格。',
        '完整提示词/schema与请求数据均已计入；输入字符/4至UTF8字节+32为经验区间，不是实测或保证上下界。',
        '输出按1至请求max_tokens设置参考；本次分镜估价不含后续配音费。'], minimum, maximum, [LLM_SOURCE],
        calls=1, input_tokens_min=lower, input_tokens_max=upper, output_tokens_max=body['max_tokens'])


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
    if operation not in ['generate', 'regenerate', 'voice', 'batch_voice'] or not isinstance(scenes, list) or len(scenes) > 20:
        raise StoreError('validation', 'Invalid estimate selection')
    if (operation == 'generate' and scenes) or (operation != 'generate' and not scenes) or (operation in ['regenerate', 'voice'] and len(scenes) != 1):
        raise StoreError('validation', 'Invalid estimate scene count')
    with store.connection() as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        project = store._read(conn, project_id)
        if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
        payloads = []
        if operation == 'generate':
            if project['scenes']: raise StoreError('conflict', 'Use scene regeneration for an existing outline')
            payloads.append({'kind': 'generate', 'project_id': project['id'], 'base_revision': expected_revision,
                'source_text': project['source_text'], 'profile': store.profile, 'model': model, 'protocol_version': 'teaching-outline:3'})
        selected = set()
        for item in scenes:
            if not isinstance(item, dict) or set(item) != {'scene_id', 'expected_revision'}: raise StoreError('validation', 'Invalid scene selection')
            scene_id = identifier(item['scene_id']); revision(item['expected_revision'])
            if scene_id in selected: raise StoreError('validation', 'Duplicate scene selection')
            selected.add(scene_id)
            row = next((s for s in project['scenes'] if s['id'] == scene_id), None)
            if row is None: raise StoreError('validation', 'Scene does not belong to project')
            if row['revision'] != item['expected_revision']: raise StoreError('conflict', 'Scene revision changed')
            if operation == 'batch_voice' and row['state'] != 'needs_voice': raise StoreError('not_ready', 'Batch voice only accepts scenes needing voice')
            if operation == 'regenerate' and row['scene']['type'] == 'data_chart': raise StoreError('validation', 'Confirmed chart cannot use model regeneration')
            voice = operation in ['voice', 'batch_voice']
            payload = {'kind': 'voice' if voice else 'regenerate', 'scene_id': row['id'], 'base_revision': row['revision'],
                'scene': Jobs._draft_scene(row['scene']) if voice else row['scene'], 'profile': store.profile_for(project) if voice else store.profile,
                'protocol_version': 'native-voice:1' if voice else 'scene-candidate:3'}
            if not voice: payload['model'] = model
            payloads.append(payload)
        quotes = []
        for payload in payloads:
            # Share actual batch lookup so a newly selected project voice is never priced as reused.
            if operation == 'batch_voice':
                existing = Jobs.batch_voice_id(conn, project, payload['scene_id'], payload['base_revision'], payload['profile'])
            else:
                existing = conn.execute('SELECT id FROM jobs WHERE input_hash=%s', [Jobs.input_hash(payload)]).fetchone()
            quotes.append(estimate_payload(payload, reused=bool(existing)))
        return combine_estimates(quotes)


def estimate_retry(store, job_id):
    with store.connection() as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        job = Jobs._read(conn, job_id)
        return estimate_payload(job['input'])
