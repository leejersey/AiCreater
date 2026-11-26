"""DeepSeek plain-text manuscript generation; never log prompts or secrets."""
import json
import re
import logging

import httpx

from services.workflow.content_skills import call_json, skill
from services.accounts.model_settings import DEEPSEEK_BASE_URL
from services.workflow.destination import pinned_post
from services.workflow.providers import ProviderError, _status

from services.workflow.manuscript_document import format_document, narration_text, parse_document
from services.workflow.ideation import check_angle, check_outline, plan_lines
from services.workflow.research import brief_lines, check_brief

log = logging.getLogger(__name__)

_DOCUMENT_SYSTEM = skill('storyboard-document').prompt()

_HOOKS_SYSTEM = skill('opening-hooks').prompt()

_POLISH_MARKDOWN_SYSTEM = skill('polish-storyboard').prompt()

_POLISH_PLAIN_SYSTEM = skill('polish-plain').prompt()

_SYSTEM_TECHNICAL = skill('script-technical').prompt()

_SYSTEM_POPULAR = skill('script-popular').prompt()

_TEACHING_STYLES = frozenset({'popular', 'technical'})

_REWRITE_SECTION_SYSTEM = skill('rewrite-section').prompt()

_CRITIQUE_SYSTEM = skill('critique').prompt()

_PUBLISH_KIT_SYSTEM = skill('publish-kit').prompt()


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


def _user_message(title, audience, duration_hint, outline, teaching_style, plan=None, markdown=False, research=None, persona=None, formula=None):
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
            lines.append('事实只能来自上面编号的 E 条目：用到事实的段落，在 materials 最后单独一行写「依据：[E1][E3]」（写实际用到的编号）；'
                         '没用到事实的段落不写。narration 里绝不出现 [E…] 编号。简报里没有的数字、研究结论和机构不要写。')
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
    if formula:
        from services.studio.breakdowns import formula_lines
        lines += formula_lines(formula, markdown)
    if plan:
        lines += plan_lines(plan)
        lines.append('每章写成一段：段落标题用章节标题，visual_intent 以该章的画面构想为基础并引用本段口播短句；'
                     '每段口播的字数约为该章预计秒数 × 5（例如 30 秒约 150 字），不要只写提纲式的短句。' if markdown
                     else '口播按大纲顺序展开，每章一个自然段，各章篇幅与预计秒数相称（约每秒 5 字）。')
    return '\n'.join(lines)



def _complete(llm, client, body, stage='manuscript'):
    """One chat completion's text, after the provider and finish-reason checks every manuscript call shares."""
    response = pinned_post(client, llm.base_url.rstrip('/') + '/chat/completions',
                           headers={'Authorization': 'Bearer ' + llm.api_key}, json=body)
    _status(response, stage)
    if len(response.content) > 1024 * 1024:
        raise ProviderError(stage, 'response_limit', 'Response exceeds 1 MiB')
    choice = response.json()['choices'][0]
    if choice.get('finish_reason') == 'length':
        raise ProviderError(stage, 'output_limit', 'Generation reached token or context budget')
    if choice.get('finish_reason') == 'content_filter':
        raise ProviderError(stage, 'response_filtered', 'Generation was filtered')
    if choice.get('finish_reason') != 'stop':
        raise ProviderError(stage, 'incomplete_response', 'Generation did not finish normally')
    text = (choice['message']['content'] or '').strip()
    if not text:
        raise ProviderError(stage, 'invalid_response', 'Expected non-empty text')
    return text


def _document(llm, client, body, advise=None):
    """A Markdown storyboard document: (formatted text, parsed JSON). A reply that fails the document check is asked for
    once more with the reason (the model sometimes leaves a blank field or a list mark in the narration).
    advise(parsed) may return a soft problem (e.g. far too long): asked once to fix it, then the second reply is kept."""
    messages = body['messages']
    for attempt in range(2):
        text = _complete(llm, client, {**body, 'messages': messages})
        if len(text) > 24000:
            raise ProviderError('manuscript', 'output_limit', 'Document exceeds 24000 code points')
        try:
            parsed = json.loads(text)
            formatted = format_document(parsed)
            advice = advise(parsed) if advise and not attempt else None
            if not advice:
                return formatted, parsed
            messages = messages + [{'role': 'assistant', 'content': text}, {'role': 'user', 'content': advice + '请重新输出完整 JSON。'}]
        except (json.JSONDecodeError, ProviderError) as problem:
            if isinstance(problem, ProviderError) and problem.code != 'invalid_response' or attempt:
                raise ProviderError('manuscript', 'invalid_response', f'模型返回的文稿不符合格式要求：{problem}') from None
            reason = 'JSON 无法解析' if isinstance(problem, json.JSONDecodeError) else str(problem).split(': ', 2)[-1]
            messages = messages + [{'role': 'assistant', 'content': text},
                                   {'role': 'user', 'content': f'上面的输出不符合要求：{reason}。请按要求重新输出完整 JSON。'}]

def generate_manuscript(title, llm, client, *, audience='', duration_hint='', outline='', user_id=None,
                      teaching_style='popular', manuscript_format='plain', plan=None, research=None, persona=None, formula=None):
    """llm: services.accounts.model_settings.LLM (the account's model or the server's DeepSeek).
    plan: {angle, outline} chosen in ideation; the manuscript follows that outline chapter by chapter."""
    if formula is not None:
        from services.studio.breakdowns import check_formula
        try: formula = check_formula(formula)
        except (ValueError, AttributeError) as problem: raise ProviderError('manuscript', 'input_limit', f'Invalid formula: {problem}') from None
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
        {'role': 'user', 'content': _user_message(title, audience, duration_hint, outline, teaching_style, plan, manuscript_format == 'markdown', research=research, persona=persona, formula=formula)}],
        'max_tokens': 8192}
    if manuscript_format == 'markdown':
        body['response_format'] = {'type': 'json_object'}
    # A DeepSeek-only switch: other OpenAI-compatible services may reject unknown fields.
    if llm.model in ['deepseek-flash', 'deepseek-v4-flash'] and llm.base_url == DEEPSEEK_BASE_URL:
        body['thinking'] = {'type': 'disabled'}
    chars, ok = 0, False
    try:
        if manuscript_format == 'markdown':
            target = sum(sec['seconds'] for sec in plan['outline']['sections']) * 5 if plan else 0
            text, _ = _document(llm, client, body, advise=(lambda doc: _too_short(doc, target)) if target else None)
        elif len(text := _complete(llm, client, body)) > 4000:
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
        if manuscript_format == 'markdown':
            text, _ = _document(llm, client, body)
        elif len(text := _complete(llm, client, body)) > 4000:
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
    return call_json(llm, client, system, user_content, check, kind, stage='manuscript', max_tokens=max_tokens, user_id=user_id)


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



def _budget_seconds(duration_hint):
    m = re.search(r'(\d+(?:\.\d+)?)\s*(分钟|分|min|m|秒|s)?', duration_hint or '', re.I)
    seconds = 180 if not m else float(m.group(1)) * (1 if (m.group(2) or '分钟').lower() in ('秒', 's') else 60)
    return max(30, min(int(seconds), 780))


def _too_short(document, target_chars):
    """Advice when a storyboard written from an outline has well under its planned narration; None when it is close."""
    chars = len(narration_text(document))
    if chars >= target_chars * 0.8: return None  # the model leans short: under 80% of the plan is asked once to expand
    return (f'口播合计只有 {chars} 字，约 {chars // 5} 秒，大纲规划约 {target_chars // 5} 秒（约 {target_chars} 字）。'
            f'请按每章预计秒数 × 5 字扩写每段口播：讲清机制、补上例子和过渡，不要只写提纲式短句，事实仍只能来自编号的 E 条目。')


def _too_long(document, duration_hint):
    """Advice when the narration is more than 25% over the budget's cap; None when it fits."""
    chars, budget = len(narration_text(document)), _budget_seconds(duration_hint) * 5
    if chars <= budget * 1.15 * 1.25:
        return None
    return (f'口播合计 {chars} 字，约 {chars // 5} 秒，远超目标时长（约 {budget} 字）。请压缩到 {budget} 字左右：'
            f'只保留最有价值的几点，合并或删掉次要段落，段数控制在 {max(2, budget // 225)}–{max(3, budget // 125)} 段。')


def _length_budget(duration_hint):
    """The narration budget for a target length, at about 5 spoken characters per second (the TTS pace we measure):
    a long article otherwise comes back two or three times too long."""
    seconds = _budget_seconds(duration_hint)
    chars = seconds * 5
    return (f'口播合计约 {chars} 字，最多不超过 {int(chars * 1.15)} 字（约每秒 5 字）；分 {max(2, seconds // 45)}–{max(3, seconds // 25)} 段，'
            '每段口播不超过 100 秒。原文内容多时只挑最有价值的几点讲透，不要全部罗列。')

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
        f'目标视频时长：{dur_clean}。' + _length_budget(dur_clean),
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
        derived_title = title_clean
        if manuscript_format == 'markdown':
            text, parsed = _document(llm, client, body, advise=lambda doc: _too_long(doc, dur_clean))
            if not derived_title:
                derived_title = str(parsed['sections'][0].get('title') or '').strip()[:80]
        elif len(text := _complete(llm, client, body)) > 4000:
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
