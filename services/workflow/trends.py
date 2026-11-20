"""Stage 2: Public trending feeds (Bilibili, Hacker News, GitHub, daily news) and Bilibili/YouTube video extraction.

Every outbound request uses pinned_get / pinned_post (HTTPS + public IP check, no proxy bypass) and bounded timeouts.
Failures in one source degrade gracefully without breaking other sources."""
from datetime import datetime, timedelta, timezone
import hashlib
import html
import json
import logging
import re
from urllib.parse import parse_qs, quote, urlsplit

import httpx

from services.workflow.destination import pinned_get
from services.workflow.research import search_hot_sources

log = logging.getLogger(__name__)

_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
TREND_PLATFORMS = ('all', 'bilibili', 'hackernews', 'github', 'news')


def _id(url: str, title: str) -> str:
    return hashlib.sha256((url or title).encode('utf-8', errors='ignore')).hexdigest()[:12]


def _fmt_num(n: int | float | None) -> str:
    if not n:
        return '0'
    n = int(n)
    if n >= 10000:
        return f'{n / 10000:.1f}万'
    return str(n)


def _fetch_bilibili_popular(client: httpx.Client, limit: int, env=None) -> list[dict]:
    resp = pinned_get(
        client,
        f'https://api.bilibili.com/x/web-interface/popular?ps={min(limit, 20)}&pn=1',
        headers={'User-Agent': _UA, 'Referer': 'https://www.bilibili.com/'},
        stage='research', env=env,
    )
    if resp.status_code != 200 or len(resp.content) > 2 * 1024 * 1024:
        return []
    items = []
    for raw in (resp.json().get('data') or {}).get('list') or []:
        bvid = (raw.get('bvid') or '').strip()
        title = (raw.get('title') or '').strip()
        if not title:
            continue
        stat = raw.get('stat') or {}
        owner = (raw.get('owner') or {}).get('name') or ''
        desc = (raw.get('desc') or '').strip()
        rcmd = ((raw.get('rcmd_reason') or {}).get('content') or '').strip()
        url = f'https://www.bilibili.com/video/{bvid}' if bvid else ''
        metrics = f'播放 {_fmt_num(stat.get("view"))} · 点赞 {_fmt_num(stat.get("like"))}'
        if rcmd:
            metrics = f'{rcmd} · {metrics}'
        content = '\n'.join(p for p in [f'UP主：{owner}' if owner else '', metrics, desc] if p)
        items.append({
            'id': _id(url, title),
            'title': title[:160],
            'url': url,
            'platform': 'bilibili',
            'platform_label': 'B站热门',
            'snippet': (desc or metrics)[:360],
            'content': content[:2400],
            'published_at': '',
            'score': 1.0,
            'metrics': metrics,
            'provider': 'bilibili_popular',
        })
        if len(items) >= limit:
            break
    return items


def _fetch_hackernews_top(client: httpx.Client, limit: int, env=None) -> list[dict]:
    resp = pinned_get(
        client,
        'https://hacker-news.firebaseio.com/v0/topstories.json',
        headers={'User-Agent': _UA},
        stage='research', env=env,
    )
    if resp.status_code != 200 or len(resp.content) > 512 * 1024:
        return []
    ids = resp.json()
    if not isinstance(ids, list):
        return []
    items = []
    for story_id in ids[:min(limit, 8)]:
        try:
            r = pinned_get(
                client,
                f'https://hacker-news.firebaseio.com/v0/item/{int(story_id)}.json',
                headers={'User-Agent': _UA},
                stage='research', env=env,
            )
            if r.status_code != 200:
                continue
            story = r.json() or {}
            title = (story.get('title') or '').strip()
            if not title:
                continue
            url = (story.get('url') or f'https://news.ycombinator.com/item?id={story_id}').strip()
            score = int(story.get('score') or 0)
            comments = int(story.get('descendants') or 0)
            metrics = f'{score} points · {comments} comments'
            text = html.unescape(re.sub(r'<[^>]+>', ' ', story.get('text') or '')).strip()
            items.append({
                'id': _id(url, title),
                'title': title[:160],
                'url': url[:500],
                'platform': 'hackernews',
                'platform_label': 'Hacker News',
                'snippet': (text or metrics)[:360],
                'content': '\n'.join(p for p in [title, metrics, text] if p)[:2400],
                'published_at': '',
                'score': round(min(1.0, score / 500.0), 3),
                'metrics': metrics,
                'provider': 'hackernews',
            })
        except Exception:
            continue
    return items


def _fetch_github_trending(client: httpx.Client, limit: int, env=None) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')
    url = f'https://api.github.com/search/repositories?q={quote(f"created:>{since}")}&sort=stars&order=desc&per_page={min(limit, 10)}'
    resp = pinned_get(
        client, url,
        headers={'User-Agent': _UA, 'Accept': 'application/vnd.github+json'},
        stage='research', env=env,
    )
    if resp.status_code != 200 or len(resp.content) > 2 * 1024 * 1024:
        return []
    items = []
    for repo in resp.json().get('items') or []:
        name = (repo.get('full_name') or '').strip()
        desc = (repo.get('description') or '').strip()
        html_url = (repo.get('html_url') or '').strip()
        stars = int(repo.get('stargazers_count') or 0)
        lang = (repo.get('language') or '').strip()
        if not name:
            continue
        metrics = f'★ {_fmt_num(stars)}' + (f' · {lang}' if lang else '')
        title = f'{name}：{desc[:90]}' if desc else name
        items.append({
            'id': _id(html_url, name),
            'title': title[:160],
            'url': html_url[:500],
            'platform': 'github',
            'platform_label': 'GitHub 热门',
            'snippet': (desc or metrics)[:360],
            'content': '\n'.join(p for p in [name, metrics, desc] if p)[:2400],
            'published_at': (repo.get('created_at') or '')[:10],
            'score': round(min(1.0, stars / 5000.0), 3),
            'metrics': metrics,
            'provider': 'github',
        })
        if len(items) >= limit:
            break
    return items


def fetch_trends(platform: str = 'all', *, client: httpx.Client, limit: int = 12, env=None) -> dict:
    """Aggregate public trending topics across Bilibili, Hacker News, GitHub and Tavily daily news."""
    plat = platform if platform in TREND_PLATFORMS else 'all'
    limit = max(1, min(int(limit), 20))
    items: list[dict] = []
    sources_used: list[str] = []

    def _try(name: str, fn):
        try:
            got = fn()
            if got:
                items.extend(got)
                sources_used.append(name)
        except Exception as exc:
            log.info('event=trend_source_skipped source=%s reason=%s', name, type(exc).__name__)

    if plat in ('all', 'bilibili'):
        _try('bilibili', lambda: _fetch_bilibili_popular(client, 5 if plat == 'all' else limit, env=env))
    if plat in ('all', 'hackernews'):
        _try('hackernews', lambda: _fetch_hackernews_top(client, 4 if plat == 'all' else limit, env=env))
    if plat in ('all', 'github'):
        _try('github', lambda: _fetch_github_trending(client, 4 if plat == 'all' else limit, env=env))
    if plat in ('all', 'news'):
        _try('news', lambda: search_hot_sources(
            '今日 AI 科技 热门趋势 爆款话题',
            platforms=['all'], time_range='day', max_results=4 if plat == 'all' else limit,
            client=client, env=env,
        ).get('items') or [])

    return {'platform': plat, 'items': items[:limit], 'sources': sources_used}


def _extract_bvid(url: str) -> str | None:
    match = re.search(r'(BV[0-9A-Za-z]{10})', url)
    return match.group(1) if match else None


def _extract_youtube_id(url: str) -> str | None:
    parts = urlsplit(url)
    host = (parts.hostname or '').lower()
    if host.endswith('youtu.be'):
        vid = parts.path.strip('/').split('/')[0]
        return vid if re.fullmatch(r'[A-Za-z0-9_-]{11}', vid) else None
    qs = parse_qs(parts.query)
    if 'v' in qs and qs['v']:
        vid = qs['v'][0]
        return vid if re.fullmatch(r'[A-Za-z0-9_-]{11}', vid) else None
    match = re.search(r'/(?:shorts|embed|live)/([A-Za-z0-9_-]{11})', parts.path)
    return match.group(1) if match else None


def extract_video_url(url: str, platform: str, *, client: httpx.Client, env=None) -> dict | None:
    """Specialized extractor for Bilibili (view API metadata + engagement) and YouTube (watch page + caption tracks)."""
    if platform == 'bilibili':
        bvid = _extract_bvid(url)
        if not bvid:
            return None
        resp = pinned_get(
            client,
            f'https://api.bilibili.com/x/web-interface/view?bvid={bvid}',
            headers={'User-Agent': _UA, 'Referer': 'https://www.bilibili.com/'},
            stage='research', env=env,
        )
        if resp.status_code != 200 or len(resp.content) > 1024 * 1024:
            return None
        data = resp.json().get('data') or {}
        title = (data.get('title') or '').strip()
        if not title:
            return None
        stat = data.get('stat') or {}
        owner = (data.get('owner') or {}).get('name') or ''
        desc = (data.get('desc') or '').strip()
        dynamic = (data.get('dynamic') or '').strip()
        pages = [p.get('part', '').strip() for p in (data.get('pages') or []) if p.get('part')]
        metrics = f'播放 {_fmt_num(stat.get("view"))} · 点赞 {_fmt_num(stat.get("like"))} · 投币 {_fmt_num(stat.get("coin"))} · 收藏 {_fmt_num(stat.get("favorite"))}'
        sections = [
            f'视频标题：{title}',
            f'UP主：{owner}' if owner else '',
            f'互动数据：{metrics}',
            f'简介：{desc}' if desc else '',
            f'动态说明：{dynamic}' if dynamic and dynamic != desc else '',
            ('分P章节：' + ' / '.join(pages[:10])) if len(pages) > 1 else '',
        ]
        content = '\n'.join(s for s in sections if s)
        return {
            'id': _id(url, title),
            'title': title[:160],
            'url': url,
            'platform': 'bilibili',
            'platform_label': 'B站',
            'snippet': (desc or metrics)[:360],
            'content': content[:4000],
            'published_at': '',
            'score': 1.0,
            'metrics': metrics,
            'provider': 'bilibili_view',
        }

    if platform == 'youtube':
        vid = _extract_youtube_id(url)
        if not vid:
            return None
        watch_url = f'https://www.youtube.com/watch?v={vid}'
        resp = pinned_get(
            client, watch_url,
            headers={'User-Agent': _UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'},
            stage='research', env=env,
        )
        if resp.status_code != 200 or len(resp.content) > 4 * 1024 * 1024:
            return None
        page = resp.text
        match = re.search(r'ytInitialPlayerResponse\s*=\s*(\{.+?\});', page)
        if not match:
            return None
        try:
            player = json.loads(match.group(1))
        except json.JSONDecodeError:
            return None
        details = player.get('videoDetails') or {}
        title = (details.get('title') or '').strip()
        author = (details.get('author') or '').strip()
        desc = (details.get('shortDescription') or '').strip()
        views = details.get('viewCount')
        metrics = f'观看 {_fmt_num(int(views))}' if views and str(views).isdigit() else ''

        transcript = ''
        tracks = (((player.get('captions') or {}).get('playerCaptionsTracklistRenderer') or {}).get('captionTracks')) or []
        if tracks:
            chosen = next((t for t in tracks if str(t.get('languageCode', '')).startswith('zh')), None) or \
                     next((t for t in tracks if str(t.get('languageCode', '')).startswith('en')), None) or tracks[0]
            base_url = (chosen.get('baseUrl') or '').strip()
            if base_url.startswith('https://'):
                try:
                    cap_resp = pinned_get(client, base_url, headers={'User-Agent': _UA}, stage='research', env=env)
                    if cap_resp.status_code == 200 and len(cap_resp.content) <= 2 * 1024 * 1024:
                        chunks = re.findall(r'<text[^>]*>(.*?)</text>', cap_resp.text, flags=re.DOTALL)
                        transcript = ' '.join(html.unescape(re.sub(r'\s+', ' ', c)).strip() for c in chunks if c.strip())
                except Exception:
                    pass

        if not title and not transcript:
            return None
        content = '\n'.join(p for p in [
            f'视频标题：{title}' if title else '',
            f'频道：{author}' if author else '',
            f'互动数据：{metrics}' if metrics else '',
            f'字幕口播：\n{transcript[:2800]}' if transcript else '',
            f'视频简介：\n{desc[:1000]}' if desc else '',
        ] if p)
        return {
            'id': _id(watch_url, title or vid),
            'title': (title or watch_url)[:160],
            'url': watch_url,
            'platform': 'youtube',
            'platform_label': 'YouTube',
            'snippet': (transcript or desc or metrics)[:360],
            'content': content[:4000],
            'published_at': '',
            'score': 1.0,
            'metrics': (metrics + (' · 含字幕口播' if transcript else '')).strip(' ·'),
            'provider': 'youtube_captions' if transcript else 'youtube_meta',
        }

    return None
