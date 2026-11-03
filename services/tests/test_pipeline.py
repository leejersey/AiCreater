import base64
import subprocess
import tempfile
import unittest
from pathlib import Path

import httpx

from services import chapters
from services.tests.test_generation import outline, settings, tts_response
from services.workflow.providers import ProviderError
from services.workflow.voice import voice_chapter


def tone(path, seconds=1):
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f'sine=frequency=440:duration={seconds}', '-ar', '24000', str(path)], check=True)
    return path.read_bytes()


class PipelineTests(unittest.TestCase):
    def test_voice_produces_a_real_wav_and_a_valid_voiced_chapter(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); public = root / 'public'; public.mkdir()
            audio = tone(root / 'source.wav')
            scene = outline()['scenes'][0]; scene['id'] = 's' * 80  # longest valid chapter id
            def handler(request):
                self.assertNotEqual(request.url.host, 'api.deepseek.com')
                return tts_response({'code': 0, 'data': base64.b64encode(audio).decode(),
                    'sentence': {'words': [{'word': '规则匹配', 'startTime': 0, 'endTime': 0.9}]}})
            with httpx.Client(transport=httpx.MockTransport(handler)) as client:
                result = voice_chapter(scene, public, settings(), client)
            [asset], [voiced] = result['assets'], result['scenes']
            chapters.validate(voiced, result['assets'])
            self.assertEqual(set(voiced), {'id', 'narration', 'duration_frames', 'captions'})
            self.assertTrue((public / asset['storage_key']).is_file())
            self.assertTrue((public / asset['storage_key']).with_name(scene['id'] + '-words.json').is_file())
            self.assertEqual(asset['duration_ms'], 1000)

    def test_spaces_in_the_narration_are_kept(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); public = root / 'public'; public.mkdir()
            audio = tone(root / 'sound.wav'); text = ' 规则匹配。 '
            def handler(request):
                return tts_response({'code': 0, 'data': base64.b64encode(audio).decode(),
                    'sentence': {'words': [{'word': '规则匹配', 'startTime': 0, 'endTime': 0.9}]}})
            with httpx.Client(transport=httpx.MockTransport(handler)) as client:
                result = voice_chapter(outline(text)['scenes'][0], public, settings(), client)
            self.assertEqual(result['scenes'][0]['narration']['text'], text)

    def test_failed_alignment_keeps_the_audio_but_publishes_nothing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); public = root / 'public'; public.mkdir()
            audio = tone(root / 'sound.wav')
            with httpx.Client(transport=httpx.MockTransport(lambda r: tts_response({'code': 0, 'data': base64.b64encode(audio).decode()}))) as client:
                with self.assertRaisesRegex(ProviderError, 'alignment'):
                    voice_chapter(outline()['scenes'][0], public, settings(), client)
            self.assertTrue(list(public.glob('generated/*/*.wav')))

    def test_process_exit_race_still_reaps_child(self):
        from unittest.mock import Mock, patch
        from services.workflow.worker import _stop_process
        process = Mock(pid=1234)
        process.poll.return_value = None
        with patch('services.workflow.worker.os.killpg', side_effect=ProcessLookupError):
            _stop_process(process)
        process.wait.assert_called_once()

    def test_invalid_narration_is_rejected_before_any_request(self):
        with tempfile.TemporaryDirectory() as temp:
            with httpx.Client(transport=httpx.MockTransport(lambda r: self.fail('Provider called'))) as client:
                for text in ['', ' ' * 5, '字' * 4001]:
                    with self.subTest(text_length=len(text)):
                        with self.assertRaises(ProviderError):
                            voice_chapter(chapters.chapter(text, 'scene_1'), Path(temp), settings(), client)


if __name__ == '__main__': unittest.main()
