"""Bounded teaching-document dialect. Never feed the Markdown source to TTS."""
import re

from services.workflow.providers import ProviderError

MAX_MARKDOWN = 24000
FIELDS = {'### 口播': 'narration', '### 画面素材': 'materials', '### 画面意图': 'visual_intent'}
HEADER = re.compile(r'## \[([a-zA-Z][a-zA-Z0-9_-]{0,31})\] ([^\n]{1,80})')


def invalid():
    raise ProviderError('manuscript', 'invalid_response',
                        '文稿格式无效：每段须有 ## [唯一ID] 标题、### 口播、### 画面素材、### 画面意图；口播仅纯文本，代码围栏须闭合。')


def validate_document(document):
    if not isinstance(document, dict) or set(document) != {'sections'}:
        invalid()
    sections = document['sections']
    if not isinstance(sections, list) or not 1 <= len(sections) <= 20:
        invalid()
    seen = set()
    for section in sections:
        if not isinstance(section, dict) or set(section) != {'id', 'title', *FIELDS.values()}:
            invalid()
        if any(not isinstance(v, str) or not v.strip() or v != v.strip() for v in section.values()):
            invalid()
        if not HEADER.fullmatch(f"## [{section['id']}] {section['title']}") or section['id'] in seen:
            invalid()
        seen.add(section['id'])
        if any(any((ord(c) < 32 and c not in '\n\t') or ord(c) == 127 or 0xD800 <= ord(c) <= 0xDFFF for c in v) for v in section.values()):
            invalid()
        if re.search(r'(?m)^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|```|~~~)', section['narration']) or '`' in section['narration']:
            invalid()
    if len(narration_text(document)) > 4000:
        raise ProviderError('manuscript', 'output_limit', '口播合计不能超过 4000 个字符')
    return document


def narration_text(document):
    return '\n\n'.join(s['narration'] for s in document['sections'])


def parse_document(text):
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_MARKDOWN:
        invalid()
    sections, section, field, fence = [], None, None, None
    for line in text.replace('\r\n', '\n').split('\n'):
        marker = re.match(r'^\s{0,3}(`{3,}|~{3,})(.*)$', line)
        if fence:
            section[field].append(line)
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence) and not marker[2].strip():
                fence = None
            continue
        if marker:
            if field != 'materials':
                invalid()
            fence = marker[1]
        match = HEADER.fullmatch(line)
        if match:
            section = {'id': match[1], 'title': match[2]}
            sections.append(section)
            field = None
        elif line in FIELDS:
            if section is None or len(section) - 2 != list(FIELDS).index(line):
                invalid()
            field = FIELDS[line]
            section[field] = []
        elif line.startswith('#'):
            invalid()
        elif field:
            section[field].append(line)
        elif line.strip():
            invalid()
    if fence:
        invalid()
    for section in sections:
        for key in FIELDS.values():
            if key in section:
                section[key] = '\n'.join(section[key]).strip()
    return validate_document({'sections': sections})


def format_document(document):
    validate_document(document)
    text = '\n\n'.join(f"## [{s['id']}] {s['title']}\n\n" + '\n\n'.join(
        heading + '\n' + s[key] for heading, key in FIELDS.items()) for s in document['sections'])
    if parse_document(text) != document:
        invalid()
    return text


def scene_materials(document, text):
    """Only reuse unchanged spoken passages; edited narration must not silently inherit stale assets."""
    sections = document.get('sections', [])
    source = narration_text({'sections': sections})
    start = source.find(text) if text.strip() else -1
    if start < 0 or source.find(text, start + 1) >= 0:
        return []
    end, offset, matched = start + len(text), 0, []
    for section in sections:
        section_end = offset + len(section['narration'])
        if start < section_end and end > offset:
            matched.append(dict(section))
        offset = section_end + 2  # narration_text joins sections with two newlines
    return matched
