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


def validate_actions(scene, path, timed=False):
    errors = []
    def fail(i, code, message):
        errors.append({'path': f'{path}/visual_actions/{i}', 'code': code, 'message': message})
    actions = scene.get('visual_actions', [])
    if actions and scene['type'] not in ['card_sequence', 'flow_diagram', 'comparison_panel']:
        fail(0, 'action_scene', 'Actions require a supported graphics scene')
    text = scene['narration']['text']
    elements = {e['id']: e for e in scene['elements']}
    starts = {a['target']: a['start_frame'] for a in scene.get('animations', [])}
    previous_cue = previous_frame = -1
    updates = set()
    for i, action in enumerate(actions):
        kind = action['kind']; target = elements.get(action['target'])
        to = elements.get(action.get('to')); source = elements.get(action.get('source'))
        start, end = action['cue']['text_start'], action['cue']['text_end']
        if (not target or kind == 'connect' and (not to or action['to'] == action['target']) or
                kind == 'update' and (not source or action['source'] == action['target'])):
            fail(i, 'action_reference', 'Distinct existing element references required')
        if start >= end or end > len(text) or not text[start:end].strip(WHITESPACE):
            fail(i, 'action_cue', 'Action requires nonblank original text')
        if start < previous_cue:
            fail(i, 'action_order', 'Actions must follow source order')
        previous_cue = start
        for element in [target] + ([to] if kind == 'connect' else []):
            if element and element.get('role') != 'topic' and element['cue']['text_start'] > start:
                fail(i, 'action_early', 'Action precedes its visible target')
        if kind == 'update' and source:
            if len(source['content']) > 16 or source['content'] not in text[start:end]:
                fail(i, 'action_state', 'Updated state must be a literal source excerpt of at most 16 code points')
            key = (action['target'], start)
            if key in updates:
                fail(i, 'action_conflict', 'Two updates cannot write the same target at one source position')
            updates.add(key)
        if timed:
            frame, duration = action['start_frame'], action['duration_frames']
            if frame + duration > scene['duration_frames'] - 6:
                fail(i, 'action_frames', 'Action must fit the audio interval')
            if frame < previous_frame:
                fail(i, 'action_order', 'Action frames must follow source order')
            previous_frame = frame
            for id_ in [action['target']] + ([action['to']] if kind == 'connect' else []):
                if id_ in starts and frame < starts[id_]:
                    fail(i, 'action_early', 'Action precedes target entrance')
    return errors


def validate_diagrams(scene, path):
    errors = []
    d, p, funnel = scene.get('dialogue'), scene.get('process'), scene.get('funnel')
    if funnel:
        def bad(message):
            errors.append({'path': f'{path}/funnel', 'code': 'diagram_binding', 'message': message})
        layers, notes = funnel['layers'], funnel['notes']
        elements = {e['id']: e for e in scene['elements']}
        ids = layers + [n['element_id'] for n in notes]
        if d or p or scene.get('motif') != 'funnel' or scene['type'] not in ['card_sequence', 'flow_diagram']:
            bad('Unsupported funnel shape')
        if len(ids) != len(elements) or len(set(ids)) != len(ids) or any(i not in elements for i in ids):
            bad('Bind every element exactly once')
        for note in notes:
            if 'target' in note and note['target'] not in layers:
                bad('Note target must be a layer')
        for e in scene['elements']:
            quote = scene['narration']['text'][e['cue']['text_start']:e['cue']['text_end']]
            if e.get('role') or e['content'] not in quote or e['id'] in layers and len(e['content']) > 12 or e.get('source_label') and e['source_label'] not in quote:
                bad('Funnel labels and notes must fit and quote their own cue')
        if any(a in elements and b in elements and elements[a]['cue']['text_start'] > elements[b]['cue']['text_start'] for a,b in zip(layers,layers[1:])):
            bad('Layers must follow narration order')
        if any(a['kind'] == 'connect' and (a['target'] not in layers or a['to'] not in layers) for a in scene.get('visual_actions', [])):
            bad('Explicit connections must join layers; notes use their target')
        return errors
    if not d and not p:
        return errors
    field = 'dialogue' if d else 'process'
    def fail(message):
        errors.append({'path': f'{path}/{field}', 'code': 'diagram_binding', 'message': message})
    if d and p:
        fail('Only one diagram binding is allowed')
        return errors
    ids = d['messages'] + [d['state']] if d else p['stages'] + p['details']
    elements = {e['id']: e for e in scene['elements']}
    if len(ids) != len(elements) or len(set(ids)) != len(ids) or any(id_ not in elements for id_ in ids):
        fail('Bind every element exactly once')
    if d and (scene['type'] != 'card_sequence' or scene.get('motif') != 'dialogue_split') or p and (scene['type'] != 'flow_diagram' or scene.get('motif', 'default') != 'default'):
        fail('Unsupported diagram shape')
    if d and 'context_messages' in d:
        contexts=d['context_messages']
        updates={a['source'] for a in scene.get('visual_actions',[]) if a['kind']=='update'}
        if (any(a['kind']=='connect' and (a['target'] in updates or a['to'] in updates) for a in scene.get('visual_actions',[]))
                or len(set(contexts))!=len(contexts) or any(id_ not in d['messages'] or id_ in updates for id_ in contexts)
                or not set(d['messages'])-updates-set(contexts)):
            fail('Context roles must be evidence, with a current message')
    for e in scene['elements']:
        quote = scene['narration']['text'][e['cue']['text_start']:e['cue']['text_end']]
        if e.get('source_label') and (e['source_label'] not in quote or p and e['id'] in p['stages'] and len(e['source_label']) > 8):
            fail('Source label must fit and quote its own cue')
        if e.get('role') or e['content'] not in quote:
            fail('Diagram labels must be literal source excerpts, not early topics')
        if d and e['id'] == d['state'] and len(e['content']) > 16 or p and e['id'] in p['stages'] and len(e['content']) > 24:
            fail('State or stage label exceeds capacity')
    ordered = d['messages'] if d else p['stages']
    if any(a in elements and b in elements and elements[a]['cue']['text_start'] > elements[b]['cue']['text_start'] for a,b in zip(ordered, ordered[1:])):
        fail('Display groups must follow narration order')
    if p and any(e['from'] not in p['stages'] or e['to'] not in p['stages'] for e in scene.get('edges', [])):
        fail('Process edges must connect stages')
    return errors


def validate_scene_visuals(scene, path):
    """Shared visual checks for schema-validated drafts and final scenes."""
    errors = []

    def fail(suffix, code, message):
        errors.append({'path': path + suffix, 'code': code, 'message': message})

    errors.extend(validate_actions(scene, path, 'animations' in scene and 'duration_frames' in scene))
    errors.extend(validate_diagrams(scene, path))
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


def validate_scene_images(scene, assets, path):
    """Validate bindings independently of derived voice/timing fields."""
    if 'images' not in scene:
        return []
    schema = {**SCHEMA['definitions']['Scene']['properties']['images'], 'definitions': SCHEMA['definitions']}
    errors = [{'path': path + '/images', 'code': 'image_schema', 'message': e.message}
              for e in Draft7Validator(schema).iter_errors(scene['images'])]
    if errors:
        return errors
    def fail(suffix, code, message):
        errors.append({'path': path + '/images' + suffix, 'code': code, 'message': message})
    if (len(scene['elements']) > 4 or scene['type'] not in ['card_sequence', 'comparison_panel'] or scene.get('motif', 'default') != 'default'
            or any(scene.get(k) for k in ['dialogue', 'process', 'funnel'])):
        fail('', 'image_layout', 'Images need a supported default composition')
    ids = [b['element_id'] for b in scene['images']]
    if len(set(ids)) != len(ids):
        fail('', 'duplicate_id', 'IDs must be unique')
    for j, binding in enumerate(scene['images']):
        if assets is not None and assets.get(binding['asset_id'], {}).get('type') != 'image':
            fail(f'/{j}/asset_id', 'missing_image', 'Image asset does not exist')
        if binding['element_id'] not in [e['id'] for e in scene['elements']]:
            fail(f'/{j}/element_id', 'image_target', 'Image target must exist')
        if not binding['alt'].strip(WHITESPACE) or any(unicodedata.category(c) in ['Cc', 'Cf', 'Zl', 'Zp'] for c in binding['alt']):
            fail(f'/{j}/alt', 'image_alt', 'Image description must be visible text')
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
    for i, asset in enumerate(value['assets']):
        if asset['type'] == 'image' and asset['width'] * asset['height'] > 8388608:
            fail(f'/assets/{i}', 'image_pixels', 'Image exceeds eight megapixels')
    unique([s['id'] for s in value['scenes']], '/scenes')
    if sum(s['duration_frames'] for s in value['scenes']) > 9000:
        fail('/scenes', 'duration_limit', 'Video exceeds five minutes')
    if sum(len(s['narration']['text']) for s in value['scenes']) > 4000:
        fail('/scenes', 'text_limit', 'Narration exceeds 4000 code points')

    for i, scene in enumerate(value['scenes']):
        path = f'/scenes/{i}'
        asset = assets.get(scene['narration']['audio_asset_id'])
        if asset is None or asset['type'] != 'audio':
            fail(path + '/narration/audio_asset_id', 'missing_asset', 'Audio asset does not exist')
        elif scene['duration_frames'] != 12 + math.ceil(asset['duration_ms'] * 30 / 1000):
            fail(path + '/duration_frames', 'audio_duration', 'Scene must contain audio plus six frames at each end')
        errors.extend(validate_scene_visuals(scene, path))
        ids = [e['id'] for e in scene['elements']]
        errors.extend(validate_scene_images(scene, assets, path))
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
