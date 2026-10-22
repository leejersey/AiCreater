"""Deterministic paper-slide direction. The model never emits camera, vector, or entrance."""
SECTION_ARC = ('two_extremes', 'solution', 'layers', 'tradeoff')
SECTION_KEYWORDS = (
    ('tradeoff', ('权衡', '取舍', '代价', '平衡', '三角')),
    ('layers', ('漏斗', '过滤', '筛选', '层级', '一层')),
    ('two_extremes', ('极端', '一方面', '另一方面', '对比', '两端')),
    ('solution', ('方案', '解决', '做法', '步骤')),
)
CURVE_WORDS = ('曲线', '趋势', '长尾', '增长', '下降')
GAUGE_WORDS = ('仪表', '阈值', '红线', '概率', '程度')
SHAKE_WORDS = ('警告', '危险', '风险', '注意', '错误')
BOX_WORDS = ('重点', '结论', '定义', '关键')
VECTOR_TYPES = ('card_sequence', 'flow_diagram')
SKIP_VECTOR_TYPES = ('title_reveal', 'code_walkthrough', 'state_diagram', 'execution_timeline', 'data_chart', 'concept')
CAMERAS = {
    'intro': (960, 540, 1),
    'two_extremes': (760, 540, 1.08),
    'solution': (960, 470, 1.12),
    'layers': (960, 640, 1.08),
    'tradeoff': (960, 700, 1.16),
    'conclusion': (960, 540, 0.94),
}
REVISIT = {
    'stroke_curve': (1180, 460, 1.38),
    'gauge': (960, 560, 1.42),
    'tradeoff_triangle': (1080, 640, 1.36),
    'dot_funnel': (960, 720, 1.34),
    'two_extremes': (1160, 540, 1.24),
}


def _text(scene):
    narration = scene.get('narration') if isinstance(scene.get('narration'), dict) else {}
    spoken = narration.get('text') if isinstance(narration.get('text'), str) else ''
    elements = scene.get('elements') if isinstance(scene.get('elements'), list) else []
    labels = ''.join(element.get('content', '') for element in elements if isinstance(element, dict) and isinstance(element.get('content'), str))
    return spoken + labels


def _keyword_section(scene):
    text = _text(scene)
    for section, words in SECTION_KEYWORDS:
        if any(word in text for word in words):
            return section
    return None


def _sections(scenes, positional):
    count = len(scenes)
    roles = [None] * count
    if positional and count:
        roles[0] = 'intro'
        if count > 1:
            roles[-1] = 'conclusion'
    cursor = 0
    for index, scene in enumerate(scenes):
        if roles[index] is not None:
            continue
        keyword = _keyword_section(scene)
        if keyword:
            roles[index] = keyword
            continue
        if not positional:
            roles[index] = 'solution'
            continue
        roles[index] = SECTION_ARC[cursor % len(SECTION_ARC)]
        cursor += 1
    return roles


def _vector(scene, section):
    if scene.get('type') in SKIP_VECTOR_TYPES or scene.get('type') not in VECTOR_TYPES:
        return None
    if scene.get('motif') not in (None, 'default'):
        return None
    if any(scene.get(key) for key in ('dialogue', 'process', 'funnel', 'images', 'code', 'chart', 'edges')):
        return None
    elements = scene.get('elements') if isinstance(scene.get('elements'), list) else []
    count = len(elements)
    if not 1 <= count <= 4:
        return None
    text = _text(scene)
    if any(word in text for word in CURVE_WORDS):
        return 'stroke_curve'
    if any(word in text for word in GAUGE_WORDS):
        return 'gauge'
    if section == 'tradeoff' or any(word in text for word in SECTION_KEYWORDS[0][1]):
        if 2 <= count <= 3:
            return 'tradeoff_triangle'
    if section == 'layers' or any(word in text for word in SECTION_KEYWORDS[1][1]):
        if 2 <= count <= 4:
            return 'dot_funnel'
    return None


def _camera(section, kind, seen):
    if kind and kind in seen:
        point = REVISIT[kind]
    elif section == 'two_extremes' and section in seen:
        point = REVISIT['two_extremes']
    else:
        point = CAMERAS[section]
    seen.add(section)
    if kind:
        seen.add(kind)
    return {'x': point[0], 'y': point[1], 'scale': point[2]}


def _structural_effect(kind, index, last):
    """Diagram motion, not emphasis. Draw stays off the per-scene emphasis budget."""
    if kind == 'dot_funnel' or (kind == 'stroke_curve' and index == 0) or (kind == 'gauge' and last):
        return 'draw'
    if kind == 'tradeoff_triangle' and last:
        return 'box'
    return None


def _effect(element, scene, section, index, shake_left, specials):
    content = element.get('content') if isinstance(element.get('content'), str) else ''
    kind = (scene.get('vector') or {}).get('kind') if isinstance(scene.get('vector'), dict) else None
    elements = scene.get('elements') if isinstance(scene.get('elements'), list) else []
    last = index == len(elements) - 1
    structural = _structural_effect(kind, index, last)
    if element.get('role') == 'topic' or (section in ('intro', 'conclusion') and scene.get('type') == 'title_reveal' and index == 0):
        want = 'scale_pop'
    elif element.get('icon') == 'warning' or any(word in content for word in SHAKE_WORDS):
        want = 'shake'
    elif structural == 'draw':
        want = 'draw'
    elif element.get('panel_style') == 'conclusion' or element.get('concept_role') in ('definition', 'summary') or element.get('highlight') or any(word in content for word in BOX_WORDS) or structural == 'box':
        want = 'box'
    elif section == 'conclusion' and last:
        want = 'scale_pop'
    elif any(word in content for word in CURVE_WORDS):
        want = 'draw'
    else:
        want = 'fade_slide'
    if want == 'shake' and shake_left <= 0:
        want = structural or 'fade_slide'
    if want in ('scale_pop', 'box', 'shake') and specials >= 2:
        want = 'draw' if structural == 'draw' else 'fade_slide'
    if want == 'shake':
        shake_left -= 1
    if want in ('scale_pop', 'box', 'shake'):
        specials += 1
    element['entrance'] = want
    return shake_left, specials


def _direct(scenes, positional):
    roles = _sections(scenes, positional)
    seen = set()
    shake_left = 1
    for scene, section in zip(scenes, roles):
        if not isinstance(scene, dict):
            continue
        scene['section'] = section
        kind = _vector(scene, section)
        if kind:
            scene['vector'] = {'kind': kind}
        else:
            scene.pop('vector', None)
        scene['camera'] = _camera(section, kind, seen)
        specials = 0
        elements = scene.get('elements') if isinstance(scene.get('elements'), list) else []
        for index, element in enumerate(elements):
            if isinstance(element, dict):
                shake_left, specials = _effect(element, scene, section, index, shake_left, specials)
    return scenes


def apply_paper_direction(draft):
    """Stamp section, camera, vector and entrance. A lone regenerate scene is not forced into intro."""
    if isinstance(draft, dict) and isinstance(draft.get('scenes'), list):
        _direct(draft['scenes'], positional=True)
        return draft
    if isinstance(draft, dict):
        _direct([draft], positional=False)
    return draft
