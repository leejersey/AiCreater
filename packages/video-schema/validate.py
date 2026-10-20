"""Validate the same final DSL as the TS renderer. Usage: validate.py file.json | -."""
import json
import math
import sys
import unicodedata
from pathlib import Path

from jsonschema import Draft7Validator

SCHEMA = json.loads(Path(__file__).with_name('schema.json').read_text())
# Match JavaScript String.trim(), not Python's broader whitespace definition.
WHITESPACE = ' \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'


def validate_scene_visuals(scene, path):
    """Shared visual checks for schema-validated drafts and final scenes."""
    errors = []

    def fail(suffix, code, message):
        errors.append({'path': path + suffix, 'code': code, 'message': message})

    text = scene['narration']['text']
    if not text.strip(WHITESPACE):
        fail('/narration/text', 'blank_text', 'Narration is blank')
    ids = [e['id'] for e in scene['elements']]
    if len(set(ids)) != len(ids):
        fail('/elements', 'duplicate_id', 'IDs must be unique')
    if sum(e.get('role') == 'topic' for e in scene['elements']) > 1:
        fail('/elements', 'topic_count', 'Only one topic title is allowed per scene')
    if scene['type'] == 'concept' and (sum(e['concept_role'] == 'definition' for e in scene['elements']) != 1 or
                                       sum(e['concept_role'] == 'summary' for e in scene['elements']) > 1):
        fail('/elements', 'concept_roles', 'Exactly one definition and at most one summary required')
    for j, element in enumerate(scene['elements']):
        if not element['content'].strip(WHITESPACE):
            fail(f'/elements/{j}/content', 'blank_text', 'Label is blank')
        if 'highlight' in element:
            high = element['highlight']
            if high['text_start'] >= high['text_end'] or high['text_end'] > len(element['content']):
                fail(f'/elements/{j}/highlight', 'invalid_highlight', 'Highlight must fit content code points')
        if 'source_label' in element:
            label = element['source_label']
            if not label.strip(WHITESPACE) or label not in text or any(unicodedata.category(c) in ['Cc', 'Cf', 'Zl', 'Zp'] for c in label):
                fail(f'/elements/{j}/source_label', 'invalid_source_label', 'Source label must be visible literal narration text')
        if element.get('role') == 'topic' and element.get('panel_style') == 'conclusion':
            fail(f'/elements/{j}/panel_style', 'topic_conclusion', 'A conclusion cannot be an early topic')
        start, end = int(element['cue']['text_start']), int(element['cue']['text_end'])
        if start >= end or end > len(text) or not text[start:end].strip(WHITESPACE):
            fail(f'/elements/{j}/cue', 'invalid_cue', 'Cue must reference a nonblank code-point interval in narration')
        if scene['type'] == 'concept' and element['content'] not in text[start:end]:
            fail(f'/elements/{j}/content', 'concept_excerpt', 'Concept content must be a literal excerpt of its cue')
    if scene['type'] == 'data_chart':
        chart = scene['chart']; rows = chart['data']
        def plain(value):
            return value.strip(WHITESPACE) and not any(unicodedata.category(c) in ['Cc','Cf','Zl','Zp'] for c in value)
        labels = [r['label'] for r in rows]
        if [r['element_id'] for r in rows] != ids:
            fail('/chart/data', 'chart_binding', 'Chart rows must bind every element once in order')
        if len(set(labels)) != len(labels) or not all(plain(v) for v in [chart['title'],chart['unit'],chart['source_note'],*labels,*chart.get('columns',[])]):
            fail('/chart', 'chart_text', 'Chart labels must be visible and unique')
        if any(type(v) not in [int,float] or not math.isfinite(v) for r in rows for v in r['values']):
            fail('/chart/data', 'chart_values', 'Finite numbers required')
        if chart['kind'] == 'matrix' and any(len(r['values']) != len(chart['columns']) for r in rows):
            fail('/chart/data', 'chart_dimensions', 'Matrix rows must match columns')
        if chart['kind'] == 'proportion' and sum(r['values'][0] for r in rows) <= 0:
            fail('/chart/data', 'chart_total', 'Proportion total must be positive')
    if scene['type'] == 'execution_timeline':
        timeline = scene['timeline']
        lanes = [lane['id'] for lane in timeline['lanes']]
        if len(set(lanes)) != len(lanes):
            fail('/timeline/lanes', 'duplicate_id', 'IDs must be unique')
        if any(not lane['label'].strip(WHITESPACE) or any(unicodedata.category(c) in ['Cc', 'Cf', 'Zl', 'Zp'] for c in lane['label']) for lane in timeline['lanes']):
            fail('/timeline/lanes', 'timeline_text', 'Lane labels must be visible text')
        for j, step in enumerate(scene['elements']):
            event = step['event']
            if event['lane_id'] not in lanes:
                fail(f'/elements/{j}/event', 'timeline_reference', 'Event lane does not exist')
            if event['start_ms'] >= event['end_ms'] or event['end_ms'] > timeline['duration_ms']:
                fail(f'/elements/{j}/event', 'timeline_range', 'Event must fit the illustrative axis')
            if any(e['event']['lane_id'] == event['lane_id'] and e['event']['start_ms'] < event['end_ms'] and event['start_ms'] < e['event']['end_ms'] for e in scene['elements'][:j]):
                fail(f'/elements/{j}/event', 'timeline_overlap', 'Events in one task lane cannot overlap')
        if any(not any(e['event']['lane_id'] == lane for e in scene['elements']) for lane in lanes):
            fail('/timeline/lanes', 'timeline_empty_lane', 'Each lane needs an event')
    if scene['type'] == 'state_diagram':
        def plain(value):
            return value.strip(WHITESPACE) and not any(unicodedata.category(c) in ['Cc', 'Cf', 'Zl', 'Zp'] for c in value)
        if not plain(scene['structure']['name']):
            fail('/structure/name', 'state_text', 'Structure name must be visible text')
        for j, step in enumerate(scene['elements']):
            items = step['items']
            keys, item_ids = [item['key'] for item in items], [item['id'] for item in items]
            if len(set(item_ids)) != len(item_ids):
                fail(f'/elements/{j}/items', 'duplicate_id', 'IDs must be unique')
            if len(set(keys)) != len(keys) or (scene['structure']['kind'] != 'object' and keys != [str(n) for n in range(len(items))]):
                fail(f'/elements/{j}/items', 'state_keys', 'Keys must be unique; array/stack indexes must be consecutive')
            if any(not plain(item['key']) or not plain(item['value']) for item in items):
                fail(f'/elements/{j}/items', 'state_text', 'State keys and values must be visible text')
            if any(id_ not in item_ids for id_ in step['active_item_ids']):
                fail(f'/elements/{j}/active_item_ids', 'state_reference', 'Highlight must reference current items')
    if scene['type'] == 'code_walkthrough':
        source = scene['code']['source']
        lines = source.split('\n')
        if (not source.strip(WHITESPACE) or len(lines) > 16 or
                any(sum(1 if ord(c) < 128 else 2 for c in line) > 48 for line in lines) or
                any(c != '\n' and unicodedata.category(c) in ['Cc', 'Cf', 'Zl', 'Zp'] for c in source)):
            fail('/code/source', 'code_layout', 'Code must fit 16 lines / 48 display units without invisible controls')
        def code_plain(value, empty=False):
            return (empty or value.strip(WHITESPACE)) and not any(unicodedata.category(c) in ['Cc', 'Cf', 'Zl', 'Zp'] for c in value)
        if 'array_name' in scene['code'] and not code_plain(scene['code']['array_name']):
            fail('/code/array_name', 'code_state_text', 'Array name must be visible')
        for j, step in enumerate(scene['elements']):
            if 'array_name' in scene['code']:
                items, pointers = step['array_items'], step['pointers']
                item_ids = [v['id'] for v in items]
                if len(set(item_ids)) != len(item_ids) or [v['key'] for v in items] != [str(n) for n in range(len(items))]:
                    fail(f'/elements/{j}/array_items', 'code_state_items', 'Unique IDs and consecutive indexes required')
                if len({v['name'] for v in pointers}) != len(pointers) or any(v['item_id'] not in item_ids for v in pointers):
                    fail(f'/elements/{j}/pointers', 'code_state_pointer', 'Unique pointers must reference current items')
                if step['loop'] is not None and step['loop']['current'] > step['loop']['total']:
                    fail(f'/elements/{j}/loop', 'code_state_loop', 'Current round cannot exceed total')
                if (any(not code_plain(v) for v in [step['content'], *[v['value'] for v in items], *[v['name'] for v in pointers], *[v[k] for v in step['variables'] for k in ['name','value']]]) or
                        any(not code_plain(step[k], empty=True) for k in ['input','output'])):
                    fail(f'/elements/{j}', 'code_state_text', 'Visible snapshot text required')
            if any(line > len(lines) for line in step['code_lines']):
                fail(f'/elements/{j}/code_lines', 'invalid_line', 'Code line does not exist')
            names = [v['name'] for v in step['variables']]
            if len(set(names)) != len(names) or any(not v.strip(WHITESPACE) for v in names):
                fail(f'/elements/{j}/variables', 'invalid_variables', 'Variable names must be nonblank and unique')
    if scene['type'] in ['code_walkthrough', 'state_diagram', 'execution_timeline', 'data_chart', 'concept']:
        previous = -1
        for j, step in enumerate(scene['elements']):
            start = step['cue']['text_start']
            if start <= previous:
                fail(f'/elements/{j}/cue', 'step_order', 'Teaching steps must follow narration order')
            previous = start
    if scene['type'] == 'flow_diagram':
        edges = scene['edges']
        keys = [(e['from'], e['to']) for e in edges]
        if len(set(keys)) != len(keys):
            fail('/edges', 'duplicate_edge', 'Duplicate edges')
        graph = {id_: [] for id_ in ids}
        for j, edge in enumerate(edges):
            if edge['from'] not in ids or edge['to'] not in ids or edge['from'] == edge['to']:
                fail(f'/edges/{j}', 'invalid_edge', 'Edges must connect distinct existing elements')
            else:
                graph[edge['from']].append(edge['to'])
        active, visited = set(), set()

        def visit(id_):
            if id_ in active:
                return True
            if id_ in visited:
                return False
            active.add(id_)
            if any(visit(child) for child in graph[id_]):
                return True
            active.remove(id_)
            visited.add(id_)
            return False

        if any(visit(id_) for id_ in ids):
            fail('/edges', 'cycle', 'Flow graph must be acyclic')
    return errors


def validate_project(value):
    errors = []

    def fail(path, code, message):
        errors.append({'path': path, 'code': code, 'message': message})

    for error in Draft7Validator(SCHEMA).iter_errors(value):
        fail('/' + '/'.join(str(x) for x in error.absolute_path), str(error.validator), error.message)
    if errors:
        return errors

    def unique(ids, path):
        if len(set(ids)) != len(ids):
            fail(path, 'duplicate_id', 'IDs must be unique')

    assets = {a['id']: a for a in value['assets']}
    unique([a['id'] for a in value['assets']], '/assets')
    unique([s['id'] for s in value['scenes']], '/scenes')
    if sum(s['duration_frames'] for s in value['scenes']) > 9000:
        fail('/scenes', 'duration_limit', 'Video exceeds five minutes')
    if sum(len(s['narration']['text']) for s in value['scenes']) > 4000:
        fail('/scenes', 'text_limit', 'Narration exceeds 4000 code points')

    for i, scene in enumerate(value['scenes']):
        path = f'/scenes/{i}'
        asset = assets.get(scene['narration']['audio_asset_id'])
        if asset is None:
            fail(path + '/narration/audio_asset_id', 'missing_asset', 'Audio asset does not exist')
        elif scene['duration_frames'] != 12 + math.ceil(asset['duration_ms'] * 30 / 1000):
            fail(path + '/duration_frames', 'audio_duration', 'Scene must contain audio plus six frames at each end')
        errors.extend(validate_scene_visuals(scene, path))
        ids = [e['id'] for e in scene['elements']]
        targets = [a['target'] for a in scene['animations']]
        if len(set(targets)) != len(targets) or len(targets) != len(set(ids)) or any(t not in ids for t in targets):
            fail(path + '/animations', 'animation_targets', 'Each element needs exactly one entrance animation')
        for j, animation in enumerate(scene['animations']):
            if animation['start_frame'] + animation['duration_frames'] > scene['duration_frames']:
                fail(f'{path}/animations/{j}', 'frame_range', 'Animation exceeds scene')
        if scene['type'] in ['code_walkthrough', 'state_diagram', 'execution_timeline', 'data_chart', 'concept']:
            starts = {a['target']: a['start_frame'] for a in scene['animations']}
            times = [starts.get(id_) for id_ in ids]
            if None not in times and any(a >= b for a, b in zip(times, times[1:])):
                fail(path + '/animations', 'step_order', 'Teaching step times must increase strictly')
        previous_end = 0
        for j, caption in enumerate(scene['captions']):
            start, end = caption['start_frame'], caption['end_frame']
            if start >= end or end > scene['duration_frames'] - 6 or start < previous_end:
                fail(f'{path}/captions/{j}', 'frame_range', 'Caption is empty, overlapping or outside audio range')
            previous_end = end
            lines = caption['text'].split('\n')
            if (not caption['text'].strip(WHITESPACE) or len(lines) > 2 or
                    any(not line.strip(WHITESPACE) or len(line) > (44 if len(lines) == 1 else 22) for line in lines) or
                    any(ord(c) < 32 and c != '\n' for c in caption['text'])):
                fail(f'{path}/captions/{j}/text', 'caption_layout', 'Caption must fit two nonblank lines of 22 code points')
    return errors


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Usage: python3 packages/video-schema/validate.py file.json | -')
        data = json.load(sys.stdin) if sys.argv[1] == '-' else json.loads(Path(sys.argv[1]).read_text())
        problems = validate_project(data)
    except (ValueError, OSError) as exc:
        problems = [{'path': '/', 'code': 'input_error', 'message': str(exc)}]
    print(json.dumps({'valid': not problems, 'validation_errors': problems}, ensure_ascii=False, indent=2))
    sys.exit(1 if problems else 0)
