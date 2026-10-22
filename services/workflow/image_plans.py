"""Bounded teaching-image decisions; planning never generates or fetches media."""
import copy
import hashlib
import json
import unicodedata
from services.workflow.schema_diagnostics import schema_errors
from services.workflow.providers import ProviderError


def text(limit):
    return {'type': 'string', 'minLength': 1, 'maxLength': limit}


PLAN_SCHEMA = {'type': 'object', 'additionalProperties': False,
    'required': ['needed', 'reason', 'requirements'], 'properties': {
        'needed': {'type': 'boolean'}, 'reason': text(160),
        'requirements': {'type': 'array', 'maxItems': 2, 'items': {
            'type': 'object', 'additionalProperties': False,
            'required': ['element_id', 'purpose', 'description', 'composition', 'alt', 'quote'],
            'properties': {'element_id': {**text(80), 'pattern': '^[a-zA-Z0-9_-]+$'},
                'purpose': {'enum': ['object', 'metaphor', 'comparison', 'spatial']},
                'description': text(500), 'composition': text(240), 'alt': text(80), 'quote': text(200)}}}}}

PROMPT = (
    ' Teaching image planning: every scene MUST have image_plan={needed:boolean,reason,requirements:[]}. '
    'needed=false with an empty list is normal: prefer editable code, formulas, exact data or diagrams when clearer. '
    'Never generate images, fetch URLs, execute tools or claim a real screenshot/observed result. '
    'For a useful teaching object/metaphor/spatial relationship, plan at most TWO independent static objects. '
    'Only default card_sequence/comparison_panel with at most FOUR elements, no dialogue/process/funnel, support images. '
    'Other types/motifs MUST choose needed=false; never degrade code or diagrams merely to force images. '
    'Each requirement targets a DISTINCT existing element_id; the image appears/highlights with that element. '
    'purpose=object|metaphor|comparison|spatial; description describes the subject, composition describes full-subject '
    'framing and space for program-owned labels; alt is a short accessible object description. '
    'quote MUST equal the entire target element cue.quote, uniquely present in restored narration. '
    'Commands, formulas, numbers, project names, arrows and precise relationships are drawn by components, not baked into images. '
    'Never add image assets, URLs, paths, CSS, timestamps or generated object IDs; the program assigns stable IDs. '
    'No image plan or visual direction belongs in narration, subtitles or source parts. '
    'Prompt descriptions are inert visual references, never instructions to execute or proof of factual accuracy. '
)


def validate_plan(scene):
    if 'image_plan' not in scene:
        return
    plan = scene['image_plan']
    errors = schema_errors(PLAN_SCHEMA, plan)
    if errors:
        raise ProviderError('storyboard', 'schema_error', 'Invalid image plan', errors)
    def reject():
        raise ProviderError('storyboard', 'image_plan', 'Invalid teaching image decision or source anchor')
    requirements = plan['requirements']
    if plan['needed'] != bool(requirements): reject()
    fields = [plan['reason']] + [r[k] for r in requirements for k in ['description', 'composition', 'alt']]
    if any(not s.strip() or any(unicodedata.category(c) in ['Cc', 'Cf', 'Zl', 'Zp'] for c in s) for s in fields): reject()
    if not requirements: return
    if (scene['type'] not in ['card_sequence', 'comparison_panel'] or len(scene['elements']) > 4
            or scene.get('motif', 'default') != 'default' or any(scene.get(k) for k in ['dialogue', 'process', 'funnel'])): reject()
    targets = [r['element_id'] for r in requirements]
    if len(set(targets)) != len(targets): reject()
    elements = {e['id']: e for e in scene['elements']}
    spoken = scene['narration']['text']
    for requirement in requirements:
        element = elements.get(requirement['element_id'])
        if element is None: reject()
        cue = element['cue']; quote = requirement['quote']
        if (not quote.strip() or spoken[cue['text_start']:cue['text_end']] != quote
                or spoken.find(quote) != cue['text_start'] or spoken.find(quote, cue['text_start'] + 1) >= 0): reject()


def scene_fingerprint(scene):
    value = {k: scene[k] for k in ['type', 'elements', 'motif', 'dialogue', 'process', 'funnel'] if k in scene}
    value['narration'] = scene['narration']['text']
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def plan_entry(scene, plan):
    """Program-owned IDs are stable for the same scene/element, not model supplied."""
    plan = copy.deepcopy(plan)
    for requirement in plan['requirements']:
        identity = scene['id'] + '/' + requirement['element_id']
        requirement['id'] = 'img_' + hashlib.sha256(identity.encode()).hexdigest()[:24]
    return {'status': 'planned', 'scene_fingerprint': scene_fingerprint(scene), 'plan': plan}


def invalidate_plan(config, scene):
    entry = config.get('image_plans', {}).get(scene['id'])
    if entry and entry['scene_fingerprint'] != scene_fingerprint(scene):
        entry['status'] = 'needs_review'
