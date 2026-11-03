"""Voice one chapter: TTS audio, measured word timings and captions, as the chapter plus its new audio asset."""
import hashlib
import json
import math
import subprocess
import time
import uuid

import httpx

from services import chapters
from services.tts.timing import align_words
from services.workflow.providers import ProviderError, volcengine_speech


def _duration(path):
    try:
        result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                 '-of', 'json', str(path)], capture_output=True, text=True, timeout=30, check=True)
        seconds = float(json.loads(result.stdout)['format']['duration'])
        if not math.isfinite(seconds) or not 0 < seconds <= 300:
            raise ProviderError('tts', 'duration_limit', 'Audio duration must be 0–300 seconds')
        return math.ceil(seconds * 1000)
    except (subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError) as exc:
        if isinstance(exc, ProviderError):
            raise
        raise ProviderError('tts', 'invalid_audio', 'Could not measure valid provider audio') from None


def voice_chapter(scene, public, settings, client, *, on_usage=None):
    """Returns {'assets': [audio], 'scenes': [voiced chapter]}. Audio and word timings stay under public/generated."""
    scene = chapters.unvoiced(scene)
    try: chapters.validate(scene)
    except chapters.ChapterError as error: raise ProviderError('input', 'invalid_chapter', str(error)) from None
    text = scene['narration']['text']
    public = public.resolve()
    generated = public / 'generated'
    if not generated.resolve().is_relative_to(public):
        raise ProviderError('input', 'asset_path', 'Generated assets must stay inside public')
    deadline = time.monotonic() + 900
    run = uuid.uuid4().hex
    directory = generated / run
    directory.mkdir(parents=True, mode=0o700)
    try:
        client.timeout = httpx.Timeout(120)
        audio, words = volcengine_speech(text, settings, client, **({'on_usage': on_usage} if on_usage else {}))
        source = directory / (scene['id'] + '.mp3')
        source.write_bytes(audio)
        _duration(source)
        wav = directory / (scene['id'] + '.wav')
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-n', '-i', str(source),
                        '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '24000', str(wav)],
                       capture_output=True, timeout=30, check=True)
        duration = _duration(wav)
        if wav.stat().st_size > 50 * 1024 * 1024:
            raise ProviderError('tts', 'audio_limit', 'Converted audio exceeds 50 MiB')
        (directory / (scene['id'] + '-words.json')).write_text(json.dumps(words, ensure_ascii=False), encoding='utf-8')
        segments = align_words(text, words, duration)
        audio_id = 'audio_' + uuid.uuid4().hex
        voiced = chapters.time_chapter(scene, audio_id, duration, segments)
        asset = {'id': audio_id, 'type': 'audio', 'storage_key': f'generated/{run}/{wav.name}',
                 'checksum': hashlib.sha256(wav.read_bytes()).hexdigest(), 'duration_ms': duration}
    except (subprocess.SubprocessError, OSError):
        error = ProviderError('tts', 'media_error', 'Audio conversion failed; generated audio was retained')
        error.scene_id, error.artifact_dir = scene['id'], str(directory)
        raise error from None
    except ProviderError as error:
        error.scene_id, error.artifact_dir = scene['id'], str(directory)
        raise
    if time.monotonic() > deadline:
        raise ProviderError('workflow', 'timeout', 'Workflow exceeded 900s budget')
    try: chapters.validate(voiced, [asset])
    except chapters.ChapterError as error: raise ProviderError('validation', 'invalid_chapter', str(error)) from None
    return {'assets': [asset], 'scenes': [voiced]}
