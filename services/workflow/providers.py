"""DeepSeek and Volcengine HTTP adapters; never log provider bodies."""
import base64
import binascii
import json
import os
import time
import uuid
from dataclasses import dataclass

import httpx


class ProviderError(ValueError):
    def __init__(self, stage, code, message):
        self.stage, self.code = stage, code
        super().__init__(f'{stage}: {code}: {message}')


@dataclass(frozen=True, repr=False)
class Settings:
    llm_key: str
    model: str
    tts_key: str
    app_id: str
    access_key: str
    resource_id: str
    speaker: str

    @classmethod
    def from_env(cls, env=None):
        env = os.environ if env is None else env
        names = ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'VOLCENGINE_API_KEY',
                 'VOLCENGINE_APP_ID', 'VOLCENGINE_ACCESS_KEY', 'VOLCENGINE_RESOURCE_ID', 'VOLCENGINE_SPEAKER']
        values = [env.get(name, '').strip() for name in names]
        values[1] = values[1] or 'deepseek-flash'
        for i in [0, 5, 6]:
            if not values[i]:
                raise ProviderError('config', 'missing_setting', names[i])
        if (values[2] and (values[3] or values[4])) or not (values[2] or (values[3] and values[4])):
            raise ProviderError('config', 'invalid_auth', 'Choose API Key OR App ID + Access Key')
        if any(any(ord(c) < 32 or ord(c) == 127 for c in v) for v in values):
            raise ProviderError('config', 'invalid_setting', 'Control characters are forbidden')
        return cls(*values)

    def tts_headers(self):
        auth = {'X-Api-Key': self.tts_key} if self.tts_key else {
            'X-Api-App-Id': self.app_id, 'X-Api-Access-Key': self.access_key}
        return {**auth, 'X-Api-Resource-Id': self.resource_id, 'X-Api-Request-Id': str(uuid.uuid4())}


def _status(response, stage):
    if response.status_code != 200:
        raise ProviderError(stage, 'http_error', f'HTTP {response.status_code}')


def volcengine_speech(text, settings, client, *, on_usage=None):
    if on_usage: on_usage({'state':'submitted','submitted_characters':len(text)})
    if settings.resource_id in ['seed-tts-2.0', 'seed-icl-2.0']:
        from services.tts.subtitle import synthesize
        result = synthesize(text, settings, timeout=min(120, client.timeout.read or 120))
        if on_usage: on_usage({'state':'reported','submitted_characters':len(text)})
        return result
    audio, words = bytearray(), []
    deadline = time.monotonic() + min(120, client.timeout.read or 120)
    body = {'user': {'uid': 'aicreater-local'}, 'req_params': {
        'text': text, 'speaker': settings.speaker,
        'audio_params': {'format': 'mp3', 'sample_rate': 24000, 'enable_timestamp': True}}}
    try:
        with client.stream('POST', 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
                           headers=settings.tts_headers(), json=body, follow_redirects=False) as response:
            _status(response, 'tts')
            received, finished = 0, False
            for line in response.iter_lines():
                if time.monotonic() > deadline:
                    raise ProviderError('tts', 'timeout', 'Synthesis stream exceeded its time budget')
                received += len(line.encode('utf-8')) + 1
                if received > 72 * 1024 * 1024:
                    raise ProviderError('tts', 'response_limit', 'Response exceeds budget')
                if not line.strip():
                    continue
                event = json.loads(line)
                code = event.get('code')
                if type(code) is int and code == 20000000:
                    finished = True
                    break
                if type(code) is not int or code != 0:
                    detail = f'Provider code {code}' if type(code) is int else 'Invalid status code'
                    raise ProviderError('tts', 'provider_error', detail)
                if event.get('data'):
                    audio.extend(base64.b64decode(event['data'], validate=True))
                    if len(audio) > 50 * 1024 * 1024:
                        raise ProviderError('tts', 'audio_limit', 'Audio exceeds 50 MiB')
                sentence = event.get('sentence')
                if sentence is not None:
                    entries = sentence.get('words', [])
                    if not isinstance(entries, list):
                        raise ProviderError('alignment', 'invalid_response', 'Expected sentence.words array')
                    words.extend(entries)
        if not finished:
            raise ProviderError('tts', 'incomplete_stream', 'Provider stream ended without completion marker')
        if not audio:
            raise ProviderError('tts', 'missing_audio', 'Provider returned no audio')
        # Persist audio before alignment validation so failed alignment can be retried without losing media.
        if on_usage: on_usage({'state':'reported','submitted_characters':len(text)})
        return bytes(audio), words
    except httpx.HTTPError:
        raise ProviderError('tts', 'transport_error', 'Provider stream failed') from None
    except (ValueError, TypeError, AttributeError, binascii.Error) as exc:
        if isinstance(exc, ProviderError):
            raise
        raise ProviderError('tts', 'invalid_response', 'Invalid streaming JSON or base64 audio') from None
