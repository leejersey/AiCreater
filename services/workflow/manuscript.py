"""DeepSeek plain-text manuscript generation; never log prompts or secrets."""
import json
import logging

import httpx

from services.accounts.model_settings import DEEPSEEK_BASE_URL
from services.workflow.destination import pinned_post
from services.workflow.providers import ProviderError, _status

from services.workflow.manuscript_document import format_document, parse_document
from services.workflow.ideation import check_angle, check_outline, plan_lines
from services.workflow.research import brief_lines, check_brief

log = logging.getLogger(__name__)

_DOCUMENT_SYSTEM = (
    '你是教学与知识类爆款视频编剧。一次联合生成相互配合的口播、画面素材与画面意图，输出 JSON 对象，不要在 JSON 外添加 Markdown。'
    '结构严格为 {"sections":[{"id":"s1","title":"段落标题","narration":"纯文本口播",'
    '"materials":"画面素材（视觉弹药），可含带语言的 Markdown 代码围栏","visual_intent":"对应本段口播的展示意图"}]}。'
    '1–20段，每段ID唯一（s1、s2等），标题1–80字，所有字段非空且无首尾空白。'
    'narration只写可直接朗读的口语化短句纯文本，不写标题、列表标记、代码或舞台指示；少用“首先、其次、综上所述、总而言之、不仅如此”等AI套话；全部口播含段落分隔共不超过4000字符。'
    'materials是给动画画面师的“视觉弹药”：除命令与代码外，必须积极提炼本段中的核心数字/指标、A vs B 对比项、步骤/流程节点、时间线、关键概念词或金句卡片；尽量不要留空或偷懒写“无”，仅纯情感过渡/开场寒暄且确实无可视化信息时才填“无”。'
    'visual_intent必须写明“画面放什么元素 + 说到口播中哪句具体短句时如何出现/高亮/切换/对比”，禁止写“展示标题文字”这类空话，不编造配音时间秒数；代码围栏只允许出现在materials。'
    '代码围栏必须闭合，素材中的Markdown标题必须放在代码围栏内。整个JSON不超过24000字符。'
    '命令与代码仅供展示，绝不执行；没有真实执行记录时不编造运行结果，必要时明确标注“示意输出（未经执行验证）”。'
    '覆盖用户要点，不编造数据、来源、实验结论；技术风格讲清机制与术语，通俗风格用概念与例子。'
)

_HOOKS_SYSTEM = (
    '你是短视频与知识博主开场钩子专家。根据用户给出的主题、文稿内容和（可选）爆款参考，生成 3 个风格截然不同的前 10–15 秒黄金开场钩子，'
    '严格输出一个 JSON 对象，不要在 JSON 外写任何文字：\n'
    '{"hooks":[\n'
    '  {"type":"contrarian","label":"反常识冲击","cover_line":"封面大字（≤16字）","opening":"可直接替换第一段口播的纯文本开场（40–180字，口语短句，无Markdown符号）","why":"一句话说明为何能留住前3秒（≤60字）"},\n'
    '  {"type":"pain","label":"痛点扎心","cover_line":"...","opening":"...","why":"..."},\n'
    '  {"type":"suspense","label":"悬念提问","cover_line":"...","opening":"...","why":"..."}\n'
    ']}\n'
    '必须正好 3 条，type 依次覆盖 contrarian、pain、suspense；禁止使用“大家好欢迎来到”“今天我们来聊聊”等平淡开场；不编造文稿与资料中没有的数据。'
)

_POLISH_MARKDOWN_SYSTEM = (
    '你是资深知识类短视频口播导演。用户会给你一份严格格式的 Markdown 分镜文稿（已解析为 JSON sections）。'
    '请对每段的 narration 做“去 AI 味 + 口语化润色”：'
    '1. 删除“首先、其次、再次、综上所述、总而言之、不仅如此、让我们一起看看”等 AI 套话和书面腔；'
    '2. 把长难句拆成适合真人配音呼吸节奏的口语短句，适当加入自然的设问、对比转折或口语连接词；'
    '3. 严格保留所有真实事实、数据、术语、技术步骤和段落数量，不删减核心干货，不编造新数据；'
    '4. 保持每段 id、title 不变，保留或轻微优化 materials 与 visual_intent 使短句引用与新口播对齐；'
    '严格输出 JSON 对象 {"sections":[{"id","title","narration","materials","visual_intent"}]}，不要在 JSON 外写任何文字，全部口播合计不超过 4000 字符。'
)

_POLISH_PLAIN_SYSTEM = (
    '你是资深知识类短视频口播导演。请对用户的口播纯文本做“去 AI 味 + 口语化润色”：'
    '删除“首先、其次、综上所述、总而言之、不仅如此、让我们一起”等 AI 套话；把长难句拆成适合朗读的口语短句，增强节奏感与对话感；'
    '严格保留原有的真实事实、数据与段落结构，不编造新信息。只输出润色后的简体中文纯文本，不要标题符号、列表符号或 Markdown，不超过 4000 字符。'
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

_REWRITE_SECTION_SYSTEM = (
    '你是教学与知识类爆款视频编剧。用户会给你整篇视频的大纲脉络、需要局部修改的那一段（JSON 格式）以及具体修改指令。'
    '请只重写这一段，保持 id 不变，严格输出 JSON 对象：'
    '{"id":"s1","title":"段落标题（1–80字）","narration":"纯文本口语化短句口播，无Markdown符号",'
    '"materials":"给动画师的视觉弹药（数字/对比/步骤/代码等，尽量不填无）","visual_intent":"结合本段口播短句说明画面元素如何出现或变化"}。'
    '不要在 JSON 外写任何文字，所有字段非空且无首尾空白，不编造数据。'
)

_CRITIQUE_SYSTEM = (
    '你是严苛但专业的百万粉知识类短视频总编。请对用户的视频文稿做“配音前毒舌审稿”，'
    '从 4 个维度打分（0–100 的整数）：hook（前3秒留存与开场钩子）、density（信息密度与干货价值）、pacing（口播节奏与去AI味程度）、visual（画面素材与视觉可表现性）。'
    '严格输出一个 JSON 对象，不要在 JSON 外写任何文字：\n'
    '{"overall_score":82,"scores":{"hook":78,"density":85,"pacing":80,"visual":84},'
    '"verdict":"一句话犀利总评（≤80字）",'
    '"issues":[{"section":"定位（如 第1段/全局）","section_id":"若针对Markdown某一段则填其方括号ID如s1，全局问题填空字符串","problem":"具体问题（≤80字）","fix":"可执行改法（≤100字）"}]}\n'
    'issues 给 3–5 条最值钱的修改建议，禁止空泛表扬。'
)

_PUBLISH_KIT_SYSTEM = (
    '你是爆款短视频与自媒体运营总监。根据用户的视频文稿和目标平台，一键生成可直接复制使用的发布套件，'
    '严格输出一个 JSON 对象，不要在 JSON 外写任何文字：\n'
    '{"titles":["5个高点击标题候选，风格各异（反常识/数字/痛点/悬念/干货），每条≤36字"],'
    '"cover_main":"封面主大字（≤12字，一眼抓人）","cover_sub":"封面副标题（≤18字）",'
    '"summary":"适合该平台的视频简介/正文摘要（≤280字，带清晰价值点）",'
    '"tags":["5–8个精准话题标签，不带#号，每条≤18字"],'
    '"pinned_comment":"放在评论区置顶引导互动与讨论的话术（≤120字）"}\n'
    '严禁编造文稿里没有的数据或结论。'
)


def check_persona(value):
    """Validate an optional creator persona/voice profile."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError('persona: object expected')

    def _s(key, limit):
        raw = value.get(key) or ''
        if not isinstance(raw, str):
            raise ValueError(f'persona.{key}: string expected')
        cleaned = ' '.join(raw.replace('\r', '\n').split()) if key != 'sample' else raw.strip()
        if len(cleaned) > limit:
            cleaned = cleaned[:limit].rstrip()
        return cleaned

    out = {
        'name': _s('name', 40) or '自定义人设',
        'audience_call': _s('audience_call', 24),
        'tone': _s('tone', 160),
        'catchphrases': _s('catchphrases', 120),
        'banned_words': _s('banned_words', 120),
        'ending_cta': _s('ending_cta', 160),
        'sample': _s('sample', 600),
    }
    if not any(out[k] for k in ('audience_call', 'tone', 'catchphrases', 'banned_words', 'ending_cta', 'sample')):
        return None
    return out


def persona_lines(persona):
    """Render a validated persona into prompt instructions."""
    if not persona:
        return []
    lines = [f'【博主口吻与人设要求：{persona["name"]}（全程保持该频道口吻）】']
    if persona['audience_call']:
        lines.append(f'- 对观众称呼：{persona["audience_call"]}')
    if persona['tone']:
        lines.append(f'- 语气与表达风格：{persona["tone"]}')
    if persona['catchphrases']:
        lines.append(f'- 可自然融入的口头禅：{persona["catchphrases"]}')
    if persona['banned_words']:
        lines.append(f'- 严禁使用的词汇：{persona["banned_words"]}')
    if persona['ending_cta']:
        lines.append(f'- 结尾引导话术参考：{persona["ending_cta"]}')
    if persona['sample']:
        lines.append(f'- 博主历史样稿语气参考（只学语感与断句，不抄内容）：\n{persona["sample"]}')
    return lines


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


def _user_message(title, audience, duration_hint, outline, teaching_style, plan=None, markdown=False, research=None, persona=None):
    lines = [f'主题：{title}']
    if audience:
        lines.append(f'受众：{audience}')
    if duration_hint:
        lines.append(f'时长参考：{duration_hint}')
    if persona:
        lines += persona_lines(persona)
    if research:
        lines += brief_lines(research)
        if markdown:
            lines.append('请将简报中的真实数据、对比项、流程步骤和金句优先沉淀到各段的 materials（画面素材）中，供后续动画直接绘制，不要偷懒填“无”。')
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
    if plan:
        lines += plan_lines(plan)
        lines.append('每章写成一段：段落标题用章节标题，visual_intent 以该章的画面构想为基础并引用本段口播短句。' if markdown
                     else '口播按大纲顺序展开，每章一个自然段，各章篇幅与预计秒数相称（约每秒 5 字）。')
    return '\n'.join(lines)


def generate_manuscript(title, llm, client, *, audience='', duration_hint='', outline='', user_id=None,
                      teaching_style='popular', manuscript_format='plain', plan=None, research=None, persona=None):
    """llm: services.accounts.model_settings.LLM (the account's model or the server's DeepSeek).
    plan: {angle, outline} chosen in ideation; the manuscript follows that outline chapter by chapter."""
    if plan is not None:
        try: plan = {'angle': check_angle(plan.get('angle')), 'outline': check_outline(plan.get('outline'))}
        except (ValueError, AttributeError) as problem: raise ProviderError('manuscript', 'input_limit', f'Invalid plan: {problem}') from None
    if research is not None:
        try: research = check_brief(research)
        except (ValueError, AttributeError) as problem: raise ProviderError('manuscript', 'input_limit', f'Invalid research: {problem}') from None
    if persona is not None:
        try: persona = check_persona(persona)
        except (ValueError, AttributeError) as problem: raise ProviderError('manuscript', 'input_limit', f'Invalid persona: {problem}') from None
    if manuscript_format not in ('plain', 'markdown'):
        raise ProviderError('manuscript', 'input_limit', 'Unsupported manuscript format')
    if teaching_style not in _TEACHING_STYLES:
        raise ProviderError('manuscript', 'input_limit', 'teaching_style must be popular or technical')
    title = _validate(title, audience, duration_hint, outline)
    system = _DOCUMENT_SYSTEM if manuscript_format == 'markdown' else _SYSTEM_TECHNICAL if teaching_style == 'technical' else _SYSTEM_POPULAR
    if not llm.api_key: raise ProviderError('config', 'missing_setting', '请在个人中心配置模型，或在服务端设置 DEEPSEEK_API_KEY')
    body = {'model': llm.model, 'messages': [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': _user_message(title, audience, duration_hint, outline, teaching_style, plan, manuscript_format == 'markdown', research=research, persona=persona)}],
        'max_tokens': 8192}
    if manuscript_format == 'markdown':
        body['response_format'] = {'type': 'json_object'}
    # A DeepSeek-only switch: other OpenAI-compatible services may reject unknown fields.
    if llm.model in ['deepseek-flash', 'deepseek-v4-flash'] and llm.base_url == DEEPSEEK_BASE_URL:
        body['thinking'] = {'type': 'disabled'}
    chars, ok = 0, False
    try:
        response = pinned_post(client, llm.base_url.rstrip('/') + '/chat/completions',
                               headers={'Authorization': 'Bearer ' + llm.api_key}, json=body)
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


def _check_hooks(value):
    hooks = value.get('hooks') if isinstance(value, dict) else None
    if not isinstance(hooks, list) or len(hooks) != 3:
        raise ValueError('hooks: exactly 3 items expected')
    expected = {'contrarian', 'pain', 'suspense'}
    out = []
    seen = set()
    for item in hooks:
        if not isinstance(item, dict):
            raise ValueError('hook: object expected')
        htype = item.get('type')
        if htype not in expected or htype in seen:
            raise ValueError('hook.type: must be unique contrarian/pain/suspense')
        seen.add(htype)
        label = (item.get('label') or '').strip()
        cover_line = (item.get('cover_line') or '').strip()
        opening = (item.get('opening') or '').strip()
        why = (item.get('why') or '').strip()
        if not label or not cover_line or not opening or not why:
            raise ValueError('hook: fields must be non-empty')
        if len(opening) > 260:
            opening = opening[:260].rstrip()
        out.append({'type': htype, 'label': label[:24], 'cover_line': cover_line[:24], 'opening': opening, 'why': why[:100]})
    return out


def generate_hooks(title, source_text, llm, client, *, research=None, persona=None, user_id=None):
    """Generate 3 distinct opening hooks (contrarian / pain / suspense) to replace the first section's narration."""
    title = (title or '').strip()[:80]
    source_text = (source_text or '').strip()
    if not source_text or len(source_text) > 24000:
        raise ProviderError('manuscript', 'input_limit', '请先生成或输入文稿内容后再生成开场钩子')
    if research is not None:
        try: research = check_brief(research)
        except (ValueError, AttributeError) as problem: raise ProviderError('manuscript', 'input_limit', f'Invalid research: {problem}') from None
    if persona is not None:
        try: persona = check_persona(persona)
        except (ValueError, AttributeError) as problem: raise ProviderError('manuscript', 'input_limit', f'Invalid persona: {problem}') from None
    if not llm.api_key:
        raise ProviderError('config', 'missing_setting', '请在个人中心配置模型，或在服务端设置 DEEPSEEK_API_KEY')
    lines = [f'主题：{title or "未命名视频"}']
    if persona:
        lines += persona_lines(persona)
    if research:
        lines += brief_lines(research)
    lines.append('当前文稿（重点参考前两段与核心卖点）：')
    lines.append(source_text[:4500])
    messages = [{'role': 'system', 'content': _HOOKS_SYSTEM}, {'role': 'user', 'content': '\n'.join(lines)}]
    ok = False
    try:
        for attempt in range(2):
            body = {'model': llm.model, 'messages': messages, 'max_tokens': 2000, 'response_format': {'type': 'json_object'}}
            if llm.model in ['deepseek-flash', 'deepseek-v4-flash'] and llm.base_url == DEEPSEEK_BASE_URL:
                body['thinking'] = {'type': 'disabled'}
            response = pinned_post(client, llm.base_url.rstrip('/') + '/chat/completions',
                                   headers={'Authorization': 'Bearer ' + llm.api_key}, json=body)
            _status(response, 'manuscript')
            if len(response.content) > 1024 * 1024:
                raise ProviderError('manuscript', 'response_limit', 'Response exceeds 1 MiB')
            choice = response.json()['choices'][0]
            if choice.get('finish_reason') == 'content_filter':
                raise ProviderError('manuscript', 'response_filtered', 'Generation was filtered')
            content = choice['message']['content'] if choice.get('finish_reason') == 'stop' else None
            try:
                hooks = _check_hooks(json.loads(content or ''))
                ok = True
                return hooks
            except (ValueError, TypeError) as problem:
                if attempt:
                    raise ProviderError('manuscript', 'invalid_response', f'钩子生成结果不符合要求：{problem}') from None
                messages = messages + [
                    {'role': 'assistant', 'content': content or ''},
                    {'role': 'user', 'content': f'上面的输出不符合要求（{problem}）。请按要求重新输出完整 JSON。'},
                ]
    except httpx.HTTPError:
        raise ProviderError('manuscript', 'transport_error', 'Provider request failed') from None
    except (KeyError, IndexError, AttributeError):
        raise ProviderError('manuscript', 'invalid_response', 'Expected a complete response') from None
    finally:
        log.info('event=manuscript_hooks user_id=%s ok=%s', user_id, ok)


def polish_manuscript(source_text, llm, client, *, manuscript_format='markdown', persona=None, instruction='', user_id=None):
    """Remove AI cliches and turn stiff prose into crisp spoken sentences (or apply a specific global critique fix)."""
    source_text = (source_text or '').strip()
    if not source_text or len(source_text) > 24000:
        raise ProviderError('manuscript', 'input_limit', '请先输入有效文稿后再润色')
    if manuscript_format not in ('plain', 'markdown'):
        raise ProviderError('manuscript', 'input_limit', 'Unsupported manuscript format')
    instruction = (instruction or '').strip()
    if len(instruction) > 300:
        raise ProviderError('manuscript', 'input_limit', '修改指令不能超过 300 字')
    if persona is not None:
        try: persona = check_persona(persona)
        except (ValueError, AttributeError) as problem: raise ProviderError('manuscript', 'input_limit', f'Invalid persona: {problem}') from None
    if not llm.api_key:
        raise ProviderError('config', 'missing_setting', '请在个人中心配置模型，或在服务端设置 DEEPSEEK_API_KEY')
    prefix_parts = []
    if persona:
        prefix_parts.append('\n'.join(persona_lines(persona)))
    if instruction:
        prefix_parts.append(f'【本次重点修改指令（必须优先落实，其余部分保持稳定）】\n{instruction}')
    prefix = ('\n\n'.join(prefix_parts) + '\n\n') if prefix_parts else ''
    if manuscript_format == 'markdown':
        doc = parse_document(source_text)
        user_content = prefix + json.dumps(doc, ensure_ascii=False)
        system = _POLISH_MARKDOWN_SYSTEM
    else:
        if len(source_text) > 4000:
            raise ProviderError('manuscript', 'input_limit', '纯文本口播不能超过 4000 字符')
        user_content = prefix + source_text
        system = _POLISH_PLAIN_SYSTEM

    body = {'model': llm.model, 'messages': [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': user_content}],
        'max_tokens': 8192}
    if manuscript_format == 'markdown':
        body['response_format'] = {'type': 'json_object'}
    if llm.model in ['deepseek-flash', 'deepseek-v4-flash'] and llm.base_url == DEEPSEEK_BASE_URL:
        body['thinking'] = {'type': 'disabled'}
    ok = False
    try:
        response = pinned_post(client, llm.base_url.rstrip('/') + '/chat/completions',
                               headers={'Authorization': 'Bearer ' + llm.api_key}, json=body)
        _status(response, 'manuscript')
        if len(response.content) > 1024 * 1024:
            raise ProviderError('manuscript', 'response_limit', 'Response exceeds 1 MiB')
        choice = response.json()['choices'][0]
        if choice.get('finish_reason') == 'length':
            raise ProviderError('manuscript', 'output_limit', 'Generation reached token or context budget')
        if choice.get('finish_reason') == 'content_filter':
            raise ProviderError('manuscript', 'response_filtered', 'Generation was filtered')
        if choice.get('finish_reason') != 'stop':
            raise ProviderError('manuscript', 'incomplete_response', 'Generation did not finish normally')
        text = (choice['message']['content'] or '').strip()
        if not text:
            raise ProviderError('manuscript', 'invalid_response', 'Expected non-empty text')
        if manuscript_format == 'markdown':
            text = format_document(json.loads(text))
        elif len(text) > 4000:
            raise ProviderError('manuscript', 'output_limit', 'Manuscript exceeds 4000 code points')
        ok = True
        return text
    except httpx.HTTPError:
        raise ProviderError('manuscript', 'transport_error', 'Provider request failed') from None
    except ProviderError:
        raise
    except (KeyError, IndexError, TypeError, AttributeError, json.JSONDecodeError):
        raise ProviderError('manuscript', 'invalid_response', '润色结果格式无效，请重试') from None
    finally:
        log.info('event=manuscript_polish user_id=%s format=%s ok=%s', user_id, manuscript_format, ok)


def _call_json_llm(llm, client, system, user_content, check, kind, *, max_tokens=2500, user_id=None):
    if not llm.api_key:
        raise ProviderError('config', 'missing_setting', '请在个人中心配置模型，或在服务端设置 DEEPSEEK_API_KEY')
    messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': user_content}]
    ok = False
    try:
        for attempt in range(2):
            body = {'model': llm.model, 'messages': messages, 'max_tokens': max_tokens, 'response_format': {'type': 'json_object'}}
            if llm.model in ['deepseek-flash', 'deepseek-v4-flash'] and llm.base_url == DEEPSEEK_BASE_URL:
                body['thinking'] = {'type': 'disabled'}
            response = pinned_post(client, llm.base_url.rstrip('/') + '/chat/completions',
                                   headers={'Authorization': 'Bearer ' + llm.api_key}, json=body)
            _status(response, 'manuscript')
            if len(response.content) > 1024 * 1024:
                raise ProviderError('manuscript', 'response_limit', 'Response exceeds 1 MiB')
            choice = response.json()['choices'][0]
            if choice.get('finish_reason') == 'content_filter':
                raise ProviderError('manuscript', 'response_filtered', 'Generation was filtered')
            content = choice['message']['content'] if choice.get('finish_reason') == 'stop' else None
            try:
                result = check(json.loads(content or ''))
                ok = True
                return result
            except (ValueError, TypeError) as problem:
                if attempt:
                    raise ProviderError('manuscript', 'invalid_response', f'模型返回的结果不符合要求：{problem}') from None
                messages = messages + [
                    {'role': 'assistant', 'content': content or ''},
                    {'role': 'user', 'content': f'上面的输出不符合要求（{problem}）。请按要求重新输出完整 JSON。'},
                ]
    except httpx.HTTPError:
        raise ProviderError('manuscript', 'transport_error', 'Provider request failed') from None
    except (KeyError, IndexError, AttributeError):
        raise ProviderError('manuscript', 'invalid_response', 'Expected a complete response') from None
    finally:
        log.info('event=%s user_id=%s ok=%s', kind, user_id, ok)


def rewrite_section(title, source_text, section_id, instruction, llm, client, *, persona=None, research=None, user_id=None):
    """Rewrite a single section in a Markdown manuscript while keeping all other sections untouched."""
    doc = parse_document((source_text or '').strip())
    idx = next((i for i, s in enumerate(doc['sections']) if s['id'] == section_id), -1)
    if idx < 0:
        raise ProviderError('manuscript', 'input_limit', f'未找到段落 [{section_id}]')
    instruction = (instruction or '').strip()
    if not instruction or len(instruction) > 300:
        raise ProviderError('manuscript', 'input_limit', '请填写 1–300 字的修改要求')
    if persona is not None:
        try: persona = check_persona(persona)
        except (ValueError, AttributeError) as problem: raise ProviderError('manuscript', 'input_limit', f'Invalid persona: {problem}') from None
    if research is not None:
        try: research = check_brief(research)
        except (ValueError, AttributeError) as problem: raise ProviderError('manuscript', 'input_limit', f'Invalid research: {problem}') from None

    outline_ctx = ' / '.join(f'{i + 1}. {s["title"]}' for i, s in enumerate(doc['sections']))
    lines = [f'视频主题：{(title or "未命名视频").strip()[:80]}', f'全文段落脉络：{outline_ctx}']
    if persona:
        lines += persona_lines(persona)
    if research:
        lines += brief_lines(research)
    lines.append('当前需要重写的段落（JSON）：')
    lines.append(json.dumps(doc['sections'][idx], ensure_ascii=False))
    lines.append(f'修改要求：{instruction}')

    def _check_sec(val):
        if not isinstance(val, dict):
            raise ValueError('section object expected')
        updated = {
            'id': section_id,
            'title': str(val.get('title') or doc['sections'][idx]['title']).strip(),
            'narration': str(val.get('narration') or '').strip(),
            'materials': str(val.get('materials') or '').strip(),
            'visual_intent': str(val.get('visual_intent') or '').strip(),
        }
        merged = {'sections': [updated if i == idx else s for i, s in enumerate(doc['sections'])]}
        return format_document(merged)

    return _call_json_llm(llm, client, _REWRITE_SECTION_SYSTEM, '\n'.join(lines), _check_sec, 'manuscript_rewrite_section', max_tokens=2500, user_id=user_id)


def critique_manuscript(title, source_text, llm, client, *, manuscript_format='markdown', user_id=None):
    """Score and critique a manuscript before spending budget on TTS & Scene Agent."""
    source_text = (source_text or '').strip()
    if not source_text or len(source_text) > 24000:
        raise ProviderError('manuscript', 'input_limit', '请先输入文稿后再进行审稿')
    user_content = f'视频主题：{(title or "未命名视频").strip()[:80]}\n格式：{manuscript_format}\n\n文稿正文：\n{source_text[:8000]}'

    def _check(val):
        if not isinstance(val, dict):
            raise ValueError('critique object expected')
        scores = val.get('scores') or {}
        if not isinstance(scores, dict):
            raise ValueError('scores object expected')
        norm_scores = {}
        for k in ('hook', 'density', 'pacing', 'visual'):
            n = scores.get(k)
            if not isinstance(n, (int, float)) or not 0 <= n <= 100:
                raise ValueError(f'scores.{k}: 0–100 expected')
            norm_scores[k] = int(round(n))
        overall = val.get('overall_score')
        if not isinstance(overall, (int, float)) or not 0 <= overall <= 100:
            overall = round(sum(norm_scores.values()) / 4)
        verdict = str(val.get('verdict') or '').strip()
        if not verdict:
            raise ValueError('verdict required')
        issues_in = val.get('issues')
        if not isinstance(issues_in, list) or not 1 <= len(issues_in) <= 6:
            raise ValueError('issues: 1–6 items expected')
        issues = []
        for it in issues_in[:5]:
            if not isinstance(it, dict):
                raise ValueError('issue object expected')
            sec = str(it.get('section') or '全局').strip()[:30]
            sec_id = str(it.get('section_id') or '').strip()[:32]
            prob = str(it.get('problem') or '').strip()[:120]
            fix = str(it.get('fix') or '').strip()[:160]
            if not prob or not fix:
                raise ValueError('issue problem and fix required')
            issues.append({'section': sec, 'section_id': sec_id, 'problem': prob, 'fix': fix})
        return {'overall_score': int(round(overall)), 'scores': norm_scores, 'verdict': verdict[:120], 'issues': issues}

    return _call_json_llm(llm, client, _CRITIQUE_SYSTEM, user_content, _check, 'manuscript_critique', max_tokens=2000, user_id=user_id)


def generate_publish_kit(title, source_text, llm, client, *, platform='general', user_id=None):
    """Generate multi-platform publishing metadata (5 titles, cover text, summary, tags, pinned comment)."""
    source_text = (source_text or '').strip()
    if not source_text or len(source_text) > 24000:
        raise ProviderError('manuscript', 'input_limit', '请先输入文稿后再生成发布套件')
    plat_names = {'general': '全平台通用', 'douyin': '抖音 / 快手', 'xiaohongshu': '小红书', 'bilibili': 'B站 / YouTube', 'wechat': '微信公众号 / 视频号'}
    plat_label = plat_names.get(platform, '全平台通用')
    user_content = f'目标平台：{plat_label}\n视频主题：{(title or "未命名视频").strip()[:80]}\n\n文稿正文：\n{source_text[:7000]}'

    def _check(val):
        if not isinstance(val, dict):
            raise ValueError('publish kit object expected')
        titles = val.get('titles')
        if not isinstance(titles, list) or not 3 <= len(titles) <= 6:
            raise ValueError('titles: 3–6 items expected')
        clean_titles = [str(t).strip()[:50] for t in titles if str(t).strip()]
        if len(clean_titles) < 3:
            raise ValueError('titles: non-empty items required')
        tags = val.get('tags')
        if not isinstance(tags, list) or not 3 <= len(tags) <= 12:
            raise ValueError('tags: 3–12 items expected')
        clean_tags = [str(t).strip().lstrip('#')[:24] for t in tags if str(t).strip().lstrip('#')]
        cover_main = str(val.get('cover_main') or '').strip()[:24]
        cover_sub = str(val.get('cover_sub') or '').strip()[:30]
        summary = str(val.get('summary') or '').strip()[:400]
        pinned = str(val.get('pinned_comment') or '').strip()[:180]
        if not cover_main or not summary or not pinned:
            raise ValueError('cover_main, summary, pinned_comment required')
        return {
            'platform': platform,
            'platform_label': plat_label,
            'titles': clean_titles[:5],
            'cover_main': cover_main,
            'cover_sub': cover_sub,
            'summary': summary,
            'tags': clean_tags[:10],
            'pinned_comment': pinned,
        }

    return _call_json_llm(llm, client, _PUBLISH_KIT_SYSTEM, user_content, _check, 'manuscript_publish_kit', max_tokens=2000, user_id=user_id)


def convert_article_to_manuscript(article_text, llm, client, *, title='', duration_hint='3分钟',
                                  teaching_style='popular', manuscript_format='markdown',
                                  focus='', persona=None, user_id=None):
    """Distill a long article, blog post or notes into a punchy spoken-video script (Markdown storyboard or plain)."""
    article_text = (article_text or '').strip()
    if len(article_text) < 20 or len(article_text) > 25000:
        raise ProviderError('manuscript', 'input_limit', '长文内容需在 20–25000 字之间')
    if manuscript_format not in ('plain', 'markdown'):
        raise ProviderError('manuscript', 'input_limit', 'Unsupported manuscript format')
    if teaching_style not in _TEACHING_STYLES:
        raise ProviderError('manuscript', 'input_limit', 'teaching_style must be popular or technical')
    if persona is not None:
        try: persona = check_persona(persona)
        except (ValueError, AttributeError) as problem: raise ProviderError('manuscript', 'input_limit', f'Invalid persona: {problem}') from None
    if not llm.api_key:
        raise ProviderError('config', 'missing_setting', '请在个人中心配置模型，或在服务端设置 DEEPSEEK_API_KEY')

    title_clean = (title or '').strip()[:80]
    focus_clean = (focus or '').strip()[:300]
    dur_clean = (duration_hint or '3分钟').strip()[:40]

    lines = [
        '【任务：长文 / 笔记提炼改写为短视频分镜口播稿】',
        f'目标视频时长：{dur_clean}（按每秒约 5 字控制总口播字数；每段口播不超过 100 秒）',
        '风格：' + ('知识干货（讲清机制、数据与步骤）' if teaching_style == 'technical' else '通俗科普（用类比和短句讲透核心观点）'),
        '改写要求：',
        '1. 严格忠于下方原文中的真实事实、数据、案例与观点，绝不编造原文没有的数字或结论；',
        '2. 删掉文章里的书面铺垫与冗余背景，重构一个前 3 秒抓人的短视频开场钩子；',
        '3. 拆分成长短错落的口语短句，禁止“综上所述、总而言之、不仅如此”等 AI 套话；',
    ]
    if manuscript_format == 'markdown':
        lines.append('4. 把原文中最有价值的数据、对比项、步骤节点或代码积极沉淀到每段的 materials（画面素材），供动画直接绘制，不要偷懒填“无”。')
    if title_clean:
        lines.append(f'参考标题：{title_clean}')
    if focus_clean:
        lines.append(f'用户特别要求：{focus_clean}')
    if persona:
        lines += persona_lines(persona)
    lines.append('\n--- 以下为原文内容 ---\n' + article_text[:18000])

    system = _DOCUMENT_SYSTEM if manuscript_format == 'markdown' else _SYSTEM_TECHNICAL if teaching_style == 'technical' else _SYSTEM_POPULAR
    body = {'model': llm.model, 'messages': [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': '\n'.join(lines)}],
        'max_tokens': 8192}
    if manuscript_format == 'markdown':
        body['response_format'] = {'type': 'json_object'}
    if llm.model in ['deepseek-flash', 'deepseek-v4-flash'] and llm.base_url == DEEPSEEK_BASE_URL:
        body['thinking'] = {'type': 'disabled'}
    ok = False
    try:
        response = pinned_post(client, llm.base_url.rstrip('/') + '/chat/completions',
                               headers={'Authorization': 'Bearer ' + llm.api_key}, json=body)
        _status(response, 'manuscript')
        if len(response.content) > 1024 * 1024:
            raise ProviderError('manuscript', 'response_limit', 'Response exceeds 1 MiB')
        choice = response.json()['choices'][0]
        if choice.get('finish_reason') == 'length':
            raise ProviderError('manuscript', 'output_limit', 'Generation reached token or context budget')
        if choice.get('finish_reason') == 'content_filter':
            raise ProviderError('manuscript', 'response_filtered', 'Generation was filtered')
        if choice.get('finish_reason') != 'stop':
            raise ProviderError('manuscript', 'incomplete_response', 'Generation did not finish normally')
        text = (choice['message']['content'] or '').strip()
        if not text:
            raise ProviderError('manuscript', 'invalid_response', 'Expected non-empty text')
        derived_title = title_clean
        if manuscript_format == 'markdown':
            parsed = json.loads(text)
            if not derived_title and isinstance(parsed, dict) and parsed.get('sections'):
                derived_title = str(parsed['sections'][0].get('title') or '').strip()[:80]
            text = format_document(parsed)
        elif len(text) > 4000:
            raise ProviderError('manuscript', 'output_limit', 'Manuscript exceeds 4000 code points')
        if not derived_title:
            first_line = next((ln.strip('# ').strip() for ln in article_text.splitlines() if ln.strip()), '长文转视频')
            derived_title = first_line[:40]
        ok = True
        return {'title': derived_title, 'text': text}
    except httpx.HTTPError:
        raise ProviderError('manuscript', 'transport_error', 'Provider request failed') from None
    except ProviderError:
        raise
    except (KeyError, IndexError, TypeError, AttributeError, json.JSONDecodeError):
        raise ProviderError('manuscript', 'invalid_response', '长文转换结果格式无效，请重试') from None
    finally:
        log.info('event=manuscript_from_article user_id=%s format=%s ok=%s', user_id, manuscript_format, ok)
