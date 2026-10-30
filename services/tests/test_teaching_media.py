import copy
import hashlib
import os
import unittest
import wave
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from psycopg.types.json import Jsonb
from services.tests import test_teaching_renders
from services.projects.store import StoreError
from services.visual.teaching_pipeline import pipeline_binding
from services.visual.teaching_tasks import fingerprint
from services.visual.teaching_media import TeachingMedia,run_once


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'),'Requires disposable PostgreSQL')
class TeachingMediaTests(unittest.TestCase):
    def setUp(self):
        fixture=test_teaching_renders.TeachingRenderQueueTests('test_only_owned_bound_file_is_published_and_resume_does_not_render_again')
        fixture.setUp();self.addCleanup(fixture.doCleanups);self.fixture=fixture
        self.store=fixture.store;self.pid=fixture.pid;self.rid=fixture.root['id'];self.tasks=fixture.workbench.tasks
        self.media=TeachingMedia(self.store)
        if self._testMethodName=='test_rebinding_does_not_mutate_or_extend_an_exhausted_root_budget':
            self.exhaust_budget_before_voice_change()
        self.audio=self.store.public/'generated/voice.wav';self.audio.parent.mkdir(parents=True)
        with wave.open(str(self.audio),'wb') as stream:
            stream.setnchannels(1);stream.setsampwidth(2);stream.setframerate(24000);stream.writeframes(b'\0\0'*96000)
        self.asset={'id':'voice','type':'audio','storage_key':'generated/voice.wav',
            'checksum':hashlib.sha256(self.audio.read_bytes()).hexdigest(),'duration_ms':4000}
        project=self.store.get_project(self.pid);row=project['scenes'][0];scene=copy.deepcopy(row['scene'])
        scene['narration'].update(audio_asset_id='voice',audio_start_frame=6)
        scene.update(duration_frames=132,captions=[{'text':'先观察。','start_frame':6,'end_frame':60},
            {'text':'再执行。','start_frame':66,'end_frame':126}])
        config=copy.deepcopy(project['config']);config['assets']=[self.asset]
        with self.store.connection() as conn:
            conn.execute("UPDATE scenes SET scene=%s,state='ready',revision=revision+1 WHERE id=%s",[Jsonb(scene),fixture.sid])
            conn.execute('UPDATE projects SET config=%s,revision=revision+1 WHERE id=%s',[Jsonb(config),self.pid])

    def exhaust_budget_before_voice_change(self):
        checkpoint=self.tasks.checkpoint(self.pid,self.rid)
        old=pipeline_binding(checkpoint['root']['snapshot_sha256'],'plan')
        artifact=self.tasks.get_cache(self.pid,self.rid,'artifact',old)['payload']
        call=self.tasks.reserve(self.pid,self.rid,'revision','d'*64)
        self.tasks.finish(self.pid,self.rid,call['id'],call['dispatch_token'],'succeeded',{'test':'retained'})
        new=pipeline_binding(checkpoint['root']['snapshot_sha256'],'revision')
        self.tasks.save_cache(self.pid,self.rid,'artifact',new,artifact)

    def test_concurrent_submission_and_claim_have_one_owner_and_no_extra_budget(self):
        with ThreadPoolExecutor(4) as pool:jobs=list(pool.map(lambda _:self.media.enqueue(self.pid,self.rid),range(4)))
        self.assertEqual(len({j['id'] for j in jobs}),1)
        with ThreadPoolExecutor(4) as pool:claims=list(pool.map(lambda _:self.media.claim(self.pid,jobs[0]['id']),range(4)))
        self.assertEqual(sum(c is not None for c in claims),1)
        self.assertEqual(self.tasks.get(self.pid,self.rid)['requests_used'],1)

    def test_real_compiler_and_audio_check_persist_an_immutable_binding_without_rendering(self):
        job=self.media.enqueue(self.pid,self.rid)
        with patch('httpx.Client',side_effect=AssertionError('No network')):
            result=run_once(TeachingMedia(self.store))
        self.assertEqual(result['id'],job['id']);self.assertEqual(result['state'],'succeeded')
        self.assertFalse(result['video_ready']);self.assertFalse(result['accepted'])
        self.assertEqual(result['stage'],'audio-bound')
        bound=self.media.binding(self.pid,job['id'])
        self.assertEqual(bound['verification']['audio_sha256'],self.asset['checksum'])
        self.assertEqual(bound['package']['artifact']['brief']['durationInFrames'],132)
        with patch('services.visual.teaching_media.bind_teaching_audio',side_effect=AssertionError('No repeat')):
            self.assertIsNone(run_once(TeachingMedia(self.store)))
            self.assertEqual(self.media.enqueue(self.pid,self.rid),result)
        self.assertEqual(self.tasks.get(self.pid,self.rid)['requests_used'],1)
        with self.store.connection() as conn:
            self.assertEqual(conn.execute('SELECT count(*) AS n FROM teaching_render_jobs WHERE root_id=%s',[self.rid]).fetchone()['n'],1)

    def test_cancel_or_expired_claim_never_publishes_or_restarts(self):
        job=self.media.enqueue(self.pid,self.rid);claim=self.media.claim(self.pid,job['id'])
        with self.store.connection() as conn:
            conn.execute("UPDATE teaching_media_jobs SET deadline=clock_timestamp()-interval '1 second' WHERE id=%s",[job['id']])
        self.assertEqual(self.media.get(self.pid,job['id'])['state'],'interrupted')
        self.assertIsNone(self.media.claim(self.pid,job['id']))
        self.tasks.cancel(self.pid,self.rid)
        self.assertEqual(self.media.get(self.pid,job['id'])['state'],'cancelled')
        with self.assertRaises(StoreError):self.media.finish(self.pid,job['id'],claim['token'],{})

    def test_changed_audio_or_corruption_stops_without_recreating_a_plan(self):
        job=self.media.enqueue(self.pid,self.rid);self.audio.write_bytes(b'bad')
        result=run_once(self.media)
        self.assertEqual(result['state'],'failed');self.assertFalse(result['video_ready'])
        self.assertIsNone(run_once(self.media))
        self.assertEqual(self.media.enqueue(self.pid,self.rid)['id'],job['id'])
        self.assertEqual(self.tasks.get(self.pid,self.rid)['requests_used'],1)
        with self.assertRaises(StoreError):self.media.binding(self.pid,job['id'])

    def test_rebinding_does_not_mutate_or_extend_an_exhausted_root_budget(self):
        checkpoint=self.tasks.checkpoint(self.pid,self.rid)
        self.media.enqueue(self.pid,self.rid);self.assertEqual(run_once(self.media)['state'],'succeeded')
        after=self.tasks.checkpoint(self.pid,self.rid)
        self.assertEqual(after['root']['requests_used'],2);self.assertEqual(after['snapshot'],checkpoint['snapshot'])

    def test_changed_root_evidence_is_rejected_before_submission(self):
        snapshot=self.tasks.checkpoint(self.pid,self.rid)['snapshot']
        snapshot['media']['scene_revision']+=10
        with self.store.connection() as conn:
            conn.execute('UPDATE teaching_task_roots SET snapshot=%s WHERE id=%s',[Jsonb(snapshot),self.rid])
        with self.assertRaises(StoreError):self.media.enqueue(self.pid,self.rid)

    def test_changed_persisted_result_cannot_be_reported_as_completed(self):
        job=self.media.enqueue(self.pid,self.rid);self.assertEqual(run_once(self.media)['state'],'succeeded')
        with self.store.connection() as conn:
            conn.execute('UPDATE teaching_media_jobs SET result=%s WHERE id=%s',[Jsonb({'changed':True}),job['id']])
        with self.assertRaises(StoreError):self.media.get(self.pid,job['id'])
        with self.assertRaises(StoreError):self.media.binding(self.pid,job['id'])

    def test_binding_cannot_claim_visual_acceptance(self):
        from services.visual.teaching_timing import bind_teaching_audio
        self.media.enqueue(self.pid,self.rid)
        def dishonest(*args):
            result=bind_teaching_audio(*args);result['accepted']=True
            result['binding_sha256']=fingerprint({k:v for k,v in result.items() if k!='binding_sha256'},8*1024*1024)
            return result
        with patch('services.visual.teaching_media.bind_teaching_audio',side_effect=dishonest):
            result=run_once(self.media)
        self.assertEqual(result['state'],'failed');self.assertFalse(result['accepted'])

    def test_unhealthy_queue_expires_and_healthy_busy_queue_is_retained(self):
        job=self.media.enqueue(self.pid,self.rid)
        with self.store.connection() as conn:
            conn.execute("UPDATE teaching_media_jobs SET created_at=clock_timestamp()-interval '3 minutes' WHERE id=%s",[job['id']])
        with patch('services.visual.teaching_media.WorkerHealth.ready',return_value=True):
            self.assertEqual(self.media.get(self.pid,job['id'])['state'],'queued')
        with patch('services.visual.teaching_media.WorkerHealth.ready',return_value=False):
            self.assertEqual(self.media.get(self.pid,job['id'])['error_code'],'executor-unavailable')

    def test_changed_content_before_claim_stops_without_compiling(self):
        job=self.media.enqueue(self.pid,self.rid)
        project=self.store.get_project(self.pid);scene=copy.deepcopy(project['scenes'][0]['scene'])
        scene['narration']['text']='不同内容。'
        with self.store.connection() as conn:
            conn.execute('UPDATE scenes SET scene=%s,revision=revision+1 WHERE id=%s',[Jsonb(scene),self.fixture.sid])
        with patch('services.visual.teaching_media.bind_teaching_audio',side_effect=AssertionError('No stale compile')):
            result=run_once(self.media)
        self.assertEqual(result['state'],'failed');self.assertEqual(result['error_code'],'input-changed')

    def test_cancellation_during_compilation_rejects_late_result(self):
        from services.visual.teaching_timing import bind_teaching_audio
        job=self.media.enqueue(self.pid,self.rid)
        def cancel(*args):
            result=bind_teaching_audio(*args);self.tasks.cancel(self.pid,self.rid);return result
        with patch('services.visual.teaching_media.bind_teaching_audio',side_effect=cancel):
            result=run_once(self.media)
        self.assertEqual(result['state'],'cancelled')
        with self.assertRaises(StoreError):self.media.binding(self.pid,job['id'])

    def test_foreign_scope_and_active_deletion_are_blocked_until_cancelled(self):
        import uuid
        job=self.media.enqueue(self.pid,self.rid)
        with self.assertRaises(StoreError):self.media.get(str(uuid.uuid4()),job['id'])
        project=self.store.get_project(self.pid)
        with self.assertRaises(StoreError):self.store.delete_project(self.pid,project['revision'],True)
        self.tasks.cancel(self.pid,self.rid)
        self.store.delete_project(self.pid,project['revision'],True)
