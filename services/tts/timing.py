"""Strict code-point alignment and frame planning, without estimated speech timing."""
import math
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
