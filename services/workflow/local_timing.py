"""Local-only retiming; missing caches never fall back to a provider."""
import copy
import hashlib
import json
from pathlib import Path

from services.tts.timing import align_words, time_scene
from services.workflow.generate import _duration
from services.workflow.providers import ProviderError
from services.workflow.storyboard import validator


def _read(public, key, limit):
    public = Path(public).resolve()
    file = public / key
    if not file.resolve().is_relative_to(public) or file.resolve() != file.absolute():
        raise ProviderError('timing', 'cache_unavailable', 'Local timing cache unavailable')
    with file.open('rb') as f: data = f.read(limit + 1)
    if not data or len(data) > limit:
        raise ProviderError('timing', 'cache_unavailable', 'Local timing cache unavailable')
    return data


def _cache(public, asset):
    try:
        audio = _read(public, asset['storage_key'], 50 * 1024**2)
        if hashlib.sha256(audio).hexdigest() != asset['checksum']:
            raise ValueError()
        key = Path(asset['storage_key'])
        words = _read(public, str(key.with_name(key.stem + '-words.json')), 1024**2)
        return words
    except (OSError, ValueError, TypeError, KeyError):
        raise ProviderError('timing', 'cache_unavailable', 'Local timing cache unavailable') from None


def cache_snapshot(public, asset):
    return hashlib.sha256(_cache(public, asset)).hexdigest()


def timing_document(payload, public):
    asset = payload['asset']
    raw = _cache(public, asset)
    if hashlib.sha256(raw).hexdigest() != payload['words_checksum']:
        raise ProviderError('timing', 'cache_unavailable', 'Local timing cache unavailable')
    try:
        words = json.loads(raw)
        if not isinstance(words, list): raise ValueError()
        measured = _duration(Path(public) / asset['storage_key'])
        # Legacy assets round milliseconds; the generator rounds up. Preserve the verified asset identity.
        if abs(measured - asset['duration_ms']) > 1: raise ValueError()
        duration = asset['duration_ms']
    except (ValueError, TypeError, ProviderError):
        raise ProviderError('timing', 'cache_unavailable', 'Local timing cache unavailable') from None
    segments = align_words(payload['scene']['narration']['text'], words, duration)
    scene = time_scene(payload['scene'], asset['id'], duration, segments)
    document = {**copy.deepcopy(payload['config']), 'assets': [copy.deepcopy(asset)], 'scenes': [scene]}
    if validator.validate_project(document):
        raise ProviderError('timing', 'validation', 'Local timing validation failed')
    return document
