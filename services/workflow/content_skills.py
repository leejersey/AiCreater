"""Content skills: the methods behind topic research, ideation, copy and review, kept as files in
packages/content-skills/<name>/SKILL.md instead of strings in code, so a method can be replaced or upgraded (and adapted
from a mature open-source skill, see NOTICE.md) without touching the calling code.

SKILL.md is a small front matter (name, version, description) and the prompt. In the prompt, line breaks are only for
reading and are joined back without a separator; a line ending in two spaces (Markdown's hard break) is a real newline.
`{{name}}` placeholders are filled by the caller. Every skill reports its version and file hash, so results can record
which method produced them. Never log prompts or secrets."""
import hashlib
import json
import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import httpx

from services.accounts.model_settings import DEEPSEEK_BASE_URL
from services.workflow.destination import pinned_post
from services.workflow import usage_log
from services.workflow.providers import ProviderError, _status

log = logging.getLogger(__name__)

SKILLS_ROOT = Path(__file__).resolve().parents[2] / 'packages' / 'content-skills'
NAME = re.compile(r'[a-z][a-z0-9-]{1,48}')
PLACEHOLDER = re.compile(r'\{\{([a-z_][a-z0-9_]*)\}\}')


@dataclass(frozen=True)
class Skill:
    name: str
    version: int
    description: str
    template: str
    sha256: str

    def prompt(self, **values):
        """The prompt with every placeholder filled; a missing or unused value is a programming error."""
        wanted = set(PLACEHOLDER.findall(self.template))
        if wanted != set(values):
            raise KeyError(f'skill {self.name}: placeholders {sorted(wanted)} but values {sorted(values)}')
        return PLACEHOLDER.sub(lambda m: str(values[m.group(1)]), self.template)

    def stamp(self):
        """What a result records about the method that produced it."""
        return {'name': self.name, 'version': self.version, 'sha256': self.sha256}


def parse(text, name=''):
    if not text.startswith('---\n') or '\n---\n' not in text[4:]:
        raise ValueError(f'skill {name}: front matter missing')
    head, body = text[4:].split('\n---\n', 1)
    meta = {}
    for line in head.splitlines():
        key, sep, value = line.partition(':')
        if not sep: raise ValueError(f'skill {name}: bad front matter line {line!r}')
        meta[key.strip()] = value.strip()
    if meta.get('name') != name or not NAME.fullmatch(name):
        raise ValueError(f'skill {name}: name in front matter must match the folder')
    if not meta.get('version', '').isdigit() or not meta.get('description'):
        raise ValueError(f'skill {name}: version (integer) and description are required')
    lines = body.strip('\n').split('\n')
    template = ''.join(line[:-2] + '\n' if line.endswith('  ') else line for line in lines)
    if not template.strip():
        raise ValueError(f'skill {name}: empty prompt')
    return int(meta['version']), meta['description'], template


@lru_cache(maxsize=None)
def skill(name):
    if not NAME.fullmatch(name or ''):
        raise ValueError(f'invalid skill name {name!r}')
    path = SKILLS_ROOT / name / 'SKILL.md'
    raw = path.read_bytes()
    version, description, template = parse(raw.decode('utf-8'), name)
    return Skill(name, version, description, template, hashlib.sha256(raw).hexdigest())


def names():
    return sorted(p.parent.name for p in SKILLS_ROOT.glob('*/SKILL.md'))


def call_json(llm, client, system, user, check, kind, *, stage=None, max_tokens=4096, user_id=None):
    """One JSON chat call, checked by `check`; a reply that fails the check is asked for once more with the reason,
    then the call fails rather than handing back half a result. `stage` labels provider errors (default: kind)."""
    stage = stage or kind
    if not llm.api_key: raise ProviderError('config', 'missing_setting', '请在个人中心配置模型，或在服务端设置 DEEPSEEK_API_KEY')
    messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]
    ok = False
    try:
        for attempt in range(2):
            body = {'model': llm.model, 'messages': messages, 'max_tokens': max_tokens, 'response_format': {'type': 'json_object'}}
            # A DeepSeek-only switch: other OpenAI-compatible services may reject unknown fields.
            if llm.model in ['deepseek-flash', 'deepseek-v4-flash'] and llm.base_url == DEEPSEEK_BASE_URL:
                body['thinking'] = {'type': 'disabled'}
            response = pinned_post(client, llm.base_url.rstrip('/') + '/chat/completions',
                                   headers={'Authorization': 'Bearer ' + llm.api_key}, json=body)
            _status(response, stage)
            if len(response.content) > 1024 * 1024: raise ProviderError(stage, 'response_limit', 'Response exceeds 1 MiB')
            usage_log.record(llm, kind, response, user_id)
            choice = response.json()['choices'][0]
            if choice.get('finish_reason') == 'content_filter': raise ProviderError(stage, 'response_filtered', 'Generation was filtered')
            content = choice['message']['content'] if choice.get('finish_reason') == 'stop' else None
            try:
                result = check(json.loads(content or ''))
                ok = True
                return result
            except (ValueError, TypeError) as problem:  # json.JSONDecodeError is a ValueError
                if attempt: raise ProviderError(stage, 'invalid_response', f'模型返回的结果不符合要求：{problem}') from None
                messages = messages + [{'role': 'assistant', 'content': content or ''},
                                       {'role': 'user', 'content': f'上面的输出不符合要求（{problem}）。请按要求重新输出完整 JSON。'}]
    except httpx.HTTPError:
        raise ProviderError(stage, 'transport_error', 'Provider request failed') from None
    except (KeyError, IndexError, AttributeError):
        raise ProviderError(stage, 'invalid_response', 'Expected a complete response') from None
    finally:
        log.info('event=%s user_id=%s ok=%s', kind, user_id, ok)
