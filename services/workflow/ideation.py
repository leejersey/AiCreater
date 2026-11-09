"""Topic ideation for a new video: angles (directions) for a topic, then an outline for the chosen angle.

Short JSON calls to the course owner's model (or the server's DeepSeek), like manuscript generation. Model output is
checked strictly; a reply that fails the check is asked for once more, then the call fails rather than handing the page
half a result. Only single videos for now: Angle.scope is always 'single' and a project's origin.series_id is None,
the places a series would plug in later. Never log prompts or secrets."""
import json
import logging

import httpx

from services.accounts.model_settings import DEEPSEEK_BASE_URL
from services.workflow.destination import pinned_post
from services.workflow.providers import ProviderError, _status

log = logging.getLogger(__name__)

STRUCTURES = {'problem': '问题驱动', 'journey': '旅程 / 流程', 'compare': '对比', 'myth': '误区纠正',
              'howto': '实操', 'history': '演进 / 历史', 'story': '故事'}
DEPTHS = {'intro': '入门', 'intermediate': '进阶', 'advanced': '深入'}
SCOPES = ('single',)  # a series ('series', with episodes) plugs in here later
MAX_CHAPTER_SECONDS = 110  # the Agent makes chapters of at most 120 s
MAX_TOTAL_SECONDS = 780    # 4000 code points of narration at about 5 per second

_RULES = ('不编造数据、日期、产品名、出处或实验结论；没有把握的具体信息用概括表述。'
          '只输出一个 JSON 对象，不要在 JSON 外写任何文字。')

_ANGLES_SYSTEM = (
    '你是教学视频的选题策划。给定一个选题，为它想出几个**真正不同**的视频切入方向（每个都是一支独立的单集视频）。'
    '每个方向的结构类型必须互不相同，取自：' + '、'.join(f'{k}（{v}）' for k, v in STRUCTURES.items()) + '；'
    '深度取自 intro（入门）、intermediate（进阶）、advanced（深入），一批里至少用到两种。'
    '如果用户给了受众或补充想法，所有方向都要服从它，只在切入角度上发散。'
    '每个方向：title 视频标题（吸引人但不夸张，≤40 字）；hook 开场第一句口播（≤80 字）；audience 适合谁（≤30 字）；'
    'takeaway 看完能得到什么（≤60 字）；structure；depth；duration_min 建议分钟数（1–10 的整数）；'
    'chapters 3–8 个章节标题（每个 ≤24 字）。'
    '输出 {"angles":[{"title","hook","audience","takeaway","structure","depth","duration_min","chapters":[...]}]}。' + _RULES)

_OUTLINE_SYSTEM = (
    '你是教学视频编剧。按给定的选题和方向写单集视频的大纲。每章：title 章节标题（≤24 字）；points 1–4 个要点（每个 ≤60 字）；'
    'picture 画面构想（≤80 字）：写一个会变化的物体或过程，比如「答题的模型，答案被划掉、换成知识库里的答案」，'
    '不要写「展示一张卡片」「出现文字」；seconds 本章预计秒数（10–' + str(MAX_CHAPTER_SECONDS) + ' 的整数）。'
    '各章秒数合计尽量贴近建议时长。若给了上一版大纲和修改意见：只改意见提到的地方，其余保持原样。'
    '输出 {"sections":[{"title","points":[...],"picture","seconds"}]}，1–20 章。' + _RULES)


def _text(value, limit, name):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit or any(ord(c) < 32 for c in value):
        raise ValueError(f'{name}: 1–{limit} characters')
    return value.strip()


def check_angle(value):
    """A normalized Angle, or ValueError."""
    if not isinstance(value, dict): raise ValueError('angle: object expected')
    chapters = value.get('chapters')
    if not isinstance(chapters, list) or not 3 <= len(chapters) <= 8: raise ValueError('chapters: 3–8 titles')
    duration = value.get('duration_min')
    if type(duration) is not int or not 1 <= duration <= 10: raise ValueError('duration_min: 1–10')
    if value.get('structure') not in STRUCTURES: raise ValueError('structure: unknown')
    if value.get('depth') not in DEPTHS: raise ValueError('depth: unknown')
    if value.get('scope', 'single') not in SCOPES: raise ValueError('scope: only single videos for now')
    return {'title': _text(value.get('title'), 40, 'title'), 'hook': _text(value.get('hook'), 80, 'hook'),
            'audience': _text(value.get('audience'), 30, 'audience'), 'takeaway': _text(value.get('takeaway'), 60, 'takeaway'),
            'structure': value['structure'], 'depth': value['depth'], 'duration_min': duration,
            'chapters': [_text(c, 24, 'chapter') for c in chapters], 'scope': 'single'}


def check_angles(value, count):
    """A batch: `count` angles with distinct structures and at least two depths (when there are three or more)."""
    angles = value.get('angles') if isinstance(value, dict) else None
    if not isinstance(angles, list) or len(angles) != count: raise ValueError(f'angles: exactly {count}')
    angles = [check_angle(a) for a in angles]
    if len({a['structure'] for a in angles}) != len(angles): raise ValueError('angles: structures must differ')
    if count >= 3 and len({a['depth'] for a in angles}) < 2: raise ValueError('angles: use at least two depths')
    if len({a['title'] for a in angles}) != len(angles): raise ValueError('angles: titles must differ')
    return angles


def check_outline(value):
    sections = value.get('sections') if isinstance(value, dict) else None
    if not isinstance(sections, list) or not 1 <= len(sections) <= 20: raise ValueError('sections: 1–20')
    out = []
    for s in sections:
        if not isinstance(s, dict): raise ValueError('section: object expected')
        points = s.get('points')
        if not isinstance(points, list) or not 1 <= len(points) <= 4: raise ValueError('points: 1–4')
        seconds = s.get('seconds')
        if type(seconds) is not int or not 10 <= seconds <= MAX_CHAPTER_SECONDS: raise ValueError(f'seconds: 10–{MAX_CHAPTER_SECONDS}')
        out.append({'title': _text(s.get('title'), 24, 'section title'), 'points': [_text(p, 60, 'point') for p in points],
                    'picture': _text(s.get('picture'), 80, 'picture'), 'seconds': seconds})
    if sum(s['seconds'] for s in out) > MAX_TOTAL_SECONDS: raise ValueError(f'outline: at most {MAX_TOTAL_SECONDS} s in total')
    return {'sections': out}


def check_origin(value):
    """What a project keeps about how it was conceived; None for a manuscript written without ideation."""
    if value is None: return None
    if not isinstance(value, dict): raise ValueError('origin: object expected')
    if value.get('scope', 'single') not in SCOPES or value.get('series_id') is not None:
        raise ValueError('origin: only single videos for now')
    notes = value.get('notes') or ''
    if not isinstance(notes, str) or len(notes) > 300: raise ValueError('notes: at most 300 characters')
    return {'topic': _text(value.get('topic'), 80, 'topic'), 'notes': notes.strip(), 'angle': check_angle(value.get('angle')),
            'outline': check_outline(value.get('outline')), 'scope': 'single', 'series_id': None}


def direction_line(origin):
    """One line for the Agent's brief: the course's direction, so the picture follows it."""
    angle = origin['angle']
    return (f'本课方向：{angle["title"]}（{STRUCTURES[angle["structure"]]} · {DEPTHS[angle["depth"]]} · 面向{angle["audience"]}）；'
            f'看完能：{angle["takeaway"]}')


def _context(topic, notes, audience, duration_hint, teaching_style):
    lines = [f'选题：{topic}']
    if notes: lines.append(f'补充想法：{notes}')
    if audience: lines.append(f'受众：{audience}')
    if duration_hint: lines.append(f'时长参考：{duration_hint}')
    lines.append('讲解风格：' + ('知识干货（讲清机制与术语）' if teaching_style == 'technical' else '通俗科普（比喻与例子）'))
    return lines


def _chat(llm, client, system, user, check, kind, user_id=None):
    """One JSON call, checked by `check`; asks once more if the reply fails the check."""
    if not llm.api_key: raise ProviderError('config', 'missing_setting', '请在个人中心配置模型，或在服务端设置 DEEPSEEK_API_KEY')
    messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]
    ok = False
    try:
        for attempt in range(2):
            body = {'model': llm.model, 'messages': messages, 'max_tokens': 4096, 'response_format': {'type': 'json_object'}}
            if llm.model in ['deepseek-flash', 'deepseek-v4-flash'] and llm.base_url == DEEPSEEK_BASE_URL:
                body['thinking'] = {'type': 'disabled'}
            response = pinned_post(client, llm.base_url.rstrip('/') + '/chat/completions',
                                   headers={'Authorization': 'Bearer ' + llm.api_key}, json=body)
            _status(response, kind)
            if len(response.content) > 1024 * 1024: raise ProviderError(kind, 'response_limit', 'Response exceeds 1 MiB')
            choice = response.json()['choices'][0]
            if choice.get('finish_reason') == 'content_filter': raise ProviderError(kind, 'response_filtered', 'Generation was filtered')
            content = choice['message']['content'] if choice.get('finish_reason') == 'stop' else None
            try:
                result = check(json.loads(content or ''))
                ok = True
                return result
            except (ValueError, TypeError) as problem:  # json.JSONDecodeError is a ValueError
                if attempt: raise ProviderError(kind, 'invalid_response', f'模型返回的结果不符合要求：{problem}') from None
                messages = messages + [{'role': 'assistant', 'content': content or ''},
                                       {'role': 'user', 'content': f'上面的输出不符合要求（{problem}）。请按要求重新输出完整 JSON。'}]
    except httpx.HTTPError:
        raise ProviderError(kind, 'transport_error', 'Provider request failed') from None
    except (KeyError, IndexError, AttributeError):
        raise ProviderError(kind, 'invalid_response', 'Expected a complete response') from None
    finally:
        log.info('event=%s user_id=%s ok=%s', kind, user_id, ok)


def generate_angles(llm, client, *, topic, notes='', audience='', duration_hint='', teaching_style='popular', count=4,
                    exclude=(), custom='', merge=None, user_id=None):
    """`count` distinct angles; or one card from the person's own direction (`custom`); or one card merging two (`merge`)."""
    lines = _context(topic, notes, audience, duration_hint, teaching_style)
    if merge:
        lines.append('把下面两个方向融合成一个新方向（取各自的长处，结构类型取更适合融合后的那个），只输出 1 个：')
        lines.append(json.dumps(merge, ensure_ascii=False))
        check = lambda v: check_angles(v, 1)
    elif custom:
        lines.append(f'用户自己想到的方向：{custom}。把它整理成 1 个方向，忠于用户的意思：')
        check = lambda v: check_angles(v, 1)
    else:
        if exclude: lines.append('已经给过这些方向，新方向必须与它们不同：' + '；'.join(exclude))
        lines.append(f'请给出 {count} 个方向。')
        check = lambda v: check_angles(v, count)
    return _chat(llm, client, _ANGLES_SYSTEM, '\n'.join(lines), check, 'ideas_angles', user_id)


def generate_outline(llm, client, *, topic, angle, notes='', audience='', duration_hint='', teaching_style='popular',
                     previous=None, feedback='', user_id=None):
    lines = _context(topic, notes, audience, duration_hint, teaching_style)
    lines.append('选定的方向：' + json.dumps(angle, ensure_ascii=False))
    if previous is not None:
        lines.append('上一版大纲：' + json.dumps(previous, ensure_ascii=False))
        lines.append(f'修改意见：{feedback}')
    return _chat(llm, client, _OUTLINE_SYSTEM, '\n'.join(lines), check_outline, 'ideas_outline', user_id)


def plan_lines(plan):
    """The chosen angle and outline, for the manuscript prompt."""
    angle, sections = plan['angle'], plan['outline']['sections']
    lines = [f'选定的方向：{angle["title"]}（{STRUCTURES[angle["structure"]]}，{DEPTHS[angle["depth"]]}，面向{angle["audience"]}）',
             f'开场第一句可参考：{angle["hook"]}', f'看完能：{angle["takeaway"]}', '必须按这份大纲写，一章对应一段，顺序不变：']
    for i, s in enumerate(sections, 1):
        lines.append(f'{i}. {s["title"]}（约 {s["seconds"]} 秒）要点：' + '；'.join(s['points']) + f'。画面构想：{s["picture"]}')
    return lines
