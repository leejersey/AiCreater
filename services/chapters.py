"""The chapter: what a course is made of. Narration text, and once voiced its audio, duration and measured captions.

A chapter is stored as {id, narration: {text, audio_asset_id?, audio_start_frame?}, duration_frames?, captions?}.
Voicing and alignment fill in the optional fields; the Scene Agent draws the picture from the narration and captions.
"""
import copy
import math
import re

from services.workflow.providers import ProviderError

MAX_TEXT = 4000            # stored chapters; the workbench editor keeps new ones to 800
MAX_DURATION_FRAMES = 9000  # five minutes at 30 fps
AUDIO_START_FRAME = 6
ID = re.compile(r'[A-Za-z0-9_-]{1,80}')


class ChapterError(ValueError):
    pass


def chapter(text, chapter_id):
    return {'id': chapter_id, 'narration': {'text': text}}


def unvoiced(scene):
    """The chapter without its audio and timing: what a voice or timing job is asked to fill in."""
    return {'id': scene['id'], 'narration': {'text': scene['narration']['text']}}


def normalize(scene):
    """Reads a chapter stored in any earlier shape (template scenes carried elements and animations)."""
    narration = scene.get('narration') or {}
    result = {'id': scene.get('id'), 'narration': {k: copy.deepcopy(narration[k]) for k in ('text', 'audio_asset_id', 'audio_start_frame') if k in narration}}
    for key in ('duration_frames', 'captions'):
        if key in scene: result[key] = copy.deepcopy(scene[key])
    return result


def validate(scene, assets=None):
    """Raises ChapterError unless `scene` is a well-formed chapter; voiced chapters must reference one of `assets`."""
    if not isinstance(scene, dict) or set(scene) - {'id', 'narration', 'duration_frames', 'captions'}:
        raise ChapterError('unexpected chapter fields')
    if not isinstance(scene.get('id'), str) or not ID.fullmatch(scene['id']):
        raise ChapterError('invalid chapter id')
    narration = scene.get('narration')
    if not isinstance(narration, dict) or set(narration) - {'text', 'audio_asset_id', 'audio_start_frame'}:
        raise ChapterError('invalid narration')
    text = narration.get('text')
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        raise ChapterError('narration must be 1–4000 characters')
    voiced = [k in narration for k in ('audio_asset_id', 'audio_start_frame')] + [k in scene for k in ('duration_frames', 'captions')]
    if any(voiced) and not all(voiced):
        raise ChapterError('audio, start frame, duration and captions go together')
    if not any(voiced): return
    if not isinstance(narration['audio_asset_id'], str) or not narration['audio_asset_id']:
        raise ChapterError('invalid audio asset')
    if assets is not None and narration['audio_asset_id'] not in {a.get('id') for a in assets}:
        raise ChapterError('audio asset is not part of the project')
    duration, start = scene['duration_frames'], narration['audio_start_frame']
    if type(duration) is not int or not 1 <= duration <= MAX_DURATION_FRAMES or type(start) is not int or not 0 <= start < duration:
        raise ChapterError('invalid duration or audio start')
    captions = scene['captions']
    if not isinstance(captions, list) or not captions or len(captions) > 1000:
        raise ChapterError('captions are required')
    previous = 0
    for caption in captions:
        if (not isinstance(caption, dict) or set(caption) != {'text', 'start_frame', 'end_frame'} or
                not isinstance(caption['text'], str) or not caption['text'].strip() or len(caption['text']) > 200 or
                type(caption['start_frame']) is not int or type(caption['end_frame']) is not int or
                not previous <= caption['start_frame'] < caption['end_frame'] <= duration):
            raise ChapterError('captions must be ordered, non-overlapping and inside the chapter')
        previous = caption['end_frame']


def _display(text, left, right):
    return re.sub(r'\s+', ' ', text[left:right]).strip()


def _fit_caption(display):
    if not display or len(display) > 44:
        return None
    if len(display) > 22:
        return display[:22] + '\n' + display[22:]
    return display


def time_chapter(scene, audio_id, duration_ms, segments):
    """Voiced chapter from measured word timings: duration, audio start and readable two-line captions."""
    result = unvoiced(scene)
    text = result['narration']['text']
    result['narration'].update(audio_asset_id=audio_id, audio_start_frame=AUDIO_START_FRAME)
    result['duration_frames'] = 2 * AUDIO_START_FRAME + math.ceil(duration_ms * 30 / 1000)
    captions = []
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
    previous_end = AUDIO_START_FRAME
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
            start = max(previous_end, AUDIO_START_FRAME + math.floor(start_ms * 30 / 1000))
            end = min(result['duration_frames'] - AUDIO_START_FRAME, AUDIO_START_FRAME + math.ceil(end_ms * 30 / 1000))
            if end <= start:
                raise ProviderError('timing', 'caption_density', 'Caption intervals cannot fit into nonoverlapping frames')
            captions.append({'text': fitted, 'start_frame': start, 'end_frame': end})
            previous_end = end
            start_w = chosen + 1
    if not captions:
        raise ProviderError('timing', 'caption_density', 'Caption intervals cannot fit into nonoverlapping frames')
    # Provider word ends can precede audible speech; retain the last caption to the audio boundary.
    captions[-1]['end_frame'] = result['duration_frames'] - AUDIO_START_FRAME
    result['captions'] = captions
    return result
