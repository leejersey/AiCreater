"""Local media work for a breakdown: probe an uploaded video, transcribe it with whisper.cpp (free, on this machine), take
keyframes (every second of the first three, then shot changes) and have a vision model describe them.

Tools: ffmpeg / ffprobe and whisper-cli with a ggml model (WHISPER_MODEL, default ~/.cache/aicreater/whisper/ggml-small.bin).
Subprocesses get a minimal environment and fixed argument lists; nothing from the video reaches a shell."""
import base64
import json
import os
import re
import subprocess
from pathlib import Path

from services.workflow.content_skills import call_json

MAX_SECONDS = 600            # uploads up to 10 minutes
MAX_FRAMES = 10
HOOK_SECONDS = (0, 1, 2, 3)  # the first three seconds decide whether people stay
DEFAULT_MODEL = Path.home() / '.cache' / 'aicreater' / 'whisper' / 'ggml-small.bin'


class MediaError(Exception):
    """A video the breakdown cannot use (not a video, too long, tools missing); the message is for the person."""


def _env():
    return {'PATH': os.environ.get('PATH', '/usr/bin:/bin:/opt/homebrew/bin'), 'LC_ALL': 'C'}


def _run(args, timeout):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=_env(), check=True)
    except FileNotFoundError:
        raise MediaError(f'缺少本机工具 {args[0]}，请先安装') from None
    except subprocess.TimeoutExpired:
        raise MediaError(f'{args[0]} 处理超时') from None
    except subprocess.CalledProcessError as failed:
        raise MediaError(f'{args[0]} 处理失败：{(failed.stderr or "").strip()[-200:]}') from None


def probe(path):
    """{duration, width, height} of a video with a video stream, or MediaError."""
    out = _run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', str(path)], 60).stdout
    info = json.loads(out or '{}')
    video = next((s for s in info.get('streams', []) if s.get('codec_type') == 'video'), None)
    if not video: raise MediaError('文件里没有视频画面')
    try: duration = float(info.get('format', {}).get('duration') or video.get('duration'))
    except (TypeError, ValueError): raise MediaError('读不出视频时长') from None
    if not 1 <= duration <= MAX_SECONDS: raise MediaError(f'视频需在 1 秒到 {MAX_SECONDS // 60} 分钟之间')
    has_audio = any(s.get('codec_type') == 'audio' for s in info.get('streams', []))
    return {'duration': round(duration, 2), 'width': video.get('width'), 'height': video.get('height'), 'audio': has_audio}


def model_path():
    path = Path(os.environ.get('WHISPER_MODEL') or DEFAULT_MODEL)
    if not path.is_file(): raise MediaError(f'缺少语音转写模型 {path}（见 README：下载 ggml-small.bin）')
    return path


def transcribe(video, workdir):
    """[{start, end, text}] in seconds, from whisper.cpp on the video's audio (Chinese, with timestamps)."""
    workdir = Path(workdir); wav = workdir / 'audio.wav'; base = workdir / 'transcript'
    _run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(wav)], 300)
    # A Simplified-Chinese prompt keeps whisper from writing Traditional characters; short segments give usable timestamps.
    _run(['whisper-cli', '-m', str(model_path()), '-l', 'zh', '--prompt', '以下是普通话的句子，使用简体中文。', '-ml', '16',
          '-oj', '-of', str(base), '-np', str(wav)], 900)
    data = json.loads((workdir / 'transcript.json').read_text(encoding='utf-8'))
    wav.unlink(missing_ok=True)
    segments = []
    for item in data.get('transcription', []):
        text = (item.get('text') or '').strip()
        offsets = item.get('offsets') or {}
        start, end = round(offsets.get('from', 0) / 1000, 2), round(offsets.get('to', 0) / 1000, 2)
        # Punctuation the length limit cut off belongs to the segment before it.
        lead = re.match(r'^[，,。.！!？?；;、]+', text)
        if lead and segments:
            segments[-1]['text'] += lead.group(0).replace(',', '，'); segments[-1]['end'] = max(segments[-1]['end'], start); text = text[lead.end():].strip()
        if text: segments.append({'start': start, 'end': end, 'text': text.replace(',', '，')})
    return segments


def scene_changes(video, limit):
    """Seconds where the picture changes most (ffmpeg's scene score), strongest first. Flat animated graphics score low
    (a full-frame colour switch is about 0.14), so the bar is low and the strongest changes are taken."""
    out = _run(['ffmpeg', '-hide_banner', '-i', str(video), '-filter:v', "select='gt(scene,0.08)',metadata=print", '-an', '-f', 'null', '-'], 300).stderr
    found = re.findall(r'pts_time:([0-9.]+)\s*\n[^\n]*lavfi\.scene_score=([0-9.]+)', out)
    ranked = sorted(((float(t), float(score)) for t, score in found), key=lambda x: -x[1])
    return [t for t, _ in ranked[:limit * 4]]


def keyframe_times(duration, changes):
    """The hook seconds, then shot changes spread over the rest (at least 2 s apart), filled evenly up to MAX_FRAMES."""
    times = [t for t in HOOK_SECONDS if t < duration]
    for t in changes:
        if len(times) >= MAX_FRAMES: break
        if t > 3.5 and all(abs(t - u) >= 2 for u in times): times.append(round(t, 2))
    step = duration / (MAX_FRAMES - len(times) + 1) if len(times) < MAX_FRAMES else 0
    k = 1
    while len(times) < MAX_FRAMES and step and k * step < duration:
        t = round(k * step, 2)
        if t > 3.5 and all(abs(t - u) >= 2 for u in times): times.append(t)
        k += 1
    return sorted(times)


def keyframes(video, duration, workdir):
    """[(seconds, jpg path)] scaled to 768 px wide."""
    frames_dir = Path(workdir) / 'frames'; frames_dir.mkdir(parents=True, exist_ok=True)
    out = []
    for t in keyframe_times(duration, scene_changes(video, MAX_FRAMES)):
        file = frames_dir / f'frame-{t:07.2f}.jpg'
        _run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t}', '-i', str(video), '-frames:v', '1', '-vf', 'scale=768:-2', '-q:v', '4', str(file)], 60)
        if file.is_file(): out.append((t, file))
    return out


def describe_frames(llm, client, frames, user_id=None):
    """{seconds: description} from the vision model, one call for all frames."""
    times = [t for t, _ in frames]
    def check(value):
        items = value.get('frames') if isinstance(value, dict) else None
        if not isinstance(items, list) or len(items) != len(times): raise ValueError(f'frames: exactly {len(times)}, in order')
        out = {}
        for t, item in zip(times, items):
            text = item.get('description') if isinstance(item, dict) else None
            if not isinstance(text, str) or not text.strip(): raise ValueError('each frame needs a description')
            out[t] = text.strip()[:200]
        return out
    content = [{'type': 'text', 'text': (f'下面是一条短视频的 {len(times)} 张关键帧，依次在第 ' + '、'.join(f'{t:g}' for t in times) + ' 秒。'
                '逐张描述画面：景别和主体、画面上的文字、图示或特效、和前一张相比的变化。只写看得到的东西，每张不超过 80 字。'
                '输出 JSON：{"frames":[{"description":"..."}]}，顺序与图片一致。')}]
    for _, file in frames:
        content.append({'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + base64.b64encode(Path(file).read_bytes()).decode()}})
    return call_json(llm, client, '你是视频画面描述员，只描述画面里看得到的内容，不推测。只输出 JSON。', content, check,
                     'studio_frames', max_tokens=3000, user_id=user_id)
