"""Strict code-point alignment and frame planning, without estimated speech timing."""
import copy
import math
import re
import unicodedata

from services.workflow.providers import ProviderError


def _spoken(c):
    return not (c.isspace() or unicodedata.category(c)[0] in 'PZ')


def align_words(text, words, duration_ms):
    if not words or duration_ms <= 0:
        raise ProviderError('alignment', 'missing_timestamps', 'A positive audio duration and timestamps are required')
    positions = [(i, c) for i, c in enumerate(text) if _spoken(c)]
    cursor, previous_end, segments = 0, 0, []
    for word in words:
        if not isinstance(word, dict) or not isinstance(word.get('word'), str):
            raise ProviderError('alignment', 'invalid_word', 'Invalid word timestamp record')
        start, end = word.get('startTime'), word.get('endTime')
        if (type(start) not in [int, float] or type(end) not in [int, float] or
                not math.isfinite(start) or not math.isfinite(end) or not 0 <= start < end <= duration_ms / 1000):
            raise ProviderError('alignment', 'invalid_time', 'Timestamps must be finite and inside the audio')
        token = ''.join(c for c in word['word'] if _spoken(c))
        if not token:
            continue
        selected = positions[cursor:cursor + len(token)]
        if ''.join(c for _, c in selected) != token:
            raise ProviderError('alignment', 'text_mismatch', 'Timestamps changed, omitted or reordered the original text')
        start_ms, end_ms = round(start * 1000), round(end * 1000)
        if start_ms < previous_end or end_ms <= start_ms:
            raise ProviderError('alignment', 'nonmonotonic_time', 'Word intervals overlap, reset or collapse')
        segments.append({'text_start': selected[0][0], 'text_end': selected[-1][0] + 1,
                         'start_ms': start_ms, 'end_ms': end_ms})
        cursor += len(token)
        previous_end = end_ms
    if not segments or cursor != len(positions):
        raise ProviderError('alignment', 'incomplete_coverage', 'Every spoken original character needs a timestamp')
    return segments


EFFECTS = ('fade_slide', 'draw', 'scale_pop', 'box', 'shake')


def _effect(element):
    entrance = element.get('entrance')
    return entrance if entrance in EFFECTS else 'fade_slide'


def _display(text, left, right):
    return re.sub(r'\s+', ' ', text[left:right]).strip()


def _fit_caption(display):
    if not display or len(display) > 44:
        return None
    if len(display) > 22:
        return display[:22] + '\n' + display[22:]
    return display


def time_scene(draft, audio_id, duration_ms, segments):
    scene = copy.deepcopy(draft)
    text = scene['narration']['text']
    scene['narration'].update(audio_asset_id=audio_id, audio_start_frame=6)
    scene['duration_frames'] = 12 + math.ceil(duration_ms * 30 / 1000)
    scene['animations'], scene['captions'] = [], []
    for element in scene['elements']:
        cue = element['cue']
        matches = [s for s in segments if s['text_start'] < cue['text_end'] and s['text_end'] > cue['text_start']]
        if not matches:
            raise ProviderError('timing', 'unmapped_cue', 'Element cue has no aligned speech')
        start = 6 + math.floor(matches[0]['start_ms'] * 30 / 1000)
        available = scene['duration_frames'] - 6 - start
        if available < 1:
            raise ProviderError('timing', 'frame_range', 'No audio frame remains for entrance')
        # Explicit topic preview is not a spoken execution/result cue; ordinary elements stay aligned.
        topic = element.get('role') == 'topic'
        if topic:
            scene['animations'].append({'target': element['id'], 'effect': 'fade_slide', 'start_frame': 6, 'duration_frames': 1})
        else:
            end = 6 + math.ceil(matches[-1]['end_ms'] * 30 / 1000)
            duration = min(max(1, end - start), scene['duration_frames'] - start)
            scene['animations'].append({'target': element['id'], 'effect': _effect(element),
                                        'start_frame': start, 'duration_frames': duration})
    for action in scene.get('visual_actions', []):
        cue = action['cue']
        matches = [s for s in segments if s['text_start'] < cue['text_end'] and s['text_end'] > cue['text_start']]
        if not matches:
            raise ProviderError('timing', 'unmapped_cue', 'Visual action cue has no aligned speech')
        start = 6 + math.floor(matches[0]['start_ms'] * 30 / 1000)
        available = scene['duration_frames'] - 6 - start
        if available < 1:
            raise ProviderError('timing', 'frame_range', 'No audio frame remains for visual action')
        action.update(start_frame=start, duration_frames=min(12, available))
    # Group exact word times into readable phrases. Breaks stay on word boundaries.
    caption_segments, group = [], None
    for i, segment in enumerate(segments):
        if group is None:
            group = {**segment, 'words': [segment]}
            caption_segments.append(group)
        else:
            group.update(text_end=segment['text_end'], end_ms=segment['end_ms'])
            group['words'].append(segment)
        right = segments[i + 1]['text_start'] if i + 1 < len(segments) else len(text)
        if (right - group['text_start'] >= 22 or
                any(c in '，。！？；!?;,\n' for c in text[segment['text_end']:right])):
            group = None
    previous_end = 6
    for i, segment in enumerate(caption_segments):
        left = 0 if i == 0 else segment['text_start']
        right = caption_segments[i + 1]['text_start'] if i + 1 < len(caption_segments) else len(text)
        words = segment['words']
        bounds = []
        for w, word in enumerate(words):
            piece_left = left if w == 0 else word['text_start']
            piece_right = words[w + 1]['text_start'] if w + 1 < len(words) else right
            bounds.append((piece_left, piece_right, word['start_ms'], word['end_ms']))
        start_w = 0
        while start_w < len(bounds):
            chosen = None
            for end_w in range(start_w, len(bounds)):
                if len(_display(text, bounds[start_w][0], bounds[end_w][1])) > 44:
                    break
                chosen = end_w
            if chosen is None:
                raise ProviderError('timing', 'caption_layout', 'A spoken word does not fit one caption')
            fitted = _fit_caption(_display(text, bounds[start_w][0], bounds[chosen][1]))
            if fitted is None:
                raise ProviderError('timing', 'caption_layout', 'A spoken word does not fit one caption')
            start_ms, end_ms = bounds[start_w][2], bounds[chosen][3]
            start = max(previous_end, 6 + math.floor(start_ms * 30 / 1000))
            end = min(scene['duration_frames'] - 6, 6 + math.ceil(end_ms * 30 / 1000))
            if end <= start:
                raise ProviderError('timing', 'caption_density', 'Caption intervals cannot fit into nonoverlapping frames')
            scene['captions'].append({'text': fitted, 'start_frame': start, 'end_frame': end})
            previous_end = end
            start_w = chosen + 1
    if not scene['captions']:
        raise ProviderError('timing', 'caption_density', 'Caption intervals cannot fit into nonoverlapping frames')
    # Provider word ends can precede audible speech; retain the last caption to the audio boundary.
    scene['captions'][-1]['end_frame'] = scene['duration_frames'] - 6
    return scene
