"""Voice a validated chapter draft: TTS, measured word timing and captions, published as a one-scene project document."""
import hashlib
import json
import math
import os
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

import httpx

from services.tts.timing import align_words, time_scene
from services.workflow.providers import ProviderError, volcengine_speech
from services.workflow.storyboard import validator, validate_storyboard


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


def generate_project(text, destination, public, settings, client, draft, *, on_usage=None):
    if not text.strip() or len(text) > 4000:
        raise ProviderError('storyboard', 'input_limit', 'Use 1–4000 code points')
    if destination.exists() or destination.is_symlink():
        raise ProviderError('input', 'existing_output', 'Output already exists; use a new filename')
    public = public.resolve()
    generated = public / 'generated'
    if not generated.resolve().is_relative_to(public):
        raise ProviderError('input', 'asset_path', 'Generated assets must stay inside public')
    destination.parent.mkdir(parents=True, exist_ok=True)
    # ponytail: budget checks cannot interrupt blocked I/O; add worker process hard deadlines in phase 3.
    deadline = time.monotonic() + 900
    validate_storyboard(draft, text)
    run = uuid.uuid4().hex
    directory = generated / run
    directory.mkdir(parents=True, mode=0o700)
    project = {'schema_version': '1.0', 'video_config': {'width': 1920, 'height': 1080, 'fps': 30, 'language': 'zh-CN'},
               'theme': 'tech_explainer', 'assets': [], 'scenes': []}
    for scene in draft['scenes']:
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProviderError('workflow', 'timeout', 'Workflow exceeded 900s budget')
            client.timeout = httpx.Timeout(min(120, remaining))
            audio, words = volcengine_speech(scene['narration']['text'], settings, client, **({'on_usage':on_usage} if on_usage else {}))
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
            segments = align_words(scene['narration']['text'], words, duration)
            audio_id = 'audio_' + uuid.uuid4().hex
            final = time_scene(scene, audio_id, duration, segments)
            project['scenes'].append(final)
            project['assets'].append({'id': audio_id, 'type': 'audio',
                'storage_key': f'generated/{run}/{wav.name}',
                'checksum': hashlib.sha256(wav.read_bytes()).hexdigest(), 'duration_ms': duration})
            if sum(s['duration_frames'] for s in project['scenes']) > 9000:
                raise ProviderError('timing', 'duration_limit', 'Video exceeds five minutes')
        except (subprocess.SubprocessError, OSError):
            error = ProviderError('tts', 'media_error', 'Audio conversion failed; generated audio was retained')
            error.scene_id, error.artifact_dir = scene['id'], str(directory)
            raise error from None
        except ProviderError as error:
            error.scene_id, error.artifact_dir = scene['id'], str(directory)
            raise
    if time.monotonic() > deadline:
        raise ProviderError('workflow', 'timeout', 'Workflow exceeded 900s budget')
    errors = validator.validate_project(project)
    if errors:
        raise ProviderError('validation', errors[0]['code'], errors[0]['path'])
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=destination.parent, delete=False) as file:
            temp = Path(file.name)
            json.dump(project, file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())
        os.link(temp, destination)  # Publish atomically and never overwrite a concurrent output.
    except OSError:
        raise ProviderError('output', 'publish_error', 'Cannot publish output; assets were retained') from None
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)
    return project

