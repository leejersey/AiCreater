import copy
import unittest
from unittest.mock import Mock

from fastapi.testclient import TestClient

from services.api.app import create_app
from services.projects.jobs import Jobs
from services.projects.store import StoreError, identifier


class RenderInfoTests(unittest.TestCase):
    def setUp(self):
        app = create_app(authentication=False)
        self.jobs = Mock(spec=Jobs)
        app.state.jobs = self.jobs
        self.client = TestClient(app, base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000))
        self.addCleanup(self.client.close)
        self.id = '11111111-1111-4111-8111-111111111111'
        self.row = {'id': self.id, 'kind': 'render', 'state': 'succeeded', 'project_id': 'project',
                    'progress': 100, 'input': {'secret': 'never-expose'},
                    'result': {'version_id': 'version', 'checksums': {'mp4': 'a'*64, 'srt': 'b'*64}}}
        self.jobs.get.return_value = self.row

    def test_success_has_fixed_download_urls_and_published_checksums(self):
        response = self.client.get('/api/renders/' + self.id)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result['job_id'], self.id)
        self.assertEqual(result['downloads'], [
            {'extension': ext, 'url': f'/api/jobs/{self.id}/files/{ext}', 'sha256': value}
            for ext, value in self.row['result']['checksums'].items()])
        self.assertNotIn('input', result)
        self.assertNotIn('never-expose', response.text)
        self.assertEqual(self.jobs.method_calls, [('get', (self.id,), {})])

    def test_non_success_states_have_no_downloads_and_do_not_recover(self):
        for state in ['queued', 'running', 'failed', 'cancelled']:
            with self.subTest(state=state):
                self.row['state'] = state
                self.row['result'] = None
                self.jobs.reset_mock()
                response = self.client.get('/api/renders/' + self.id)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['downloads'], [])
                self.assertEqual(response.json()['state'], state)
                self.assertEqual(self.jobs.method_calls, [('get', (self.id,), {})])

    def test_success_with_bad_or_missing_checksum_is_rejected(self):
        for value in [None, {}, {'checksums': {}}, {'checksums': {'mp4': '../secret', 'srt': 'b'*64}},
                      {'checksums': {'mp4': ['secret'], 'srt': 'b'*64}}, {'checksums': 'secret'}]:
            with self.subTest(value=value):
                self.row['result'] = copy.deepcopy(value)
                response = self.client.get('/api/renders/' + self.id)
                self.assertEqual(response.status_code, 422)
                self.assertNotIn('secret', response.text)

    def test_other_job_kind_and_unknown_id_are_not_renders(self):
        self.row['kind'] = 'voice'
        self.assertEqual(self.client.get('/api/renders/' + self.id).status_code, 404)
        self.jobs.get.side_effect = StoreError('not_found', 'Job not found')
        self.assertEqual(self.client.get('/api/renders/' + self.id).status_code, 404)

    def test_invalid_id_uses_existing_validation(self):
        self.jobs.get.side_effect = lambda value: identifier(value)
        self.assertEqual(self.client.get('/api/renders/not-an-id').status_code, 400)
