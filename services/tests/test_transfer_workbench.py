import copy
import json
import unittest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from services.projects.store import StoreError


class TransferWorkbenchTests(unittest.TestCase):
    def test_automatic_recipe_route_is_explicit_free_and_reuses_current_snapshot(self):
        from services.visual.store import VisualJobs
        from services.api.visual import router
        store=MagicMock();store._read.return_value={'id':'p','revision':1};store._scene.return_value={'id':'s'};jobs=VisualJobs(store)
        base={'brief':{},'cues':[],'scene':{},'asset':{},'fingerprint':'f'}
        with patch('services.visual.store.measured_input',return_value=base),patch.object(jobs,'_submit',side_effect=lambda c,p,s,k,d:(k,d)):
            self.assertEqual(jobs.automatic_transfer('p','s',1,True,'rag-augmentation:1'),('prepare-transfer',{**base,'preset':'rag-augmentation:1'}))
        with self.assertRaises(StoreError):VisualJobs(None).automatic_transfer('p','s',1,True,'anything')
        app=FastAPI();app.include_router(router);app.state.visual=MagicMock();app.state.visual.automatic_transfer.return_value={}
        client=TestClient(app);body={'scene_id':'s','expected_revision':1,'confirmed':True,'preset':'rag-augmentation:1'}
        self.assertEqual(client.post('/api/projects/p/visual/auto-transfer',json=body).status_code,202)
        for bad in ({**body,'preset':'anything'},{**body,'max_requests':2},{**body,'design':{}}):
            self.assertEqual(client.post('/api/projects/p/visual/auto-transfer',json=bad).status_code,422)
        from services.visual import worker
        self.assertEqual(worker.command_input(MagicMock(),{'kind':'prepare-transfer','input':{**base,'preset':'rag-augmentation:1'}}),{'brief':{},'cues':[],'preset':'rag-augmentation:1'})

    def test_route_is_strict_free_and_project_scoped(self):
        from services.api.visual import router
        app=FastAPI();app.include_router(router);app.state.visual=MagicMock()
        app.state.visual.prepare_transfer.return_value={'id':'candidate'}
        client=TestClient(app);body={'scene_id':'s','expected_revision':1,'confirmed':True,'design':{},'roles':{}}
        for bad in ({**body,'execute':True},{**body,'max_requests':1},{**body,'expected_revision':True}):
            self.assertEqual(client.post('/api/projects/p/visual/prepare-transfer',json=bad).status_code,422)
        app.state.visual.prepare_transfer.assert_not_called()
        self.assertEqual(client.post('/api/projects/p/visual/prepare-transfer',json=body).status_code,202)
        app.state.visual.prepare_transfer.assert_called_once_with('p','s',1,True,{}, {})

    def test_submission_binds_measured_chapter_and_never_dispatches_paid_generation(self):
        from services.visual.store import VisualJobs
        store=MagicMock();project={'id':'p','revision':1};store._read.return_value=project;store._scene.return_value={'id':'s'}
        jobs=VisualJobs(store);base={'brief':{'narration':'hello'},'cues':[{'id':'cue'}],'scene':{},'asset':{},'fingerprint':'f'}
        design={'brief':base['brief'],'cues':base['cues'],'objects':[]};roles={'carrierId':'head'}
        with patch('services.visual.store.measured_input',return_value=copy.deepcopy(base)),patch.object(jobs,'_submit',side_effect=lambda c,p,s,k,d:(k,d)):
            kind,data=jobs.prepare_transfer('p','s',1,True,design,roles)
            self.assertEqual(kind,'prepare-transfer');self.assertEqual(data,{**base,'design':design,'roles':roles})
            for bad in ({**design,'brief':{}},{**design,'cues':[]}):
                with self.assertRaises(StoreError):jobs.prepare_transfer('p','s',1,True,bad,roles)
            with self.assertRaises(StoreError):jobs.prepare_transfer('p','s',2,True,design,roles)
            padded={**design,'padding':''}
            padded['padding']='x'*(128*1024-1-len(json.dumps({'design':padded,'roles':roles},ensure_ascii=False,separators=(',',':')).encode()))
            self.assertEqual(jobs.prepare_transfer('p','s',1,True,padded,roles)[0],'prepare-transfer')
            with self.assertRaises(StoreError):jobs.prepare_transfer('p','s',1,True,{**padded,'padding':padded['padding']+'xx'},roles)
        with self.assertRaises(StoreError):VisualJobs(None).prepare_transfer('p','s',1,False,{}, {})

    def test_candidate_can_be_published_but_is_not_a_generation_or_acceptable_preview(self):
        from services.visual.store import VisualJobs
        row={'id':'j','project_id':'p','scene_id':'s','kind':'prepare-transfer','state':'succeeded','stage':'done','error':None,'input':{}}
        result={'sha256':'a'*64,'design_sha256':'b'*64,'assembly_sha256':'c'*64,'binding_sha256':'d'*64,'source':'export {}','design':{},'requests_dispatched':0,'execution':'not_run','technical':'passed','visual':'pending','production_adopted':False,'_files':{'source.txt':'e'*64,'design.json':'f'*64}}
        self.assertTrue(VisualJobs._valid_result(row,result));self.assertFalse(VisualJobs._acceptable({**row,'result':result}))
        for change in ({'requests_dispatched':1},{'execution':'executed'},{'production_adopted':True},{'video':'video.mp4'},{'binding_sha256':None}):
            self.assertFalse(VisualJobs._valid_result(row,{**result,**change}))
        public=VisualJobs._public({**row,'result':result})
        self.assertEqual(public['result']['binding_sha256'],'d'*64);self.assertEqual(public['result']['execution'],'not_run')

    def test_worker_maps_only_the_free_command_and_scrubs_credentials(self):
        from services.visual import worker
        data={'design':{'brief':{'narration':'hello'},'cues':[]},'roles':{},'brief':{'narration':'hello'},'cues':[]}
        self.assertEqual(worker.command_input(MagicMock(),{'kind':'prepare-transfer','input':data}),{'design':data['design'],'roles':{}})
        with patch.dict('os.environ',{'DEEPSEEK_API_KEY':'secret','TTS_API_KEY':'secret','PATH':'/bin'}):
            self.assertNotIn('DEEPSEEK_API_KEY',worker.child_environment('prepare-transfer'))
            self.assertNotIn('TTS_API_KEY',worker.child_environment('prepare-transfer'))
        with self.assertRaises(ValueError):worker.command_input(MagicMock(),{'kind':'prepare-transfer','input':{**data,'brief':{}}})

    def test_transfer_preview_is_a_separate_exact_hash_approval_not_production_acceptance(self):
        from services.visual.store import VisualJobs
        base={'scene':{},'asset':{},'fingerprint':'f'}
        hashes={'sha256':'a'*64,'design_sha256':'b'*64,'assembly_sha256':'c'*64,'binding_sha256':'d'*64}
        store=MagicMock();project={'id':'p'};store._read.return_value=project;jobs=VisualJobs(store)
        parent={'id':'candidate','scene_id':'s','kind':'prepare-transfer','state':'succeeded','input':base,'result':hashes}
        with patch.object(jobs,'_read',return_value=parent),patch.object(jobs,'_current',return_value=True),patch.object(jobs,'_submit',side_effect=lambda c,p,s,k,d:(k,d)):
            kind,data=jobs.preview_transfer('p','candidate',True,'a'*64)
            self.assertEqual(kind,'preview-transfer');self.assertTrue(data['transfer_candidate']);self.assertEqual(data['binding_sha256'],'d'*64)
            self.assertEqual(data['scene'],base['scene'])
            with self.assertRaises(StoreError):jobs.preview_transfer('p','candidate',True,'0'*64)
            parent['kind']='generate'
            with self.assertRaises(StoreError):jobs.preview_transfer('p','candidate',True,'a'*64)
        with self.assertRaises(StoreError):VisualJobs(None).preview_transfer('p','j',False,'a'*64)
        app=FastAPI()
        from services.api.visual import router
        app.include_router(router);app.state.visual=MagicMock();app.state.visual.preview_transfer.return_value={}
        client=TestClient(app)
        self.assertEqual(client.post('/api/projects/p/visual/j/preview-transfer',json={'confirmed':True,'sha256':'a'*64}).status_code,202)
        app.state.visual.preview_transfer.assert_called_once_with('p','j',True,'a'*64)

    def test_diagnostic_preview_is_never_acceptable_even_when_geometry_and_video_pass(self):
        from services.visual.store import VisualJobs
        hashes={'sha256':'a'*64,'design_sha256':'b'*64,'assembly_sha256':'c'*64,'binding_sha256':'d'*64}
        result={**hashes,'diagnostic':True,'production_adopted':False,'requests_dispatched':0,'geometry':{'status':'passed'},'frames':['stills/frame-0.png'],'frame_hashes':{'stills/frame-0.png':'e'*64},'video':'video.mp4','srt':'video.srt','_files':{'stills/frame-0.png':'e'*64,'video.mp4':'f'*64,'video.srt':'0'*64}}
        row={'kind':'preview-transfer','state':'succeeded','input':{**hashes,'transfer_candidate':True},'result':result}
        self.assertTrue(VisualJobs._valid_result(row,result));self.assertFalse(VisualJobs._acceptable(row))
        for change in ({'diagnostic':False},{'production_adopted':True},{'binding_sha256':'0'*64},{'requests_dispatched':1},{'frame_hashes':None}):
            self.assertFalse(VisualJobs._valid_result(row,{**result,**change}))

    def test_worker_rechecks_candidate_files_and_audio_before_diagnostic_execution(self):
        from services.visual import worker
        import tempfile
        from pathlib import Path
        hashes={'sha256':'a'*64,'design_sha256':'b'*64,'assembly_sha256':'c'*64,'binding_sha256':'d'*64}
        published={**hashes,'_files':{'source.txt':'e'*64,'design.json':'f'*64}}
        jobs=MagicMock();jobs.get_raw.return_value={'id':'candidate','kind':'prepare-transfer','state':'succeeded','result':published}
        with tempfile.TemporaryDirectory() as directory,patch.object(worker,'job_directory',return_value=Path(directory)),patch.object(worker,'publishable_result',return_value=copy.deepcopy(published)) as check:
            audio=Path(directory)/'audio.wav';audio.write_bytes(b'fixture');jobs.store.asset_file.return_value=audio
            data={**hashes,'generation_id':'candidate','transfer_candidate':True,'asset':{'id':'voice','checksum':worker._hash(audio)},'scene':{}}
            job={'kind':'preview-transfer','project_id':'p','input':data}
            command=worker.command_input(jobs,job)
            self.assertEqual(command['sha256'],'a'*64);self.assertEqual(command['binding_sha256'],'d'*64)
            self.assertEqual(command['audio_sha256'],data['asset']['checksum']);check.assert_called_once()
            jobs.store.asset_file.reset_mock();check.return_value={**published,'binding_sha256':'0'*64}
            with self.assertRaises(ValueError):worker.command_input(jobs,job)
            jobs.store.asset_file.assert_not_called()
            check.return_value=published;audio.write_bytes(b'changed')
            with self.assertRaises(StoreError):worker.command_input(jobs,job)
