"""Local paid-provider workflow: python3 -m services.workflow.generate script.txt output.json."""
import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv

from services.tts.timing import align_words, time_scene
from services.workflow.providers import ProviderError, Settings, deepseek_storyboard, volcengine_speech
from services.workflow.storyboard import ROOT, validator, validate_storyboard


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


def generate_project(text, destination, public, settings, client, draft=None, *, on_usage=None):
    text = text.strip() if draft is None else text
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
    if draft is None:
        draft = deepseek_storyboard(text, settings, client, **({'on_usage':on_usage} if on_usage else {}))
    else:
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('script', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--storyboard', type=Path, help='Use a validated teaching storyboard instead of calling the LLM')
    args = parser.parse_args()
    try:
        load_dotenv(ROOT / '.env', override=False)
        settings = Settings.from_env()
        if args.script.stat().st_size > 32 * 1024:
            raise ProviderError('input', 'input_limit', 'Script file exceeds 32 KiB')
        text = args.script.read_text(encoding='utf-8-sig')
        draft = None
        if args.storyboard:
            if args.storyboard.stat().st_size > 64 * 1024:
                raise ProviderError('storyboard', 'input_limit', 'Storyboard exceeds 64 KiB')
            try:
                draft = json.loads(args.storyboard.read_text(encoding='utf-8-sig'))
            except json.JSONDecodeError:
                raise ProviderError('storyboard', 'invalid_response', 'Storyboard must be JSON') from None
            validate_storyboard(draft, text.strip())
        with httpx.Client(timeout=120, follow_redirects=False) as client:
            project = generate_project(text, args.output, ROOT / 'apps/renderer/public', settings, client, draft=draft)
        print(json.dumps({'dsl': str(args.output), 'scenes': len(project['scenes']),
                          'duration_frames': sum(s['duration_frames'] for s in project['scenes'])}, ensure_ascii=False))
        return 0
    except ProviderError as error:
        print(json.dumps({'stage': error.stage, 'code': error.code, 'message': str(error),
                          'scene_id': getattr(error, 'scene_id', None),
                          'artifact_dir': getattr(error, 'artifact_dir', None)}, ensure_ascii=False), file=sys.stderr)
        return 1
    except (OSError, UnicodeError):
        print('{"stage":"input","code":"file_error","message":"Cannot read input or write output"}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
