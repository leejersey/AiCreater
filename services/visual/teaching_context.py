"""Server-owned chapter/timing snapshot; no paid calls or file execution."""
import copy
from services.projects.store import StoreError
from services.visual.contract import draft_input, measured_input


def chapter_snapshot(project, row, timing_mode):
    if timing_mode not in ('draft', 'measured'): raise StoreError('validation', 'Invalid timing mode')
    data = (draft_input if timing_mode == 'draft' else measured_input)(project, row)
    return {'generation_mode': 'teaching-plan', 'brief': data['brief'], 'cues': data['cues'],
            'media': {'timing_mode': timing_mode, 'fingerprint': data['fingerprint'],
                      'scene_revision': row['revision'], 'asset': copy.deepcopy(data['asset'])}}
