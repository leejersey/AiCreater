import base64
import json
import unittest
from unittest.mock import patch

import httpx

from services.workflow.providers import Settings, ProviderError, volcengine_speech
from services import chapters
from services.tts.timing import align_words


def outline(text='规则匹配。'):
    """One unvoiced chapter, wrapped like a voice job's input."""
    return {'scenes': [chapters.chapter(text, 'scene_1')]}


def time_scene(scene, audio_id, duration_ms, segments):
    return chapters.time_chapter(scene, audio_id, duration_ms, segments)


def tts_response(*events):
    return httpx.Response(200, text='\n'.join(json.dumps(e) for e in [*events, {'code': 20000000}]))


def settings(**changes):
    env = {'DEEPSEEK_API_KEY': 'secret-llm', 'VOLCENGINE_API_KEY': 'secret-tts',
           'VOLCENGINE_RESOURCE_ID': 'seed-tts-1.0', 'VOLCENGINE_SPEAKER': 'test_voice'}
    env.update(changes)
    return Settings.from_env(env)


class ProviderTests(unittest.TestCase):
    def test_missing_configuration_fails_without_printing_secrets(self):
        with self.assertRaisesRegex(ProviderError, 'VOLCENGINE_SPEAKER') as caught:
            settings(VOLCENGINE_SPEAKER='')
        self.assertNotIn('secret-', str(caught.exception))

    def test_legacy_auth_and_ambiguous_auth(self):
        s = settings(VOLCENGINE_API_KEY='', VOLCENGINE_APP_ID='app', VOLCENGINE_ACCESS_KEY='access')
        self.assertEqual(s.tts_headers()['X-Api-App-Id'], 'app')
        self.assertNotIn('X-Api-Key', s.tts_headers())
        with self.assertRaises(ProviderError):
            settings(VOLCENGINE_APP_ID='app', VOLCENGINE_ACCESS_KEY='access')

    def test_voice_child_uses_frozen_voice_without_llm_credentials(self):
        import io
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from services.workflow.worker import child
        payload = {'kind': 'voice', 'scene': outline()['scenes'][0], 'public_root': '/tmp/voice-test',
                   'profile': {'voice': {'resource_id': 'seed-tts-2.0', 'speaker': 'frozen_voice'}}}
        output = io.StringIO()
        with patch('sys.stdin', io.StringIO(json.dumps(payload))), patch.dict('os.environ', {'VOLCENGINE_API_KEY': 'test-voice'}, clear=True), patch('services.workflow.voice.voice_chapter', return_value={'test': 'document'}) as generate, redirect_stdout(output):
            child()
        self.assertEqual(generate.call_args.args[2].speaker, 'frozen_voice')
        self.assertEqual(generate.call_args.args[0], payload['scene'])
        self.assertEqual(json.loads(output.getvalue()), {'document': {'test': 'document'}})

    def test_voice_child_reaches_tts_through_real_draft_validation(self):
        import io
        import tempfile
        from contextlib import redirect_stdout
        from services.workflow.worker import child
        with tempfile.TemporaryDirectory() as folder:
            payload = {'kind': 'voice', 'scene': outline()['scenes'][0], 'public_root': folder,
                       'profile': {'voice': {'resource_id': 'seed-tts-2.0', 'speaker': 'test_voice'}}}
            output = io.StringIO()
            with patch('sys.stdin', io.StringIO(json.dumps(payload))), patch.dict('os.environ', {'VOLCENGINE_API_KEY': 'test-voice'}, clear=True), patch('services.workflow.voice.volcengine_speech', side_effect=ProviderError('tts', 'transport_error', 'Offline sentinel')) as tts, redirect_stdout(output):
                child()
            tts.assert_called_once()
            self.assertEqual(json.loads(output.getvalue()), {'error': 'transport_error'})

    def test_tts_request_audio_and_timestamp_response(self):
        words = [{'word': '规则匹配', 'startTime': 0, 'endTime': 1.01}]
        def handler(request):
            self.assertEqual(str(request.url), 'https://openspeech.bytedance.com/api/v3/tts/unidirectional')
            body = json.loads(request.content)
            self.assertTrue(body['req_params']['audio_params']['enable_timestamp'])
            self.assertEqual(body['req_params']['speaker'], 'test_voice')
            self.assertEqual(request.headers['X-Api-Key'], 'secret-tts')
            chunks = [{'code': 0, 'data': base64.b64encode(b'audio-1').decode()},
                      {'code': 0, 'data': base64.b64encode(b'audio-2').decode(), 'sentence': {'words': words}}]
            return tts_response(*chunks)
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            audio, result = volcengine_speech('规则匹配。', settings(), client)
        self.assertEqual(audio, b'audio-1audio-2')
        self.assertEqual(result, words)

    def test_tts_rejects_errors_and_bad_base64(self):
        for payload in [{'code': 1, 'message': 'secret-tts'},
                        {'code': 0, 'data': '!!!'}]:
            with self.subTest(payload=payload):
                with httpx.Client(transport=httpx.MockTransport(lambda r: tts_response(payload))) as client:
                    with self.assertRaises(ProviderError) as caught:
                        volcengine_speech('规则匹配。', settings(), client)
                    self.assertNotIn('secret-tts', str(caught.exception))

    def test_progressing_tts_stream_still_has_a_wall_clock_budget(self):
        with httpx.Client(transport=httpx.MockTransport(lambda r: tts_response({
                'code': 0, 'data': base64.b64encode(b'audio').decode()}))) as client:
            with patch('services.workflow.providers.time', create=True) as clock:
                clock.monotonic.side_effect = [0, 121]
                with self.assertRaisesRegex(ProviderError, 'timeout'):
                    volcengine_speech('规则匹配。', settings(), client)

    def test_missing_timestamps_fail_after_audio_is_available_for_retention(self):
        with httpx.Client(transport=httpx.MockTransport(lambda r: tts_response({
                'code': 0, 'data': base64.b64encode(b'audio').decode()}))) as client:
            audio, words = volcengine_speech('规则匹配。', settings(), client)
        self.assertEqual(audio, b'audio')
        with self.assertRaisesRegex(ProviderError, 'alignment'):
            align_words('规则匹配。', words, 1000)

    def test_tts_rejects_audio_without_the_completion_marker(self):
        with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={
                'code': 0, 'data': base64.b64encode(b'audio').decode(),
                'sentence': {'words': [{'word': '规则', 'startTime': 0, 'endTime': 1}]}}))) as client:
            with self.assertRaisesRegex(ProviderError, 'incomplete_stream'):
                volcengine_speech('规则', settings(), client)


class TimingTests(unittest.TestCase):
    def test_unicode_and_repeated_words_have_separate_intervals(self):
        words = [{'word': '规则', 'startTime': 0.01, 'endTime': 0.5},
                 {'word': '规则', 'startTime': 0.6, 'endTime': 1.0}]
        self.assertEqual(align_words('规则，规则。', words, 1001), [
            {'text_start': 0, 'text_end': 2, 'start_ms': 10, 'end_ms': 500},
            {'text_start': 3, 'text_end': 5, 'start_ms': 600, 'end_ms': 1000}])
        emoji = align_words('😀规则', [{'word': '😀规则', 'startTime': 0, 'endTime': 1}], 1000)
        self.assertEqual(emoji[0]['text_end'], 3)

    def test_alignment_rejects_missing_changed_reversed_and_invalid_times(self):
        for words in [[], [{'word': '规则', 'startTime': 0, 'endTime': 1}],
                      [{'word': '错误', 'startTime': 0, 'endTime': 1}],
                      [{'word': '规则匹配', 'startTime': 1, 'endTime': 0}],
                      [{'word': '规则匹配', 'startTime': 0, 'endTime': 2}],
                      [{'word': '规则匹配', 'startTime': float('nan'), 'endTime': 1}]]:
            with self.subTest(words=words):
                with self.assertRaises(ProviderError): align_words('规则匹配。', words, 1000)

    def test_frames_ceil_duration_and_boundaries(self):
        segments = [{'text_start': 0, 'text_end': 4, 'start_ms': 17, 'end_ms': 1001}]
        scene = time_scene(outline()['scenes'][0], 'audio_1', 1001, segments)
        self.assertEqual(scene['duration_frames'], 43)
        self.assertEqual(scene['captions'][0]['end_frame'], 37)
        self.assertEqual(scene['narration']['audio_start_frame'], 6)
        self.assertNotIn('audio_asset_id', outline()['scenes'][0]['narration'])

    def test_character_timestamps_make_readable_phrase_captions(self):
        draft = outline('规则，匹配。')['scenes'][0]
        segments = align_words('规则，匹配。', [
            {'word': '规', 'startTime': 0, 'endTime': 0.2},
            {'word': '则', 'startTime': 0.2, 'endTime': 0.5},
            {'word': '匹', 'startTime': 0.6, 'endTime': 0.8},
            {'word': '配', 'startTime': 0.8, 'endTime': 1}], 1000)
        scene = time_scene(draft, 'audio_1', 1000, segments)
        self.assertEqual([c['text'] for c in scene['captions']], ['规则，', '匹配。'])
        self.assertEqual([(c['start_frame'], c['end_frame']) for c in scene['captions']], [(6, 21), (24, 36)])


    def test_last_caption_persists_when_provider_word_ends_early(self):
        draft = outline('规则，匹配。')['scenes'][0]
        segments = align_words('规则，匹配。', [
            {'word': '规则', 'startTime': 0, 'endTime': 0.5},
            {'word': '匹配', 'startTime': 0.6, 'endTime': 1}], 3001)
        scene = time_scene(draft, 'audio_1', 3001, segments)
        self.assertEqual([(c['start_frame'], c['end_frame']) for c in scene['captions']], [(6, 21), (24, 97)])
        self.assertEqual(scene['captions'][-1]['end_frame'], scene['duration_frames'] - 6)
        self.assertEqual(segments[-1]['end_ms'], 1000)

    def test_single_oversized_word_is_not_split_by_invented_times(self):
        text = '知识' * 35
        draft = outline(text)
        segment = {'text_start': 0, 'text_end': len(text), 'start_ms': 0, 'end_ms': 3000}
        with self.assertRaises(ProviderError) as caught:
            time_scene(draft['scenes'][0], 'audio_1', 3000, [segment])
        self.assertEqual(caught.exception.code, 'caption_layout')

    def test_long_phrase_splits_on_word_boundaries_with_real_times(self):
        text = '知识' * 30
        words = [{'word': '知识', 'startTime': i * 0.1, 'endTime': (i + 1) * 0.1} for i in range(30)]
        scene = time_scene(outline(text)['scenes'][0], 'audio_1', 3000, align_words(text, words, 3000))
        self.assertEqual([(c['start_frame'], c['end_frame']) for c in scene['captions']], [(6, 39), (39, 72), (72, 96)])
        self.assertEqual(''.join(c['text'].replace('\n', '') for c in scene['captions']), text)
        for caption in scene['captions']:
            self.assertLessEqual(len(caption['text'].split('\n')), 2)
            self.assertTrue(all(0 < len(line) <= 22 for line in caption['text'].split('\n')))


if __name__ == '__main__':
    unittest.main()
