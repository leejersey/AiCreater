"""Bounded structural diagnostics, never validation messages or instance values."""
import json
import re
from itertools import islice
from pathlib import Path

from jsonschema import Draft7Validator


def _fields(node):
    result = set()
    if isinstance(node, dict):
        result.update(node.get('properties', {}))
        for value in node.values(): result.update(_fields(value))
    elif isinstance(node, list):
        for value in node: result.update(_fields(value))
    return result


PUBLIC_FIELDS = _fields(json.loads((Path(__file__).resolve().parents[2] / 'packages/video-schema/schema.json').read_text())) | {'source_part_ids', 'quote'}
RULES = frozenset(Draft7Validator.VALIDATORS) | {'schema'}


def safe_schema_errors(values):
    if not isinstance(values, list): return []
    result = []
    for value in values[:3]:
        if not isinstance(value, dict): continue
        rule, path = value.get('rule'), value.get('path')
        if not isinstance(rule, str) or rule not in RULES: continue
        if not isinstance(path, str) or not path.startswith('/') or len(path) > 256: continue
        parts = []
        # Unknown property names may contain secrets: stop before them, never echo them.
        for part in path.split('/')[1:11]:
            if part in PUBLIC_FIELDS: parts.append(part)
            elif part.isascii() and part.isdigit() and len(part) <= 3 and int(part) <= 200:
                parts.append(str(int(part)))
            else: break
        result.append({'path': '/' + '/'.join(parts), 'rule': rule})
    return result


def safe_cue_error(value):
    if not isinstance(value, dict): return None
    path, reason = value.get('path'), value.get('reason')
    if not isinstance(path, str) or len(path) > 48 or not re.fullmatch(r'/scenes/(?:[0-9]|1[0-9])/elements/[0-5]/cue', path): return None
    if not isinstance(reason, str) or reason not in {'empty_or_reversed', 'out_of_bounds', 'blank_interval', 'quote_blank', 'quote_not_found', 'quote_ambiguous'}: return None
    return {'path': path, 'reason': reason}


def schema_errors(schema, value):
    problems = list(islice(Draft7Validator(schema).iter_errors(value), 3))
    details = safe_schema_errors([{'path': '/' + '/'.join(map(str, error.absolute_path)), 'rule': error.validator}
                                 for error in problems])
    # Missing diagnostics must never turn an invalid document into a valid one.
    return details or ([{'path': '/', 'rule': 'schema'}] if problems else [])
