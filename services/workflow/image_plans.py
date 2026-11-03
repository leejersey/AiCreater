"""Bounded teaching-image decisions; planning never generates or fetches media."""
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
