import copy
import unittest
from unittest.mock import MagicMock,patch
from services.projects.store import StoreError
from services.visual.store import VisualJobs

BASE={'brief':{},'cues':[],'scene':{},'asset':{},'fingerprint':'f'}
RESULT={'sha256':'a'*64,'design_sha256':'b'*64,'recovery_sha256':'c'*64,'source':'export {}','design':{},'requests_dispatched':0,
        'generation_mode':'source','execution':'not_run','technical':'passed','visual':'pending','production_adopted':False,'diagnostic':True,
        '_files':{'source.txt':'d'*64,'design.json':'e'*64}}


class SourceRecoveryStoreTests(unittest.TestCase):
    def test_current_status_tracks_original_parent_and_recovery_approval(self):
        jobs=VisualJobs(MagicMock());project={'id':'p'}
        original={'id':'parent','scene_id':'s','kind':'generate','state':'failed','input':copy.deepcopy(BASE),'result':{'requests_dispatched':2}}
        inspection={'id':'inspection','scene_id':'s','kind':'recover-source','state':'succeeded','input':{**BASE,'generation_id':'parent'},'result':copy.deepcopy(RESULT)}
        repair={'kind':'repair','scene_id':'s','input':{**BASE,'recovery_id':'inspection','sha256':'a'*64,'recovery_sha256':'c'*64}}
        with patch.object(jobs,'_snapshot_current',return_value=True),patch.object(jobs,'_read',side_effect=lambda c,p,j:original if j=='parent' else inspection):
            self.assertTrue(jobs._current(None,project,inspection));self.assertTrue(jobs._current(None,project,repair))
            original['state']='succeeded';self.assertFalse(jobs._current(None,project,inspection));self.assertFalse(jobs._current(None,project,repair))
            original['state']='failed';inspection['result']['recovery_sha256']='0'*64;self.assertFalse(jobs._current(None,project,repair))

    def test_inspection_is_explicit_free_and_reuses_failed_source_snapshot(self):
        store=MagicMock();store._read.return_value={'id':'p'};jobs=VisualJobs(store)
        parent={'id':'parent','scene_id':'s','kind':'generate','state':'failed','input':copy.deepcopy(BASE),'result':{'requests_dispatched':2}}
        with patch.object(jobs,'_generation',return_value=parent),patch.object(jobs,'_submit',side_effect=lambda c,p,s,k,d:(k,d)):
            self.assertEqual(jobs.recover_source('p','parent',True),('recover-source',{**BASE,'generation_id':'parent','generation_mode':'source'}))
            for changes in ({'state':'succeeded'},{'result':{'requests_dispatched':1}},{'input':{**BASE,'generation_mode':'host-intent'}}):
                with patch.object(jobs,'_generation',return_value={**parent,**changes}),self.assertRaises(StoreError):jobs.recover_source('p','parent',True)
        with self.assertRaises(StoreError):VisualJobs(None).recover_source('p','x',False)

    def test_pending_candidate_is_not_previewable_and_requires_two_exact_hashes_for_repair(self):
        store=MagicMock();store._read.return_value={'id':'p'};jobs=VisualJobs(store)
        parent={'id':'inspection','scene_id':'s','kind':'recover-source','state':'succeeded','input':{**BASE,'generation_id':'parent'},'result':copy.deepcopy(RESULT)}
        with patch.object(jobs,'_read',return_value=parent),patch.object(jobs,'_current',return_value=True),patch.object(jobs,'_submit',side_effect=lambda c,p,s,k,d:(k,d)):
            kind,data=jobs.repair_source('p','inspection',True,1,'Fix path','a'*64,'c'*64)
            self.assertEqual(kind,'repair');self.assertEqual(data['recovery_id'],'inspection');self.assertEqual(data['sha256'],'a'*64);self.assertEqual(data['recovery_sha256'],'c'*64)
            self.assertNotIn('generation_id',data)
            for a,b in (('0'*64,'c'*64),('a'*64,'0'*64)):
                with self.assertRaises(StoreError):jobs.repair_source('p','inspection',True,1,'Fix',a,b)
            with self.assertRaises(StoreError):jobs.preview('p','inspection',True,'a'*64)
            with patch.object(jobs,'_current',return_value=False),self.assertRaises(StoreError):jobs.repair_source('p','inspection',True,1,'Fix','a'*64,'c'*64)
        for maximum in (True,0,2):
            with self.assertRaises(StoreError):VisualJobs(None).repair_source('p','x',True,maximum,'Fix','a'*64,'c'*64)

    def test_recovery_result_can_never_be_execution_or_acceptance(self):
        row={'kind':'recover-source','input':{}}
        self.assertTrue(VisualJobs._valid_result(row,RESULT));self.assertFalse(VisualJobs._acceptable({**row,'state':'succeeded','result':RESULT}))
        for changes in ({'requests_dispatched':1},{'requests_dispatched':False},{'execution':'executed'},{'production_adopted':True},{'accepted':True},{'video':'video.mp4'},{'recovery_sha256':None},{'generation_mode':'host-intent'}):
            self.assertFalse(VisualJobs._valid_result(row,{**RESULT,**changes}))
