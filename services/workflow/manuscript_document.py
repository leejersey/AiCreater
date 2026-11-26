"""Bounded teaching-document dialect. Never feed the Markdown source to TTS."""
import re

from services.workflow.providers import ProviderError

MAX_MARKDOWN = 24000
FIELDS = {'### 口播': 'narration', '### 画面素材': 'materials', '### 画面意图': 'visual_intent'}
HEADER = re.compile(r'## \[([a-zA-Z][a-zA-Z0-9_-]{0,31})\] ([^\n]{1,80})')


def invalid(reason=''):
    raise ProviderError('manuscript', 'invalid_response',
                        '文稿格式无效：每段须有 ## [唯一ID] 标题、### 口播、### 画面素材、### 画面意图；口播仅纯文本，代码围栏须闭合。' + (f'（{reason}）' if reason else ''))


def validate_document(document):
    if not isinstance(document, dict) or set(document) != {'sections'}:
        invalid('顶层只能有 sections')
    sections = document['sections']
    if not isinstance(sections, list) or not 1 <= len(sections) <= 20:
        invalid('sections 须为 1–20 段')
    seen = set()
    for section in sections:
        if not isinstance(section, dict) or set(section) != {'id', 'title', *FIELDS.values()}:
            invalid('每段只能有 id、title、' + '、'.join(FIELDS.values()) + ' 这些字段')
        if any(not isinstance(v, str) or not v.strip() or v != v.strip() for v in section.values()):
            invalid(f"段 {section.get('id')} 有空字段或首尾空白")
        if not HEADER.fullmatch(f"## [{section['id']}] {section['title']}") or section['id'] in seen:
            invalid(f"段 {section['id']} 的 ID 重复或标题不合规")
        seen.add(section['id'])
        if any(any((ord(c) < 32 and c not in '\n\t') or ord(c) == 127 or 0xD800 <= ord(c) <= 0xDFFF for c in v) for v in section.values()):
            invalid(f"段 {section['id']} 含控制字符")
        if re.search(r'\[E\d+\]', section['narration']):
            invalid(f"段 {section['id']} 的口播里有证据编号 [E…]，编号只能写在画面素材里")
        if re.search(r'(?m)^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|```|~~~)', section['narration']) or '`' in section['narration']:
            invalid(f"段 {section['id']} 的口播含标题、列表、编号或代码标记")
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
    # The text must read back as the same document; when it does not, say where, so a model can fix it.
    try:
        back = parse_document(text)
    except ProviderError:
        invalid('有段落的口播、画面素材或画面意图里含以 # 开头的行或未闭合的代码围栏，会被当成新的标题')
    if back != document:
        bad = next((s['id'] for s, b in zip(document['sections'], back['sections']) if s != b), document['sections'][-1]['id'])
        invalid(f'段 {bad} 的字段内容里有以 # 开头的行或代码围栏，读回时会被当成新的标题')
    return text
