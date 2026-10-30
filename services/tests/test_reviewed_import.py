import copy
import os
from pathlib import Path
import tempfile
import unittest

from services.projects.store import StoreError
from services.tests.test_visual_store import VisualStoreTests


class ReviewedImportOfflineTests(unittest.TestCase):
    def test_edit_then_restore_does_not_rebind_old_preview_to_a_new_scene_revision(self):
        from services.visual.reviewed_import import assert_snapshot_revision
        measured={'scene':{'narration':{'text':'Same restored content'}},'asset':{'id':'same-audio'}}
        snapshot={**copy.deepcopy(measured),'project_id':'p','scene_id':'s','scene_revision':1}
        assert_snapshot_revision(snapshot,measured,'p','s',1)
        for version in (2,3):
            with self.assertRaises(StoreError):assert_snapshot_revision(snapshot,measured,'p','s',version)
        for invalid in (True,None):
            with self.assertRaises(StoreError):assert_snapshot_revision({**snapshot,'scene_revision':invalid},measured,'p','s',1)

    def test_evidence_reader_rejects_symlinks_directories_and_oversized_json(self):
        from services.visual.reviewed_import import _bytes
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();file=root/'plain.json';file.write_bytes(b'{}')
            self.assertEqual(_bytes(file),b'{}')
            link=root/'link.json';link.symlink_to(file)
            for target,maximum in ((link,100),(root,100),(file,1)):
                with self.assertRaises((ValueError,OSError)):_bytes(target,maximum)

    def test_requires_explicit_approval_and_real_historical_count_before_database(self):
        from services.visual.reviewed_import import register_verified_import
        for confirmed,count in ((False,1),(True,0),(True,True),(True,2)):
            with self.assertRaises((StoreError,ValueError)):
                register_verified_import(None,'p','s',1,{},
                    {'sha256':'a'*64,'requests_dispatched':count,'new_requests':0,'accepted':False},
                    'b'*64,None,confirmed)
        with self.assertRaisesRegex(ValueError,'Unsupported reviewed source origin'):
            register_verified_import(None,'p','s',1,{},
                {'sha256':'a'*64,'requests_dispatched':1,'new_requests':0,'accepted':False,'origin':'unknown'},
                'b'*64,None,True)


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'),'Requires disposable TEST_DATABASE_URL')
class ReviewedImportStoreTests(unittest.TestCase):
    setUp=VisualStoreTests.setUp

    def fixture(self):
        from services.visual.contract import measured_input
        project=self.store.get_project(self.pid)
        measured=measured_input(project,self.store._scene(project,self.sid))
        verified={'artifact':{'brief':measured['brief'],'source':'export {}','rationale':'Retained model response'},
                  'design':{'brief':measured['brief'],'cues':measured['cues']},
                  'sha256':'a'*64,'design_sha256':'b'*64,'requests_dispatched':1,'new_requests':0,'accepted':False}
        def publish(gid,pid,reuse=False):
            gen={'sha256':'a'*64,'design_sha256':'b'*64,'source':'export {}','design':verified['design'],
                 'requests_dispatched':1,'_files':{'source.txt':'c'*64,'design.json':'d'*64}}
            preview={'sha256':'a'*64,'design_sha256':'b'*64,'geometry':{'status':'passed'},
                     'frames':['stills/frame-0.png'],'frame_hashes':{'stills/frame-0.png':'e'*64},
                     'video':'video.mp4','srt':'video.srt','_files':{'stills/frame-0.png':'e'*64,'video.mp4':'f'*64,'video.srt':'1'*64}}
            return gen,preview
        return measured,verified,publish

    def test_atomic_terminal_import_is_idempotent_and_uses_existing_acceptance_and_export(self):
        from services.visual.reviewed_import import register_verified_import
        measured,verified,publish=self.fixture()
        first=register_verified_import(self.store,self.pid,self.sid,1,measured,verified,'2'*64,publish,True)
        self.assertFalse(first['preview']['accepted'])
        self.assertEqual(first['generation']['result']['requests_dispatched'],1)
        self.assertIsNone(self.jobs.claim('workflow'));self.assertIsNone(self.jobs.claim('render'))
        accepted=self.jobs.accept(self.pid,first['preview']['id'],True,'a'*64)
        self.assertTrue(accepted['accepted']);self.assertTrue(accepted['current'])
        again=register_verified_import(self.store,self.pid,self.sid,1,measured,verified,'2'*64,publish,True)
        self.assertEqual(first['generation']['id'],again['generation']['id'])
        self.assertEqual(first['preview']['id'],again['preview']['id']);self.assertTrue(again['preview']['accepted'])
        self.assertEqual(len(self.jobs.list(self.pid)),2)
        self.assertEqual(len(self.jobs.export(self.pid,1,True)['input_summary']),1)

    def test_stale_snapshot_invalid_result_and_failed_publication_leave_no_rows(self):
        from services.visual.reviewed_import import register_verified_import
        measured,verified,publish=self.fixture()
        stale=copy.deepcopy(measured);stale['fingerprint']='9'*64
        def bad(*args,**kwargs):
            gen,preview=publish(*args,**kwargs);preview['frame_hashes']={};return gen,preview
        def fail(*args,**kwargs):raise ValueError('file verification failed')
        for revision,snapshot,publisher in ((2,measured,publish),(1,stale,publish),(1,measured,bad),(1,measured,fail)):
            with self.assertRaises((StoreError,ValueError)):
                register_verified_import(self.store,self.pid,self.sid,revision,snapshot,verified,'3'*64,publisher,True)
            self.assertEqual(self.jobs.list(self.pid),[])

    def test_offline_revision_retains_distinct_origin_and_zero_new_requests(self):
        from services.visual.reviewed_import import register_verified_import
        measured,verified,publish=self.fixture()
        verified['origin']='local-reviewed-offline-revision'
        result=register_verified_import(self.store,self.pid,self.sid,1,measured,verified,'5'*64,publish,True)
        raw=self.jobs.get_raw(self.pid,result['generation']['id'])
        self.assertEqual(raw['input']['reviewed_import']['origin'],'local-reviewed-offline-revision')
        self.assertEqual(raw['input']['reviewed_import']['new_requests'],0)
        self.assertIn('离线修订稿',raw['stage'])
        self.assertTrue(self.jobs.accept(self.pid,result['preview']['id'],True,'a'*64)['accepted'])

    def test_reuse_refuses_changed_public_files_and_scene_edits_invalidate_acceptance(self):
        from services.visual.reviewed_import import register_verified_import
        from psycopg.types.json import Jsonb
        measured,verified,publish=self.fixture()
        first=register_verified_import(self.store,self.pid,self.sid,1,measured,verified,'4'*64,publish,True)
        self.jobs.accept(self.pid,first['preview']['id'],True,'a'*64)
        def changed(*args,**kwargs):
            gen,pv=publish(*args,**kwargs);pv['_files']['video.mp4']='8'*64;return gen,pv
        with self.assertRaises(StoreError):
            register_verified_import(self.store,self.pid,self.sid,1,measured,verified,'4'*64,changed,True)
        with self.store.connection() as conn:
            scene=copy.deepcopy(self.scene);scene['captions'][0]['end_frame']=59
            conn.execute('UPDATE scenes SET scene=%s,revision=revision+1 WHERE id=%s',[Jsonb(scene),self.sid])
        self.assertFalse(self.jobs.get(self.pid,first['preview']['id'])['accepted'])
        with self.assertRaises(StoreError):self.jobs.export(self.pid,1,True)
        self.assertEqual(len(self.jobs.list(self.pid)),2)
