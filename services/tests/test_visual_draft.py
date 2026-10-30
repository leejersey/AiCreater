import copy
import unittest
from unittest.mock import MagicMock, patch
from services.visual.contract import draft_input, measured_input
from services.projects.store import StoreError

class DraftInputTests(unittest.TestCase):
    def fixture(self):
        return {'title':'Demo','config':{'assets':[]}}, {'id':'s','revision':1,'state':'needs_voice','scene':{'narration':{'text':'先检索知识。然后生成答案。'}}}

    def test_draft_is_estimated_stable_across_voice_changes(self):
        project,row=self.fixture(); result=draft_input(project,row)
        self.assertIsNone(result['asset'])
        self.assertEqual(result['timing_mode'],'draft')
        self.assertTrue(30<=result['scene']['duration_frames']<=3600)
        self.assertEqual(''.join(c['text'] for c in result['cues']),row['scene']['narration']['text'])
        voiced=copy.deepcopy(row);voiced['revision']=2;voiced['state']='ready';voiced['scene']['narration']['audio_asset_id']='a'
        voiced['scene']['captions']=[{'text':'changed','start_frame':6,'end_frame':100}]
        self.assertEqual(draft_input(project,voiced),result)
        voiced['scene']['narration']['text']+='改稿。'
        self.assertNotEqual(draft_input(project,voiced)['fingerprint'],result['fingerprint'])

    def test_draft_never_satisfies_measured_requirement(self):
        project,row=self.fixture()
        with self.assertRaises(StoreError):measured_input(project,row)

    def test_short_draft_has_at_least_one_second(self):
        project,row=self.fixture();row['scene']['narration']['text']='好'
        self.assertEqual(draft_input(project,row)['scene']['duration_frames'],30)

    def test_store_draft_and_free_alignment_are_separate_from_measured_generation(self):
        from services.visual.store import VisualJobs
        project,row=self.fixture();project.update(id='p',revision=1)
        store=MagicMock();store._read.return_value=project;store._scene.return_value=row;jobs=VisualJobs(store)
        with patch.object(jobs,'_submit',side_effect=lambda c,p,s,k,d:{'kind':k,'input':d}):
            draft=jobs.generate('p','s',1,True,2,'source','draft')
            self.assertEqual(draft['input']['timing_mode'],'draft')
            with self.assertRaises(StoreError):jobs.generate('p','s',1,True,2)
            parent={'id':'g','kind':'generate','state':'succeeded','scene_id':'s','input':draft['input'],'result':{'sha256':'a'*64}}
            with patch.object(jobs,'_generation',return_value=parent):
                with self.assertRaises(StoreError):jobs.align_draft('p','g',True,'a'*64)
                with patch('services.visual.store.measured_input',return_value={'fingerprint':'measured'}):
                    aligned=jobs.align_draft('p','g',True,'a'*64)
                    self.assertEqual(aligned['kind'],'repair');self.assertEqual(aligned['input']['operation'],'retime')
                    self.assertNotIn('timing_mode',aligned['input'])

    def test_draft_preview_cannot_be_accepted_even_with_valid_media(self):
        from services.visual.store import VisualJobs
        row={'kind':'preview','state':'succeeded','input':{'timing_mode':'draft'},'result':{'geometry':{'status':'passed'},'video':'video.mp4','srt':'video.srt','frames':['stills/frame-0.png'],'frame_hashes':{'stills/frame-0.png':'a'},'_files':{'stills/frame-0.png':'a','video.mp4':'b','video.srt':'c'}}}
        self.assertFalse(VisualJobs._acceptable(row));row['input']={};self.assertTrue(VisualJobs._acceptable(row))

    def test_draft_current_survives_voice_but_not_text_and_worker_never_fetches_audio(self):
        from services.visual.store import VisualJobs
        from services.visual.worker import command_input
        project,row=self.fixture();project.update(id='p',revision=1)
        store=MagicMock();store._scene.return_value=row;jobs=VisualJobs(store);data=draft_input(project,row)
        self.assertTrue(jobs._snapshot_current(project,'s',data));row['revision']=9;row['state']='ready'
        row['scene']['narration']['audio_asset_id']='new-audio'
        self.assertTrue(jobs._snapshot_current(project,'s',data))
        row['scene']['narration']['text']+='改稿'
        self.assertFalse(jobs._snapshot_current(project,'s',data))
        parent={'id':'11111111-1111-4111-8111-111111111111','state':'succeeded','input':{'timing_mode':'draft'},'result':{'sha256':'a'*64,'design_sha256':'b'*64}}
        worker_jobs=MagicMock();worker_jobs.get_raw.return_value=parent
        aligned=command_input(worker_jobs,{'kind':'repair','project_id':'p','input':{'operation':'retime','draft_generation_id':'g','draft_sha256':'a'*64,'scene':{}}})
        self.assertEqual(aligned['operation'],'retime');self.assertEqual(aligned['design_sha256'],'b'*64)
        worker_jobs.store.asset_file.assert_not_called()

    def test_only_alignment_can_publish_zero_request_repair(self):
        from services.visual.store import VisualJobs
        result={'sha256':'a'*64,'design_sha256':'b'*64,'source':'export {}','design':{},'requests_dispatched':0}
        self.assertTrue(VisualJobs._valid_result({'kind':'repair','input':{'operation':'retime'}},result))
        self.assertFalse(VisualJobs._valid_result({'kind':'repair','input':{}},result))

    def test_draft_repairs_do_not_fetch_audio_but_reject_fake_measured_assets(self):
        from services.visual.worker import check_request_audio
        jobs=MagicMock()
        check_request_audio(jobs,'p',{'timing_mode':'draft','asset':None})
        jobs.store.asset_file.assert_not_called()
        with self.assertRaises(ValueError):check_request_audio(jobs,'p',{'timing_mode':'draft','asset':{'id':'fake'}})
