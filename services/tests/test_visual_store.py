import copy
import hashlib
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

from psycopg.types.json import Jsonb

from services.projects.store import Store, StoreError
from services.tests.test_projects import PROFILE


class VisualStoreOfflineTests(unittest.TestCase):
    def test_components_generation_and_children_keep_mode_and_budget(self):
        from services.visual.store import VisualJobs
        store=MagicMock()
        project={'id':'p','revision':1};store._read.return_value=project
        store._scene.return_value={'id':'s'}
        jobs=VisualJobs(store)
        base={'brief':{},'cues':[],'scene':{},'asset':{},'fingerprint':'f'}
        with patch('services.visual.store.measured_input',return_value=base.copy()),patch.object(jobs,'_submit',side_effect=lambda conn,project,scene,kind,data:data):
            data=jobs.generate('p','s',1,True,2,'host-components')
            self.assertEqual(data,{**base,'generation_mode':'host-components'})
            parent={'id':'parent','scene_id':'s','kind':'generate','state':'failed','result':{'requests_dispatched':1},'input':data}
            with patch.object(jobs,'_generation',return_value=parent):
                for method,budget in ((jobs.repair,1),(jobs.revise_design,2)):
                    self.assertEqual(method('p','parent',True,budget,'fix')['generation_mode'],'host-components')
                    for confirmed,maximum in ((False,budget),(True,True),(True,budget+1)):
                        with self.assertRaises(StoreError):method('p','parent',confirmed,maximum,'fix')
            for confirmed,maximum in ((False,2),(True,True),(True,1),(True,3)):
                with self.assertRaises(StoreError):jobs.generate('p','s',1,confirmed,maximum,'host-components')

    def test_components_results_require_both_hashes_and_exact_mode(self):
        from services.visual.store import VisualJobs
        result={'sha256':'a'*64,'design_sha256':'b'*64,'source':'export {}','design':{},'requests_dispatched':1,'generation_mode':'host-components','assembly_sha256':'c'*64,'intent_sha256':'d'*64}
        for kind in ('generate','repair'):
            row={'kind':kind,'input':{'generation_mode':'host-components'}}
            self.assertTrue(VisualJobs._valid_result(row,result))
            for key in ('assembly_sha256','intent_sha256'):
                for value in (None,True,'bad'):
                    candidate={**result,key:value}
                    if value is None:candidate.pop(key)
                    with self.subTest(kind=kind,key=key,value=value):self.assertFalse(VisualJobs._valid_result(row,candidate))
            for mode in ('source','host-motion','host-intent',None):
                self.assertFalse(VisualJobs._valid_result(row,{**result,'generation_mode':mode}))
                self.assertFalse(VisualJobs._valid_result({'kind':kind,'input':{'generation_mode':mode}},result))
            self.assertFalse(VisualJobs._valid_result(row,{**result,'requests_dispatched':3 if kind=='generate' else 2}))
        public=VisualJobs._public({'id':'j','project_id':'p','scene_id':'s','kind':'generate','state':'succeeded','stage':'done','error':None,'input':row['input'],'result':result})
        self.assertEqual(public['input_summary']['generation_mode'],'host-components')
        for key in ('assembly_sha256','intent_sha256'):self.assertEqual(public['result'][key],result[key])

    def test_intent_result_requires_frozen_mode_and_both_hashes(self):
        from services.visual.store import VisualJobs
        row={'kind':'generate','input':{'generation_mode':'host-intent'}}
        result={'sha256':'a'*64,'design_sha256':'b'*64,'source':'export {}','design':{},'requests_dispatched':2,'generation_mode':'host-intent','assembly_sha256':'c'*64,'intent_sha256':'d'*64}
        self.assertTrue(VisualJobs._valid_result(row,result))
        for change in ({'intent_sha256':None},{'assembly_sha256':None},{'generation_mode':'source'}):
            self.assertFalse(VisualJobs._valid_result(row,{**result,**change}))
        public=VisualJobs._public({'id':'j','project_id':'p','scene_id':'s','kind':'generate','state':'succeeded','stage':'done','error':None,'input':row['input'],'result':result})
        self.assertEqual(public['result']['intent_sha256'],'d'*64)
        for mode in ('source','host-motion'):
            for key in ('intent_sha256','assembly_sha256'):
                self.assertFalse(VisualJobs._valid_result({'kind':'generate','input':{'generation_mode':mode}},{**result,'generation_mode':mode,key:True}))
    def test_invalid_generation_mode_precedes_database_access(self):
        from services.visual.store import VisualJobs
        for mode in ('invalid',None,True,[]):
            with self.assertRaises(StoreError):VisualJobs(None).generate('bad','bad',1,True,2,mode)
    def test_budget_validation_precedes_database_access(self):
        from services.visual.store import VisualJobs
        jobs = VisualJobs(None)
        for maximum in (True, 1, 3):
            with self.assertRaises(StoreError):
                jobs.generate('bad', 'bad', 1, True, maximum)
        with self.assertRaises(StoreError):
            jobs.repair('bad', 'bad', False, 1, 'fix')
        for maximum in (True,1,3):
            with self.assertRaises(StoreError):jobs.revise_design('bad','bad',True,maximum,'fix')

    def test_public_result_is_allowlisted(self):
        from services.visual.store import VisualJobs
        row = {'id': uuid.uuid4(), 'project_id': uuid.uuid4(), 'scene_id': None,
               'kind': 'generate', 'state': 'succeeded', 'stage': 'complete',
               'created_at': None, 'error': None, 'input': {'secret': '/private'},
               'result': {'source': 'export {}', 'design': {'title': 'test'},
                          '_files': {'source.txt': 'a' * 64}, 'provider_response': 'secret',
                          'directory': '/private'}, 'accepted': False}
        public = VisualJobs._public(row)
        self.assertNotIn('input', public)
        self.assertEqual(public['result'], {'source': 'export {}', 'design': {'title': 'test'}})
        self.assertFalse(public['accepted'])


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Requires disposable TEST_DATABASE_URL')
class VisualStoreTests(unittest.TestCase):
    def setUp(self):
        from services.visual.store import VisualJobs
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(os.environ['TEST_DATABASE_URL'], self.temp.name, PROFILE)
        self.store.initialize()
        with self.store.connection() as conn:
            conn.execute(Path(__file__).parents[1].joinpath('visual/schema.sql').read_text())
            # Each run owns a disposable database, never operate on a shared stack.
            conn.execute('DELETE FROM visual_jobs')
        self.jobs = VisualJobs(self.store)
        self.project = self.store.create_project('Visual', 'Read then change.')
        self.pid = self.project['id']
        self.sid = str(uuid.uuid4())
        self.asset = {'id': 'voice', 'type': 'audio', 'checksum': 'a' * 64,
                      'storage_key': 'generated/voice.wav', 'duration_ms': 2000}
        self.scene = {'id': 'visual-test', 'type': 'card_sequence',
                      'narration': {'text': 'Read then change.', 'audio_asset_id': 'voice', 'audio_start_frame': 0},
                      'duration_frames': 60, 'captions': [{'text': 'Read then change.', 'start_frame': 0, 'end_frame': 60}],
                      'elements': [{'id': 'point', 'content': 'Read', 'cue': {'text_start': 0, 'text_end': 16}}]}
        with self.store.connection() as conn:
            config = copy.deepcopy(self.project['config']); config['assets'] = [self.asset]
            conn.execute('UPDATE projects SET config=%s WHERE id=%s', [Jsonb(config), self.pid])
            conn.execute('''INSERT INTO scenes(id,project_id,scene_key,position,state,scene)
                VALUES (%s,%s,'visual-test',0,'ready',%s)''', [self.sid, self.pid, Jsonb(self.scene)])

    def generate(self):
        return self.jobs.generate(self.pid, self.sid, 1, True, 2)

    def test_automatic_video_queues_isolated_render_then_at_most_one_repair_and_render(self):
        generation=self.jobs.generate(self.pid,self.sid,1,True,2,auto_render=True,auto_repair_requests=1)
        claim=self.jobs.claim('workflow')
        result={'sha256':'a'*64,'design_sha256':'d'*64,'source':'export default function Scene(){return null;}','design':{},'requests_dispatched':2}
        self.jobs.finish(generation['id'],claim['attempt_id'],result)
        preview=self.jobs.claim('render');self.assertTrue(preview['input']['isolated_render'])
        self.assertEqual(preview['input']['auto_repair_requests'],1)
        self.assertEqual(preview['input']['sha256'],'a'*64)
        failed={'sha256':'a'*64,'design_sha256':'d'*64,'geometry':{'status':'failed','issueCount':1,'motionChecks':0,'frames':{'0':{'issues':[{'kind':'label-route','target':'label','detail':'Crosses real route'}]}}},'frames':['stills/frame-0.png'],'frame_hashes':{'stills/frame-0.png':'c'*64},'_files':{'stills/frame-0.png':'c'*64}}
        self.jobs.finish(preview['id'],preview['attempt_id'],failed)
        repair=self.jobs.claim('workflow');self.assertTrue(repair['input']['auto_render'])
        self.assertEqual(repair['input']['auto_repair_requests'],0)
        self.jobs.finish(repair['id'],repair['attempt_id'],{**result,'sha256':'b'*64,'requests_dispatched':1})
        final=self.jobs.claim('render');self.assertTrue(final['input']['isolated_render'])
        self.assertNotIn('auto_repair_requests',final['input'])
        self.jobs.finish(final['id'],final['attempt_id'],{**failed,'sha256':'b'*64})
        self.assertIsNone(self.jobs.claim('workflow'));self.assertIsNone(self.jobs.claim('render'))

    def test_layout_failure_shares_one_repair_budget_and_never_renews_it_after_revision(self):
        parent=self.jobs.generate(self.pid,self.sid,1,True,2,auto_render=True,auto_repair_requests=1)
        claim=self.jobs.claim('workflow')
        self.jobs.finish(parent['id'],claim['attempt_id'],{'requests_dispatched':1},error='layout_preflight')
        revision=self.jobs.claim('workflow')
        self.assertEqual(revision['input']['design_revision_of'],parent['id'])
        self.assertEqual(revision['input']['auto_repair_requests'],0)
        self.assertIn('固定图案',revision['input']['feedback'])
        result={'sha256':'a'*64,'design_sha256':'d'*64,'source':'export default function Scene(){return null;}','design':{},'requests_dispatched':2}
        self.jobs.finish(revision['id'],revision['attempt_id'],result)
        render=self.jobs.claim('render');self.assertTrue(render['input']['isolated_render'])
        self.assertNotIn('auto_repair_requests',render['input'])
        self.jobs.cancel(self.pid,render['id'])
        self.assertIsNone(self.jobs.claim('workflow'));self.assertIsNone(self.jobs.claim('render'))
        self.assertEqual(self.jobs.repair_design_video(self.pid,parent['id'],True,2)['id'],revision['id'])
        self.assertIsNone(self.jobs.claim('workflow'))

    def test_layout_repair_failure_stops_and_no_allowance_means_no_automatic_revision(self):
        parent=self.jobs.generate(self.pid,self.sid,1,True,2,auto_render=True,auto_repair_requests=1)
        claim=self.jobs.claim('workflow');self.jobs.finish(parent['id'],claim['attempt_id'],{'requests_dispatched':1},error='layout_preflight')
        repair=self.jobs.claim('workflow')
        self.jobs.finish(repair['id'],repair['attempt_id'],{'requests_dispatched':1},error='layout_preflight')
        self.assertIsNone(self.jobs.claim('workflow'));self.assertIsNone(self.jobs.claim('render'))
        other=self.jobs.generate(self.pid,self.sid,1,True,2,auto_render=True)
        claim=self.jobs.claim('workflow');self.jobs.finish(other['id'],claim['attempt_id'],{'requests_dispatched':1},error='layout_preflight')
        self.assertIsNone(self.jobs.claim('workflow'))

    def failed_picture(self,automatic=0):
        generation=self.complete_generation()
        preview=self.jobs.preview(self.pid,generation['id'],True,self.sha,automatic)
        claim=self.jobs.claim('render')
        result={'sha256':self.sha,'design_sha256':'d'*64,'geometry':{'status':'failed','issueCount':1,'motionChecks':0,'frames':{'0':{'issues':[{'kind':'label-route','target':'label','detail':'Crosses real route'}]}}},'frames':['stills/frame-0.png'],'frame_hashes':{'stills/frame-0.png':'c'*64},'_files':{'stills/frame-0.png':'c'*64}}
        self.assertEqual(self.jobs.finish(preview['id'],claim['attempt_id'],result)['state'],'succeeded')
        return generation,preview

    def test_failed_picture_is_not_rendered_repeatedly_and_explicit_repair_uses_report(self):
        generation,preview=self.failed_picture()
        self.assertEqual(self.jobs.preview(self.pid,generation['id'],True,self.sha)['id'],preview['id'])
        self.assertIsNone(self.jobs.claim('render'))
        self.assertIsNone(self.jobs.claim('workflow'))
        for confirmed,maximum in ((False,1),(True,0),(True,2)):
            with self.assertRaises(StoreError):self.jobs.repair_preview(self.pid,preview['id'],confirmed,maximum)
        repair=self.jobs.repair_preview(self.pid,preview['id'],True,1)
        self.assertEqual(self.jobs.repair_preview(self.pid,preview['id'],True,1)['id'],repair['id'])
        raw=self.jobs.get_raw(self.pid,repair['id'])
        self.assertEqual(raw['input']['operation'],'quality-repair');self.assertIn('Crosses real route',raw['input']['feedback'])
        self.assertEqual(repair['input_summary']['max_requests'],1)
        self.assertEqual(self.jobs.get_raw(self.pid,preview['id'])['result']['geometry']['status'],'failed')

    def test_approved_check_can_queue_only_one_repair_but_never_execute_new_source(self):
        generation,preview=self.failed_picture(1)
        repairs=[j for j in self.jobs.list(self.pid) if j['kind']=='repair'];self.assertEqual(len(repairs),1)
        repair=repairs[0];self.assertEqual(repair['input_summary']['operation'],'quality-repair')
        claim=self.jobs.claim('workflow');self.assertEqual(claim['id'],repair['id'])
        result={'sha256':'f'*64,'design_sha256':'d'*64,'source':'export default function Scene(){return null;}','design':{},'requests_dispatched':1}
        self.assertEqual(self.jobs.finish(repair['id'],claim['attempt_id'],result)['state'],'succeeded')
        self.assertIsNone(self.jobs.claim('workflow'));self.assertIsNone(self.jobs.claim('render'))
        self.assertEqual(self.jobs.preview(self.pid,generation['id'],True,self.sha,1)['id'],repair['id'])
        self.assertIsNone(self.jobs.claim('workflow'))
        with self.assertRaises(StoreError):self.jobs.preview(self.pid,repair['id'],True,self.sha)
        self.assertEqual(self.jobs.get_raw(self.pid,preview['id'])['result']['geometry']['status'],'failed')

    def test_visual_first_draft_voice_alignment_acceptance_and_export_lifecycle(self):
        silent=copy.deepcopy(self.scene);silent['narration']={'text':'Read then change.'}
        with self.store.connection() as conn:
            conn.execute("UPDATE scenes SET state='needs_voice',scene=%s WHERE id=%s",[Jsonb(silent),self.sid])
        draft=self.jobs.generate(self.pid,self.sid,1,True,2,'source','draft')
        self.assertEqual(draft['input_summary']['timing_mode'],'draft')
        self.assertEqual(self.jobs.generate(self.pid,self.sid,1,True,2,'source','draft')['id'],draft['id'])
        claim=self.jobs.claim('workflow')
        result={'sha256':'a'*64,'design_sha256':'d'*64,'source':'export default function Scene(){return null}','design':{},'requests_dispatched':2}
        self.assertEqual(self.jobs.finish(draft['id'],claim['attempt_id'],result)['state'],'succeeded')
        preview=self.jobs.preview(self.pid,draft['id'],True,'a'*64);claim=self.jobs.claim('render')
        media={'sha256':'a'*64,'design_sha256':'d'*64,'geometry':{'status':'passed'},'frames':['stills/frame-0.png'],'frame_hashes':{'stills/frame-0.png':'c'*64},'video':'video.mp4','srt':'video.srt','_files':{'stills/frame-0.png':'c'*64,'video.mp4':'e'*64,'video.srt':'f'*64}}
        self.assertEqual(self.jobs.finish(preview['id'],claim['attempt_id'],media)['state'],'succeeded')
        with self.assertRaises(StoreError):self.jobs.accept(self.pid,preview['id'],True,'a'*64)
        with self.assertRaises(StoreError):self.jobs.align_draft(self.pid,draft['id'],True,'a'*64)
        with self.store.connection() as conn:
            conn.execute("UPDATE scenes SET state='ready',revision=revision+1,scene=%s WHERE id=%s",[Jsonb(self.scene),self.sid])
        self.assertTrue(self.jobs.get(self.pid,draft['id'])['current'])
        self.assertTrue(self.jobs.get(self.pid,preview['id'])['current'])
        aligned=self.jobs.align_draft(self.pid,draft['id'],True,'a'*64)
        self.assertEqual(aligned['input_summary']['max_requests'],0)
        self.assertEqual(self.jobs.align_draft(self.pid,draft['id'],True,'a'*64)['id'],aligned['id'])
        claim=self.jobs.claim('workflow')
        self.assertEqual(self.jobs.finish(aligned['id'],claim['attempt_id'],{**result,'sha256':'b'*64,'requests_dispatched':0})['state'],'succeeded')
        formal=self.jobs.preview(self.pid,aligned['id'],True,'b'*64);claim=self.jobs.claim('render')
        self.assertEqual(self.jobs.finish(formal['id'],claim['attempt_id'],{**media,'sha256':'b'*64})['state'],'succeeded')
        self.assertTrue(self.jobs.accept(self.pid,formal['id'],True,'b'*64)['accepted'])
        self.assertEqual(self.jobs.export(self.pid,1,True)['kind'],'export')
        with self.store.connection() as conn:
            changed=copy.deepcopy(self.scene);changed['narration']['text']='Changed narration.'
            conn.execute("UPDATE scenes SET revision=revision+1,scene=%s WHERE id=%s",[Jsonb(changed),self.sid])
        self.assertFalse(self.jobs.get(self.pid,draft['id'])['current'])
        self.assertFalse(self.jobs.get(self.pid,formal['id'])['accepted'])

    def test_source_recovery_migration_queue_dedup_and_explicit_repair(self):
        original=self.generate();claimed=self.jobs.claim('workflow')
        self.jobs.finish(original['id'],claimed['attempt_id'],{'requests_dispatched':2},error='execution_failed')
        with self.store.connection() as conn:
            conn.execute('ALTER TABLE visual_jobs DROP CONSTRAINT visual_jobs_kind_v6_check')
            conn.execute("ALTER TABLE visual_jobs ADD CONSTRAINT visual_jobs_kind_v3_check CHECK (kind IN ('generate','repair','preview','export','prepare-transfer','preview-transfer'))")
            conn.execute(Path(__file__).parents[1].joinpath('visual/schema.sql').read_text())
        recovery=self.jobs.recover_source(self.pid,original['id'],True)
        self.assertEqual(self.jobs.recover_source(self.pid,original['id'],True)['id'],recovery['id'])
        self.assertEqual(recovery['input_summary']['max_requests'],0)
        claimed=self.jobs.claim('workflow');self.assertEqual(claimed['kind'],'recover-source')
        result={'sha256':'a'*64,'design_sha256':'b'*64,'recovery_sha256':'c'*64,'source':'export default function Scene(){return null;}','design':{},'requests_dispatched':0,
            'generation_mode':'source','execution':'not_run','technical':'passed','visual':'pending','production_adopted':False,'diagnostic':True,
            '_files':{'source.txt':'d'*64,'design.json':'e'*64}}
        done=self.jobs.finish(recovery['id'],claimed['attempt_id'],result);self.assertEqual(done['state'],'succeeded');self.assertFalse(done['accepted'])
        with self.assertRaises(StoreError):self.jobs.preview(self.pid,recovery['id'],True,'a'*64)
        with self.assertRaises(StoreError):self.jobs.repair_source(self.pid,recovery['id'],True,1,'Fix','0'*64,'c'*64)
        repaired=self.jobs.repair_source(self.pid,recovery['id'],True,1,'Fix','a'*64,'c'*64)
        self.assertEqual(self.jobs.repair_source(self.pid,recovery['id'],True,1,'Fix','a'*64,'c'*64)['id'],repaired['id'])
        self.assertEqual(repaired['input_summary']['max_requests'],1);self.assertEqual(repaired['input_summary']['recovery_id'],recovery['id'])
        self.assertEqual(self.jobs.get(self.pid,original['id'])['state'],'failed')
        with self.store.connection() as conn:
            conn.execute(Path(__file__).parents[1].joinpath('visual/schema.sql').read_text())
            self.assertEqual(conn.execute('SELECT count(*) AS n FROM visual_jobs').fetchone()['n'],3)
        self.jobs.cancel(self.pid,repaired['id'])

    def test_layout_migration_proposal_and_one_code_adoption(self):
        original=self.generate();claimed=self.jobs.claim('workflow')
        self.jobs.finish(original['id'],claimed['attempt_id'],{'requests_dispatched':1},error='layout_preflight')
        with self.store.connection() as conn:
            conn.execute('ALTER TABLE visual_jobs DROP CONSTRAINT visual_jobs_kind_v6_check')
            conn.execute("ALTER TABLE visual_jobs ADD CONSTRAINT visual_jobs_kind_v4_check CHECK (kind IN ('generate','repair','preview','export','prepare-transfer','preview-transfer','recover-source'))")
            conn.execute(Path(__file__).parents[1].joinpath('visual/schema.sql').read_text())
        proposal=self.jobs.propose_layout(self.pid,original['id'],True)
        self.assertEqual(self.jobs.propose_layout(self.pid,original['id'],True)['id'],proposal['id'])
        claimed=self.jobs.claim('workflow');self.assertEqual(claimed['kind'],'propose-layout')
        from services.tests.test_layout_workbench import RESULT
        self.assertEqual(self.jobs.finish(proposal['id'],claimed['attempt_id'],copy.deepcopy(RESULT))['state'],'succeeded')
        with self.assertRaises(StoreError):self.jobs.preview(self.pid,proposal['id'],True,'a'*64)
        repaired=self.jobs.apply_layout(self.pid,proposal['id'],True,1,'a'*64,'c'*64)
        self.assertEqual(self.jobs.apply_layout(self.pid,proposal['id'],True,1,'a'*64,'c'*64)['id'],repaired['id'])
        self.assertEqual(repaired['input_summary']['max_requests'],1);self.assertEqual(repaired['input_summary']['layout_id'],proposal['id'])
        self.assertEqual(self.jobs.get(self.pid,original['id'])['state'],'failed');self.jobs.cancel(self.pid,repaired['id'])
        with self.store.connection() as conn:conn.execute(Path(__file__).parents[1].joinpath('visual/schema.sql').read_text())

    def test_intent_mode_deduplication_and_child_inheritance(self):
        self.check_mode_deduplication_and_child_inheritance('host-intent')

    def test_components_mode_deduplication_and_child_inheritance(self):
        self.check_mode_deduplication_and_child_inheritance('host-components')

    def check_mode_deduplication_and_child_inheritance(self,mode):
        host=self.jobs.generate(self.pid,self.sid,1,True,2,mode)
        self.assertEqual(self.jobs.generate(self.pid,self.sid,1,True,2,mode)['id'],host['id'])
        self.assertNotEqual(self.generate()['id'],host['id'])
        claim=self.jobs.claim('workflow');self.assertEqual(claim['id'],host['id'])
        self.jobs.finish(host['id'],claim['attempt_id'],{'requests_dispatched':1},error='failed')
        child=self.jobs.revise_design(self.pid,host['id'],True,2,'fix')
        self.assertEqual(child['input_summary']['generation_mode'],mode)
        repair=self.jobs.repair(self.pid,host['id'],True,1,'fix')
        self.assertEqual(repair['input_summary']['generation_mode'],mode)

    def test_host_mode_is_frozen_deduplicated_and_inherited_by_design_revision(self):
        host=self.jobs.generate(self.pid,self.sid,1,True,2,'host-motion')
        self.assertEqual(host['input_summary']['generation_mode'],'host-motion')
        self.assertEqual(self.jobs.generate(self.pid,self.sid,1,True,2,'host-motion')['id'],host['id'])
        self.assertNotEqual(self.generate()['id'],host['id'])
        claim=self.jobs.claim('workflow')
        self.assertEqual(claim['id'],host['id'])
        self.jobs.finish(host['id'],claim['attempt_id'],{'requests_dispatched':1},error='failed')
        child=self.jobs.revise_design(self.pid,host['id'],True,2,'fix')
        self.assertEqual(self.jobs.get_raw(self.pid,child['id'])['input']['generation_mode'],'host-motion')

    def test_host_mode_repair_inherits_parent_without_an_override(self):
        host=self.jobs.generate(self.pid,self.sid,1,True,2,'host-motion');claim=self.jobs.claim('workflow')
        self.jobs.finish(host['id'],claim['attempt_id'],{'requests_dispatched':2},error='failed')
        child=self.jobs.repair(self.pid,host['id'],True,1,'fix')
        self.assertEqual(self.jobs.get_raw(self.pid,child['id'])['input']['generation_mode'],'host-motion')

    def test_design_revision_reuses_snapshot_and_deduplicates_without_retrying_parent(self):
        parent=self.generate();claim=self.jobs.claim('workflow')
        self.jobs.finish(parent['id'],claim['attempt_id'],{'requests_dispatched':1},error='failed')
        revision=self.jobs.revise_design(self.pid,parent['id'],True,2,'修正标签状态衔接')
        duplicate=self.jobs.revise_design(self.pid,parent['id'],True,2,'修正标签状态衔接')
        self.assertEqual(revision['id'],duplicate['id'])
        raw=self.jobs.get_raw(self.pid,revision['id'])
        self.assertEqual(raw['kind'],'generate')
        self.assertEqual(raw['input']['design_revision_of'],parent['id'])
        self.assertEqual(raw['input']['cues'],self.jobs.get_raw(self.pid,parent['id'])['input']['cues'])
        self.assertEqual(self.jobs.get(self.pid,parent['id'])['state'],'failed')

    def test_design_revision_rejects_code_failures(self):
        parent=self.generate();claim=self.jobs.claim('workflow')
        self.jobs.finish(parent['id'],claim['attempt_id'],{'requests_dispatched':2},error='failed')
        with self.assertRaises(StoreError):self.jobs.revise_design(self.pid,parent['id'],True,2,'fix')

    def test_design_revision_rejects_a_changed_chapter_before_submission(self):
        parent=self.generate();claim=self.jobs.claim('workflow')
        self.jobs.finish(parent['id'],claim['attempt_id'],{'requests_dispatched':1},error='failed')
        with self.store.connection() as conn:conn.execute('UPDATE scenes SET revision=revision+1 WHERE id=%s',[self.sid])
        with self.assertRaises(StoreError):self.jobs.revise_design(self.pid,parent['id'],True,2,'fix')

    def complete_generation(self):
        job = self.generate(); claim = self.jobs.claim('workflow')
        self.assertEqual(job['id'], claim['id'])
        source = 'export const Scene = () => null;'
        self.sha = hashlib.sha256(source.encode()).hexdigest()
        result = {'sha256': self.sha, 'design_sha256': 'd' * 64, 'source': source,
                  'design': {'test': True}, 'rationale': 'test', 'requests_dispatched': 2,
                  '_files': {'source.txt': self.sha, 'design.json': 'b' * 64}}
        return self.jobs.finish(job['id'], claim['attempt_id'], result)

    def complete_preview(self):
        generation = self.complete_generation()
        job = self.jobs.preview(self.pid, generation['id'], True, self.sha)
        claim = self.jobs.claim('render')
        result = {'sha256': self.sha, 'design_sha256': 'd' * 64,
                  'geometry': {'status': 'passed'}, 'frames': ['stills/frame-0.png'],
                  'frame_hashes': {'stills/frame-0.png': 'c' * 64},
                  'video': 'video.mp4', 'srt': 'video.srt',
                  '_files': {'video.mp4': 'e' * 64, 'video.srt': 'f' * 64, 'stills/frame-0.png': 'c' * 64}}
        return self.jobs.finish(job['id'], claim['attempt_id'], result)

    def test_project_scope_and_private_snapshot(self):
        job = self.generate()
        other = self.store.create_project('Other', 'Unrelated.')
        self.assertEqual(self.jobs.list(other['id']), [])
        for method in (self.jobs.get, self.jobs.get_raw, self.jobs.cancel):
            with self.assertRaisesRegex(StoreError, 'not_found'):
                method(other['id'], job['id'])
        raw = self.jobs.get_raw(self.pid, job['id'])
        self.assertEqual(set(raw['input']), {'brief', 'cues', 'scene', 'asset', 'fingerprint'})
        self.assertNotIn('input', self.jobs.get(self.pid, job['id']))
        self.assertEqual(self.jobs.get(self.pid, job['id'])['input_summary']['max_requests'], 2)

    def test_revision_and_not_ready_fail_closed(self):
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.generate(self.pid, self.sid, 2, True, 2)
        with self.store.connection() as conn:
            conn.execute("UPDATE scenes SET state='needs_voice' WHERE id=%s", [self.sid])
        with self.assertRaisesRegex(StoreError, 'not_ready'):
            self.generate()

    def test_generate_uses_project_revision_not_scene_revision(self):
        with self.store.connection() as conn:
            conn.execute('UPDATE projects SET revision=3 WHERE id=%s', [self.pid])
        job = self.jobs.generate(self.pid, self.sid, 3, True, 2)
        self.assertEqual(job['state'], 'queued')
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.generate(self.pid, self.sid, 1, True, 2)

    def test_layout_preflight_failure_is_actionable_without_raw_provider_details(self):
        job=self.generate();claim=self.jobs.claim('workflow')
        result=self.jobs.finish(job['id'],claim['attempt_id'],{'requests_dispatched':1},error='layout_preflight')
        self.assertEqual(result['state'],'failed')
        self.assertIn('布局',result['error']);self.assertIn('尚未生成视频',result['error'])
        self.assertNotIn('请调整',result['error'])

    def test_compilation_failure_uses_only_the_unused_shared_repair_allowance(self):
        job=self.jobs.generate(self.pid,self.sid,1,True,2,auto_render=True,auto_repair_requests=1)
        claim=self.jobs.claim('workflow')
        failed=self.jobs.finish(job['id'],claim['attempt_id'],{'requests_dispatched':2},error='source_typecheck')
        self.assertIn('编译检查',failed['error']);self.assertNotIn('本地运行记录',failed['error'])
        repair=self.jobs.claim('workflow');self.assertEqual(repair['input']['generation_id'],job['id'])
        self.assertTrue(repair['input']['automatic_code_repair']);self.assertEqual(repair['input']['auto_repair_requests'],0)
        self.jobs.finish(repair['id'],repair['attempt_id'],{'requests_dispatched':1},error='source_typecheck')
        self.assertIsNone(self.jobs.claim('workflow'));self.assertIsNone(self.jobs.claim('render'))

    def test_claim_is_fenced_and_never_retries(self):
        job = self.generate(); claim = self.jobs.claim('workflow')
        self.assertIsNone(self.jobs.claim('workflow'))

        self.assertFalse(self.jobs.heartbeat(job['id'], str(uuid.uuid4())))
        self.assertTrue(self.jobs.heartbeat(job['id'], claim['attempt_id']))
        with self.store.connection() as conn:
            conn.execute("UPDATE visual_jobs SET heartbeat_at=now()-interval '61 seconds' WHERE id=%s", [job['id']])
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.finish(job['id'], claim['attempt_id'], {})
        self.assertIsNone(self.jobs.claim('workflow'))
        self.assertEqual(self.jobs.get(self.pid, job['id'])['state'], 'failed')
        self.assertIsNone(self.jobs.claim('workflow'))

    def test_duplicate_active_submission_reuses_one_paid_job(self):
        job=self.generate()
        self.assertEqual(self.generate()['id'],job['id'])
        claim=self.jobs.claim('workflow')
        self.assertEqual(self.generate()['id'],claim['id'])
        self.jobs.cancel(self.pid,job['id'])
        self.assertNotEqual(self.generate()['id'],job['id'])

    def test_cancel_fences_late_finish(self):
        job = self.generate(); claim = self.jobs.claim('workflow')
        self.assertEqual(self.jobs.cancel(self.pid, job['id'])['state'], 'cancelled')
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.finish(job['id'], claim['attempt_id'], {})

    def test_failed_result_keeps_private_files_and_bounded_request_count(self):
        job = self.generate(); claim = self.jobs.claim('workflow')
        result = self.jobs.finish(job['id'], claim['attempt_id'],
                                {'requests_dispatched': 1, '_files': {'source.txt': 'a' * 64}, 'raw': 'secret'},
                                error='private provider response')
        self.assertEqual(result['state'], 'failed')
        self.assertNotIn('private provider response', str(result))
        self.assertEqual(result['result'], {'requests_dispatched': 1})
        self.assertIn('_files', self.jobs.get_raw(self.pid, job['id'])['result'])

    def test_hash_approval_and_repair_snapshot(self):
        job = self.complete_generation()
        for confirmed, sha in ((False, self.sha), (True, 'f' * 64)):
            with self.assertRaises(StoreError):
                self.jobs.preview(self.pid, job['id'], confirmed, sha)
        repair = self.jobs.repair(self.pid, job['id'], True, 1, 'move the label')
        raw = self.jobs.get_raw(self.pid, repair['id'])
        self.assertEqual(raw['input']['generation_id'], job['id'])
        self.assertEqual(raw['input']['fingerprint'], self.jobs.get_raw(self.pid, job['id'])['input']['fingerprint'])
        self.assertEqual(repair['input_summary']['max_requests'], 1)

    def test_accept_and_export_bind_current_media(self):
        preview = self.complete_preview()
        accepted = self.jobs.accept(self.pid, preview['id'], True, self.sha)
        self.assertTrue(accepted['accepted'])
        export = self.jobs.export(self.pid, 1, True)
        chapter = self.jobs.get_raw(self.pid, export['id'])['input']['chapters'][0]
        self.assertEqual(chapter['scene_id'], self.sid)
        self.assertEqual(chapter['asset'], self.asset)
        with self.store.connection() as conn:
            config = self.store._read(conn, self.pid)['config']
            config['assets'][0]['checksum'] = 'b' * 64
            conn.execute('UPDATE projects SET config=%s WHERE id=%s', [Jsonb(config), self.pid])
        self.assertFalse(self.jobs.get(self.pid, preview['id'])['accepted'])
        with self.assertRaises(StoreError): self.jobs.accept(self.pid, preview['id'], True, self.sha)
        with self.assertRaises(StoreError): self.jobs.export(self.pid, 1, True)
        claim = self.jobs.claim('render')
        done = self.jobs.finish(claim['id'], claim['attempt_id'], {'video': 'video.mp4', 'srt': 'video.srt', 'durationInFrames': 60})
        self.assertEqual(done['state'], 'failed'); self.assertIn('stale', done['error'])

    def test_snapshot_changes_before_finish_are_not_published(self):
        job = self.generate(); claim = self.jobs.claim('workflow')
        with self.store.connection() as conn:
            conn.execute('UPDATE scenes SET revision=revision+1 WHERE id=%s', [self.sid])
        done = self.jobs.finish(job['id'], claim['attempt_id'], {'requests_dispatched': 1})
        self.assertEqual(done['state'], 'failed'); self.assertIn('stale', done['error'])

    def test_geometry_failure_cannot_be_accepted(self):
        generation = self.complete_generation()
        job = self.jobs.preview(self.pid, generation['id'], True, self.sha)
        claim = self.jobs.claim('render')
        self.jobs.finish(job['id'], claim['attempt_id'], {'sha256': self.sha, 'design_sha256': 'd' * 64,
                                                      'geometry': {'status': 'failed'}, 'frames': [], 'frame_hashes': {}})
        with self.assertRaises(StoreError): self.jobs.accept(self.pid, job['id'], True, self.sha)
        with self.assertRaises(StoreError): self.jobs.export(self.pid, 1, True)

    def test_prepare_only_empty_and_preserves_all_narration(self):
        text = ('A sentence. ' * 150)
        project = self.store.create_project('Prepare', text)
        prepared = self.jobs.prepare(project['id'], 1)
        self.assertEqual(''.join(s['scene']['narration']['text'] for s in prepared['scenes']), text)
        self.assertTrue(all(len(s['scene']['narration']['text']) <= 800 for s in prepared['scenes']))
        self.assertTrue(all(s['state'] == 'needs_voice' for s in prepared['scenes']))
        self.assertEqual(self.jobs.prepare(project['id'], prepared['revision']), prepared)

    def test_failed_generation_can_be_explicitly_repaired_without_retry(self):
        job = self.generate(); claim = self.jobs.claim('workflow')
        self.jobs.finish(job['id'], claim['attempt_id'], {'requests_dispatched': 2}, error='typecheck failed')
        self.assertIsNone(self.jobs.claim('workflow'))
        repair = self.jobs.repair(self.pid, job['id'], True, 1, 'fix the type error')
        self.assertEqual(repair['kind'], 'repair')
        self.assertEqual(self.jobs.get_raw(self.pid, repair['id'])['input']['generation_id'], job['id'])

    def test_multi_chapter_export_lifecycle_invalidation_and_recovery(self):
        sid2 = str(uuid.uuid4())
        asset2 = {'id': 'voice-2', 'type': 'audio', 'checksum': 'b' * 64,
                  'storage_key': 'generated/voice-2.wav', 'duration_ms': 3000}
        scene2 = {'id': 'visual-test-2', 'type': 'card_sequence',
                  'narration': {'text': 'Second chapter.', 'audio_asset_id': 'voice-2', 'audio_start_frame': 0},
                  'duration_frames': 90, 'captions': [{'text': 'Second chapter.', 'start_frame': 0, 'end_frame': 90}],
                  'elements': [{'id': 'point-2', 'content': 'Second', 'cue': {'text_start': 0, 'text_end': 15}}]}
        with self.store.connection() as conn:
            config = copy.deepcopy(self.store._read(conn, self.pid)['config'])
            config['assets'].append(asset2)
            conn.execute('UPDATE projects SET config=%s WHERE id=%s', [Jsonb(config), self.pid])
            conn.execute('''INSERT INTO scenes(id,project_id,scene_key,position,state,scene)
                VALUES (%s,%s,'visual-test-2',1,'ready',%s)''', [sid2, self.pid, Jsonb(scene2)])
        p1 = self.complete_preview()
        self.assertTrue(self.jobs.accept(self.pid, p1['id'], True, self.sha)['accepted'])
        # Export is blocked while chapter 2 has no accepted preview
        with self.assertRaisesRegex(StoreError, 'Every current chapter needs an accepted preview'):
            self.jobs.export(self.pid, 1, True)
        # Chapter 2 generation crashes / loses lease on restart: recovered as failed without auto-retry
        g2 = self.jobs.generate(self.pid, sid2, 1, True, 2)
        c2 = self.jobs.claim('workflow')
        self.assertEqual(c2['id'], g2['id'])
        with self.store.connection() as conn:
            conn.execute("UPDATE visual_jobs SET heartbeat_at=now()-interval '61 seconds' WHERE id=%s", [g2['id']])
            # Simulate retained 2-request code failure record before crash
            conn.execute("UPDATE visual_jobs SET result=%s WHERE id=%s", [Jsonb({'requests_dispatched': 2}), g2['id']])
        self.assertIsNone(self.jobs.claim('workflow'))
        failed_g2 = self.jobs.get(self.pid, g2['id'])
        self.assertEqual(failed_g2['state'], 'failed')
        # Explicit 1-request repair recovers chapter 2 without retrying the 2-request parent
        r2 = self.jobs.repair(self.pid, g2['id'], True, 1, 'fix crash candidate')
        self.assertEqual(self.jobs.repair(self.pid, g2['id'], True, 1, 'fix crash candidate')['id'], r2['id'])
        rc2 = self.jobs.claim('workflow')
        sha2 = 'e' * 64
        self.jobs.finish(r2['id'], rc2['attempt_id'], {
            'sha256': sha2, 'design_sha256': 'f' * 64, 'source': 'export default function S(){return null;}',
            'design': {'test': 2}, 'rationale': 'r2', 'requests_dispatched': 1,
            '_files': {'source.txt': sha2, 'design.json': 'f' * 64},
        })
        pv2 = self.jobs.preview(self.pid, r2['id'], True, sha2)
        pvc2 = self.jobs.claim('render')
        self.jobs.finish(pv2['id'], pvc2['attempt_id'], {
            'sha256': sha2, 'design_sha256': 'f' * 64, 'geometry': {'status': 'passed'},
            'frames': ['stills/frame-0.png'], 'frame_hashes': {'stills/frame-0.png': 'c' * 64},
            'video': 'video.mp4', 'srt': 'video.srt',
            '_files': {'video.mp4': '1' * 64, 'video.srt': '2' * 64, 'stills/frame-0.png': 'c' * 64},
        })
        self.assertTrue(self.jobs.accept(self.pid, pv2['id'], True, sha2)['accepted'])
        # Deduplicated export submission, cancellation fencing, and fresh export completion
        exp1 = self.jobs.export(self.pid, 1, True)
        self.assertEqual(self.jobs.export(self.pid, 1, True)['id'], exp1['id'])
        ec1 = self.jobs.claim('render')
        self.assertEqual(self.jobs.cancel(self.pid, exp1['id'])['state'], 'cancelled')
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.finish(exp1['id'], ec1['attempt_id'], {'video': 'video.mp4', 'srt': 'video.srt', 'durationInFrames': 150})
        exp2 = self.jobs.export(self.pid, 1, True)
        self.assertNotEqual(exp2['id'], exp1['id'])
        ec2 = self.jobs.claim('render')
        done_exp = self.jobs.finish(exp2['id'], ec2['attempt_id'], {
            'video': 'video.mp4', 'srt': 'video.srt', 'durationInFrames': 150,
            '_files': {'video.mp4': '3' * 64, 'video.srt': '4' * 64},
        })
        self.assertEqual(done_exp['state'], 'succeeded')
        self.assertTrue(done_exp['current'])
        # Editing chapter 2 invalidates chapter 2 acceptance and marks the previous export non-current
        with self.store.connection() as conn:
            conn.execute('UPDATE scenes SET revision=revision+1 WHERE id=%s', [sid2])
        self.assertTrue(self.jobs.get(self.pid, p1['id'])['accepted'])
        self.assertFalse(self.jobs.get(self.pid, pv2['id'])['accepted'])
        self.assertFalse(self.jobs.get(self.pid, exp2['id'])['current'])
        with self.assertRaisesRegex(StoreError, 'Every current chapter needs an accepted preview'):
            self.jobs.export(self.pid, 1, True)

    def test_delete_blocks_active_then_deletes_terminal_visual_history(self):
        project = self.store.create_project('Delete', 'A chapter.')
        prepared = self.jobs.prepare(project['id'], 1)
        scene = prepared['scenes'][0]
        with self.store.connection() as conn:
            conn.execute('''INSERT INTO visual_jobs(id,project_id,scene_id,kind,input)
                VALUES (%s,%s,%s,'generate','{}')''', [str(uuid.uuid4()), project['id'], scene['id']])
        with self.assertRaisesRegex(StoreError, 'not_ready'):
            self.store.delete_project(project['id'], prepared['revision'], True)
        job = self.jobs.list(project['id'])[0]
        self.jobs.cancel(project['id'], job['id'])
        self.store.delete_project(project['id'], prepared['revision'], True)
        with self.assertRaisesRegex(StoreError, 'not_found'):
            self.jobs.list(project['id'])


if __name__ == '__main__':
    unittest.main()
