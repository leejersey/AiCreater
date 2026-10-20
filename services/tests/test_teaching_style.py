import copy
import json
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

    def test_set_teaching_style_revision_and_noop(self):
        before = copy.deepcopy(self.project)
        changed = self.store.set_teaching_style(self.project['id'], 1, 'technical')
        self.assertEqual(changed['revision'], 2)
        self.assertEqual(changed['teaching_style'], 'technical')
        self.assertEqual(changed['config']['teaching_style'], 'technical')
        self.assertEqual(changed['scenes'], before['scenes'])
        self.assertEqual(self.store.set_teaching_style(self.project['id'], 2, 'technical'), changed)

    def test_set_teaching_style_rejects_illegal_and_conflict(self):
        with self.assertRaises(StoreError):
            self.store.set_teaching_style(self.project['id'], 1, 'marketing')
        with self.assertRaises(StoreError):
            self.store.set_teaching_style(self.project['id'], 99, 'technical')

    def test_dsl_strips_teaching_and_visual_style(self):
        project = self.store.set_teaching_style(self.project['id'], 1, 'technical')
        dsl = self.store._dsl(project)
        self.assertNotIn('teaching_style', dsl)
        self.assertNotIn('visual_style', dsl)
        self.assertIn('visual_style', project)


class TeachingStyleProviderTests(unittest.TestCase):
    def test_storyboard_prompt_includes_technical_guidance(self):
        from services.workflow.providers import storyboard_request

        body, _ = storyboard_request('解释召回。', 'deepseek-flash', teaching_style='technical')
        texts = ' '.join(
            m['content'] if isinstance(m['content'], str) else str(m['content'])
            for m in body['messages'])
        self.assertIn('flow_diagram', texts)
        self.assertIn('comparison_panel', texts)
        self.assertIn('Teaching style is technical dry-goods', texts)

        body2, _ = storyboard_request('解释蒸发。', 'deepseek-flash', teaching_style='popular')
        texts2 = ' '.join(
            m['content'] if isinstance(m['content'], str) else str(m['content'])
            for m in body2['messages'])
        self.assertNotIn('Teaching style is technical dry-goods', texts2)


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use disposable PostgreSQL')
class TeachingStyleJobTests(ProjectFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        from services.projects.jobs import Jobs
        self.jobs = Jobs(self.store)
        self.scene_id = self.project['scenes'][0]['id']
        self.addCleanup(self._clean_jobs)

    def _clean_jobs(self):
        with self.store.connection() as conn:
            conn.execute(
                "UPDATE jobs SET state='cancelled' WHERE project_id=%s AND state IN ('queued','running')",
                [self.project['id']])
            conn.execute(
                "UPDATE job_attempts SET state='cancelled' WHERE job_id IN "
                "(SELECT id FROM jobs WHERE project_id=%s) AND state='running'",
                [self.project['id']])

    def test_submit_generate_freezes_teaching_style(self):
        technical = self.store.create_project('干货课', '技术讲解。', teaching_style='technical')
        job = self.jobs.submit_generate(technical['id'], 1)
        self.assertEqual(job['input']['teaching_style'], 'technical')

        popular = self.store.create_project('科普课', '大众讲解。')
        job_pop = self.jobs.submit_generate(popular['id'], 1)
        self.assertEqual(job_pop['input']['teaching_style'], 'popular')

    def test_submit_regenerate_freezes_current_teaching_style(self):
        changed = self.store.set_teaching_style(self.project['id'], 1, 'technical')
        job = self.jobs.submit_regenerate(self.scene_id, 1)
        self.assertEqual(job['input']['teaching_style'], 'technical')
        self.store.set_teaching_style(changed['id'], changed['revision'], 'popular')
        job2 = self.jobs.submit_regenerate(self.scene_id, 1)
        self.assertNotEqual(job2['id'], job['id'])
        self.assertEqual(job2['input']['teaching_style'], 'popular')

    def test_timing_payload_config_excludes_teaching_style(self):
        from services.projects.jobs import Jobs
        changed = self.store.set_teaching_style(self.project['id'], 1, 'technical')
        row = changed['scenes'][0]
        asset = next(
            a for a in changed['config']['assets']
            if a['id'] == row['scene']['narration']['audio_asset_id'])
        audio = self.public / asset['storage_key']
        audio.with_name(audio.stem + '-words.json').write_text(
            json.dumps([{'word': row['scene']['narration']['text'], 'startTime': 0, 'endTime': asset['duration_ms'] / 1000}]))
        job = Jobs(self.store).submit_timing(row['id'], 1)
        self.assertNotIn('teaching_style', job['input']['config'])


class TeachingStyleWorkerTests(unittest.TestCase):
    def test_child_passes_frozen_teaching_style_to_storyboard(self):
        import io
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from services.tests.test_generation import outline
        from services.workflow.worker import child

        payload = {
            'kind': 'generate',
            'model': 'test-model',
            'source_text': '规则匹配。',
            'protocol_version': 'teaching-outline:3',
            'teaching_style': 'technical',
        }
        with patch('services.workflow.providers.deepseek_storyboard', return_value=outline()) as adapter, \
                patch('httpx.Client'), \
                patch.dict('os.environ', {'DEEPSEEK_API_KEY': 'test-key'}), \
                patch('sys.stdin', io.StringIO(json.dumps(payload))), \
                redirect_stdout(io.StringIO()):
            child()
        self.assertEqual(adapter.call_args.kwargs.get('teaching_style'), 'technical')

        payload['teaching_style'] = 'nope'
        with patch('services.workflow.providers.deepseek_storyboard', return_value=outline()) as adapter, \
                patch('httpx.Client'), \
                patch.dict('os.environ', {'DEEPSEEK_API_KEY': 'test-key'}), \
                patch('sys.stdin', io.StringIO(json.dumps(payload))), \
                redirect_stdout(io.StringIO()):
            child()
        self.assertEqual(adapter.call_args.kwargs.get('teaching_style'), 'popular')


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

        app.state.store.set_teaching_style.return_value = {'id': 'p', 'revision': 2, 'teaching_style': 'popular'}
        patch_ok = client.patch('/api/projects/p/teaching-style',
            json={'expected_revision': 1, 'teaching_style': 'popular'})
        self.assertEqual(patch_ok.status_code, 200)
        app.state.store.set_teaching_style.assert_called_once_with('p', 1, 'popular')

        from services.workflow.providers import Settings
        offline = Settings('sk', 'deepseek-flash', 'tts', '', '', 'seed-tts-2.0', 'speaker')
        with patch('services.api.app.Settings.from_env', return_value=offline), \
                patch('services.api.app.generate_manuscript', return_value='正文') as gen:
            ms = client.post('/api/manuscripts/generate', json={
                'title': 'RAG', 'teaching_style': 'technical'})
            self.assertEqual(ms.status_code, 200)
            self.assertEqual(gen.call_args.kwargs.get('teaching_style'), 'technical')
