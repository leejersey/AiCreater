"""Hotspot research, URL extraction and viral-structure deconstruction for manuscript generation.

Stage 1: Tavily multi-platform search + Tavily Extract (with safe pinned_get fallback) + LLM viral brief deconstruction.
Stage 2 (trends.py) and Stage 3 (social_providers.py) plug into this module cleanly without changing the brief contract.
Never log API keys or raw user text."""
import hashlib
import html
import json
import logging
import os
import re
from urllib.parse import urlsplit

import httpx

from services.workflow.content_skills import skill
from services.accounts.model_settings import DEEPSEEK_BASE_URL
from services.workflow.destination import pinned_get, pinned_post
from services.workflow import usage_log
from services.workflow.providers import ProviderError, _status

log = logging.getLogger(__name__)

TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract'

PLATFORMS = {
    'all': {'label': '全网热点', 'domains': []},
    'wechat': {'label': '公众号', 'domains': ['mp.weixin.qq.com']},
    'xiaohongshu': {'label': '小红书', 'domains': ['xiaohongshu.com']},
    'douyin': {'label': '抖音', 'domains': ['douyin.com']},
    'x': {'label': 'X / Twitter', 'domains': ['x.com', 'twitter.com']},
    'bilibili': {'label': 'B站', 'domains': ['bilibili.com']},
    'youtube': {'label': 'YouTube', 'domains': ['youtube.com', 'youtu.be']},
    'zhihu': {'label': '知乎', 'domains': ['zhihu.com']},
    'tech': {'label': '科技媒体', 'domains': ['36kr.com', 'huxiu.com', 'sspai.com', 'github.com', 'huggingface.co']},
}

TIME_RANGES = ('day', 'week', 'month')

VIRAL_STYLES = {
    'balanced': {'label': '均衡爆款（干货+钩子）', 'guide': '兼顾前 3 秒强钩子与扎实信息密度，逻辑顺滑、案例具体。'},
    'short_video': {'label': '强钩子短视频节奏', 'guide': '前 3 秒用反差/痛点直接抓人，短句快节奏、每 15–20 秒一个小反转或金句，结尾有互动引导。'},
    'deep_article': {'label': '深度公众号拆解', 'guide': '由真实热点事件或痛点故事切入，层层拆解底层逻辑与关键案例，观点鲜明有记忆点。'},
    'myth_bust': {'label': '反常识 / 避坑打假', 'guide': '先抛出大众普遍误区制造认知冲突，再用真实事实与对比逐条纠偏，给出可执行结论。'},
}

_ANALYZE_SYSTEM = skill('hotspot-brief').prompt()


def _clean_text(value, limit, name, *, allow_empty=False):
    if not isinstance(value, str):
        raise ValueError(f'{name}: string expected')
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', value).strip()
    if not cleaned:
        if allow_empty:
            return ''
        raise ValueError(f'{name}: must not be empty')
    if len(cleaned) > limit:
        cleaned = cleaned[:limit].rstrip()
    return cleaned


def detect_platform(url: str) -> str:
    host = (urlsplit(url or '').hostname or '').lower()
    for key, meta in PLATFORMS.items():
        if key == 'all':
            continue
        for domain in meta['domains']:
            if host == domain or host.endswith('.' + domain):
                return key
    return 'web'


def platform_label(key: str) -> str:
    if key in PLATFORMS:
        return PLATFORMS[key]['label']
    if key == 'manual':
        return '手动导入'
    if key == 'hackernews':
        return 'Hacker News'
    if key == 'github':
        return 'GitHub'
    return '网页'


def _item_id(url: str, title: str) -> str:
    raw = (url or title or 'item').encode('utf-8', errors='ignore')
    return hashlib.sha256(raw).hexdigest()[:12]


def _tavily_key(api_key: str | None = None) -> str:
    key = (api_key if api_key is not None else os.getenv('TAVILY_API_KEY', '')).strip()
    if not key:
        raise ProviderError('research', 'missing_setting', '尚未配置 TAVILY_API_KEY，请在 .env 中配置后重启服务，或使用「粘贴链接 / 爆款文案」与「今日热榜」。')
    return key


def research_status(env=None) -> dict:
    src = os.environ if env is None else env
    return {
        'tavily_configured': bool((src.get('TAVILY_API_KEY') or '').strip()),
        'tikhub_configured': bool((src.get('TIKHUB_API_KEY') or '').strip()),
        'apify_configured': bool((src.get('APIFY_API_TOKEN') or '').strip()),
        'platforms': [{'id': k, 'label': v['label']} for k, v in PLATFORMS.items()],
        'viral_styles': [{'id': k, 'label': v['label']} for k, v in VIRAL_STYLES.items()],
    }


def search_hot_sources(query: str, *, platforms: list[str] | tuple[str, ...] = ('all',),
                       time_range: str = 'week', max_results: int = 8,
                       client: httpx.Client, api_key: str | None = None,
                       env=None) -> dict:
    """Search hot articles/posts via Tavily (optionally scoped to platform domains) and optional social providers."""
    q = _clean_text(query, 120, 'query')
    if time_range not in TIME_RANGES:
        raise ProviderError('research', 'input_limit', 'time_range must be day, week, or month')
    max_results = max(1, min(int(max_results), 12))
    selected = [p for p in (platforms or ['all']) if p in PLATFORMS] or ['all']

    # Stage 3 pluggable social provider hook (TikHub / Apify) for Douyin & Xiaohongshu when configured.
    social_items = []
    social_providers_used = []
    if any(p in ('douyin', 'xiaohongshu') for p in selected):
        try:
            from services.workflow.social_providers import search_social_platforms
            social_items, social_providers_used = search_social_platforms(
                q, [p for p in selected if p in ('douyin', 'xiaohongshu')],
                max_results=min(5, max_results), client=client, env=env)
        except Exception as exc:
            log.info('event=social_search_fallback reason=%s', type(exc).__name__)

    domains = []
    if 'all' not in selected:
        for p in selected:
            for d in PLATFORMS[p]['domains']:
                if d not in domains:
                    domains.append(d)

    # Enhance query gently for X/short-video platforms when searched via Tavily.
    search_query = q
    if selected == ['x']:
        search_query = f'{q} (site:x.com OR site:twitter.com)'

    tavily_items = []
    answer = ''
    key = (api_key if api_key is not None else (os.environ if env is None else env).get('TAVILY_API_KEY', '')).strip()
    if key:
        payload = {
            'api_key': key,
            'query': search_query,
            'search_depth': 'advanced',
            'topic': 'news' if time_range == 'day' and not domains else 'general',
            'time_range': time_range,
            'max_results': max_results,
            'include_answer': True,
            'include_raw_content': False,
        }
        if domains:
            payload['include_domains'] = domains
        try:
            response = pinned_post(client, TAVILY_SEARCH_URL,
                                   headers={'Content-Type': 'application/json'}, json=payload, stage='research', env=env)
            _status(response, 'research')
            if len(response.content) > 2 * 1024 * 1024:
                raise ProviderError('research', 'response_limit', 'Search response exceeds 2 MiB')
            data = response.json()
            answer = (data.get('answer') or '').strip()[:600]
            for raw in data.get('results') or []:
                url = (raw.get('url') or '').strip()
                title = (raw.get('title') or '').strip() or url
                content = (raw.get('content') or '').strip()
                if not title and not content:
                    continue
                plat = detect_platform(url)
                tavily_items.append({
                    'id': _item_id(url, title),
                    'title': title[:160],
                    'url': url[:500],
                    'platform': plat,
                    'platform_label': platform_label(plat),
                    'snippet': content[:360],
                    'content': content[:2400],
                    'published_at': (raw.get('published_date') or '').strip()[:40],
                    'score': round(float(raw.get('score') or 0), 3),
                    'metrics': '',
                    'provider': 'tavily',
                })
        except httpx.HTTPError:
            if not social_items:
                raise ProviderError('research', 'transport_error', 'Tavily 搜索请求失败，请检查网络连接') from None
    elif not social_items:
        _tavily_key('')  # raises missing_setting

    merged = []
    seen = set()
    for item in [*social_items, *tavily_items]:
        dedupe = item.get('url') or item.get('id')
        if dedupe in seen:
            continue
        seen.add(dedupe)
        merged.append(item)

    providers = [*social_providers_used, *(['tavily'] if key else [])]
    return {'query': q, 'answer': answer, 'items': merged[:max_results], 'providers': providers}


def _strip_html(raw_html: str) -> tuple[str, str]:
    title_match = re.search(r'<title[^>]*>(.*?)</title>', raw_html, flags=re.IGNORECASE | re.DOTALL)
    title = html.unescape(re.sub(r'\s+', ' ', title_match.group(1))).strip() if title_match else ''
    cleaned = re.sub(r'<(script|style|noscript|svg|header|footer|nav)[^>]*>[\s\S]*?</\1>', ' ', raw_html, flags=re.IGNORECASE)
    cleaned = re.sub(r'<[^>]+>', '\n', cleaned)
    cleaned = html.unescape(cleaned)
    lines = [re.sub(r'\s+', ' ', ln).strip() for ln in cleaned.splitlines()]
    text = '\n'.join(ln for ln in lines if len(ln) >= 2)
    return title[:160], text[:4000]


def extract_url_content(url: str, *, client: httpx.Client, api_key: str | None = None, env=None) -> dict:
    """Extract readable text/transcript from a URL (YouTube/Bilibili specialized, TikHub for Douyin/XHS, Tavily Extract, pinned_get fallback)."""
    target = _clean_text(url, 500, 'url')
    parts = urlsplit(target)
    if parts.scheme != 'https' or not parts.hostname:
        raise ProviderError('research', 'input_limit', '仅支持有效的 https:// 链接')
    plat = detect_platform(target)

    # Stage 2: specialized Bilibili / YouTube extractor (metadata + captions/transcript)
    if plat in ('bilibili', 'youtube'):
        try:
            from services.workflow.trends import extract_video_url
            video_item = extract_video_url(target, plat, client=client, env=env)
            if video_item and video_item.get('content'):
                return video_item
        except Exception as exc:
            log.info('event=video_extract_fallback platform=%s reason=%s', plat, type(exc).__name__)

    # Stage 3: specialized TikHub extractor for Douyin / Xiaohongshu when configured
    if plat in ('douyin', 'xiaohongshu'):
        try:
            from services.workflow.social_providers import extract_social_url
            social_item = extract_social_url(target, plat, client=client, env=env)
            if social_item and social_item.get('content'):
                return social_item
        except Exception as exc:
            log.info('event=social_extract_fallback platform=%s reason=%s', plat, type(exc).__name__)

    key = (api_key if api_key is not None else (os.environ if env is None else env).get('TAVILY_API_KEY', '')).strip()
    if key:
        try:
            response = pinned_post(
                client, TAVILY_EXTRACT_URL,
                headers={'Content-Type': 'application/json'},
                json={'api_key': key, 'urls': [target]},
                stage='research', env=env,
            )
            if response.status_code == 200 and len(response.content) <= 2 * 1024 * 1024:
                results = response.json().get('results') or []
                if results:
                    raw = results[0]
                    content = (raw.get('raw_content') or raw.get('content') or '').strip()
                    if content:
                        first_line = next((ln.strip('# ').strip() for ln in content.splitlines() if ln.strip()), '')
                        title = (raw.get('title') or first_line or target)[:160]
                        return {
                            'id': _item_id(target, title),
                            'title': title,
                            'url': target,
                            'platform': plat,
                            'platform_label': platform_label(plat),
                            'snippet': content[:360],
                            'content': content[:4000],
                            'published_at': '',
                            'score': 1.0,
                            'metrics': '',
                            'provider': 'tavily_extract',
                        }
        except httpx.HTTPError:
            pass

    # Safe fallback: direct pinned_get (HTTPS + public IP only, no redirects)
    try:
        resp = pinned_get(
            client, target,
            headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'},
            stage='research', env=env,
        )
        if resp.status_code >= 400:
            raise ProviderError('research', 'transport_error', f'无法抓取该链接（HTTP {resp.status_code}），该平台可能有访问限制，建议直接复制爆款文案粘贴导入。')
        if len(resp.content) > 2 * 1024 * 1024:
            raise ProviderError('research', 'response_limit', '网页内容过大，请直接复制正文粘贴导入。')
        title, text = _strip_html(resp.text)
        if len(text) < 30:
            raise ProviderError('research', 'invalid_response', '未能从该链接提取到有效正文（可能需要登录或触发反爬），建议直接复制原文粘贴导入。')
        return {
            'id': _item_id(target, title or target),
            'title': title or target,
            'url': target,
            'platform': plat,
            'platform_label': platform_label(plat),
            'snippet': text[:360],
            'content': text[:4000],
            'published_at': '',
            'score': 1.0,
            'metrics': '',
            'provider': 'direct_fetch',
        }
    except httpx.HTTPError:
        raise ProviderError('research', 'transport_error', '抓取链接失败，建议直接复制原文或口播稿粘贴导入。') from None


def check_brief(value) -> dict:
    """Strictly validate a ResearchBrief before feeding it to ideation or manuscript generation."""
    if not isinstance(value, dict):
        raise ValueError('research: object expected')
    facts = value.get('facts')
    hooks = value.get('hooks')
    pain_points = value.get('pain_points')
    if not isinstance(facts, list) or not 1 <= len(facts) <= 8:
        raise ValueError('research.facts: 1–8 items')
    if not isinstance(hooks, list) or not 1 <= len(hooks) <= 6:
        raise ValueError('research.hooks: 1–6 items')
    if not isinstance(pain_points, list) or not 1 <= len(pain_points) <= 6:
        raise ValueError('research.pain_points: 1–6 items')
    viral_style = value.get('viral_style') or 'balanced'
    if viral_style not in VIRAL_STYLES:
        raise ValueError('research.viral_style: unknown')
    sources_in = value.get('sources') or []
    if not isinstance(sources_in, list) or len(sources_in) > 5:
        raise ValueError('research.sources: at most 5 items')
    sources = []
    for s in sources_in:
        if not isinstance(s, dict):
            raise ValueError('research.source: object expected')
        sources.append({
            'title': _clean_text(s.get('title') or '参考素材', 160, 'source.title'),
            'platform_label': _clean_text(s.get('platform_label') or '网页', 30, 'source.platform_label'),
            'url': _clean_text(s.get('url') or '', 500, 'source.url', allow_empty=True),
        })
    return {
        'facts': [_clean_text(f, 160, 'fact') for f in facts],
        'hooks': [_clean_text(h, 120, 'hook') for h in hooks],
        'pain_points': [_clean_text(p, 120, 'pain_point') for p in pain_points],
        'pacing': _clean_text(value.get('pacing') or '', 300, 'pacing'),
        'viral_style': viral_style,
        'sources': sources,
    }


def analyze_viral_brief(llm, client: httpx.Client, *, topic: str, sources: list[dict],
                        viral_style: str = 'balanced', user_id=None) -> dict:
    """Deconstruct 1–5 selected hot articles/posts into facts, hooks, pain points and pacing."""
    if not llm.api_key:
        raise ProviderError('config', 'missing_setting', '请在个人中心配置模型，或在服务端设置 DEEPSEEK_API_KEY')
    topic_clean = _clean_text(topic or '热点视频选题', 80, 'topic')
    if viral_style not in VIRAL_STYLES:
        raise ProviderError('research', 'input_limit', 'Unsupported viral_style')
    if not isinstance(sources, list) or not 1 <= len(sources) <= 5:
        raise ProviderError('research', 'input_limit', '请选择 1–5 条参考素材进行拆解')

    normalized_sources = []
    prompt_lines = [f'目标选题：{topic_clean}', f'期望爆款风格：{VIRAL_STYLES[viral_style]["label"]}（{VIRAL_STYLES[viral_style]["guide"]}）', '', '参考资料：']
    for i, item in enumerate(sources, 1):
        title = _clean_text(item.get('title') or f'参考素材 {i}', 160, f'sources[{i}].title')
        content = _clean_text(item.get('content') or item.get('snippet') or '', 3000, f'sources[{i}].content')
        plat_label = _clean_text(item.get('platform_label') or platform_label(item.get('platform') or 'web'), 30, f'sources[{i}].platform_label')
        url = _clean_text(item.get('url') or '', 500, f'sources[{i}].url', allow_empty=True)
        metrics = _clean_text(item.get('metrics') or '', 80, f'sources[{i}].metrics', allow_empty=True)
        normalized_sources.append({'title': title, 'platform_label': plat_label, 'url': url})
        meta_line = f'[{i}]（{plat_label}）{title}' + (f' · {metrics}' if metrics else '')
        prompt_lines.append(meta_line)
        prompt_lines.append(content)
        prompt_lines.append('')

    messages = [{'role': 'system', 'content': _ANALYZE_SYSTEM}, {'role': 'user', 'content': '\n'.join(prompt_lines)}]
    ok = False
    try:
        for attempt in range(2):
            body = {'model': llm.model, 'messages': messages, 'max_tokens': 2500, 'response_format': {'type': 'json_object'}}
            if llm.model in ['deepseek-flash', 'deepseek-v4-flash'] and llm.base_url == DEEPSEEK_BASE_URL:
                body['thinking'] = {'type': 'disabled'}
            response = pinned_post(client, llm.base_url.rstrip('/') + '/chat/completions',
                                   headers={'Authorization': 'Bearer ' + llm.api_key}, json=body, stage='research')
            _status(response, 'research')
            if len(response.content) > 1024 * 1024:
                raise ProviderError('research', 'response_limit', 'Response exceeds 1 MiB')
            usage_log.record(llm, 'research', response)
            choice = response.json()['choices'][0]
            if choice.get('finish_reason') == 'content_filter':
                raise ProviderError('research', 'response_filtered', 'Analysis was filtered')
            content = choice['message']['content'] if choice.get('finish_reason') == 'stop' else None
            try:
                parsed = json.loads(content or '')
                brief = check_brief({**parsed, 'viral_style': viral_style, 'sources': normalized_sources})
                ok = True
                return brief
            except (ValueError, TypeError) as problem:
                if attempt:
                    raise ProviderError('research', 'invalid_response', f'爆款拆解结果不符合要求：{problem}') from None
                messages = messages + [
                    {'role': 'assistant', 'content': content or ''},
                    {'role': 'user', 'content': f'上面的输出不符合要求（{problem}）。请按要求重新输出完整 JSON。'},
                ]
    except httpx.HTTPError:
        raise ProviderError('research', 'transport_error', 'Provider request failed') from None
    except (KeyError, IndexError, AttributeError):
        raise ProviderError('research', 'invalid_response', 'Expected a complete response') from None
    finally:
        log.info('event=research_analyze user_id=%s sources=%s ok=%s', user_id, len(normalized_sources), ok)


def brief_lines(brief: dict) -> list[str]:
    """Render a validated ResearchBrief into prompt instructions for ideation & manuscript generation."""
    style = VIRAL_STYLES.get(brief.get('viral_style') or 'balanced', VIRAL_STYLES['balanced'])
    lines = [
        '【热点与爆款参考简报（已核实参考素材，请优先吸收其真实事实与爆款节奏，禁止照抄原文，不要编造简报之外的具体数字）】',
        f'爆款节奏偏好：{style["label"]}（{style["guide"]}）',
        '真实事实与案例弹药（编号与课程证据包一致）：',
        *[f'- E{i} {f}' for i, f in enumerate(brief['facts'], 1)],
        '可借鉴的高点击开场钩子：',
        *[f'- {h}' for h in brief['hooks']],
        '观众痛点与争议焦点：',
        *[f'- {p}' for p in brief['pain_points']],
        f'推荐叙事骨架：{brief["pacing"]}',
    ]
    return lines


_PITCHES_SYSTEM = skill('platform-pitches').prompt()


def _check_pitches(value) -> list[dict]:
    pitches = value.get('pitches') if isinstance(value, dict) else None
    if not isinstance(pitches, list) or len(pitches) != 3:
        raise ValueError('pitches: exactly 3 items expected')
    allowed = {'douyin', 'xiaohongshu', 'bilibili'}
    seen = set()
    out = []
    for item in pitches:
        if not isinstance(item, dict):
            raise ValueError('pitch: object expected')
        plat = item.get('platform')
        if plat not in allowed or plat in seen:
            raise ValueError('pitch.platform: must be unique douyin/xiaohongshu/bilibili')
        seen.add(plat)
        tstyle = item.get('teaching_style')
        if tstyle not in ('popular', 'technical'):
            raise ValueError('pitch.teaching_style: must be popular or technical')
        out.append({
            'platform': plat,
            'platform_name': _clean_text(item.get('platform_name') or plat, 40, 'platform_name'),
            'duration_hint': _clean_text(item.get('duration_hint') or '3分钟', 20, 'duration_hint'),
            'teaching_style': tstyle,
            'title': _clean_text(item.get('title') or '', 40, 'title'),
            'cover_text': _clean_text(item.get('cover_text') or '', 24, 'cover_text'),
            'hook': _clean_text(item.get('hook') or '', 90, 'hook'),
            'angle_summary': _clean_text(item.get('angle_summary') or '', 140, 'angle_summary'),
            'notes': _clean_text(item.get('notes') or '', 220, 'notes'),
        })
    return out


def generate_platform_pitches(llm, client: httpx.Client, *, topic: str, brief: dict, user_id=None) -> list[dict]:
    """Turn a ResearchBrief into 3 platform-tailored video pitches (Douyin 1m / Xiaohongshu 2.5m / Bilibili 5m)."""
    if not llm.api_key:
        raise ProviderError('config', 'missing_setting', '请在个人中心配置模型，或在服务端设置 DEEPSEEK_API_KEY')
    validated = check_brief(brief)
    topic_clean = _clean_text(topic or '热点选题', 80, 'topic')
    user_content = '\n'.join([f'核心热点选题：{topic_clean}', *brief_lines(validated)])
    messages = [{'role': 'system', 'content': _PITCHES_SYSTEM}, {'role': 'user', 'content': user_content}]
    ok = False
    try:
        for attempt in range(2):
            body = {'model': llm.model, 'messages': messages, 'max_tokens': 2400, 'response_format': {'type': 'json_object'}}
            if llm.model in ['deepseek-flash', 'deepseek-v4-flash'] and llm.base_url == DEEPSEEK_BASE_URL:
                body['thinking'] = {'type': 'disabled'}
            response = pinned_post(client, llm.base_url.rstrip('/') + '/chat/completions',
                                   headers={'Authorization': 'Bearer ' + llm.api_key}, json=body, stage='research')
            _status(response, 'research')
            if len(response.content) > 1024 * 1024:
                raise ProviderError('research', 'response_limit', 'Response exceeds 1 MiB')
            usage_log.record(llm, 'research', response)
            choice = response.json()['choices'][0]
            if choice.get('finish_reason') == 'content_filter':
                raise ProviderError('research', 'response_filtered', 'Pitch generation was filtered')
            content = choice['message']['content'] if choice.get('finish_reason') == 'stop' else None
            try:
                pitches = _check_pitches(json.loads(content or ''))
                ok = True
                return pitches
            except (ValueError, TypeError) as problem:
                if attempt:
                    raise ProviderError('research', 'invalid_response', f'平台方案生成结果不符合要求：{problem}') from None
                messages = messages + [
                    {'role': 'assistant', 'content': content or ''},
                    {'role': 'user', 'content': f'上面的输出不符合要求（{problem}）。请按要求重新输出完整 JSON。'},
                ]
    except httpx.HTTPError:
        raise ProviderError('research', 'transport_error', 'Provider request failed') from None
    except (KeyError, IndexError, AttributeError):
        raise ProviderError('research', 'invalid_response', 'Expected a complete response') from None
    finally:
        log.info('event=research_pitches user_id=%s ok=%s', user_id, ok)
