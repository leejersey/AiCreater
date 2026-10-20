import base64
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import httpx

from services.tests.test_generation import outline, settings, tts_response, quoted_wire
from services.workflow.generate import generate_project
from services.workflow.providers import ProviderError
from services.workflow.storyboard import validator


class PipelineTests(unittest.TestCase):
    def test_http_protocol_pipeline_outputs_real_wav_and_valid_dsl(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'source.wav'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                            'sine=frequency=440:duration=1', '-ar', '24000', str(source)], check=True)
            audio = source.read_bytes()
            draft = outline()
            draft['scenes'][0]['id'] = 's' * 80  # Longest schema-valid scene ID must remain renderable.
            def handler(request):
                if request.url.host == 'api.deepseek.com':
                    return httpx.Response(200, json={'choices': [{'finish_reason': 'stop',
                        'message': {'content': json.dumps(quoted_wire(draft))}}]})
                return tts_response({'code': 0, 'data': base64.b64encode(audio).decode(),
                    'sentence': {'words': [{'word': '规则匹配', 'startTime': 0, 'endTime': 0.9}]}})
            destination = root / 'project.json'
            public = root / 'public'; public.mkdir()
            with httpx.Client(transport=httpx.MockTransport(handler)) as client:
                result = generate_project('规则匹配。', destination, public, settings(), client)
            self.assertEqual(validator.validate_project(result), [])
            self.assertEqual(json.loads(destination.read_text()), result)
            asset = result['assets'][0]
            self.assertTrue((public / asset['storage_key']).is_file())
            self.assertEqual(asset['duration_ms'], 1000)
            # Preserving outputs must fail BEFORE another paid provider request.
            with httpx.Client(transport=httpx.MockTransport(lambda r: self.fail('Provider called'))) as client:
                with self.assertRaises(ProviderError):
                    generate_project('规则匹配。', destination, public, settings(), client)

    def test_supplied_voice_draft_preserves_spaces_without_calling_llm(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); public = root / 'public'; public.mkdir()
            audio_file = root / 'sound.wav'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', str(audio_file)], check=True)
            text = ' 规则匹配。 '
            def handler(request):
                self.assertNotEqual(request.url.host, 'api.deepseek.com')
                return tts_response({'code': 0, 'data': base64.b64encode(audio_file.read_bytes()).decode(),
                    'sentence': {'words': [{'word': '规则匹配', 'startTime': 0, 'endTime': 0.9}]}})
            with httpx.Client(transport=httpx.MockTransport(handler)) as client:
                result = generate_project(text, root / 'project.json', public, settings(), client, draft=outline(text))
            self.assertEqual(result['scenes'][0]['narration']['text'], text)
            self.assertEqual(validator.validate_project(result), [])

    def test_failed_alignment_keeps_audio_but_does_not_publish_dsl(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); public = root / 'public'; public.mkdir()
            audio_file = root / 'sound.wav'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                            'sine=frequency=440:duration=1', str(audio_file)], check=True)
            def handler(request):
                if request.url.host == 'api.deepseek.com':
                    return httpx.Response(200, json={'choices': [{'finish_reason': 'stop',
                        'message': {'content': json.dumps(quoted_wire(outline()))}}]})
                return tts_response({'code': 0, 'data': base64.b64encode(audio_file.read_bytes()).decode()})
            destination = root / 'project.json'
            with httpx.Client(transport=httpx.MockTransport(handler)) as client:
                with self.assertRaisesRegex(ProviderError, 'alignment'):
                    generate_project('规则匹配。', destination, public, settings(), client)
            self.assertFalse(destination.exists())
            self.assertTrue(list(public.glob('generated/*/*.wav')))

    def test_process_exit_race_still_reaps_child(self):
        from unittest.mock import Mock, patch
        from services.workflow.worker import _stop_process
        process = Mock(pid=1234)
        process.poll.return_value = None
        with patch('services.workflow.worker.os.killpg', side_effect=ProcessLookupError):
            _stop_process(process)
        process.wait.assert_called_once()

    def test_invalid_script_rejected_before_requests(self):
        with tempfile.TemporaryDirectory() as temp:
            with httpx.Client(transport=httpx.MockTransport(lambda r: self.fail('Provider called'))) as client:
                for text in ['', ' ' * 5, '字' * 4001]:
                    with self.subTest(text_length=len(text)):
                        with self.assertRaises(ProviderError):
                            generate_project(text, Path(temp) / 'result.json', Path(temp), settings(), client)


if __name__ == '__main__': unittest.main()
