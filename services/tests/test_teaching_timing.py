import copy
import unittest
import hashlib
import tempfile
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from services.projects.store import StoreError
from services.visual.teaching_context import chapter_snapshot
from services.visual.teaching_timing import measured_timeline, bind_teaching_audio, verify_bound_audio


class TeachingTimingTests(unittest.TestCase):
    def fixture(self):
        row={'id':'chapter','revision':1,'state':'needs_voice','scene':{'narration':{'text':'先检索知识。然后生成答案。'}}}
        project={'title':'教学','config':{'assets':[]}}
        source=chapter_snapshot(project,row,'draft')
        voiced=copy.deepcopy(row);voiced.update(revision=2,state='ready')
        voiced['scene'].update(duration_frames=150,captions=[
            {'text':'先检索知识。','start_frame':6,'end_frame':60},
            {'text':'然后生成答案。','start_frame':72,'end_frame':144}])
        voiced['scene']['narration'].update(audio_asset_id='audio-1',audio_start_frame=6)
        project['config']['assets']=[{'id':'audio-1','type':'audio','storage_key':'generated/voice.wav','checksum':'a'*64,'duration_ms':4800}]
        return source,project,voiced

    def test_rebind_preserves_cue_ids_text_and_source_without_a_model(self):
        source,project,row=self.fixture();original=copy.deepcopy(source)
        result=measured_timeline(source,project,row)
        self.assertEqual(result['cues'],[
            {**source['cues'][0],'startFrame':6,'endFrame':60},
            {**source['cues'][1],'startFrame':72,'endFrame':144}])
        self.assertEqual(result['brief']['durationInFrames'],150)
        self.assertEqual(result['media']['asset']['checksum'],'a'*64)
        self.assertEqual(result['media']['captions'],row['scene']['captions'])
        self.assertEqual(result['media']['audio_start_frame'],6)
        self.assertEqual(source,original)
        self.assertEqual(result['model_calls'],0)
        self.assertEqual(result,measured_timeline(source,project,row))

    def test_already_measured_first_order_is_supported(self):
        _,project,row=self.fixture();source=chapter_snapshot(project,row,'measured')
        result=measured_timeline(source,project,row)
        self.assertEqual(result['cues'],source['cues'])

    def test_caption_subdivision_can_map_to_an_existing_whole_cue(self):
        source,project,row=self.fixture()
        row['scene']['captions'][:1]=[
            {'text':'先检索','start_frame':6,'end_frame':30},
            {'text':'知识。','start_frame':33,'end_frame':60}]
        self.assertEqual(measured_timeline(source,project,row)['cues'][0]['endFrame'],60)

    def test_unmeasured_inner_caption_boundary_is_rejected_not_estimated(self):
        source,project,row=self.fixture()
        row['scene']['captions']=[{'text':source['brief']['narration'],'start_frame':6,'end_frame':144}]
        with self.assertRaisesRegex(StoreError,'boundary'):measured_timeline(source,project,row)

    def test_changed_content_or_visual_brief_is_not_silently_adopted(self):
        for field,value in [('title','新标题'),('narration','不同口播'),('visualGoal','不同目标')]:
            source,project,row=self.fixture();source['brief'][field]=value
            with self.assertRaises(StoreError):measured_timeline(source,project,row)

    def test_invalid_asset_offset_and_cue_identity_are_rejected(self):
        for mutate in [
            lambda s,p,r:p['config']['assets'][0].update(checksum='invalid'),
            lambda s,p,r:p['config']['assets'][0].update(type='image'),
            lambda s,p,r:r['scene']['narration'].update(audio_start_frame=-1),
            lambda s,p,r:r['scene']['narration'].update(audio_start_frame=True),
            lambda s,p,r:r['scene']['captions'][0].update(start_frame=0),
            lambda s,p,r:s['cues'][1].update(id=s['cues'][0]['id']),
            lambda s,p,r:s['cues'][0].update(text='已删除文字'),
        ]:
            source,project,row=self.fixture();mutate(source,project,row)
            with self.subTest(mutate=mutate),self.assertRaises(StoreError):measured_timeline(source,project,row)

    def test_audio_overrun_is_rejected(self):
        source,project,row=self.fixture();project['config']['assets'][0]['duration_ms']=6000
        with self.assertRaises(StoreError):measured_timeline(source,project,row)

    def test_real_host_recompiles_existing_plan_and_binds_media_without_provider(self):
        from services.visual.teaching_pipeline import host_command
        source,project,row=self.fixture();context={k:source[k] for k in ('brief','cues')}
        request=host_command('request',context)
        plan={'schemaVersion':'teaching-scene-plan:1','inputSha256':request['inputSha256'],'structure':'flow',
            'objects':[{'id':id,'meaning':id,'label':id,'ownerId':None,'component':component,'initialState':state}
                for id,component,state in [('paper','document','waiting'),('machine','classifier','idle')]],
            'relations':[{'kind':'flow','from':'paper','to':'machine','label':''}],
            'beats':[{'cueId':source['cues'][0]['id'],'actions':[{'kind':'transfer','objectId':'paper','targetId':'machine'}]},
                {'cueId':source['cues'][1]['id'],'actions':[{'kind':'hold','objectId':'machine'}]}]}
        artifact=host_command('check',{**context,'plan':plan})['artifact']
        result=bind_teaching_audio(source,artifact,artifact['artifactSha256'],project,row)
        self.assertEqual(result['model_calls'],0);self.assertFalse(result['accepted'])
        self.assertEqual(result['execution'],'not-run')
        self.assertNotEqual(result['artifact']['artifactSha256'],artifact['artifactSha256'])
        self.assertEqual(result['artifact']['cues'],result['timeline']['cues'])
        self.assertEqual(result['timeline']['media']['asset']['checksum'],'a'*64)
        self.assertEqual(result,bind_teaching_audio(source,artifact,artifact['artifactSha256'],project,row))
        foreign=copy.deepcopy(source);foreign['cues'][0]['id']='foreign'
        with self.assertRaises(StoreError):bind_teaching_audio(foreign,artifact,artifact['artifactSha256'],project,row)

    def test_actual_audio_bytes_and_duration_are_verified_without_network(self):
        with tempfile.TemporaryDirectory() as folder:
            audio=Path(folder)/'voice.wav'
            with wave.open(str(audio),'wb') as stream:
                stream.setnchannels(1);stream.setsampwidth(2);stream.setframerate(24000)
                stream.writeframes(b'\0\0'*115200)
            source,project,row=self.fixture();asset=project['config']['assets'][0]
            asset['checksum']=hashlib.sha256(audio.read_bytes()).hexdigest()
            timeline=measured_timeline(source,project,row)
            store=Mock();store.get_project.return_value=project;store.asset_file.return_value=audio
            result=verify_bound_audio(store,'project',timeline)
            self.assertEqual(result['audio_sha256'],asset['checksum'])
            self.assertEqual(result['duration_ms'],4800)
            self.assertEqual(result['timeline_sha256'],timeline['timeline_sha256'])
            with patch.dict('os.environ',{'DEEPSEEK_API_KEY':'do-not-forward'}),patch(
                    'services.visual.teaching_timing.subprocess.run',return_value=SimpleNamespace(stdout='{"format":{"duration":"4.8"},"streams":[{"codec_type":"video"}]}')) as probe:
                with self.assertRaises(StoreError):verify_bound_audio(store,'project',timeline)
                self.assertNotIn('DEEPSEEK_API_KEY',probe.call_args.kwargs['env'])
            changed=copy.deepcopy(timeline);changed['media']['audio_start_frame']=0
            with self.assertRaises(StoreError):verify_bound_audio(store,'project',changed)
            asset['duration_ms']=4700
            lying=measured_timeline(source,project,row)
            with self.assertRaises(StoreError):verify_bound_audio(store,'project',lying)
            asset['duration_ms']=4800
            audio.write_bytes(b'corrupt')
            with self.assertRaises(StoreError):verify_bound_audio(store,'project',timeline)
