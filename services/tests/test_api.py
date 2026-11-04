from contextlib import ExitStack
import json
import os
import unittest

from fastapi.testclient import TestClient

from services.tests.test_projects import ProjectFixture



@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use run_project_tests.py for real PostgreSQL')
class ApiTests(ProjectFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        from services.api.app import create_app
        stack = ExitStack()
        self.addCleanup(stack.close)
        self.client = stack.enter_context(TestClient(create_app(self.store, authentication=False), base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000)))

    def test_markdown_routes_validate_and_separate_spoken_text(self):
        from unittest.mock import patch
        from services.workflow.manuscript_document import format_document
        from services.tests.test_manuscript_document import SECTIONS
        markdown = format_document({'sections':SECTIONS})
        body = {'title':'uv','source_text':markdown,'manuscript_format':'markdown'}
        response = self.client.post('/api/projects',json=body)
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.json()['source_text'],SECTIONS[0]['narration'])
        self.assertEqual(response.json()['config']['manuscript']['markdown'],markdown)
        self.assertEqual(self.client.post('/api/projects',json={**body,'source_text':'plain text'}).status_code,422)
        self.assertEqual(self.client.post('/api/projects',json={**body,'manuscript_format':'html'}).status_code,422)
        with patch('services.api.app.Settings.from_env',return_value=None), \
             patch('services.api.app.generate_manuscript',return_value=markdown) as generate:
            generated = self.client.post('/api/manuscripts/generate',json={'title':'uv','manuscript_format':'markdown'})
        self.assertEqual(generated.status_code,200)
        self.assertEqual(generated.json()['text'],markdown)
        self.assertEqual(generate.call_args.kwargs['manuscript_format'],'markdown')

    def test_project_voice_patch_is_free_revision_checked_and_strict(self):
        path='/api/projects/'+self.project['id']+'/voice';before=self.store.get_project(self.project['id'])
        response=self.client.patch(path,json={'expected_revision':1,'speaker':'public_voice'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['voice']['speaker'],'public_voice')
        self.assertEqual(response.json()['scenes'],before['scenes'])
        self.assertEqual(self.client.get('/api/projects/'+self.project['id']+'/jobs').json(),[])
        self.assertEqual(self.client.patch(path,json={'expected_revision':1,'speaker':'another_voice'}).status_code,409)
        for fields in [{'speaker':'../bad'},{'speaker':'valid','api_key':'private'},{'speaker':True},{'speaker':'valid','expected_revision':True}]:
            self.assertEqual(self.client.patch(path,json={'expected_revision':2,**fields}).status_code,422)
        self.assertEqual(self.store.get_project(self.project['id'])['voice']['speaker'],'public_voice')

    def test_themes_are_listed_and_a_course_switches_theme_by_revision(self):
        listed=self.client.get('/api/themes').json()
        self.assertEqual([t['id'] for t in listed if t['default']],['blueprint'])
        self.assertTrue({'chalk-garden','paper-press'}<=({t['id'] for t in listed}))
        self.assertEqual(set(listed[0]['preview']),{'background','surface','foreground','accent'})
        path='/api/projects/'+self.project['id']+'/theme'
        self.assertEqual(self.store.get_project(self.project['id'])['theme_id'],'blueprint')
        response=self.client.patch(path,json={'expected_revision':1,'theme_id':'chalk-garden'})
        self.assertEqual((response.status_code,response.json()['theme_id']),(200,'chalk-garden'))
        self.assertEqual(self.client.patch(path,json={'expected_revision':1,'theme_id':'blueprint'}).status_code,409)
        for fields in [{'theme_id':'../x'},{'theme_id':'blueprint','colors':{}},{'theme_id':1}]:
            self.assertEqual(self.client.patch(path,json={'expected_revision':2,**fields}).status_code,422)
        created=self.client.post('/api/projects',json={'title':'主题','source_text':'一句话。','theme_id':'swiss-ikb'})
        self.assertEqual((created.status_code,created.json()['theme_id']),(201,'swiss-ikb'))
        self.assertEqual(self.client.post('/api/projects',json={'title':'主题','source_text':'一句话。','theme_id':'nope'}).status_code,422)

    def test_cost_estimates_are_readonly_and_match_real_submission_dedup(self):
        row=self.project['scenes'][0];project_id=self.project['id']
        url='/api/projects/'+project_id+'/estimate'
        body={'operation':'voice','expected_revision':1,'scenes':[{'scene_id':row['id'],'expected_revision':1}]}
        before=self.store.get_project(project_id)
        quote=self.client.post(url,json=body)
        self.assertEqual(quote.status_code,200);self.assertEqual(quote.headers['cache-control'],'no-store')
        self.assertEqual(quote.json()['quantity']['calls'],1)
        self.assertEqual(self.client.get('/api/projects/'+project_id+'/jobs').json(),[])
        self.assertEqual(self.store.get_project(project_id),before)
        created=self.client.post('/api/scenes/'+row['id']+'/voice',json={'expected_revision':1})
        self.assertEqual(created.status_code,202)
        job=created.json();self.addCleanup(self.client.app.state.jobs.cancel,job['job_id'])
        again=self.client.post(url,json=body).json()
        self.assertEqual(again['status'],'no_new_call');self.assertEqual(again['quantity']['reused_jobs'],1)
        retry=self.client.get('/api/jobs/'+job['job_id']+'/estimate')
        self.assertEqual(retry.status_code,200);self.assertEqual(retry.json()['quantity']['calls'],1)
        self.assertEqual(self.client.post(url,json={**body,'operation':'regenerate'}).status_code,422)
        self.assertEqual(self.store.get_project(project_id),before)
        self.assertEqual(self.client.post(url,json={**body,'expected_revision':2}).status_code,409)
        for scenes in [[],body['scenes']*2,[{**body['scenes'][0],'scene_id':'33333333-3333-4333-8333-333333333333'}]]:
            self.assertEqual(self.client.post(url,json={**body,'scenes':scenes}).status_code,422)

    def test_local_timing_endpoint_is_separate_and_rejects_missing_cache(self):
        row=self.project['scenes'][0];url='/api/scenes/'+row['id']+'/timing'
        scene=row['scene'];asset=next(a for a in self.dsl['assets'] if a['id']==scene['narration']['audio_asset_id'])
        path=self.public/asset['storage_key'];path.with_name(path.stem+'-words.json').unlink()  # the fixture writes a cache; start without it
        response=self.client.post(url,json={'expected_revision':1})
        self.assertEqual(response.status_code,422);self.assertEqual(response.json()['code'],'timing_cache')
        self.assertEqual(self.client.post(url,json={'expected_revision':1,'words_checksum':'forged'}).status_code,422)
        path.with_name(path.stem+'-words.json').write_text(json.dumps([{'word':scene['narration']['text'],'startTime':0,'endTime':asset['duration_ms']/1000}]))
        response=self.client.post(url,json={'expected_revision':1})
        self.assertEqual(response.status_code,202);self.assertEqual(response.json()['kind'],'timing');self.assertNotIn('input',response.json())
        self.client.app.state.jobs.cancel(response.json()['job_id'])
        self.assertEqual(self.client.post(url,json={'expected_revision':9}).status_code,409)

    def test_editor_lists_projects_jobs_and_validated_audio(self):
        projects = self.client.get('/api/projects')
        self.assertEqual(projects.status_code, 200)
        self.assertIn(self.project['id'], [p['id'] for p in projects.json()])
        job = self.client.app.state.jobs.submit_voice(self.project['scenes'][0]['id'], 1)
        self.addCleanup(self.client.app.state.jobs.cancel, job['id'])
        jobs = self.client.get('/api/projects/' + self.project['id'] + '/jobs').json()
        self.assertIn(job['id'], [j['job_id'] for j in jobs])
        self.assertNotIn('input', jobs[0])
        asset = self.dsl['assets'][0]
        response = self.client.get('/api/projects/' + self.project['id'] + '/assets/' + asset['id'])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, (self.public / asset['storage_key']).read_bytes())
        self.assertEqual(self.client.get('/api/projects/' + self.project['id'] + '/assets/unknown').status_code, 404)
        (self.public / asset['storage_key']).write_bytes(b'tampered')
        self.assertEqual(self.client.get('/api/projects/' + self.project['id'] + '/assets/' + asset['id']).status_code, 422)

    def test_create_script_draft_does_not_call_generation(self):
        response = self.client.post('/api/projects', json={'title': 'Python 教学', 'source_text': '讲解函数参数。', 'mode': 'script'})
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data['source_text'], '讲解函数参数。')
        self.assertEqual(data['scenes'], [])
        self.assertEqual(self.client.get('/api/projects/' + data['id']).json(), data)
        response = self.client.post('/api/projects/' + data['id'] + '/visual/export', json={'expected_revision': 1, 'confirmed': True})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['code'], 'not_ready')

    def test_strict_fields_revision_and_errors_do_not_echo_secrets(self):
        for body in [{'title': 'x', 'source_text': 'x', 'api_key': 'secret-token'},
                     {'title': 'x', 'source_text': 23}, {'title': 'x', 'source_text': 'x', 'mode': 'topic'},
                     {'title': 'x', 'source_text': 'x', 'secret-token': True}]:
            response = self.client.post('/api/projects', json=body)
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('secret-token', response.text)
        response = self.client.patch('/api/projects/' + self.project['id'] + '/voice', json={'expected_revision': True, 'speaker': 'secret-token'})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn('secret-token', response.text)
        self.assertEqual(self.client.get('/api/projects/00000000-0000-0000-0000-000000000000').status_code, 404)
        response = self.client.post('/api/projects', content='{"secret-token"', headers={'Content-Type': 'application/json'})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn('secret-token', response.text)

    def test_invalid_unicode_is_request_error_not_database_failure(self):
        response = self.client.post('/api/projects', content=b'{"title":"x","source_text":"\\ud800"}',
                                    headers={'Content-Type': 'application/json'})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['code'], 'validation')

    def test_host_origin_and_actual_body_limit(self):
        path = '/api/projects/' + self.project['id']
        self.assertEqual(self.client.get(path, headers={'Host': 'attacker.invalid:8000'}).status_code, 403)
        self.assertEqual(self.client.get(path, headers={'Origin': 'https://attacker.invalid'}).status_code, 403)
        self.assertEqual(self.client.get(path, headers={'Origin': 'http://localhost:3000'}).status_code, 200)
        response = self.client.post('/api/projects', content=b'x' * (512 * 1024 + 1), headers={'Content-Length': '1'})
        self.assertEqual(response.status_code, 413)
        response = self.client.options('/api/projects', headers={'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:3000')

    def test_default_startup_uses_local_database_configuration(self):
        from unittest.mock import patch
        from services.api.app import create_app
        env = {'DATABASE_URL': os.environ['TEST_DATABASE_URL'], 'VOLCENGINE_RESOURCE_ID': 'seed-tts-2.0',
               'VOLCENGINE_SPEAKER': 'test_voice'}
        with patch.dict(os.environ, env), patch('services.config.load_local_config'):
            with TestClient(create_app(authentication=False), base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000)) as client:
                self.assertEqual(client.get('/health').json(), {'status': 'ready'})
                self.assertEqual(client.get('/api/projects/' + self.project['id']).json(), self.project)
                from services.projects.store import StoreError
                with patch.object(client.app.state.store, 'connection', side_effect=StoreError('database', 'Unavailable')):
                    self.assertEqual(client.get('/health').status_code, 503)

    def test_nonlocal_peer_cannot_forge_local_host(self):
        from services.api.app import create_app
        with TestClient(create_app(self.store, authentication=False), base_url='http://127.0.0.1:8000', client=('192.0.2.1', 50000)) as client:
            self.assertEqual(client.get('/health').status_code, 403)

    def test_runner_polls_visual_jobs_first_then_voice_and_timing_in_the_same_lane(self):
        from unittest.mock import patch
        from services import runner
        with patch('services.visual.worker.run_once', return_value=None) as visual, patch('services.workflow.worker.run_once', return_value=None) as voice:
            self.assertIsNone(runner.poll(self.store, 'render'))
            self.assertEqual((visual.call_args.kwargs['lane'], voice.call_args.kwargs['lane']), ('render', 'render'))
            self.assertIs(voice.call_args.args[0].store, self.store)
            visual.return_value = {'id': 'job', 'state': 'succeeded'}
            self.assertEqual(runner.poll(self.store, 'workflow')['id'], 'job')
            self.assertEqual(voice.call_count, 1)  # a visual job ran, so voice was not asked this round

    def test_voice_http_worker_attachment_is_revision_checked(self):
        import sys
        from services.workflow.worker import run_once
        scene_id = self.project['scenes'][0]['id']
        submitted = self.client.post('/api/scenes/' + scene_id + '/voice', json={'expected_revision': 1})
        self.assertEqual(submitted.status_code, 202)
        self.assertEqual(submitted.json()['kind'], 'voice')
        self.assertEqual(submitted.json()['stage'], 'tts')
        document = self.voice_document()
        result = run_once(self.client.app.state.jobs, [sys.executable, '-c', 'print(' + repr(json.dumps({'document': document})) + ')'])
        self.assertEqual(result['state'], 'succeeded')
        self.assertTrue(result['result']['attached'])
        self.assertEqual(self.client.get('/api/projects/' + self.project['id']).json()['revision'], 2)
