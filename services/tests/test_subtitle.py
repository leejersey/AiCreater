import json
import struct
import unittest
from unittest.mock import patch

import httpx
from websockets.exceptions import ConnectionClosed

from services.tests.test_generation import settings
from services.tts.timing import align_words
from services.workflow.providers import ProviderError, volcengine_speech


def frame(event, payload=None, session='session', audio=False):
    body = payload if isinstance(payload, bytes) else json.dumps(payload or {}).encode()
    identity = session.encode()
    header = b'\x11\xb4\x00\x00' if audio else b'\x11\x94\x10\x00'
    return (header + struct.pack('>iI', event, len(identity)) + identity +
            struct.pack('>I', len(body)) + body)


class Socket:
    def __init__(self, events):
        self.events, self.sent = list(events), []

    def __enter__(self): return self
    def __exit__(self, *args): return False
    def send(self, data): self.sent.append(data)
    def recv(self, timeout):
        if not self.events: raise ConnectionClosed(None, None)
        value = self.events.pop(0)
        if isinstance(value, Exception): raise value
        return value


def lifecycle(*events):
    return [frame(50, session='connection'), frame(150), *events, frame(152),
            frame(52, session='connection')]


class SubtitleTests(unittest.TestCase):
    def synthesize(self, events):
        from services.tts.subtitle import synthesize
        socket = Socket(events)
        with patch('services.tts.subtitle.connect', return_value=socket) as connect, \
                patch('services.tts.subtitle.uuid.uuid4', return_value='session'):
            result = synthesize('规则，匹配。', settings(VOLCENGINE_RESOURCE_ID='seed-tts-2.0'))
        return result, socket, connect

    def test_audio_and_late_original_subtitle_and_lifecycle(self):
        words = [{'word': '规则', 'startTime': 0, 'endTime': 0.5},
                 {'word': '匹配', 'startTime': 0.6, 'endTime': 1.0}]
        result, socket, connect = self.synthesize(lifecycle(
            frame(350, {'text': '规则，匹配。'}),
            frame(352, b'audio-', audio=True), frame(352, b'end', audio=True),
            frame(351), frame(364, {'words': words})))
        self.assertEqual(result, (b'audio-end', words))
        self.assertEqual(len(align_words('规则，匹配。', result[1], 1000)), 2)
        self.assertEqual([struct.unpack('>i', f[4:8])[0] for f in socket.sent], [1, 100, 200, 102, 2])
        body = json.loads(socket.sent[1][23:])  # 4-byte header/event/ID length/payload length + 7-byte ID
        self.assertTrue(body['req_params']['audio_params']['enable_subtitle'])
        self.assertNotIn('enable_timestamp', body['req_params']['audio_params'])
        self.assertEqual(body['namespace'], 'BidirectionalTTS')
        self.assertEqual(connect.call_args.args[0], 'wss://openspeech.bytedance.com/api/v3/tts/bidirection')
        self.assertEqual(connect.call_args.kwargs['additional_headers']['X-Api-Key'], 'secret-tts')

    def test_two_subtitle_events_keep_session_timebase(self):
        words = [{'word': '规则', 'startTime': 0.1, 'endTime': 0.5},
                 {'word': '匹配', 'startTime': 0.6, 'endTime': 1.0}]
        result, _, _ = self.synthesize(lifecycle(frame(352, b'audio', audio=True),
            frame(364, {'words': words[:1]}), frame(364, {'words': words[1:]})))
        self.assertEqual(result[1], words)

    def test_tts2_resource_uses_native_adapter_without_http_call(self):
        with httpx.Client(transport=httpx.MockTransport(lambda r: self.fail('Unexpected HTTP TTS'))) as client:
            with patch('services.tts.subtitle.synthesize', return_value=(b'audio', [])) as native:
                self.assertEqual(volcengine_speech('规则', settings(VOLCENGINE_RESOURCE_ID='seed-tts-2.0'), client),
                                 (b'audio', []))
                native.assert_called_once()

    def test_errors_and_session_mismatch_are_sanitized(self):
        error = b'\x11\xf0\x10\x00' + struct.pack('>II', 401, 10) + b'secret-tts'
        cases = [[frame(51, {'message': 'secret-tts'}, session='connection')],
                 [frame(50), frame(153, {'message': 'secret-tts'})],
                 lifecycle(frame(352, b'audio', session='wrong', audio=True)),
                 lifecycle(error), lifecycle(frame(364, {'words': 'secret-tts'})),
                 lifecycle(frame(352, b'audio', audio=True)[:-1]),
                 lifecycle('secret-tts'), lifecycle(frame(999))]
        for events in cases:
            with self.subTest(events=len(events)):
                with self.assertRaises(ProviderError) as caught: self.synthesize(events)
                self.assertNotIn('secret-tts', str(caught.exception))

    def test_disconnect_and_timeout_cannot_publish_complete_audio(self):
        for tail in [[], [TimeoutError('secret-tts')]]:
            with self.subTest(tail=len(tail)):
                with self.assertRaises(ProviderError):
                    self.synthesize([frame(50), frame(150), frame(352, b'audio', audio=True), *tail])

    def test_missing_subtitles_retain_complete_audio_for_alignment_error(self):
        (audio, words), _, _ = self.synthesize(lifecycle(frame(352, b'audio', audio=True)))
        self.assertEqual(audio, b'audio')
        with self.assertRaisesRegex(ProviderError, 'missing_timestamps'):
            align_words('规则，匹配。', words, 1000)

    def test_binary_lengths_and_header_are_validated(self):
        from services.tts.subtitle import decode_frame
        good = frame(364, {'words': []})
        for bad in [b'', good[:3], good[:-1], good + b'junk',
                    b'\x12' + good[1:], good[:2] + b'\x11' + good[3:]]:
            with self.subTest(length=len(bad)):
                with self.assertRaises(ProviderError): decode_frame(bad)

    def test_audio_and_word_count_limits(self):
        from services.tts.subtitle import MAX_MESSAGE
        chunk = frame(352, b'a' * (MAX_MESSAGE - 128), audio=True)
        with self.assertRaisesRegex(ProviderError, 'audio_limit'):
            self.synthesize(lifecycle(*([chunk] * 13)))
        with self.assertRaisesRegex(ProviderError, 'invalid_response'):
            self.synthesize(lifecycle(frame(364, {'words': [{}] * 16001})))

    def test_error_frame_keeps_numeric_code_without_provider_body(self):
        from services.tts.subtitle import decode_frame
        error = b'\x11\xf0\x10\x00' + struct.pack('>II', 401, 10) + b'secret-tts'
        with self.assertRaisesRegex(ProviderError, 'provider_error: Provider code 401'):
            decode_frame(error)

    def test_wall_clock_budget_stops_even_progressing_stream(self):
        with patch('services.tts.subtitle.time.monotonic', side_effect=[0, 121]):
            with self.assertRaisesRegex(ProviderError, 'timeout'):
                self.synthesize(lifecycle(frame(352, b'audio', audio=True)))
