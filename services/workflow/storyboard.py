"""Chapter draft schema derived from the final DSL; voice jobs validate the frozen chapter against it."""
import copy
import importlib.util
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
_scene['properties'] = {k: v for k, v in _scene['properties'].items() if k in ['id', 'type', 'narration', 'elements', 'edges', 'code', 'structure', 'timeline', 'chart', 'motif', 'visual_actions', 'dialogue', 'process', 'funnel', 'camera', 'vector', 'section']}
DRAFT_SCHEMA['definitions']['VisualAction']['required'] = ['kind', 'target', 'cue']
from services.workflow.image_plans import PLAN_SCHEMA, validate_plan
_scene['properties']['image_plan'] = copy.deepcopy(PLAN_SCHEMA)
_scene['properties']['narration']['required'] = ['text']
_scene['properties']['narration']['properties'] = {'text': _scene['properties']['narration']['properties']['text']}



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
        validate_plan(scene)
        errors = validator.validate_scene_visuals(scene, f'/scenes/{i}')
        if errors:
            error, details = errors[0], None
            if error['code'] == 'invalid_cue':
                cue = scene['elements'][int(error['path'].split('/')[4])]['cue']
                start, end = cue['text_start'], cue['text_end']
                reason = 'empty_or_reversed' if start >= end else 'out_of_bounds' if end > len(scene['narration']['text']) else 'blank_interval'
                details = {'path': error['path'], 'reason': reason}
            raise ProviderError('storyboard', error['code'], error['path'], cue_error=details)
