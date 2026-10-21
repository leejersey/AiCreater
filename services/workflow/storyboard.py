"""Intermediate LLM schema derived from the final DSL, sharing visual semantics."""
import copy
import importlib.util
import math
import re
from pathlib import Path

from services.workflow.schema_diagnostics import schema_errors
from services.workflow.providers import ProviderError

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('video_validator', ROOT / 'packages/video-schema/validate.py')
validator = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(validator)

DRAFT_SCHEMA = copy.deepcopy(validator.SCHEMA)
DRAFT_SCHEMA['title'] = 'Storyboard'
DRAFT_SCHEMA['required'] = ['scenes']
DRAFT_SCHEMA['properties'] = {'scenes': DRAFT_SCHEMA['properties']['scenes']}
_scene = DRAFT_SCHEMA['definitions']['Scene']
_scene['required'] = ['id', 'type', 'narration', 'elements']
_scene['properties'] = {k: v for k, v in _scene['properties'].items() if k in ['id', 'type', 'narration', 'elements', 'edges', 'code', 'structure', 'timeline', 'chart', 'motif', 'visual_actions', 'dialogue', 'process', 'funnel']}
DRAFT_SCHEMA['definitions']['VisualAction']['required'] = ['kind', 'target', 'cue']
_scene['properties']['narration']['required'] = ['text']
_scene['properties']['narration']['properties'] = {'text': _scene['properties']['narration']['properties']['text']}


# Provider-only schema. Saved drafts, voice jobs and the public DSL stay canonical.
REFERENCE_SCHEMA = copy.deepcopy(DRAFT_SCHEMA)
_reference_scene = REFERENCE_SCHEMA['definitions']['Scene']
_reference_scene['required'].remove('narration')
_reference_scene['required'].append('source_part_ids')
_reference_scene['properties'].pop('narration')
# T8 will expose source-quoted actions together with the director prompt/protocol.
_reference_scene['properties'].pop('visual_actions')
_reference_scene['properties'].pop('dialogue')
_reference_scene['properties'].pop('process')
_reference_scene['properties'].pop('funnel')
REFERENCE_SCHEMA['definitions'].pop('VisualAction')
REFERENCE_SCHEMA['definitions'].pop('Dialogue')
REFERENCE_SCHEMA['definitions'].pop('Process')
REFERENCE_SCHEMA['definitions'].pop('Funnel')
_reference_scene['properties']['source_part_ids'] = {
    'type': 'array', 'minItems': 1, 'maxItems': 200, 'uniqueItems': True,
    'items': {'type': 'integer', 'minimum': 1, 'maximum': 200}}


LEGACY_REFERENCE_SCHEMA = copy.deepcopy(REFERENCE_SCHEMA)
REFERENCE_SCHEMA['definitions']['Element']['properties']['cue'] = {
    'type': 'object', 'additionalProperties': False, 'required': ['quote'],
    'properties': {'quote': {'type': 'string', 'minLength': 1, 'maxLength': 4000}}}


# Explicit offline director protocol; existing paid workers keep REFERENCE_SCHEMA.
DIRECTOR_REFERENCE_SCHEMA = copy.deepcopy(REFERENCE_SCHEMA)
for _key in ('visual_actions', 'dialogue', 'process', 'funnel'):
    DIRECTOR_REFERENCE_SCHEMA['definitions']['Scene']['properties'][_key] = copy.deepcopy(_scene['properties'][_key])
for _key in ('VisualAction', 'Dialogue', 'Process', 'Funnel'):
    DIRECTOR_REFERENCE_SCHEMA['definitions'][_key] = copy.deepcopy(DRAFT_SCHEMA['definitions'][_key])
_action_properties = DIRECTOR_REFERENCE_SCHEMA['definitions']['VisualAction']['properties']
_action_properties['cue'] = copy.deepcopy(REFERENCE_SCHEMA['definitions']['Element']['properties']['cue'])
for _key in ('start_frame', 'duration_frames'):
    _action_properties.pop(_key)


def source_parts(source):
    # ponytail: unpunctuated text is one part; add manuscript breaks for finer scene boundaries.
    pieces, prefix = [], ''
    for piece in re.split(r'(?<=[。！？\n])', source):
        if not piece.strip():
            if pieces: pieces[-1] += piece
            else: prefix += piece
        else:
            pieces.append(prefix + piece)
            prefix = ''
    if prefix: pieces.append(prefix)
    size = max(1, math.ceil(len(pieces) / 200))
    return [{'id': i // size + 1, 'text': ''.join(pieces[i:i + size])}
            for i in range(0, len(pieces), size)]


_GRAPHIC = ('icon', 'step', 'highlight', 'source_label', 'panel_style')
_CODE_STEP = ('code_lines', 'variables', 'output', 'array_items', 'pointers', 'loop', 'input')
_STATE_STEP = ('items', 'active_item_ids')


def _coerce_scene_motif(scene, kind, elements):
    motif = scene.get('motif')
    if motif is None:
        return
    if motif == 'default':
        return
    soft = kind in ('title_reveal', 'card_sequence', 'flow_diagram', 'comparison_panel', 'concept')
    n = len(elements)
    ok = (
        (motif == 'funnel' and (scene.get('funnel') or 2 <= n <= 3) and kind in ('card_sequence', 'flow_diagram')) or
        (motif == 'dialogue_split' and 2 <= n <= 4 and kind == 'card_sequence') or
        (motif == 'means_row' and 2 <= n <= 3 and kind == 'card_sequence') or
        (motif == 'schematic' and 1 <= n <= 4 and kind in ('card_sequence', 'concept', 'flow_diagram'))
    )
    if not soft or not ok:
        scene.pop('motif', None)


def coerce_storyboard_draft(draft):
    """Drop type-foreign extras and demote unsatisfiable templates before schema checks."""
    if not isinstance(draft, dict) or not isinstance(draft.get('scenes'), list):
        return draft
    for scene in draft['scenes']:
        if not isinstance(scene, dict):
            continue
        kind = scene.get('type')
        elements = scene.get('elements') if isinstance(scene.get('elements'), list) else []
        if kind == 'comparison_panel' and len(elements) not in (2, 4, 6):
            scene['type'] = 'card_sequence'
            scene.pop('edges', None)
            kind = 'card_sequence'
        if kind == 'concept':
            narration = scene.get('narration') if isinstance(scene.get('narration'), dict) else {}
            text = narration.get('text') if isinstance(narration.get('text'), str) else None
            if text is not None:
                for element in elements:
                    if not isinstance(element, dict):
                        continue
                    cue = element.get('cue') if isinstance(element.get('cue'), dict) else None
                    if not cue or 'text_start' not in cue or 'text_end' not in cue:
                        continue
                    try:
                        start, end = int(cue['text_start']), int(cue['text_end'])
                    except (TypeError, ValueError):
                        continue
                    if start < 0 or end > len(text) or start >= end:
                        continue
                    span = text[start:end]
                    content = element.get('content')
                    if isinstance(content, str) and content in span:
                        continue
                    excerpt = span.strip(validator.WHITESPACE)[:40]
                    if excerpt:
                        element['content'] = excerpt
            definitions = sum(1 for e in elements if isinstance(e, dict) and e.get('concept_role') == 'definition')
            summaries = sum(1 for e in elements if isinstance(e, dict) and e.get('concept_role') == 'summary')
            if definitions != 1 or summaries > 1:
                scene['type'] = 'card_sequence'
                kind = 'card_sequence'
        if kind != 'flow_diagram':
            scene.pop('edges', None)
        if kind != 'code_walkthrough':
            scene.pop('code', None)
        if kind != 'state_diagram':
            scene.pop('structure', None)
        if kind != 'execution_timeline':
            scene.pop('timeline', None)
        if kind != 'data_chart':
            scene.pop('chart', None)
        graphic_ok = kind in ('title_reveal', 'card_sequence', 'flow_diagram', 'comparison_panel')
        role_ok = kind in ('title_reveal', 'card_sequence')
        for element in elements:
            if not isinstance(element, dict):
                continue
            if kind != 'concept':
                element.pop('concept_role', None)
            if not role_ok:
                element.pop('role', None)
            if not graphic_ok:
                for key in _GRAPHIC:
                    element.pop(key, None)
            if kind != 'code_walkthrough':
                for key in _CODE_STEP:
                    element.pop(key, None)
            if kind != 'state_diagram':
                for key in _STATE_STEP:
                    element.pop(key, None)
            if kind != 'execution_timeline':
                element.pop('event', None)
            if kind == 'title_reveal' and element.get('content') and len(element['content']) > 30:
                element['content'] = element['content'][:30]
        _coerce_scene_motif(scene, kind, elements)
    return draft


def restore_storyboard(raw, source, parts, *, require_quotes=False, semantic_graphics=False):
    if semantic_graphics and not require_quotes:
        raise ProviderError('storyboard', 'schema_error', 'Director protocol requires source quotes')
    if isinstance(raw, dict) and isinstance(raw.get('scenes'), list) and any(isinstance(s, dict) and (s.get('type') == 'data_chart' or 'chart' in s) for s in raw['scenes']):
        raise ProviderError('storyboard', 'schema_error', 'Chart data requires explicit user confirmation')
    # Exact legacy reads remain supported; new provider calls must use quote-only wire data.
    if not require_quotes and isinstance(raw, dict) and isinstance(raw.get('scenes'), list) and all(
            isinstance(s, dict) and 'narration' in s for s in raw['scenes']):
        draft = coerce_storyboard_draft(copy.deepcopy(raw))
        validate_storyboard(draft, source)
        return draft
    problems = schema_errors(DIRECTOR_REFERENCE_SCHEMA if semantic_graphics else REFERENCE_SCHEMA, raw)
    quoted = not problems
    if problems and not require_quotes:
        problems = schema_errors(LEGACY_REFERENCE_SCHEMA, raw)
    if problems:
        raise ProviderError('storyboard', 'schema_error', 'Invalid source-reference fields', problems)
    ids = [part for scene in raw['scenes'] for part in scene['source_part_ids']]
    if ids != [p['id'] for p in parts] or any(type(i) is not int for i in ids):
        raise ProviderError('storyboard', 'source_reference', 'Parts must cover the source exactly once in order')
    result = copy.deepcopy(raw)
    lookup = {p['id']: p['text'] for p in parts}
    for i, scene in enumerate(result['scenes']):
        text = ''.join(lookup[part] for part in scene.pop('source_part_ids'))
        scene['narration'] = {'text': text}
        if quoted:
            for field in ('elements', 'visual_actions'):
                for j, item in enumerate(scene.get(field, [])):
                    quote = item['cue']['quote']
                    start = text.find(quote)
                    reason = 'quote_blank' if not quote.strip() else 'quote_not_found' if start < 0 else 'quote_ambiguous' if text.find(quote, start + 1) >= 0 else None
                    if reason:
                        path = f'/scenes/{i}/{field}/{j}/cue'
                        raise ProviderError('storyboard', 'invalid_cue', 'Expected a unique original quote', cue_error={'path': path, 'reason': reason})
                    item['cue'] = {'text_start': start, 'text_end': start + len(quote)}
    result = coerce_storyboard_draft(result)
    validate_storyboard(result, source)
    return result


def validate_storyboard(draft, source):
    problems = schema_errors(DRAFT_SCHEMA, draft)
    if problems:
        raise ProviderError('storyboard', 'schema_error', 'Invalid teaching fields', problems)
    scenes = draft['scenes']
    if len({s['id'] for s in scenes}) != len(scenes):
        raise ProviderError('storyboard', 'duplicate_id', 'Scene IDs must be unique')
    if ''.join(s['narration']['text'] for s in scenes) != source or not source.strip() or len(source) > 4000:
        raise ProviderError('storyboard', 'source_mismatch', 'Narration must preserve the original 1–4000 code points')
    for i, scene in enumerate(scenes):
        errors = validator.validate_scene_visuals(scene, f'/scenes/{i}')
        if errors:
            error, details = errors[0], None
            if error['code'] == 'invalid_cue':
                cue = scene['elements'][int(error['path'].split('/')[4])]['cue']
                start, end = cue['text_start'], cue['text_end']
                reason = 'empty_or_reversed' if start >= end else 'out_of_bounds' if end > len(scene['narration']['text']) else 'blank_interval'
                details = {'path': error['path'], 'reason': reason}
            raise ProviderError('storyboard', error['code'], error['path'], cue_error=details)
