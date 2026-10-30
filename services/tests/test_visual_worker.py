import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from unittest.mock import Mock
import json
import hashlib


class VisualWorkerTests(unittest.TestCase):
    def test_components_mode_and_required_hashes_survive_queue_publication(self):
        from services.visual import worker
        data={'brief':{},'cues':[],'generation_mode':'host-components'}
        self.assertEqual(worker.command_input(Mock(),{'kind':'generate','input':data}),data)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            (root/'source.txt').write_text('export {}');(root/'design.json').write_text('{}')
            result={'sha256':'a'*64,'design_sha256':'b'*64,'source':'export {}','design':{},'requests_dispatched':1,'generation_mode':'host-components','assembly_sha256':'c'*64,'intent_sha256':'d'*64}
            for kind in ('generate','repair'):
                job={'kind':kind,'input':data}
                (root/'result.json').write_text(json.dumps(result))
                self.assertEqual(worker.publishable_result(job,root)['intent_sha256'],'d'*64)
                for key in ('assembly_sha256','intent_sha256'):
                    for value in (None,True,'bad'):
                        candidate={**result,key:value}
                        if value is None:candidate.pop(key)
                        (root/'result.json').write_text(json.dumps(candidate))
                        with self.subTest(kind=kind,key=key,value=value),self.assertRaises(ValueError):
                            worker.publishable_result(job,root)
                for mode in ('source','host-motion','host-intent',None):
                    (root/'result.json').write_text(json.dumps({**result,'generation_mode':mode}))
                    with self.assertRaises(ValueError):worker.publishable_result(job,root)
                (root/'result.json').write_text(json.dumps({**result,'requests_dispatched':3 if kind=='generate' else 2}))
                with self.assertRaises(ValueError):worker.publishable_result(job,root)

    def test_components_repair_requires_exact_parent_and_disk_mode(self):
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();pid='11111111-1111-4111-8111-111111111111';(root/pid).mkdir()
            jobs=Mock();jobs.get_raw.return_value={'id':pid,'input':{'generation_mode':'host-components'}}
            job={'kind':'repair','project_id':'p','input':{'generation_id':pid,'feedback':'fix','generation_mode':'host-components'}}
            with patch.object(worker,'WORK_ROOT',root):
                (root/pid/'generation-mode.json').write_text(json.dumps({'generation_mode':'host-components'}))
                self.assertEqual(worker.command_input(jobs,job),{'previous_directory':str(root/pid),'feedback':'fix'})
                for mode in ('source','host-motion','host-intent'):
                    (root/pid/'generation-mode.json').write_text(json.dumps({'generation_mode':mode}))
                    with self.assertRaises(ValueError):worker.command_input(jobs,job)
                    jobs.get_raw.return_value['input']['generation_mode']=mode
                    with self.assertRaises(ValueError):worker.command_input(jobs,job)
                    jobs.get_raw.return_value['input']['generation_mode']='host-components'
                (root/pid/'generation-mode.json').unlink()
                with self.assertRaises(ValueError):worker.command_input(jobs,job)

    def test_components_render_checks_both_hashes_and_exact_mode_before_audio(self):
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();job_id='11111111-1111-4111-8111-111111111111';(root/job_id).mkdir()
            audio=root/'audio.wav';audio.write_bytes(b'synthetic audio')
            result={'sha256':'a'*64,'design_sha256':'b'*64,'generation_mode':'host-components','assembly_sha256':'c'*64,'intent_sha256':'d'*64}
            jobs=Mock();jobs.get_raw.return_value={'id':job_id,'kind':'generate','state':'succeeded','input':{'generation_mode':'host-components'},'result':result}
            jobs.store.asset_file.return_value=audio
            snapshot={'generation_id':job_id,'sha256':'a'*64,'asset':{'id':'voice','checksum':worker._hash(audio)},'scene':{}}
            with patch.object(worker,'WORK_ROOT',root):
                (root/job_id/'result.json').write_text(json.dumps(result))
                self.assertEqual(worker._chapter(jobs,'p',snapshot)['generation_directory'],str(root/job_id))
                self.assertTrue(worker._chapter(jobs,'p',{**snapshot,'isolated_render':True})['isolated_render'])
                self.assertNotIn('isolated_render',worker._chapter(jobs,'p',snapshot))
                jobs.store.asset_file.reset_mock()
                for key in ('assembly_sha256','intent_sha256','generation_mode'):
                    values=('source','host-motion','host-intent',None) if key=='generation_mode' else ('e'*64,None,True)
                    for value in values:
                        (root/job_id/'result.json').write_text(json.dumps({**result,key:value}))
                        with self.subTest(key=key,value=value),self.assertRaises(ValueError):worker._chapter(jobs,'p',snapshot)
                        jobs.store.asset_file.assert_not_called()

    def test_repair_refuses_disk_mode_drift_before_launch(self):
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();pid='11111111-1111-4111-8111-111111111111';(root/pid).mkdir()
            jobs=Mock();jobs.get_raw.return_value={'id':pid,'input':{'generation_mode':'host-intent'}}
            job={'kind':'repair','project_id':'p','input':{'generation_id':pid,'feedback':'fix','generation_mode':'host-intent'}}
            with patch.object(worker,'WORK_ROOT',root):
                for mode in ('source','host-motion'):
                    (root/pid/'generation-mode.json').write_text(json.dumps({'generation_mode':mode}))
                    with self.assertRaises(ValueError):worker.command_input(jobs,job)
                (root/pid/'generation-mode.json').write_text(json.dumps({'generation_mode':'host-intent'}))
                self.assertEqual(worker.command_input(jobs,job)['previous_directory'],str(root/pid))
                (root/pid/'generation-mode.json').unlink()
                with self.assertRaises(ValueError):worker.command_input(jobs,job)
                jobs.get_raw.return_value={'id':pid,'input':{}}
                legacy={**job,'input':{'generation_id':pid,'feedback':'fix'}}
                self.assertEqual(worker.command_input(jobs,legacy)['previous_directory'],str(root/pid))
                for name in ('frozen-intent.json','frozen-assembly.json'):
                    (root/pid/name).write_text('{}')
                    with self.assertRaises(ValueError):worker.command_input(jobs,legacy)
                    (root/pid/name).unlink()

    def test_all_present_hashes_are_type_checked_in_legacy_modes(self):
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();(root/'source.txt').write_text('export {}');(root/'design.json').write_text('{}')
            for mode in ('source','host-motion'):
                result={'sha256':'a'*64,'design_sha256':'b'*64,'source':'export {}','design':{},'requests_dispatched':2,'generation_mode':mode,'assembly_sha256':'c'*64,'intent_sha256':True}
                (root/'result.json').write_text(json.dumps(result))
                with self.assertRaises(ValueError):worker.publishable_result({'kind':'generate','input':{'generation_mode':mode}},root)

    def test_intent_mode_and_required_hash_survive_queue_publication(self):
        from services.visual import worker
        data={'brief':{},'cues':[],'generation_mode':'host-intent'}
        self.assertEqual(worker.command_input(Mock(),{'kind':'generate','input':data}),data)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            result={'sha256':'a'*64,'design_sha256':'b'*64,'source':'export {}','design':{},'requests_dispatched':2,'generation_mode':'host-intent','assembly_sha256':'c'*64}
            (root/'source.txt').write_text('export {}');(root/'design.json').write_text('{}')
            for intent in (None,'bad',True):
                candidate={**result,**({'intent_sha256':intent} if intent is not None else {})}
                (root/'result.json').write_text(json.dumps(candidate))
                with self.assertRaises(ValueError):worker.publishable_result({'kind':'generate','input':data},root)
            (root/'result.json').write_text(json.dumps({**result,'intent_sha256':'d'*64}))
            self.assertEqual(worker.publishable_result({'kind':'generate','input':data},root)['intent_sha256'],'d'*64)

    def test_intent_render_checks_mode_and_all_data_metadata_before_audio(self):
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();job_id='11111111-1111-4111-8111-111111111111';(root/job_id).mkdir()
            result={'sha256':'a'*64,'design_sha256':'b'*64,'generation_mode':'host-intent','assembly_sha256':'c'*64,'intent_sha256':'d'*64}
            jobs=Mock();jobs.get_raw.return_value={'id':job_id,'kind':'generate','state':'succeeded','input':{'generation_mode':'host-intent'},'result':result}
            for change in ({'intent_sha256':'e'*64},{'intent_sha256':None},{'assembly_sha256':'e'*64},{'generation_mode':'host-motion'}):
                (root/job_id/'result.json').write_text(json.dumps({**result,**change}))
                with patch.object(worker,'WORK_ROOT',root),self.assertRaises(ValueError):
                    worker._chapter(jobs,'p',{'generation_id':job_id,'sha256':'a'*64})
                jobs.store.asset_file.assert_not_called()

    def test_generation_mode_survives_queue_and_invalid_mode_is_rejected(self):
        from services.visual import worker
        jobs=Mock();base={'brief':{},'cues':[],'generation_mode':'host-motion'}
        self.assertEqual(worker.command_input(jobs,{'kind':'generate','input':base})['generation_mode'],'host-motion')
        for mode in ('bad',None,True):
            with self.assertRaises(ValueError):worker.command_input(jobs,{'kind':'generate','input':{**base,'generation_mode':mode}})

    def test_published_host_result_cannot_silently_downgrade_to_source(self):
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();result={'sha256':'a'*64,'design_sha256':'b'*64,'source':'export {}','design':{},'requests_dispatched':2}
            (root/'result.json').write_text(json.dumps(result))
            (root/'source.txt').write_text('export {}');(root/'design.json').write_text('{}')
            job={'kind':'generate','input':{'generation_mode':'host-motion'}}
            with self.assertRaises(ValueError):worker.publishable_result(job,root)
            result.update(generation_mode='host-motion',assembly_sha256='c'*64)
            (root/'result.json').write_text(json.dumps(result))
            published=worker.publishable_result(job,root)
            self.assertEqual(published['generation_mode'],'host-motion')
    def test_design_revision_loads_only_complete_owned_response_and_private_feedback(self):
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();parent_id='11111111-1111-4111-8111-111111111111'
            folder=root/parent_id;folder.mkdir()
            response={'finishReason':'stop','content':json.dumps({'retained':'design'})}
            (folder/'provider-1.json').write_text(json.dumps(response))
            (folder/'provider-1.failure.json').write_text(json.dumps({'error':'state continuity mismatch'}))
            base={'brief':{},'cues':[],'scene':{},'asset':{},'fingerprint':'f'}
            jobs=Mock();jobs.get_raw.return_value={'id':parent_id,'kind':'generate','state':'failed','result':{'requests_dispatched':1},'input':base}
            job={'kind':'generate','project_id':'project','input':{**base,'design_revision_of':parent_id,'feedback':'reset explicitly'}}
            with patch.object(worker,'WORK_ROOT',root):
                data=worker.command_input(jobs,job)
                self.assertEqual(data['previous_design'],{'retained':'design'})
                self.assertEqual(data['diagnostic'],'state continuity mismatch')
                self.assertEqual(data['feedback'],'reset explicitly')
                malformed='{\"avoid\":[\"cards\"]\",\"objects\":[]}'
                (folder/'provider-1.json').write_text(json.dumps({**response,'content':malformed}))
                recovered=worker.command_input(jobs,job)['previous_design']
                self.assertEqual(recovered['schemaVersion'],'invalid-design-json:1')
                self.assertEqual(recovered['content'],malformed)
                self.assertEqual(recovered['sha256'],hashlib.sha256(malformed.encode()).hexdigest())
                for content in ('{\"x\":NaN}','{\"x\":Infinity}','{\"x\":-Infinity}'):
                    (folder/'provider-1.json').write_text(json.dumps({**response,'content':content}))
                    self.assertEqual(worker.command_input(jobs,job)['previous_design']['content'],content)
                for content in ('   ','x'*(128*1024+1)):
                    (folder/'provider-1.json').write_text(json.dumps({**response,'content':content}))
                    with self.assertRaises(ValueError):worker.command_input(jobs,job)
                (folder/'provider-1.json').write_text(json.dumps({**response,'content':malformed}))
                for mode in ('host-intent','host-components','host-motion'):
                    base['generation_mode']=mode;job['input']['generation_mode']=mode
                    with self.assertRaises(ValueError):worker.command_input(jobs,job)
                base.pop('generation_mode');job['input'].pop('generation_mode')
                (folder/'provider-1.json').write_text(json.dumps({**response,'content':malformed,'truncated':True}))
                with self.assertRaises(ValueError):worker.command_input(jobs,job)
                (folder/'provider-1.json').write_text(json.dumps({**response,'finishReason':'length'}))
                with self.assertRaises(ValueError):worker.command_input(jobs,job)
                (folder/'provider-1.json').unlink()
                (folder/'provider-1.json').symlink_to(folder/'provider-1.failure.json')
                with self.assertRaises(ValueError):worker.command_input(jobs,job)

    def test_render_checks_frozen_design_against_database_before_media_access(self):
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();job_id='11111111-1111-4111-8111-111111111111'
            (root/job_id).mkdir();(root/job_id/'result.json').write_text(json.dumps({'sha256':'a'*64,'design_sha256':'changed'}))
            jobs=Mock();jobs.get_raw.return_value={'id':job_id,'kind':'generate','state':'succeeded','result':{'sha256':'a'*64,'design_sha256':'d'*64}}
            with patch.object(worker,'WORK_ROOT',root),self.assertRaises(ValueError):
                worker._chapter(jobs,'project',{'generation_id':job_id,'sha256':'a'*64})
            jobs.store.asset_file.assert_not_called()

    def test_repair_cannot_change_frozen_generation_mode(self):
        from services.visual import worker
        jobs=Mock();jobs.get_raw.return_value={'input':{'generation_mode':'host-motion'}}
        with self.assertRaises(ValueError):
            worker.command_input(jobs,{'kind':'repair','project_id':'p','input':{'generation_id':'j','feedback':'fix'}})

    def test_render_checks_assembly_metadata_before_audio_access(self):
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();job_id='11111111-1111-4111-8111-111111111111'
            (root/job_id).mkdir()
            result={'sha256':'a'*64,'design_sha256':'b'*64,'generation_mode':'host-motion','assembly_sha256':'c'*64}
            (root/job_id/'result.json').write_text(json.dumps({**result,'assembly_sha256':'d'*64}))
            jobs=Mock();jobs.get_raw.return_value={'id':job_id,'kind':'generate','state':'succeeded','input':{'generation_mode':'host-motion'},'result':result}
            with patch.object(worker,'WORK_ROOT',root),self.assertRaises(ValueError):
                worker._chapter(jobs,'p',{'generation_id':job_id,'sha256':'a'*64})
            jobs.store.asset_file.assert_not_called()

    def test_render_environment_is_allowlisted(self):
        from services.visual.worker import child_environment
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'secret','DATABASE_URL':'db','VOLCENGINE_API_KEY':'tts','MINIO_SECRET_KEY':'s','PATH':'/bin'},clear=True):
            self.assertEqual(child_environment('preview'),{'PATH':'/bin'})
            self.assertEqual(child_environment('generate')['DEEPSEEK_API_KEY'],'secret')
            self.assertNotIn('DATABASE_URL',child_environment('generate'))

    def test_owned_directory_and_file_paths_reject_symlinks_and_traversal(self):
        from services.visual.worker import checked_file,job_directory
        with self.assertRaises(ValueError):job_directory('../private')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();(root/'source.txt').write_text('safe')
            self.assertEqual(checked_file(root,'source.txt'),root/'source.txt')
            for name in ['../source.txt','/etc/passwd','provider-1.json','stills/../source.txt']:
                with self.assertRaises(ValueError):checked_file(root,name)
            (root/'design.json').symlink_to(root/'source.txt')
            with self.assertRaises(ValueError):checked_file(root,'design.json')


if __name__=='__main__':unittest.main()
