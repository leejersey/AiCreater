import os
import tempfile
import unittest
import uuid
import hashlib
import threading
import time
import subprocess
import shutil
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from types import SimpleNamespace

from services.projects.store import Store, StoreError
from services.tests.test_projects import PROFILE
from services.visual.teaching_workbench import TeachingWorkbench
from services.visual.teaching_renders import TeachingRenders, render_frozen, RenderInterrupted


class TeachingRenderAdapterTests(unittest.TestCase):
    def test_render_child_does_not_receive_credentials_or_accept_missing_receipts(self):
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'private','DATABASE_URL':'private'}), patch('services.visual.teaching_renders.run_owned',return_value=SimpleNamespace(returncode=0,stdout='no receipt')) as launch:
            with self.assertRaises(StoreError): render_frozen({},'a'*64,'/tmp/test-only-not-created')
        self.assertNotIn('DEEPSEEK_API_KEY',launch.call_args.kwargs['env']); self.assertNotIn('DATABASE_URL',launch.call_args.kwargs['env'])
        self.assertTrue(launch.call_args.args[0][1].endswith('scripts/teaching-render-isolated.ts'))

    def test_unconfirmed_container_cleanup_keeps_execution_interrupted(self):
        with patch('services.visual.teaching_renders.run_owned',return_value=SimpleNamespace(returncode=2,stdout='')):
            with self.assertRaises(RenderInterrupted): render_frozen({},'a'*64,'/tmp/test-only-not-created')

    def test_positive_host_exit_without_cleanup_proof_is_still_interrupted(self):
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp).resolve()/str(uuid.uuid4());output.mkdir()
            (output/'execution.json').write_text('{}')
            with patch('services.visual.teaching_renders.run_owned',return_value=SimpleNamespace(returncode=1,stdout='')):
                with self.assertRaises(RenderInterrupted):render_frozen({},'a'*64,output)

    def test_wrong_or_duplicate_receipts_are_rejected(self):
        import json
        line='TEACHING_RESULT: '+json.dumps({'status':'preview-ready','inputSha256':'b'*64})
        for output in (line,line+'\n'+line):
            with patch('services.visual.teaching_renders.run_owned',return_value=SimpleNamespace(returncode=0,stdout=output)):
                with self.assertRaises(StoreError): render_frozen({},'a'*64,'/tmp/test-only-not-created')


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Requires disposable PostgreSQL')
class TeachingRenderQueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store = Store(os.environ['TEST_DATABASE_URL'], self.temp.name, PROFILE)
        self.store.initialize(); self.workbench = TeachingWorkbench(self.store)
        self.workbench.tasks.initialize()
        project = self.store.create_project('Queue', '先观察。再执行。')
        self.project = self.store.add_scene(project['id'], 1, '先观察。再执行。', '状态变化')
        self.pid = self.project['id']; self.sid = self.project['scenes'][0]['id']
        self.root = self.workbench.prepare(self.pid, self.sid, self.project['revision'], str(uuid.uuid4()), 'draft', True, 2)
        def cancel_fixture():
            try:self.workbench.tasks.cancel(self.pid,self.root['id'])
            except StoreError as error:
                if error.code!='not_found':raise
        self.addCleanup(cancel_fixture)
        from services.visual.teaching_pipeline import TeachingPipeline
        def provider(request):
            cues = request['outputSchema']['schema']['properties']['beats']['items']['properties']['cueId']['enum']
            return {'schemaVersion':'teaching-scene-plan:1','inputSha256':request['inputSha256'],'structure':'state-change',
                'objects':[{'id':'status','component':'indicator','meaning':'status','label':'状态','ownerId':None,'initialState':'idle'}],
                'relations':[], 'beats':[{'cueId':cue,'actions':[{'kind':'transition','objectId':'status','fromState':'idle','toState':'active'}] if i==0 else [{'kind':'hold','objectId':'status'}]} for i,cue in enumerate(cues)]}
        result = TeachingPipeline(self.workbench.tasks).run(self.pid, self.root['id'], provider)
        self.assertEqual(result['status'], 'artifact-ready')
        self.queue = TeachingRenders(self.store)

    def enqueue(self): return self.queue.enqueue(self.pid, self.root['id'])

    def cleanup_proof(self,job):
        folder=self.store.public/'teaching-renders'/job['id'];folder.mkdir(parents=True,exist_ok=True)
        identity={'schemaVersion':'teaching-container-execution:1','jobId':job['id'],
            'containerName':'aicreater-teaching-'+job['id'],'image':'aicreater-teaching-renderer:local','executionNonce':'b'*64}
        proof={'schemaVersion':'teaching-container-cleanup:1','jobId':job['id'],
            'containerName':identity['containerName'],'containerId':'c'*64,'executionNonce':identity['executionNonce'],'status':'absent'}
        (folder/'execution.json').write_text(json.dumps(identity));(folder/'cleanup.json').write_text(json.dumps(proof))
        return folder,identity,proof

    def test_verified_cleanup_releases_deletion_without_success_or_retry(self):
        job=self.enqueue();self.queue.claim(self.pid,self.root['id'])
        with self.store.connection() as conn:conn.execute("UPDATE teaching_render_jobs SET deadline=now()-interval '1 second' WHERE root_id=%s",[self.root['id']])
        self.queue.get(self.pid,self.root['id']);self.cleanup_proof(job)
        with patch('services.visual.teaching_renders.render_frozen') as render:
            from services.visual.teaching_worker import run_once
            result=run_once(TeachingRenders(self.store));self.assertIsNone(run_once(TeachingRenders(self.store)))
        self.assertEqual(result['state'],'interrupted');self.assertEqual(result['error_code'],'execution-cleaned')
        self.assertFalse(result['video_ready']);self.assertFalse(result['accepted']);render.assert_not_called()
        self.assertEqual(self.workbench.tasks.get(self.pid,self.root['id'])['requests_used'],1)
        self.store.delete_project(self.pid,self.project['revision'],True)

    def test_cleanup_missing_mismatched_oversized_and_symlink_proofs_stay_fenced(self):
        job=self.enqueue();self.queue.claim(self.pid,self.root['id'])
        with self.store.connection() as conn:conn.execute("UPDATE teaching_render_jobs SET state='interrupted',error_code='execution-interrupted' WHERE root_id=%s",[self.root['id']])
        self.assertIsNone(self.queue.reconcile(self.pid,self.root['id']))
        folder,identity,proof=self.cleanup_proof(job)
        for change in ({'jobId':str(uuid.uuid4())},{'executionNonce':'d'*64},{'status':'running'},{'containerId':'not-an-id'},{'containerName':'other'}):
            (folder/'cleanup.json').write_text(json.dumps({**proof,**change}))
            self.assertIsNone(self.queue.reconcile(self.pid,self.root['id']))
        (folder/'cleanup.json').write_text(' '*5000);self.assertIsNone(self.queue.reconcile(self.pid,self.root['id']))
        (folder/'cleanup.json').write_text('['*1500+']'*1500);self.assertIsNone(self.queue.reconcile(self.pid,self.root['id']))
        (folder/'cleanup.json').unlink();outside=Path(self.temp.name)/'outside.json';outside.write_text(json.dumps(proof))
        (folder/'cleanup.json').symlink_to(outside);self.assertIsNone(self.queue.reconcile(self.pid,self.root['id']))
        with self.assertRaises(StoreError):self.store.delete_project(self.pid,self.project['revision'],True)

    def test_cleanup_never_releases_active_execution(self):
        job=self.enqueue();self.queue.claim(self.pid,self.root['id']);self.cleanup_proof(job)
        self.assertIsNone(self.queue.reconcile(self.pid,self.root['id']))
        self.assertEqual(self.queue.get(self.pid,self.root['id'])['state'],'running')
        with self.assertRaises(StoreError):self.store.delete_project(self.pid,self.project['revision'],True)

    def test_concurrent_cleanup_is_once_and_late_publication_stays_rejected(self):
        job=self.enqueue();claim=self.queue.claim(self.pid,self.root['id'])
        with self.store.connection() as conn:conn.execute("UPDATE teaching_render_jobs SET state='interrupted',error_code='execution-interrupted' WHERE root_id=%s",[self.root['id']])
        folder,_,_=self.cleanup_proof(job)
        with ThreadPoolExecutor(4) as pool:results=list(pool.map(lambda _:self.queue.reconcile(self.pid,self.root['id']),range(4)))
        self.assertEqual(sum(result is not None for result in results),1)
        file=folder/'late.mp4';file.write_bytes(b'fake-late-output')
        with self.assertRaises(StoreError):self.queue._publish(self.pid,self.root['id'],claim,{
            'status':'preview-ready','inputSha256':claim['artifact_sha256'],'artifactSha256':claim['artifact_sha256'],
            'previewFile':'late.mp4','videoSha256':hashlib.sha256(file.read_bytes()).hexdigest()})
        self.assertFalse(self.queue.get(self.pid,self.root['id'])['video_ready'])

    def test_restarted_worker_picks_persisted_queue_once_without_new_model_calls(self):
        from services.visual.teaching_worker import run_once
        self.enqueue()
        with patch('services.visual.teaching_renders.render_frozen',side_effect=lambda a,h,p:self.fixture_receipt(p,h)) as render:
            result=run_once(TeachingRenders(self.store))
            self.assertIsNone(run_once(TeachingRenders(self.store)))
        self.assertEqual(result['state'],'succeeded'); self.assertEqual(render.call_count,1)
        self.assertEqual(self.workbench.tasks.get(self.pid,self.root['id'])['requests_used'],1)

    def test_worker_restart_never_reclaims_running_or_expired_execution(self):
        from services.visual.teaching_worker import run_once
        self.enqueue(); self.queue.claim(self.pid,self.root['id'])
        with patch('services.visual.teaching_renders.render_frozen') as render:
            self.assertIsNone(run_once(TeachingRenders(self.store)))
            with self.store.connection() as conn: conn.execute("UPDATE teaching_render_jobs SET deadline=clock_timestamp()-interval '1 second' WHERE root_id=%s",[self.root['id']])
            self.assertIsNone(run_once(TeachingRenders(self.store)))
        self.assertEqual(render.call_count,0)
        self.assertEqual(self.queue.get(self.pid,self.root['id'])['state'],'interrupted')

    def test_unclaimed_render_expires_without_starting_the_container(self):
        self.enqueue()
        with self.store.connection() as conn:conn.execute("UPDATE teaching_render_jobs SET created_at=clock_timestamp()-interval '3 minutes' WHERE root_id=%s",[self.root['id']])
        self.assertIsNone(self.queue.claim(self.pid,self.root['id']))
        current=self.queue.get(self.pid,self.root['id'])
        self.assertEqual(current['state'],'failed');self.assertEqual(current['error_code'],'executor-unavailable')
        self.assertFalse(current['video_ready'])

    @unittest.skipUnless(os.environ.get('RUN_TEACHING_ISOLATED_TEST')=='1','Requires explicit real-container smoke opt-in')
    def test_real_pg_queue_container_and_publication_without_model_redispatch(self):
        self.enqueue(); result=self.queue.run(self.pid,self.root['id'])
        self.assertEqual(result['state'],'succeeded'); self.assertTrue(result['video_ready']); self.assertFalse(result['accepted'])
        self.assertEqual(self.workbench.tasks.get(self.pid,self.root['id'])['requests_used'],1)
        with self.store.connection() as conn:
            private=conn.execute('SELECT receipt FROM teaching_render_jobs WHERE root_id=%s',[self.root['id']]).fetchone()['receipt']
        file=self.store._asset_path(private['key']); self.assertGreater(file.stat().st_size,1000)
        self.assertEqual(self.queue.run(self.pid,self.root['id']),result)
        evidence=Path(__file__).resolve().parents[2]/'output'/('teaching-queue-container-'+uuid.uuid4().hex[:10])
        shutil.copytree(self.store.public/'teaching-renders'/result['id'],evidence)
        print('REAL_TEACHING_QUEUE_EVIDENCE:',evidence,'accepted=false; fake plan provider; zero paid calls')

    def test_duplicate_enqueue_and_claim_have_one_owner_and_do_not_use_model_budget(self):
        with ThreadPoolExecutor(4) as pool: jobs = list(pool.map(lambda _: self.enqueue(), range(6)))
        self.assertEqual(len({job['id'] for job in jobs}), 1)
        with ThreadPoolExecutor(4) as pool: claims = list(pool.map(lambda _: self.queue.claim(self.pid, self.root['id']), range(6)))
        self.assertEqual(sum(claim is not None for claim in claims), 1)
        self.assertEqual(self.workbench.tasks.get(self.pid, self.root['id'])['requests_used'], 1)
        self.assertFalse(jobs[0]['video_ready']); self.assertNotIn('token', jobs[0])
        self.assertIsNone(TeachingRenders(self.store).claim(self.pid, self.root['id']))

    def test_cancelled_and_changed_inputs_never_start_renderer(self):
        self.enqueue(); self.workbench.cancel(self.pid, self.root['id'])
        self.assertIsNone(self.queue.claim(self.pid, self.root['id']))
        self.assertEqual(self.queue.get(self.pid, self.root['id'])['state'], 'cancelled')

    def test_cancel_queued_task_without_worker_allows_deletion(self):
        self.enqueue(); self.workbench.cancel(self.pid,self.root['id'])
        self.assertEqual(self.queue.get(self.pid,self.root['id'])['state'],'cancelled')
        self.store.delete_project(self.pid,self.project['revision'],True)

    def test_deadline_crossed_while_waiting_for_lock_cannot_publish(self):
        self.enqueue(); claim=self.queue.claim(self.pid,self.root['id'])
        folder=self.store.public/'teaching-renders'/claim['id']; folder.parent.mkdir(parents=True)
        result=self.fixture_receipt(folder,claim['artifact_sha256']); entered=threading.Event()
        original=self.store._read
        def read(conn,project_id,lock=False):
            if lock: entered.set()
            return original(conn,project_id,lock=lock)
        with ThreadPoolExecutor(1) as pool, patch.object(self.store,'_read',side_effect=read):
            with self.store.connection() as conn:
                original(conn,self.pid,lock=True)
                conn.execute("UPDATE teaching_render_jobs SET deadline=clock_timestamp()+interval '300 milliseconds' WHERE root_id=%s",[self.root['id']])
                future=pool.submit(self.queue._publish,self.pid,self.root['id'],claim,result)
                self.assertTrue(entered.wait(2)); time.sleep(0.5)
            with self.assertRaises(StoreError): future.result(timeout=5)
        self.assertEqual(self.queue.get(self.pid,self.root['id'])['state'],'interrupted')

    def test_changed_input_blocks_queued_execution(self):
        self.enqueue(); row = self.project['scenes'][0]
        self.store.edit_scene(row['id'], row['revision'], {'narration_text':row['scene']['narration']['text']+'新增说明。'})
        self.assertIsNone(self.queue.claim(self.pid, self.root['id']))
        self.assertEqual(self.queue.get(self.pid, self.root['id'])['error_code'], 'input-changed')

    def test_expired_execution_is_not_reclaimed_or_published_by_old_owner(self):
        self.enqueue(); claim = self.queue.claim(self.pid, self.root['id'])
        with self.store.connection() as conn: conn.execute("UPDATE teaching_render_jobs SET deadline=now()-interval '1 second' WHERE root_id=%s", [self.root['id']])
        self.assertEqual(self.queue.get(self.pid, self.root['id'])['state'], 'interrupted')
        self.assertIsNone(self.queue.claim(self.pid, self.root['id']))
        with self.assertRaises(StoreError): self.queue.fail(self.pid, self.root['id'], claim['token'], 'render-failed')

    def test_inflight_render_protects_deletion_and_failure_is_not_success(self):
        self.enqueue()
        with self.assertRaises(StoreError): self.store.delete_project(self.pid, self.project['revision'], True)
        claim = self.queue.claim(self.pid, self.root['id'])
        with self.assertRaises(StoreError): self.queue.fail(self.pid, self.root['id'], str(uuid.uuid4()), 'render-failed')
        self.queue.fail(self.pid, self.root['id'], claim['token'], 'render-failed')
        job = self.queue.get(self.pid, self.root['id'])
        self.assertEqual(job['state'], 'failed'); self.assertFalse(job['video_ready'])
        self.assertIsNone(self.queue.claim(self.pid, self.root['id']))
        self.assertEqual(self.enqueue()['id'], job['id'])

    def test_foreign_scope_and_uncompiled_root_are_rejected(self):
        with self.assertRaises(StoreError): self.queue.get(str(uuid.uuid4()), self.root['id'])
        root = self.workbench.prepare(self.pid, self.sid, self.project['revision'], str(uuid.uuid4()), 'draft', True, 2)
        with self.assertRaises(StoreError): self.queue.enqueue(self.pid, root['id'])

    def test_worker_failure_retains_evidence_without_running_again(self):
        self.enqueue()
        with patch('services.visual.teaching_renders.render_frozen', side_effect=RuntimeError('private file or credential')) as render:
            self.queue.run(self.pid, self.root['id'])
            self.queue.run(self.pid, self.root['id'])
        self.assertEqual(render.call_count, 1)
        job = self.queue.get(self.pid, self.root['id'])
        self.assertEqual(job['state'], 'failed'); self.assertNotIn('private', str(job))

    def test_child_timeout_is_interrupted_not_a_safe_to_delete_failure(self):
        self.enqueue()
        with patch('services.visual.teaching_renders.render_frozen',side_effect=subprocess.TimeoutExpired('host-render',1800)) as render:
            result=self.queue.run(self.pid,self.root['id'])
            self.queue.run(self.pid,self.root['id'])
        self.assertEqual(result['state'],'interrupted'); self.assertFalse(result['video_ready']); self.assertEqual(render.call_count,1)
        with self.assertRaises(StoreError): self.store.delete_project(self.pid,self.project['revision'],True)

    def test_signal_termination_keeps_descendant_shutdown_fenced(self):
        self.enqueue()
        def signal(artifact,expected,folder):
            with patch('services.visual.teaching_renders.run_owned',return_value=SimpleNamespace(returncode=-9,stdout='')):
                return render_frozen(artifact,expected,folder)
        with patch('services.visual.teaching_renders.render_frozen',side_effect=signal) as render:
            result=self.queue.run(self.pid,self.root['id']); self.queue.run(self.pid,self.root['id'])
        self.assertEqual(result['state'],'interrupted'); self.assertFalse(result['video_ready']); self.assertEqual(render.call_count,1)
        with self.assertRaises(StoreError): self.store.delete_project(self.pid,self.project['revision'],True)
        latest=self.store.add_scene(self.pid,self.project['revision'],'其他章节。','其他要点')
        with self.assertRaises(StoreError) as error: self.store.delete_scene(self.pid,latest['revision'],self.sid,self.project['scenes'][0]['revision'],True)
        self.assertEqual(error.exception.code,'not_ready'); self.assertIn('teaching',str(error.exception))

    def test_cancel_during_worker_never_publishes_a_result(self):
        self.enqueue()
        def render(artifact, expected, folder):
            self.workbench.cancel(self.pid, self.root['id'])
            return self.fixture_receipt(folder, expected)
        with patch('services.visual.teaching_renders.render_frozen',side_effect=render):
            result=self.queue.run(self.pid,self.root['id'])
        self.assertEqual(result['state'],'cancelled'); self.assertFalse(result['video_ready'])

    @staticmethod
    def fixture_receipt(folder, expected):
        # Deliberate worker substitute: these bytes are not an actual rendered MP4.
        folder.mkdir(); file=folder/'fixture.mp4'; file.write_bytes(b'fake-worker-output')
        return {'status':'preview-ready','inputSha256':expected,'artifactSha256':expected,
            'previewFile':'fixture.mp4','videoSha256':hashlib.sha256(file.read_bytes()).hexdigest()}

    def test_only_owned_bound_file_is_published_and_resume_does_not_render_again(self):
        self.enqueue()
        with patch('services.visual.teaching_renders.render_frozen',side_effect=lambda a,h,p:self.fixture_receipt(p,h)) as render:
            first=self.queue.run(self.pid,self.root['id'])
            second=TeachingRenders(self.store).run(self.pid,self.root['id'])
        self.assertEqual(first['state'],'succeeded'); self.assertTrue(first['video_ready'])
        self.assertEqual(first,second); self.assertEqual(render.call_count,1)
        self.assertNotIn(self.temp.name,str(first)); self.assertNotIn('receipt',first)

    def test_checksum_failure_cannot_become_video_ready(self):
        self.enqueue()
        def render(artifact,expected,folder):
            result=self.fixture_receipt(folder,expected); result['videoSha256']='0'*64; return result
        with patch('services.visual.teaching_renders.render_frozen',side_effect=render): result=self.queue.run(self.pid,self.root['id'])
        self.assertEqual(result['state'],'failed'); self.assertFalse(result['video_ready'])

    def test_wrong_token_and_escaping_output_cannot_publish(self):
        self.enqueue(); claim=self.queue.claim(self.pid,self.root['id'])
        folder=self.store.public/'teaching-renders'/claim['id']; folder.parent.mkdir(parents=True)
        result=self.fixture_receipt(folder,claim['artifact_sha256'])
        with self.assertRaises(StoreError): self.queue._publish(self.pid,self.root['id'],{**claim,'token':str(uuid.uuid4())},result)
        with self.assertRaises(StoreError): self.queue._publish(self.pid,self.root['id'],claim,{**result,'previewFile':'../../outside.mp4'})
        self.assertFalse(self.queue.get(self.pid,self.root['id'])['video_ready'])

    def test_input_change_during_render_does_not_publish_old_video(self):
        self.enqueue()
        def render(artifact,expected,folder):
            row=self.project['scenes'][0]
            self.store.edit_scene(row['id'],row['revision'],{'narration_text':row['scene']['narration']['text']+'新增说明。'})
            return self.fixture_receipt(folder,expected)
        with patch('services.visual.teaching_renders.render_frozen',side_effect=render): result=self.queue.run(self.pid,self.root['id'])
        self.assertEqual(result['state'],'failed'); self.assertEqual(result['error_code'],'input-changed'); self.assertFalse(result['video_ready'])

    def test_expired_worker_completion_remains_interrupted_without_retry(self):
        self.enqueue()
        def render(artifact,expected,folder):
            with self.store.connection() as conn: conn.execute("UPDATE teaching_render_jobs SET deadline=now()-interval '1 second' WHERE root_id=%s",[self.root['id']])
            return self.fixture_receipt(folder,expected)
        with patch('services.visual.teaching_renders.render_frozen',side_effect=render) as renderer:
            result=self.queue.run(self.pid,self.root['id'])
        self.assertEqual(result['state'],'interrupted'); self.assertFalse(result['video_ready']); self.assertEqual(renderer.call_count,1)
