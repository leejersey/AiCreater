import copy
import os
import unittest

from psycopg.types.json import Jsonb

from services.projects.store import StoreError
from services.tests.test_projects import ProjectFixture


class TeachingStyleNormalizeTests(unittest.TestCase):
    def test_normalize_defaults_and_rejects(self):
        from services.projects.store import normalize_teaching_style

        self.assertEqual(normalize_teaching_style(None), 'popular')
        self.assertEqual(normalize_teaching_style(''), 'popular')
        self.assertEqual(normalize_teaching_style('technical'), 'technical')
        self.assertEqual(normalize_teaching_style('popular'), 'popular')
        with self.assertRaises(StoreError):
            normalize_teaching_style('marketing')
        with self.assertRaises(StoreError):
            normalize_teaching_style(True)

    def test_normalize_required_rejects_empty(self):
        from services.projects.store import normalize_teaching_style

        with self.assertRaises(StoreError):
            normalize_teaching_style(None, required=True)
        with self.assertRaises(StoreError):
            normalize_teaching_style('', required=True)

    def test_effective_teaching_style_tolerates_missing_and_illegal(self):
        from services.projects.store import effective_teaching_style

        self.assertEqual(effective_teaching_style(None), 'popular')
        self.assertEqual(effective_teaching_style({}), 'popular')
        self.assertEqual(effective_teaching_style({'teaching_style': 'technical'}), 'technical')
        self.assertEqual(effective_teaching_style({'teaching_style': 'marketing'}), 'popular')
        self.assertEqual(effective_teaching_style({'teaching_style': True}), 'popular')


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use disposable PostgreSQL')
class TeachingStyleStoreTests(ProjectFixture, unittest.TestCase):
    def test_create_persists_and_defaults(self):
        technical = self.store.create_project('干货课', '技术讲解。', teaching_style='technical')
        self.assertEqual(technical['teaching_style'], 'technical')
        self.assertEqual(technical['config']['teaching_style'], 'technical')

        popular = self.store.create_project('科普课', '大众讲解。')
        self.assertEqual(popular['teaching_style'], 'popular')
        self.assertEqual(popular['config']['teaching_style'], 'popular')

    def test_read_defaults_legacy_config_without_key(self):
        project = self.store.create_project('旧配置', '无 teaching_style 键。')
        config = copy.deepcopy(project['config'])
        config.pop('teaching_style', None)
        with self.store.connection() as conn:
            conn.execute('UPDATE projects SET config=%s WHERE id=%s', [Jsonb(config), project['id']])
        reread = self.store.get_project(project['id'])
        self.assertEqual(reread['teaching_style'], 'popular')
        self.assertNotIn('teaching_style', reread['config'])

class TeachingStyleApiOfflineTests(unittest.TestCase):
    def test_create_and_patch_and_manuscript_accept_style(self):
        from fastapi.testclient import TestClient
        from services.api.app import create_app
        from unittest.mock import MagicMock, patch
        app = create_app(authentication=False)
        app.state.store = MagicMock()
        app.state.jobs = MagicMock()
        client = TestClient(app, base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000))

        app.state.store.create_project.return_value = {'id': 'p', 'teaching_style': 'technical'}
        ok = client.post('/api/projects', json={
            'title': 'RAG', 'source_text': '口播。', 'mode': 'script', 'teaching_style': 'technical'})
        self.assertEqual(ok.status_code, 201)
        app.state.store.create_project.assert_called_once()
        kwargs = app.state.store.create_project.call_args.kwargs
        self.assertEqual(kwargs.get('teaching_style'), 'technical')

        bad = client.post('/api/projects', json={
            'title': 'RAG', 'source_text': '口播。', 'mode': 'script', 'teaching_style': 'nope'})
        self.assertIn(bad.status_code, (400, 422))


        from services.workflow.providers import Settings
        offline = Settings('sk', 'deepseek-flash', 'tts', '', '', 'seed-tts-2.0', 'speaker')
        with patch('services.api.app.Settings.from_env', return_value=offline), \
                patch('services.api.app.generate_manuscript', return_value='正文') as gen:
            ms = client.post('/api/manuscripts/generate', json={
                'title': 'RAG', 'teaching_style': 'technical'})
            self.assertEqual(ms.status_code, 200)
            self.assertEqual(gen.call_args.kwargs.get('teaching_style'), 'technical')
