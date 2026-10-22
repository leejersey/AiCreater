"""Offline image asset/render persistence tests; never call a paid provider."""
import copy
import hashlib
import os
import subprocess
import unittest
from contextlib import ExitStack
from fastapi.testclient import TestClient
from services.tests.test_projects import ProjectFixture
from services.projects.store import StoreError, draft_valid
from services.projects.jobs import Jobs


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use disposable PostgreSQL')
class TeachingImageTests(ProjectFixture, unittest.TestCase):
    def image_project(self):
        dsl = copy.deepcopy(self.dsl)
        scene = next(s for s in dsl['scenes'] if s['type'] == 'card_sequence')
        file = self.public / 'toolbox.png'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', str(file)], check=True)
        image = {'id':'toolbox', 'type':'image', 'storage_key':'toolbox.png',
                 'checksum':hashlib.sha256(file.read_bytes()).hexdigest(), 'width':64, 'height':64}
        dsl['assets'].append(image)
        scene['images'] = [{'asset_id':'toolbox', 'element_id':scene['elements'][0]['id'], 'alt':'项目的独立工具箱'}]
        return self.store.import_project('教学图片', dsl)

    def test_import_edit_freeze_duplicate_and_scene_preview_retain_images(self):
        project = self.image_project()
        row = next(r for r in project['scenes'] if r['scene'].get('images'))
        old = self.store.create_version(project['id'], project['revision'])
        self.assertEqual(old['dsl']['scenes'][row['position']]['images'], row['scene']['images'])
        elements = copy.deepcopy(row['scene']['elements']); elements[0]['content'] = '工具箱'
        edited = self.store.edit_scene(row['id'], row['revision'], {'elements':elements})
        changed = next(r for r in edited['scenes'] if r['id'] == row['id'])
        self.assertEqual(changed['state'], 'ready')
        self.assertEqual(changed['scene']['images'], row['scene']['images'])
        self.assertEqual(changed['scene']['narration'], row['scene']['narration'])
        self.assertEqual(self.store.get_version(old['id'])['dsl'], old['dsl'])
        jobs = Jobs(self.store)
        job = jobs.submit_preview(row['id'], changed['revision'])
        ids = {a['id'] for a in job['input']['version']['dsl']['assets']}
        self.assertEqual(ids, {'toolbox', row['scene']['narration']['audio_asset_id']})
        jobs.cancel(job['id'])
        cloned = self.store.duplicate_scene(project['id'], edited['revision'], row['id'], changed['revision'])
        self.assertGreater(sum(bool(r['scene'].get('images')) for r in cloned['scenes']), 1)

    def test_unsupported_paid_transformations_cannot_drop_bindings(self):
        project = self.image_project(); row = next(r for r in project['scenes'] if r['scene'].get('images'))
        jobs = Jobs(self.store)
        for submit in [jobs.submit_voice, jobs.submit_timing, jobs.submit_regenerate]:
            with self.subTest(submit=submit.__name__), self.assertRaises(StoreError):
                submit(row['id'], row['revision'])
        self.assertEqual(jobs.list_project(project['id']), [])
        with self.assertRaises(StoreError):
            self.store.edit_scene(row['id'], row['revision'], {'narration_text':'改变讲解内容。'})
        broken = copy.deepcopy(self.store._dsl(project)); broken['scenes'][row['position']]['images'][0]['element_id'] = 'missing'
        with self.assertRaises(StoreError): draft_valid(broken)
        self.assertEqual(self.store.get_project(project['id']), project)

    def test_private_image_requires_owner_session(self):
        import uuid
        from services.api.app import create_app
        project = self.image_project()
        url = '/api/projects/' + project['id'] + '/assets/toolbox'
        app = create_app(self.store)
        with TestClient(app, base_url='http://127.0.0.1:8000', client=('127.0.0.1',50000),
                        headers={'Origin':'http://127.0.0.1:3000'}) as client:
            self.assertEqual(client.get(url).status_code, 401)
            owner = client.post('/api/auth/register', json={'username':'image_'+uuid.uuid4().hex[:16], 'password':'test-secret-2026'})
            self.assertEqual(owner.status_code, 201)
            with self.store.connection() as conn:
                conn.execute('UPDATE projects SET owner_id=%s WHERE id=%s', [owner.json()['id'],project['id']])
            self.assertEqual(client.get(url).status_code, 200)
            client.cookies.clear()
            stranger = client.post('/api/auth/register', json={'username':'other_'+uuid.uuid4().hex[:16], 'password':'test-secret-2026'})
            self.assertEqual(stranger.status_code, 201)
            self.assertEqual(client.get(url).status_code, 404)

    def test_image_route_mime_checksum_and_project_scoping(self):
        from services.api.app import create_app
        project = self.image_project()
        with ExitStack() as stack:
            client = stack.enter_context(TestClient(create_app(self.store, authentication=False), base_url='http://127.0.0.1:8000', client=('127.0.0.1',50000)))
            url = '/api/projects/' + project['id'] + '/assets/toolbox'
            response = client.get(url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['content-type'], 'image/png')
            self.assertEqual(response.content, (self.public / 'toolbox.png').read_bytes())
            self.assertEqual(response.headers['cache-control'], 'no-store')
            self.assertEqual(client.get('/api/projects/' + self.project['id'] + '/assets/toolbox').status_code, 404)
            (self.public / 'toolbox.png').write_bytes(b'changed')
            self.assertEqual(client.get(url).status_code, 422)
