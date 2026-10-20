"""Minimal V3 WebSocket TTS 2.0 audio/subtitle adapter; no provider-body logging."""
import json
import struct
import time
import uuid

from websockets.exceptions import WebSocketException
from websockets.sync.client import connect

from services.workflow.providers import ProviderError


MAX_MESSAGE = 4 * 1024 * 1024


def encode_frame(event, payload=None, session=''):
    body = json.dumps(payload or {}, ensure_ascii=False).encode('utf-8')
    result = b'\x11\x14\x10\x00' + struct.pack('>i', event)
    if event not in [1, 2]:
        identity = session.encode('utf-8')
        result += struct.pack('>I', len(identity)) + identity
    return result + struct.pack('>I', len(body)) + body


def decode_frame(data):
    try:
        if (not isinstance(data, bytes) or len(data) < 12 or len(data) > MAX_MESSAGE or
                data[0] != 0x11 or data[3] != 0 or data[2] not in [0, 0x10]):
            raise ValueError
        kind, flags = data[1] >> 4, data[1] & 15
        if kind == 15 and flags == 0:
            code, size = struct.unpack('>II', data[4:12])
            if size != len(data) - 12:
                raise ValueError
            raise ProviderError('tts', 'provider_error', f'Provider code {code}')
        if flags != 4 or kind not in [9, 11]:
            raise ValueError
        event, size = struct.unpack('>iI', data[4:12])
        offset = 12 + size
        if size > 256 or offset + 4 > len(data):
            raise ValueError
        identity = data[12:offset].decode('utf-8')
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        body = data[offset + 4:]
        if len(body) != length or not identity:
            raise ValueError
        if kind == 11:
            if event != 352 or data[2] != 0:
                raise ValueError
            return event, identity, body
        if event == 352 or data[2] != 0x10:
            raise ValueError
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise ValueError
        return event, identity, payload
    except ProviderError:
        raise
    except (ValueError, TypeError, struct.error):
        raise ProviderError('tts', 'invalid_response', 'Invalid V3 binary frame') from None


def synthesize(text, settings, timeout=120):
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        raise ProviderError('tts', 'input_limit', 'Use 1–4000 code points')
    deadline = time.monotonic() + min(timeout, 120)
    session = str(uuid.uuid4())
    audio, words = bytearray(), []
    headers = settings.tts_headers()
    headers['X-Api-Connect-Id'] = str(uuid.uuid4())
    body = {'user': {'uid': 'aicreater-local'}, 'namespace': 'BidirectionalTTS', 'event': 100,
            'req_params': {'speaker': settings.speaker,
                           'audio_params': {'format': 'mp3', 'sample_rate': 24000, 'enable_subtitle': True}}}

    def remaining():
        seconds = deadline - time.monotonic()
        if seconds <= 0:
            raise ProviderError('tts', 'timeout', 'Synthesis exceeded its time budget')
        return seconds

    received = 0
    def receive(socket):
        nonlocal received
        raw = socket.recv(timeout=remaining())
        remaining()
        received += len(raw)
        if received > 72 * 1024 * 1024:
            raise ProviderError('tts', 'response_limit', 'Response exceeds budget')
        event, identity, payload = decode_frame(raw)
        if event in [51, 151, 153]:
            raise ProviderError('tts', 'provider_error', f'Provider event {event}')
        if event not in [50, 52] and identity != session:
            raise ProviderError('tts', 'session_mismatch', 'Unexpected synthesis session')
        return event, payload

    def expect(socket, wanted):
        if receive(socket)[0] != wanted:
            raise ProviderError('tts', 'unexpected_event', 'Unexpected protocol lifecycle event')

    try:
        with connect('wss://openspeech.bytedance.com/api/v3/tts/bidirection',
                     additional_headers=headers, open_timeout=remaining(), close_timeout=5,
                     max_size=MAX_MESSAGE, compression=None) as socket:
            socket.send(encode_frame(1))
            expect(socket, 50)
            socket.send(encode_frame(100, body, session))
            expect(socket, 150)
            request = {**body, 'event': 200, 'req_params': {**body['req_params'], 'text': text}}
            socket.send(encode_frame(200, request, session))
            socket.send(encode_frame(102, session=session))
            while True:
                event, payload = receive(socket)
                if event == 152:
                    break
                if event == 352:
                    audio.extend(payload)
                    if len(audio) > 50 * 1024 * 1024:
                        raise ProviderError('tts', 'audio_limit', 'Audio exceeds 50 MiB')
                elif event == 364:
                    entries = payload.get('words')
                    if not isinstance(entries, list) or len(words) + len(entries) > 16000:
                        raise ProviderError('alignment', 'invalid_response', 'Expected bounded subtitle words array')
                    words.extend(entries)
                elif event not in [350, 351, 154, 359]:
                    raise ProviderError('tts', 'unexpected_event', 'Unexpected synthesis event')
            socket.send(encode_frame(2))
            expect(socket, 52)
        if not audio:
            raise ProviderError('tts', 'missing_audio', 'Provider returned no audio')
        # Persist audio before the shared aligner validates timestamps and original-text coverage.
        return bytes(audio), words
    except TimeoutError:
        raise ProviderError('tts', 'timeout', 'Synthesis exceeded its time budget') from None
    except (WebSocketException, OSError):
        raise ProviderError('tts', 'transport_error', 'WebSocket synthesis failed or closed early') from None
