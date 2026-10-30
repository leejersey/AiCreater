import os
import tempfile
import unittest
import uuid
import hashlib
import subprocess
import sys
import json
import copy
import wave
from psycopg.types.json import Jsonb
import httpx
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from contextlib import ExitStack

from fastapi.testclient import TestClient

from services.api.app import create_app
from services.projects.store import Store, StoreError, ROOT
from services.tests.test_projects import PROFILE


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Requires disposable PostgreSQL')
class TeachingApiTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        self.store = Store(os.environ['TEST_DATABASE_URL'], self.stack.enter_context(tempfile.TemporaryDirectory()), PROFILE)
        self.calls = []
        def provider(request):
            self.calls.append(request['stage'])
            cue_ids = request['outputSchema']['schema']['properties']['beats']['items']['properties']['cueId']['enum']
            return {'schemaVersion': 'teaching-scene-plan:1', 'inputSha256': request['inputSha256'], 'structure': 'state-change',
                    'objects': [{'id': 'status', 'component': 'indicator', 'meaning': 'status', 'label': '状态', 'ownerId': None, 'initialState': 'idle'}],
                    'relations': [], 'beats': [{'cueId': cue, 'actions': [{'kind': 'transition', 'objectId': 'status', 'fromState': 'idle', 'toState': 'active'}] if i == 0 else [{'kind': 'hold', 'objectId': 'status'}]} for i, cue in enumerate(cue_ids)]}
        self.provider = provider
        self.client = self.stack.enter_context(TestClient(create_app(self.store, teaching_plan=True, teaching_provider=provider), base_url='http://127.0.0.1:8000', client=('127.0.0.1', 51000)))
        self.assertEqual(self.client.post('/api/auth/register', json={'username': 'teaching_' + uuid.uuid4().hex[:12], 'password': 'test-password-2026'}).status_code, 201)
        project = self.client.post('/api/projects', json={'title': '教学实验', 'source_text': '先读取。再执行。'}).json()
        self.pid = project['id']; self.path = '/api/projects/' + self.pid + '/teaching-tasks'
        def cancel_fixtures():
            tasks=self.client.app.state.teaching.tasks
            try:
                for root in tasks.list_ids(self.pid):tasks.cancel(self.pid,root)
            except StoreError as error:
                if error.code!='not_found':raise
        self.addCleanup(cancel_fixtures)
        self.project = self.client.post('/api/projects/' + self.pid + '/visual/prepare', json={'expected_revision': 1}).json()
        self.body = {'scene_id': self.project['scenes'][0]['id'], 'expected_revision': self.project['revision'], 'timing_mode': 'draft',
                     'idempotency_key': str(uuid.uuid4()), 'confirmed': True, 'max_requests': 2}

    def prepare(self):
        response = self.client.post(self.path, json=self.body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_free_audio_binding_api_reaches_bound_video_and_subtitle_without_more_model_calls(self):
        from services.visual.teaching_pipeline import TeachingPipeline
        from services.visual.teaching_media import TeachingMedia,run_once
        task=self.prepare();service=self.client.app.state.teaching
        self.assertEqual(TeachingPipeline(service.tasks).run(self.pid,task['id'],self.provider)['status'],'artifact-ready')
        project=self.store.get_project(self.pid);row=project['scenes'][0];scene=copy.deepcopy(row['scene'])
        file=self.store.public/'generated/api-voice.wav';file.parent.mkdir(parents=True,exist_ok=True)
        with wave.open(str(file),'wb') as audio:
            audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(24000);audio.writeframes(b'\0\0'*96000)
        asset={'id':'api-voice','type':'audio','storage_key':'generated/api-voice.wav','checksum':hashlib.sha256(file.read_bytes()).hexdigest(),'duration_ms':4000}
        cues=service.tasks.checkpoint(self.pid,task['id'])['snapshot']['cues']
        scene['narration'].update(audio_asset_id=asset['id'],audio_start_frame=6)
        scene.update(duration_frames=132,captions=[{'text':cue['text'],'start_frame':6+i*60,'end_frame':60+i*60} for i,cue in enumerate(cues)])
        config=copy.deepcopy(project['config']);config['assets'].append(asset)
        with self.store.connection() as conn:
            conn.execute("UPDATE scenes SET scene=%s,state='ready',revision=revision+1 WHERE id=%s",[Jsonb(scene),row['id']])
            conn.execute('UPDATE projects SET config=%s,revision=revision+1 WHERE id=%s',[Jsonb(config),self.pid])
        url=self.path+'/'+task['id']
        response=self.client.post(url+'/audio-binding',json={})
        self.assertEqual(response.status_code,202,response.text)
        self.assertEqual(self.client.post(url+'/audio-binding',json={}).json()['id'],response.json()['id'])
        self.assertEqual(self.client.post(url+'/audio-binding',json={'audio_file':'/private'}).status_code,422)
        run_once(TeachingMedia(self.store))
        from services.tests.test_teaching_av_queue import TeachingAvQueueTests
        with patch('services.visual.teaching_renders.render_audiovisual',side_effect=lambda *args:TeachingAvQueueTests.fake_renderer(self,*args)):
            service.renders.run(self.pid,task['id'])
        current=self.client.get(url).json()
        self.assertEqual(current['stage'],'preview-ready');self.assertEqual(current['timing_mode'],'measured')
        self.assertTrue(current['current']);self.assertFalse(current['accepted']);self.assertTrue(current['video_ready'])
        self.assertEqual(self.client.get(url+'/video').status_code,200)
        self.assertEqual(self.client.get(url+'/subtitles').status_code,200)
        render_id=current['render']['playable_render_id']
        self.assertEqual(self.client.get(url+'/video',params={'render_id':render_id}).status_code,200)
        self.assertEqual(self.client.get(url+'/subtitles',params={'render_id':render_id}).status_code,200)
        self.assertEqual(self.client.get(url+'/video',params={'render_id':str(uuid.uuid4())}).status_code,409)
        self.assertEqual(self.calls,['plan'])
        public=self.client.get(url+'/audio-binding')
        self.assertEqual(public.status_code,200)
        for private in ('storage_key','artifact','snapshot','audioFile','token'):
            self.assertNotIn('"'+private+'"',public.text)
        self.client.post('/api/auth/logout',json={})
        self.assertEqual(self.client.get(url+'/subtitles').status_code,401)
        self.assertEqual(self.client.post(url+'/audio-binding',json={}).status_code,401)

    def test_prepare_execute_and_refresh_keep_truthful_states_and_root_budget(self):
        self.assertTrue(self.client.get(self.path+'/readiness').json()['ready']);self.assertEqual(self.calls,[])
        task = self.prepare()
        self.assertEqual(task['stage'], 'prepared'); self.assertTrue(task['can_run']); self.assertFalse(task['video_ready']); self.assertEqual(self.calls, [])
        self.assertEqual(self.prepare()['id'], task['id'])
        response = self.client.post(self.path + '/' + task['id'] + '/run', json={})
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()['result']['status'], 'queued')
        self.assertEqual(self.calls,[])
        self.assertEqual(self.client.get(self.path+'/'+task['id']).json()['stage'],'plan-queued')
        from services.visual.teaching_planning import run_once
        run_once(self.client.app.state.teaching.planning,self.provider)
        current = self.client.get(self.path + '/' + task['id']).json()
        self.assertEqual(current['stage'], 'render-queued'); self.assertFalse(current['video_ready']); self.assertFalse(current['accepted'])
        self.assertFalse(current['can_run'])
        self.client.post(self.path + '/' + task['id'] + '/run', json={})
        self.assertEqual(self.calls, ['plan'])
        for private in ('dispatch_token', 'prompt', 'snapshot', 'payload', 'source'):
            self.assertNotIn('"' + private + '"', str(response.content))
        self.assertEqual(self.client.get(self.path).headers['cache-control'], 'no-store')

    def test_strict_inputs_reject_budget_overrides_and_client_snapshots(self):
        for change in ({'confirmed': False}, {'max_requests': True}, {'max_requests': 3}, {'brief': {}}, {'source': 'code'}):
            self.assertEqual(self.client.post(self.path, json={**self.body, **change}).status_code, 422)
        self.assertEqual(self.calls, [])

    def test_auth_and_project_scope_cover_every_new_endpoint(self):
        task = self.prepare(); url = self.path + '/' + task['id']
        self.client.post('/api/auth/logout', json={})
        self.assertEqual(self.client.get(url).status_code, 401)
        self.client.post('/api/auth/register', json={'username': 'other_' + uuid.uuid4().hex[:12], 'password': 'test-password-2026'})
        for method, route, body in (('get', url, None), ('get',self.path+'/readiness',None),('post', self.path, self.body), ('post', url + '/run', {}), ('post', url + '/cancel', {})):
            response = getattr(self.client, method)(route, **({'json': body} if body is not None else {}))
            self.assertEqual(response.status_code, 404)
        other = self.client.post('/api/projects', json={'title': 'Other', 'source_text': 'Other.'}).json()
        self.assertEqual(self.client.get('/api/projects/' + other['id'] + '/teaching-tasks/' + task['id']).status_code, 404)
        self.assertEqual(self.calls, [])

    def test_changed_chapter_is_stale_and_cancel_does_not_dispatch(self):
        task = self.prepare(); row = self.project['scenes'][0]
        edited = self.client.patch('/api/scenes/' + row['id'], json={'expected_revision': row['revision'], 'changes': {'narration_text': row['scene']['narration']['text'] + '新增说明。'}})
        self.assertEqual(edited.status_code, 200, edited.text)
        url = self.path + '/' + task['id']
        self.assertEqual(self.client.get(url).json()['stage'], 'stale')
        with self.assertRaises(StoreError): self.client.app.state.teaching.tasks.reserve(self.pid, task['id'], 'plan', 'a' * 64)
        self.assertEqual(self.client.post(url + '/run', json={}).status_code, 409)
        self.assertEqual(self.client.post(url + '/cancel', json={}).json()['stage'], 'cancelled')
        self.assertEqual(self.client.post(url + '/cancel', json={}).json()['stage'], 'cancelled')
        self.assertEqual(self.calls, [])

    def test_failed_protocol_is_visible_without_exposing_response_or_suggesting_a_paid_retry(self):
        task = self.prepare(); self.client.app.state.teaching.provider = lambda _: {'source': 'private response content'}
        response = self.client.post(self.path + '/' + task['id'] + '/run', json={})
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(self.client.get(self.path+'/'+task['id']).json()['requests_used'],0)
        from services.visual.teaching_planning import run_once
        run_once(self.client.app.state.teaching.planning,self.client.app.state.teaching.provider)
        task = self.client.get(self.path + '/' + task['id']).json()
        self.assertEqual(task['stage'], 'blocked'); self.assertFalse(task['can_run']); self.assertFalse(task['video_ready'])
        self.assertNotIn('private response content', response.text)
        self.assertEqual(task['requests_used'], 1)
        again=self.client.post(self.path+'/'+task['id']+'/run',json={})
        self.assertEqual(again.status_code,200);self.assertEqual(again.json()['result']['status'],'blocked')

    def test_inflight_teaching_request_blocks_existing_project_deletion(self):
        task = self.prepare(); tasks = self.client.app.state.teaching.tasks
        call = tasks.reserve(self.pid, task['id'], 'plan', 'a' * 64)
        response = self.client.post('/api/projects/' + self.pid + '/delete', json={'expected_revision': self.project['revision'], 'confirmed': True})
        self.assertEqual(response.status_code, 409)
        tasks.finish(self.pid, task['id'], call['id'], call['dispatch_token'], 'failed')
        self.assertEqual(self.client.post('/api/projects/' + self.pid + '/delete', json={'expected_revision': self.project['revision'], 'confirmed': True}).status_code, 200)

    def test_complete_but_locally_invalid_response_is_failed_not_unknown_or_retried(self):
        task=self.prepare();deep={}
        for _ in range(40):deep={'child':deep}
        self.client.app.state.teaching.provider=lambda _:deep
        url=self.path+'/'+task['id']
        self.assertEqual(self.client.post(url+'/run',json={}).status_code,202)
        from services.visual.teaching_planning import run_once
        run_once(self.client.app.state.teaching.planning,self.client.app.state.teaching.provider)
        current=self.client.get(url).json()
        self.assertEqual(current['requests_used'],1);self.assertEqual(current['calls'][0]['state'],'failed')
        self.assertFalse(current['video_ready']);self.assertEqual(current['stage'],'blocked')
        self.client.post(url+'/cancel',json={})
        self.assertEqual(self.client.post('/api/projects/'+self.pid+'/delete',json={'expected_revision':self.project['revision'],'confirmed':True}).status_code,200)

    def test_cancel_inflight_planning_preserves_late_response_and_never_admits_render(self):
        task=self.prepare();url=self.path+'/'+task['id'];started=threading.Event();release=threading.Event()
        def provider(request):
            started.set();self.assertTrue(release.wait(5));return self.provider(request)
        self.client.app.state.teaching.provider=provider
        self.client.post(url+'/run',json={})
        from services.visual.teaching_planning import run_once
        with ThreadPoolExecutor(1) as pool:
            future=pool.submit(run_once,self.client.app.state.teaching.planning,provider)
            try:
                self.assertTrue(started.wait(5));self.assertEqual(self.client.post(url+'/cancel',json={}).json()['stage'],'cancelled')
                self.assertEqual(self.client.post('/api/projects/'+self.pid+'/delete',json={'expected_revision':self.project['revision'],'confirmed':True}).status_code,409)
            finally:release.set()
            self.assertEqual(future.result(timeout=10)['state'],'cancelled')
        current=self.client.get(url).json()
        self.assertEqual(current['calls'][0]['state'],'succeeded');self.assertIsNone(current['render']);self.assertFalse(current['video_ready'])
        self.assertEqual(self.client.post('/api/projects/'+self.pid+'/delete',json={'expected_revision':self.project['revision'],'confirmed':True}).status_code,200)

    def test_unknown_call_still_protects_late_response_from_project_deletion(self):
        task = self.prepare(); tasks = self.client.app.state.teaching.tasks
        call = tasks.reserve(self.pid, task['id'], 'plan', 'a' * 64)
        with self.store.connection() as conn:
            conn.execute("UPDATE teaching_model_calls SET created_at=now()-interval '11 minutes' WHERE id=%s", [call['id']])
        current = self.client.get(self.path + '/' + task['id']).json()
        self.assertEqual(current['stage'], 'blocked'); self.assertEqual(current['calls'][0]['state'], 'unknown')
        body = {'expected_revision': self.project['revision'], 'confirmed': True}
        self.assertEqual(self.client.post('/api/projects/' + self.pid + '/delete', json=body).status_code, 409)
        tasks.finish(self.pid, task['id'], call['id'], call['dispatch_token'], 'succeeded', {'late': 'response'})
        self.assertEqual(tasks.get_cache(self.pid, task['id'], 'response-plan', 'a' * 64)['payload'], {'late': 'response'})
        self.assertEqual(self.client.post('/api/projects/' + self.pid + '/delete', json=body).status_code, 200)

    def test_unconfigured_provider_is_explicit_and_never_reserves_a_slot(self):
        task = self.prepare(); self.client.app.state.teaching.provider = None
        response = self.client.post(self.path + '/' + task['id'] + '/run', json={})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.client.get(self.path + '/' + task['id']).json()['requests_used'], 0)
        self.assertEqual(self.calls, [])

    def test_missing_worker_preflight_rejects_admission_without_a_queue_or_model_slot(self):
        task=self.prepare();service=self.client.app.state.teaching
        def unavailable():raise StoreError('teaching_unavailable','执行器未就绪')
        service.readiness=unavailable
        response=self.client.post(self.path+'/'+task['id']+'/run',json={})
        self.assertEqual(response.status_code,503)
        self.assertFalse(self.client.get(self.path+'/readiness').json()['ready'])
        self.assertEqual(self.client.post(self.path,json={**self.body,'idempotency_key':str(uuid.uuid4())}).status_code,503)
        current=self.client.get(self.path+'/'+task['id']).json()
        self.assertEqual(current['requests_used'],0);self.assertFalse(current['can_run']);self.assertEqual(self.calls,[])
        with self.assertRaises(StoreError):service.planning.get(self.pid,task['id'])

    def test_feature_off_has_no_experimental_routes_or_migration(self):
        with TestClient(create_app(self.store), base_url='http://127.0.0.1:8000', client=('127.0.0.1', 51001)) as client:
            client.cookies.update(self.client.cookies)
            self.assertEqual(client.get(self.path).status_code, 404)

    def compiled(self):
        task=self.prepare(); url=self.path+'/'+task['id']
        self.assertEqual(self.client.post(url+'/run',json={}).status_code,202)
        from services.visual.teaching_planning import run_once
        run_once(self.client.app.state.teaching.planning,self.client.app.state.teaching.provider)
        return task,url

    @staticmethod
    def fake_render(artifact,expected,folder):
        # Transport fixture only, not an actual rendered video.
        folder.mkdir(); file=folder/'preview.mp4'; file.write_bytes(b'fixture-video-data')
        return {'status':'preview-ready','inputSha256':expected,'artifactSha256':expected,
            'previewFile':'preview.mp4','videoSha256':hashlib.sha256(file.read_bytes()).hexdigest()}

    def test_background_render_media_range_and_refresh_do_not_redispatch(self):
        task,url=self.compiled()
        current=self.client.get(url).json(); self.assertTrue(current['can_render'])
        with patch('services.visual.teaching_renders.render_frozen',side_effect=self.fake_render) as render:
            response=self.client.post(url+'/render',json={}); self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['stage'],'render-queued'); self.assertEqual(render.call_count,0)
            from services.visual.teaching_worker import run_once
            run_once(self.client.app.state.teaching.renders)
            current=self.client.get(url).json()
            self.assertTrue(current['video_ready']); self.assertEqual(current['stage'],'preview-ready'); self.assertFalse(current['accepted'])
            self.client.post(url+'/render',json={}); self.client.get(url)
        self.assertEqual(render.call_count,1); self.assertEqual(self.calls,['plan'])
        media=self.client.get(url+'/video',headers={'Range':'bytes=0-3'})
        self.assertEqual(media.status_code,206); self.assertEqual(media.content,b'fixt')
        self.assertIn('no-store',media.headers['cache-control'])
        self.assertEqual(self.client.head(url+'/video').status_code,200)
        self.assertIn('attachment',self.client.get(url+'/video?download=true').headers['content-disposition'])
        self.assertNotIn(self.store.public.as_posix(),str(current))

    def test_render_failure_never_exposes_playable_url_or_retries(self):
        task,url=self.compiled()
        with patch('services.visual.teaching_renders.render_frozen',side_effect=RuntimeError('secret child log')) as render:
            self.client.post(url+'/render',json={})
            from services.visual.teaching_worker import run_once
            run_once(self.client.app.state.teaching.renders)
            self.client.post(url+'/render',json={})
        current=self.client.get(url).json()
        self.assertEqual(current['stage'],'render-blocked'); self.assertFalse(current['video_ready']); self.assertFalse(current['can_render'])
        self.assertEqual(render.call_count,1); self.assertNotIn('secret',str(current))
        self.assertNotEqual(self.client.get(url+'/video').status_code,200)

    def test_media_is_project_scoped_and_missing_or_changed_files_are_rejected(self):
        task,url=self.compiled()
        with patch('services.visual.teaching_renders.render_frozen',side_effect=self.fake_render):
            self.client.post(url+'/render',json={})
            from services.visual.teaching_worker import run_once
            run_once(self.client.app.state.teaching.renders)
        current=self.client.get(url).json(); folder=self.store.public/'teaching-renders'/current['render']['id']
        file=folder/'preview.mp4'; file.write_bytes(b'tampered-video-data')
        self.assertFalse(self.client.get(url).json()['video_ready'])
        self.assertNotEqual(self.client.get(url+'/video').status_code,200)
        file.unlink(); self.assertFalse(self.client.get(url).json()['video_ready'])
        self.client.post('/api/auth/logout',json={})
        self.assertEqual(self.client.get(url+'/video').status_code,401)
        self.client.post('/api/auth/register',json={'username':'other_'+uuid.uuid4().hex[:12],'password':'test-password-2026'})
        self.assertEqual(self.client.get(url+'/video').status_code,404)
        self.assertEqual(self.client.post(url+'/render',json={}).status_code,404)

    def test_render_refuses_uncompiled_task_and_client_paths(self):
        task=self.prepare(); url=self.path+'/'+task['id']
        self.assertNotEqual(self.client.post(url+'/render',json={}).status_code,200)
        self.assertEqual(self.client.post(url+'/render',json={'output':'/tmp/unsafe'}).status_code,422)
        self.assertEqual(self.calls,[])

    @unittest.skipUnless(os.environ.get('RUN_TEACHING_ISOLATED_TEST')=='1','Explicit real-container API smoke opt-in')
    def test_real_container_background_render_and_authenticated_video(self):
        from services.visual.teaching_provider import TeachingPlanProvider
        from services.workflow.providers import Settings
        requests=[]
        def model_transport(request):
            requests.append(request)
            payload=json.loads(json.loads(request.content)['messages'][1]['content'])
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'role':'assistant','content':json.dumps(self.provider(payload),ensure_ascii=False)}}]})
        client=self.stack.enter_context(httpx.Client(transport=httpx.MockTransport(model_transport)))
        self.client.app.state.teaching.provider=TeachingPlanProvider(Settings('test-only','deepseek-flash','','','','',''),client=client)
        task,url=self.compiled()
        self.assertEqual(len(requests),1)
        response=self.client.post(url+'/render',json={}); self.assertEqual(response.status_code,200,response.text)
        env={key:os.environ[key] for key in ('PATH','HOME','TMPDIR','LANG','LC_ALL') if key in os.environ}
        env['DATABASE_URL']=os.environ['TEST_DATABASE_URL']
        command=[sys.executable,'-m','services.visual.teaching_worker','--once','--public',str(self.store.public)]
        worker=subprocess.run(command,cwd=ROOT,env=env,text=True,capture_output=True,timeout=180)
        self.assertEqual(worker.returncode,0,worker.stdout)
        self.assertEqual(json.loads(worker.stdout)['state'],'succeeded')
        current=self.client.get(url).json()
        self.assertEqual(current['stage'],'preview-ready'); self.assertTrue(current['video_ready']); self.assertFalse(current['accepted'])
        media=self.client.get(url+'/video'); self.assertEqual(media.status_code,200); self.assertGreater(len(media.content),1000)
        partial=self.client.get(url+'/video',headers={'Range':'bytes=0-15'})
        self.assertEqual(partial.status_code,206); self.assertEqual(partial.content,media.content[:16])
        self.client.post(url+'/render',json={})
        self.assertEqual(self.client.get(url).json()['render']['id'],current['render']['id'])
        self.assertEqual(self.calls,['plan']); self.assertEqual(current['requests_used'],1)
        restarted=subprocess.run(command,cwd=ROOT,env=env,text=True,capture_output=True,timeout=30)
        self.assertEqual(restarted.returncode,0); self.assertEqual(json.loads(restarted.stdout)['state'],'idle')
        identity=json.loads((self.store.public/'teaching-renders'/current['render']['id']/'execution.json').read_text())
        self.assertEqual(identity['jobId'],current['render']['id'])
        self.assertEqual(identity['containerName'],'aicreater-teaching-'+current['render']['id'])
        proof=json.loads((self.store.public/'teaching-renders'/current['render']['id']/'cleanup.json').read_text())
        self.assertEqual(proof['status'],'absent');self.assertEqual(proof['executionNonce'],identity['executionNonce'])
        self.assertRegex(proof['containerId'],r'^[a-f0-9]{64}$')
        # Simulate a lost publication after the real executor's final cleanup proof.
        with self.store.connection() as conn:conn.execute("UPDATE teaching_render_jobs SET state='interrupted',receipt=NULL,error_code='execution-interrupted' WHERE id=%s",[current['render']['id']])
        recovered=subprocess.run(command,cwd=ROOT,env=env,text=True,capture_output=True,timeout=30)
        self.assertEqual(recovered.returncode,0);self.assertEqual(json.loads(recovered.stdout)['state'],'interrupted')
        stopped=self.client.get(url).json()
        self.assertFalse(stopped['video_ready']);self.assertEqual(stopped['render']['error_code'],'execution-cleaned')
        self.assertEqual(stopped['requests_used'],1);self.assertNotEqual(self.client.get(url+'/video').status_code,200)
