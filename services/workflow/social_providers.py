"""Stage 3: Pluggable commercial social data adapters (TikHub / Apify) for Douyin & Xiaohongshu.

Completely optional: when TIKHUB_API_KEY or APIFY_API_TOKEN is absent, every function returns empty/None
so research.py falls back seamlessly to Tavily domain search & URL extraction."""
import hashlib
import logging
import os
from urllib.parse import quote

import httpx

from services.workflow.destination import pinned_get, pinned_post

log = logging.getLogger(__name__)

TIKHUB_BASE = 'https://api.tikhub.io'


def _id(url: str, title: str) -> str:
    return hashlib.sha256((url or title).encode('utf-8', errors='ignore')).hexdigest()[:12]


def _fmt_num(n) -> str:
    try:
        v = int(n or 0)
    except (TypeError, ValueError):
        return '0'
    return f'{v / 10000:.1f}万' if v >= 10000 else str(v)


def _tikhub_headers(key: str) -> dict:
    return {'Authorization': f'Bearer {key}', 'Accept': 'application/json'}


def _parse_douyin_aweme(aweme: dict) -> dict | None:
    desc = (aweme.get('desc') or '').strip()
    aweme_id = str(aweme.get('aweme_id') or '').strip()
    if not desc and not aweme_id:
        return None
    author = (aweme.get('author') or {}).get('nickname') or ''
    stats = aweme.get('statistics') or {}
    metrics = f'点赞 {_fmt_num(stats.get("digg_count"))} · 评论 {_fmt_num(stats.get("comment_count"))} · 收藏 {_fmt_num(stats.get("collect_count"))}'
    url = f'https://www.douyin.com/video/{aweme_id}' if aweme_id else ''
    title = (desc.splitlines()[0] if desc else f'抖音视频 {aweme_id}')[:120]
    content = '\n'.join(p for p in [f'作者：{author}' if author else '', f'互动：{metrics}', desc] if p)
    return {
        'id': _id(url, title),
        'title': title,
        'url': url,
        'platform': 'douyin',
        'platform_label': '抖音',
        'snippet': (desc or metrics)[:360],
        'content': content[:3000],
        'published_at': '',
        'score': 1.0,
        'metrics': metrics,
        'provider': 'tikhub',
    }


def _parse_xhs_note(note: dict) -> dict | None:
    card = note.get('note_card') if isinstance(note.get('note_card'), dict) else note
    title = (card.get('display_title') or card.get('title') or '').strip()
    desc = (card.get('desc') or '').strip()
    note_id = str(note.get('id') or card.get('note_id') or '').strip()
    if not title and not desc:
        return None
    user = (card.get('user') or {}).get('nickname') or ''
    interact = card.get('interact_info') or {}
    likes = interact.get('liked_count') or card.get('liked_count') or 0
    collects = interact.get('collected_count') or card.get('collected_count') or 0
    comments = interact.get('comment_count') or card.get('comment_count') or 0
    metrics = f'点赞 {likes} · 收藏 {collects} · 评论 {comments}'
    url = f'https://www.xiaohongshu.com/explore/{note_id}' if note_id else ''
    content = '\n'.join(p for p in [f'作者：{user}' if user else '', f'互动：{metrics}', title, desc] if p)
    return {
        'id': _id(url, title or desc),
        'title': (title or desc[:80])[:160],
        'url': url,
        'platform': 'xiaohongshu',
        'platform_label': '小红书',
        'snippet': (desc or title)[:360],
        'content': content[:3000],
        'published_at': '',
        'score': 1.0,
        'metrics': metrics,
        'provider': 'tikhub',
    }


def search_social_platforms(query: str, platforms: list[str], *, max_results: int = 5,
                            client: httpx.Client, env=None) -> tuple[list[dict], list[str]]:
    """Search Douyin / Xiaohongshu via TikHub when TIKHUB_API_KEY is configured."""
    src = os.environ if env is None else env
    tikhub_key = (src.get('TIKHUB_API_KEY') or '').strip()
    if not tikhub_key:
        return [], []

    items: list[dict] = []
    providers: list[str] = []
    headers = _tikhub_headers(tikhub_key)

    if 'douyin' in platforms:
        try:
            url = f'{TIKHUB_BASE}/api/v1/douyin/app/v3/fetch_general_search_result?keyword={quote(query)}&count={max_results}'
            resp = pinned_get(client, url, headers=headers, stage='research', env=env)
            if resp.status_code == 200 and len(resp.content) <= 2 * 1024 * 1024:
                rows = ((resp.json().get('data') or {}).get('data')) or []
                for row in rows:
                    aweme = row.get('aweme_info') if isinstance(row, dict) else None
                    if isinstance(aweme, dict):
                        parsed = _parse_douyin_aweme(aweme)
                        if parsed:
                            items.append(parsed)
                if items:
                    providers.append('tikhub_douyin')
        except Exception as exc:
            log.info('event=tikhub_douyin_search_skipped reason=%s', type(exc).__name__)

    if 'xiaohongshu' in platforms:
        try:
            url = f'{TIKHUB_BASE}/api/v1/xiaohongshu/web/search_notes?keyword={quote(query)}&page=1&sort=popularity_descending'
            resp = pinned_get(client, url, headers=headers, stage='research', env=env)
            if resp.status_code == 200 and len(resp.content) <= 2 * 1024 * 1024:
                notes = ((resp.json().get('data') or {}).get('items')) or []
                added = 0
                for raw in notes[:max_results]:
                    if isinstance(raw, dict):
                        parsed = _parse_xhs_note(raw)
                        if parsed:
                            items.append(parsed)
                            added += 1
                if added:
                    providers.append('tikhub_xhs')
        except Exception as exc:
            log.info('event=tikhub_xhs_search_skipped reason=%s', type(exc).__name__)

    return items[:max_results], providers


def extract_social_url(url: str, platform: str, *, client: httpx.Client, env=None) -> dict | None:
    """Extract a Douyin or Xiaohongshu link via TikHub when TIKHUB_API_KEY is configured."""
    src = os.environ if env is None else env
    tikhub_key = (src.get('TIKHUB_API_KEY') or '').strip()
    if not tikhub_key:
        return None
    headers = _tikhub_headers(tikhub_key)

    if platform == 'douyin':
        resp = pinned_get(
            client,
            f'{TIKHUB_BASE}/api/v1/douyin/web/fetch_one_video_by_share_url?share_url={quote(url)}',
            headers=headers, stage='research', env=env,
        )
        if resp.status_code == 200 and len(resp.content) <= 2 * 1024 * 1024:
            aweme = (resp.json().get('data') or {}).get('aweme_detail') or {}
            if isinstance(aweme, dict):
                return _parse_douyin_aweme(aweme)

    if platform == 'xiaohongshu':
        resp = pinned_post(
            client,
            f'{TIKHUB_BASE}/api/v1/xiaohongshu/web/get_note_info_v2',
            headers={**headers, 'Content-Type': 'application/json'},
            json={'share_text': url},
            stage='research', env=env,
        )
        if resp.status_code == 200 and len(resp.content) <= 2 * 1024 * 1024:
            data = resp.json().get('data') or {}
            if isinstance(data, dict):
                return _parse_xhs_note(data)

    return None
