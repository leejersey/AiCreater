"""DeepSeek plain-text manuscript generation; never log prompts or secrets."""
import json
import logging

import httpx

from services.workflow.providers import ProviderError, _status

from services.workflow.manuscript_document import format_document

log = logging.getLogger(__name__)

_DOCUMENT_SYSTEM = (
    '你是教学视频编剧。一次联合生成相互配合的口播、画面素材与画面意图，输出 JSON 对象，不要在 JSON 外添加 Markdown。'
    '结构严格为 {"sections":[{"id":"s1","title":"段落标题","narration":"纯文本口播",'
    '"materials":"画面素材，可含带语言的 Markdown 代码围栏","visual_intent":"对应本段口播的展示意图"}]}。'
    '1–20段，每段ID唯一（s1、s2等），标题1–80字，所有字段非空且无首尾空白。'
    'narration只写可直接朗读的纯文本，不写标题、列表标记、代码或舞台指示；全部口播含段落分隔共不超过4000字符。'
    'materials补充不必朗读的命令、代码、流程标签、对比项等；无额外素材时填“无”。'
    'visual_intent引用本段口播中的具体短句安排素材出现，不编造配音时间秒数；代码围栏只允许出现在materials。'
    '代码围栏必须闭合，素材中的Markdown标题必须放在代码围栏内。整个JSON不超过24000字符。'
    '命令与代码仅供展示，绝不执行；没有真实执行记录时不编造运行结果，必要时明确标注“示意输出（未经执行验证）”。'
    '覆盖用户要点，不编造数据、来源、实验结论；技术风格讲清机制与术语，通俗风格用概念与例子。'
)

_SYSTEM_TECHNICAL = (
    '你是知识讲解视频的口播撰稿人。只输出可直接朗读的简体中文纯文本，不要 JSON、Markdown、代码块、列表符号或标题符号。'
    '默认结构：问题或场景→机制与关键术语→流程或对比→例子→收束；段落自然连贯，适合旁白。'
    '若用户给了大纲或要点，必须覆盖其中的术语与步骤，用口播讲清“怎么做/为什么”，'
    '不要用“这里不展开”“具体细节略过”一类句子跳过要点。'
    '英文术语可保留常见写法（如 embedding、rerank、topK），并紧跟一句中文解释；不要堆砌公式或伪代码。'
    '不要编造无法核实的具体数字、榜单分数、出处或实验结论；不确定处用概括性表述。'
    '全文不超过 4000 个 Unicode 码点。'
)

_SYSTEM_POPULAR = (
    '你是知识讲解视频的口播撰稿人。只输出可直接朗读的简体中文纯文本，不要 JSON、Markdown、代码块、列表符号或标题符号。'
    '用通俗易懂、有画面感的方式讲解：可以用生活比喻、概念拆解和例子帮助理解，段落自然连贯，适合旁白。'
    '若用户给了大纲或要点，必须覆盖其中的内容与步骤，用口播讲清“是什么/为什么/怎么用”，不要跳过用户给出的要点。'
    '未给要点时不要强行堆砌专业术语；先把概念讲明白，再适度点到关键名词即可。'
    '不要编造无法核实的具体数字、榜单分数、出处或实验结论；不确定处用概括性表述。'
    '全文不超过 4000 个 Unicode 码点。'
)

_TEACHING_STYLES = frozenset({'popular', 'technical'})


def _control_chars(text):
    return any(ord(c) < 32 or ord(c) == 127 for c in text)


def _validate(title, audience, duration_hint, outline):
    title = title.strip()
    if not title or len(title) > 80:
        raise ProviderError('manuscript', 'input_limit', 'Use a 1–80 character title')
    limits = ((audience, 80), (duration_hint, 40), (outline, 1000))
    for value, limit in limits:
        if len(value) > limit:
            raise ProviderError('manuscript', 'input_limit', 'Optional field exceeds limit')
    for value in (title, audience, duration_hint, outline):
        if _control_chars(value):
            raise ProviderError('manuscript', 'input_limit', 'Control characters are forbidden')
    return title


def _user_message(title, audience, duration_hint, outline, teaching_style):
    lines = [f'主题：{title}']
    if audience:
        lines.append(f'受众：{audience}')
    if duration_hint:
        lines.append(f'时长参考：{duration_hint}')
    if outline:
        lines.append(f'必须覆盖的要点：{outline}')
        if teaching_style == 'technical':
            lines.append('请按干货讲解写口播：先讲清机制与术语，再串流程与例子；不要写成空泛科普。')
        else:
            lines.append('请用通俗口播覆盖上述要点：概念、例子与步骤都要讲到，避免空泛概括。')
    elif teaching_style == 'technical':
        lines.append('未提供要点时，请从标题提炼可操作的机制与常用术语，避免只有比喻没有步骤。')
    else:
        lines.append('未提供要点时，可按概念与生活例子展开，先把主题讲清楚，不必强行堆砌术语。')
    return '\n'.join(lines)


def generate_manuscript(title, settings, client, *, audience='', duration_hint='', outline='', user_id=None,
                      teaching_style='popular', manuscript_format='plain'):
    if manuscript_format not in ('plain', 'markdown'):
        raise ProviderError('manuscript', 'input_limit', 'Unsupported manuscript format')
    if teaching_style not in _TEACHING_STYLES:
        raise ProviderError('manuscript', 'input_limit', 'teaching_style must be popular or technical')
    title = _validate(title, audience, duration_hint, outline)
    system = _DOCUMENT_SYSTEM if manuscript_format == 'markdown' else _SYSTEM_TECHNICAL if teaching_style == 'technical' else _SYSTEM_POPULAR
    body = {'model': settings.model, 'messages': [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': _user_message(title, audience, duration_hint, outline, teaching_style)}],
        'max_tokens': 8192}
    if manuscript_format == 'markdown':
        body['response_format'] = {'type': 'json_object'}
    if settings.model in ['deepseek-flash', 'deepseek-v4-flash']:
        body['thinking'] = {'type': 'disabled'}
    chars, ok = 0, False
    try:
        response = client.post('https://api.deepseek.com/chat/completions', follow_redirects=False,
                               headers={'Authorization': 'Bearer ' + settings.llm_key}, json=body)
        _status(response, 'manuscript')
        if len(response.content) > 1024 * 1024:
            raise ProviderError('manuscript', 'response_limit', 'Response exceeds 1 MiB')
        data = response.json()
        choice = data['choices'][0]
        if choice.get('finish_reason') == 'length':
            raise ProviderError('manuscript', 'output_limit', 'Generation reached token or context budget')
        if choice.get('finish_reason') == 'content_filter':
            raise ProviderError('manuscript', 'response_filtered', 'Generation was filtered')
        if choice.get('finish_reason') != 'stop':
            raise ProviderError('manuscript', 'incomplete_response', 'Generation did not finish normally')
        text = choice['message']['content'].strip()
        if not text:
            raise ProviderError('manuscript', 'invalid_response', 'Expected non-empty narration text')
        if manuscript_format == 'markdown':
            if len(text) > 24000:
                raise ProviderError('manuscript', 'output_limit', 'Document exceeds 24000 code points')
            text = format_document(json.loads(text))
        elif len(text) > 4000:
            raise ProviderError('manuscript', 'output_limit', 'Manuscript exceeds 4000 code points')
        chars, ok = len(text), True
        return text
    except httpx.HTTPError:
        raise ProviderError('manuscript', 'transport_error', 'Provider request failed') from None
    except ProviderError:
        raise
    except (KeyError, IndexError, TypeError, AttributeError, json.JSONDecodeError):
        raise ProviderError('manuscript', 'invalid_response', 'Expected a complete manuscript response') from None
    finally:
        log.info('event=manuscript_generate user_id=%s chars=%s ok=%s', user_id, chars, ok)
