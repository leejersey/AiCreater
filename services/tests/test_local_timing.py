import hashlib
import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from services.tests.test_generation import outline
from services.workflow.providers import ProviderError


class LocalTimingTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(); self.addCleanup(self.folder.cleanup)
        self.public = Path(self.folder.name)
        self.audio = self.public / 'generated/cache/scene.wav'; self.audio.parent.mkdir(parents=True)
        with wave.open(str(self.audio), 'wb') as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(24000); f.writeframes(b'\0\0' * 72000)
        self.words = self.audio.with_name('scene-words.json')
        self.words.write_text(json.dumps([{'word':'规则匹配','startTime':0,'endTime':1}]))
        self.asset = {'id':'audio_1','type':'audio','storage_key':'generated/cache/scene.wav',
                      'checksum':hashlib.sha256(self.audio.read_bytes()).hexdigest(),'duration_ms':3000}
        self.payload = {'scene':outline()['scenes'][0], 'asset':self.asset,
                        'words_checksum':hashlib.sha256(self.words.read_bytes()).hexdigest(),
                        'config':{'schema_version':'1.0','video_config':{'width':1920,'height':1080,'fps':30,'language':'zh-CN'},'theme':'tech_explainer'}}

    def test_recompute_without_http_or_tts_preserves_audio_and_source(self):
        from services.workflow.local_timing import timing_document
        with patch('httpx.Client',side_effect=AssertionError('No HTTP')), patch('services.workflow.providers.volcengine_speech',side_effect=AssertionError('No TTS')):
            result=timing_document(self.payload,self.public)
        self.assertEqual(result['assets'],[self.asset])
        self.assertEqual(result['scenes'][0]['narration']['text'],'规则匹配。')
        self.assertEqual(result['scenes'][0]['captions'][-1]['end_frame'],96)

    def test_edited_graphics_retime_from_existing_cache_without_speech_calls(self):
        from services.workflow.local_timing import timing_document
        from services.tests.test_teaching_diagrams import funnel_draft, draft, process_draft
        for field,builder in [('funnel',funnel_draft),('dialogue',draft),('process',process_draft)]:
            scene=builder();text=scene['narration']['text'];e=scene['elements'][0]
            scene['visual_actions']=[{'kind':'highlight','target':e['id'],'cue':e['cue']}]
            words=[{'word':char,'startTime':i*3/len(text),'endTime':(i+1)*3/len(text)} for i,char in enumerate(text)]
            self.words.write_text(json.dumps(words));self.payload['words_checksum']=hashlib.sha256(self.words.read_bytes()).hexdigest()
            self.payload['scene']=scene
            with self.subTest(field=field),patch('httpx.Client',side_effect=AssertionError('No HTTP')),patch('services.workflow.providers.volcengine_speech',side_effect=AssertionError('No TTS')):
                document=timing_document(self.payload,self.public)
                timed=document['scenes'][0]
                self.assertEqual(timed[field],scene[field]);self.assertEqual(document['assets'],[self.asset])
                self.assertEqual(timed['visual_actions'][0]['cue'],e['cue'])
                self.assertIn('start_frame',timed['visual_actions'][0])

    def test_local_timing_preserves_explicit_topic_and_audio(self):
        from services.workflow.local_timing import timing_document
        self.payload['scene']['elements'][0]['role']='topic'
        result=timing_document(self.payload,self.public);scene=result['scenes'][0]
        self.assertEqual(scene['elements'][0]['role'],'topic')
        self.assertEqual(scene['animations'][0]['start_frame'],6);self.assertEqual(scene['animations'][0]['duration_frames'],1)
        self.assertEqual(result['assets'],[self.asset])

    def test_legacy_millisecond_rounding_keeps_frozen_asset_duration(self):
        from services.workflow.local_timing import timing_document
        self.asset['duration_ms']=2999
        result=timing_document(self.payload,self.public)
        self.assertEqual(result['assets'][0]['duration_ms'],2999)

    def test_missing_or_changed_words_fail_without_fallback(self):
        from services.workflow.local_timing import timing_document
        self.words.write_text('[]')
        with self.assertRaises(ProviderError):timing_document(self.payload,self.public)
        self.words.unlink()
        with self.assertRaises(ProviderError):timing_document(self.payload,self.public)

    def test_audio_corruption_duration_mismatch_and_bad_source_fail(self):
        from services.workflow.local_timing import timing_document
        self.asset['duration_ms']=2000
        with self.assertRaises(ProviderError):timing_document(self.payload,self.public)
        self.asset['duration_ms']=3000;self.payload['scene']['narration']['text']='不匹配。'
        with self.assertRaises(ProviderError):timing_document(self.payload,self.public)
        self.audio.write_bytes(b'bad')
        with self.assertRaises(ProviderError):timing_document(self.payload,self.public)

    def test_escaped_symlink_and_oversized_words_fail(self):
        from services.workflow.local_timing import cache_snapshot
        self.asset['storage_key']='../outside.wav'
        with self.assertRaises(ProviderError):cache_snapshot(self.public,self.asset)
        self.asset['storage_key']='generated/cache/scene.wav'
        self.words.unlink();self.words.symlink_to(self.audio)
        with self.assertRaises(ProviderError):cache_snapshot(self.public,self.asset)
        self.words.unlink();self.words.write_bytes(b' '*(1024*1024+1))
        with self.assertRaises(ProviderError):cache_snapshot(self.public,self.asset)
