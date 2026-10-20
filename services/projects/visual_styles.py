"""Frozen render-only settings, outside the teaching DSL and voice fingerprints."""
import copy
import json
from services.workflow.storyboard import ROOT


def snapshot(style='legacy'):
    presets=json.loads((ROOT/'packages/video-components/src/visual-styles.json').read_text())
    if not isinstance(style,str) or style not in presets:
        raise ValueError('Unknown visual style')
    return {'id':style,'tokens':copy.deepcopy(presets[style])}
