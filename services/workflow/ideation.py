"""Topic ideation for a new video: angles (directions) for a topic, then an outline for the chosen angle.

Short JSON calls to the course owner's model (or the server's DeepSeek), like manuscript generation. Model output is
checked strictly; a reply that fails the check is asked for once more, then the call fails rather than handing the page
half a result. Only single videos for now: Angle.scope is always 'single' and a project's origin.series_id is None,
the places a series would plug in later. Never log prompts or secrets."""
import json
import random

from services.workflow.content_skills import call_json, skill
from services.workflow.research import brief_lines, check_brief

# Batches of four or more must include at least one of these: left to itself the model keeps to problem / journey /
# compare / myth, the first structures it sees.
LESS_OBVIOUS = ('howto', 'history', 'story')
STRUCTURES = {'problem': '问题驱动', 'journey': '旅程 / 流程', 'compare': '对比', 'myth': '误区纠正',
              'howto': '实操', 'history': '演进 / 历史', 'story': '故事'}
DEPTHS = {'intro': '入门', 'intermediate': '进阶', 'advanced': '深入'}
SCOPES = ('single',)  # a series ('series', with episodes) plugs in here later
MAX_CHAPTER_SECONDS = 110  # the Agent makes chapters of at most 120 s
MAX_TOTAL_SECONDS = 780    # 4000 code points of narration at about 5 per second

_ANGLES_SYSTEM = skill('ideation-angles').prompt(structures='、'.join(f'{k}（{v}）' for k, v in STRUCTURES.items()))

_OUTLINE_SYSTEM = skill('ideation-outline').prompt(max_chapter_seconds=MAX_CHAPTER_SECONDS)


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


def check_angles(value, count, avoid=()):
    """A batch: `count` angles with distinct structures and at least two depths (when there are three or more)."""
    angles = value.get('angles') if isinstance(value, dict) else None
    if not isinstance(angles, list) or len(angles) != count: raise ValueError(f'angles: exactly {count}')
    angles = [check_angle(a) for a in angles]
    if len({a['structure'] for a in angles}) != len(angles): raise ValueError('angles: structures must differ')
    if count >= 3 and len({a['depth'] for a in angles}) < 2: raise ValueError('angles: use at least two depths')
    reused = [a['structure'] for a in angles if a['structure'] in set(avoid)]
    if count >= 4 and len(reused) > 2:
        raise ValueError('angles: reuse at most two structures of the last batch (reused ' + ', '.join(reused) + ')')
    if count >= 4 and not any(a['structure'] in LESS_OBVIOUS for a in angles):
        raise ValueError('angles: include at least one of ' + ' / '.join(f'{k}（{STRUCTURES[k]}）' for k in LESS_OBVIOUS))
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
    formula = value.get('formula')
    if formula is not None:
        from services.studio.breakdowns import check_formula
        formula = check_formula(formula)
    return {'topic': _text(value.get('topic'), 80, 'topic'), 'notes': notes.strip(), 'angle': check_angle(value.get('angle')),
            'outline': check_outline(value.get('outline')), 'scope': 'single', 'series_id': None, **({'formula': formula} if formula else {})}


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
    """One JSON call, checked by `check`; asks once more if the reply fails the check (content_skills.call_json)."""
    return call_json(llm, client, system, user, check, kind, max_tokens=4096, user_id=user_id)


def generate_angles(llm, client, *, topic, notes='', audience='', duration_hint='', teaching_style='popular', count=4,
                    exclude=(), avoid_structures=(), custom='', merge=None, research=None, persona=None, user_id=None):
    """`count` distinct angles; or one card from the person's own direction (`custom`); or one card merging two (`merge`)."""
    lines = _context(topic, notes, audience, duration_hint, teaching_style)
    if persona is not None:
        from services.workflow.manuscript import check_persona, persona_lines
        checked_persona = check_persona(persona)
        if checked_persona:
            lines += persona_lines(checked_persona)
    if research is not None:
        lines += brief_lines(check_brief(research))
    if merge:
        lines.append('把下面两个方向融合成一个新方向（取各自的长处，结构类型取更适合融合后的那个），只输出 1 个：')
        lines.append(json.dumps(merge, ensure_ascii=False))
        check = lambda v: check_angles(v, 1)
    elif custom:
        lines.append(f'用户自己想到的方向：{custom}。把它整理成 1 个方向，忠于用户的意思：')
        check = lambda v: check_angles(v, 1)
    else:
        if exclude: lines.append('已经给过这些方向，新方向必须与它们不同：' + '；'.join(exclude))
        avoid = [s for s in dict.fromkeys(avoid_structures) if s in STRUCTURES]
        if avoid: lines.append('上一批用过的结构：' + '、'.join(f'{k}（{STRUCTURES[k]}）' for k in avoid) + '。这一批优先用其余结构，最多重复其中 2 个。')
        # A fresh order each time, in the user message (the system prompt stays the same for the prompt cache).
        order = random.sample(list(STRUCTURES), len(STRUCTURES))
        lines.append('本批可选的结构类型（顺序随机，不代表优先级）：' + '、'.join(f'{k}（{STRUCTURES[k]}）' for k in order) + '。')
        if count >= 4:
            lines.append('其中至少要有一个是 ' + '、'.join(f'{k}（{STRUCTURES[k]}）' for k in LESS_OBVIOUS) + ' 之一；深度尽量拉开，适合时可以有一个 advanced（深入）。')
        lines.append(f'请给出 {count} 个方向。')
        check = lambda v: check_angles(v, count, avoid)
    return _chat(llm, client, _ANGLES_SYSTEM, '\n'.join(lines), check, 'ideas_angles', user_id)


def generate_outline(llm, client, *, topic, angle, notes='', audience='', duration_hint='', teaching_style='popular',
                     previous=None, feedback='', research=None, persona=None, formula=None, user_id=None):
    lines = _context(topic, notes, audience, duration_hint, teaching_style)
    if persona is not None:
        from services.workflow.manuscript import check_persona, persona_lines
        checked_persona = check_persona(persona)
        if checked_persona:
            lines += persona_lines(checked_persona)
    if research is not None:
        lines += brief_lines(check_brief(research))
    lines.append('选定的方向：' + json.dumps(angle, ensure_ascii=False))
    if formula is not None:
        from services.studio.breakdowns import check_formula, formula_lines
        lines += formula_lines(check_formula(formula), markdown=False)
        lines.append('章节按公式的步骤安排：每步一章（或相邻几章），各章秒数参考公式的时长。')
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
