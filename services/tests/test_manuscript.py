import json
import logging
import unittest
from unittest.mock import MagicMock, patch

from services.workflow.providers import ProviderError, Settings


class ManuscriptHelperTests(unittest.TestCase):
    def settings(self):
        return Settings('sk', 'deepseek-flash', '', 'app', 'ak', 'seed-tts-2.0', 'speaker')

    def test_rejects_blank_title_and_overlong_hints(self):
        from services.workflow import manuscript as m
        with self.assertRaises(ProviderError):
            m.generate_manuscript('', self.settings(), MagicMock())
        with self.assertRaises(ProviderError):
            m.generate_manuscript('题', self.settings(), MagicMock(), audience='x' * 81)

    def test_happy_path_returns_text_and_logs(self):
        from services.workflow import manuscript as m
        client = MagicMock()
        client.post.return_value = MagicMock(
            status_code=200, content=b'{}',
            json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': '蒸发发生在液体表面。'}}],
                          'usage': {'prompt_tokens': 1, 'completion_tokens': 2}})
        with self.assertLogs('services.workflow.manuscript', level='INFO') as logs:
            text = m.generate_manuscript('蒸发', self.settings(), client, user_id='u1',
                                         audience='初中', duration_hint='3分钟', outline='定义→例子',
                                         teaching_style='technical')
        self.assertEqual(text, '蒸发发生在液体表面。')
        self.assertTrue(any('manuscript_generate' in r.getMessage() for r in logs.records))
        body = client.post.call_args.kwargs['json']
        self.assertEqual(body['messages'][0]['role'], 'system')
        self.assertIn('要点', body['messages'][0]['content'])
        self.assertIn('蒸发', body['messages'][1]['content'])
        self.assertIn('必须覆盖的要点：定义→例子', body['messages'][1]['content'])
        self.assertIn('干货', body['messages'][1]['content'])

    def test_empty_or_overlong_model_text_raises(self):
        from services.workflow import manuscript as m
        client = MagicMock()
        client.post.return_value = MagicMock(
            status_code=200, content=b'{}',
            json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': '   '}}]})
        with self.assertRaises(ProviderError):
            m.generate_manuscript('题', self.settings(), client)
        client.post.return_value.json = lambda: {
            'choices': [{'finish_reason': 'stop', 'message': {'content': '字' * 4001}}]}
        with self.assertRaises(ProviderError) as ctx:
            m.generate_manuscript('题', self.settings(), client)
        self.assertEqual(ctx.exception.code, 'output_limit')

    def test_technical_vs_popular_prompts(self):
        from services.workflow import manuscript as m
        client = MagicMock()
        client.post.return_value = MagicMock(
            status_code=200, content=b'{}',
            json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': '口播正文。'}}],
                          'usage': {'prompt_tokens': 1, 'completion_tokens': 1}})
        m.generate_manuscript('RAG', self.settings(), client, teaching_style='technical', outline='')
        tech_system = client.post.call_args.kwargs['json']['messages'][0]['content']
        self.assertIn('机制', tech_system)
        self.assertIn('这里不展开', tech_system)
        tech_user = client.post.call_args.kwargs['json']['messages'][1]['content']
        self.assertIn('机制', tech_user)
        self.assertIn('术语', tech_user)

        m.generate_manuscript('蒸发', self.settings(), client, teaching_style='popular', outline='')
        pop_system = client.post.call_args.kwargs['json']['messages'][0]['content']
        pop_user = client.post.call_args.kwargs['json']['messages'][1]['content']
        self.assertNotEqual(tech_system, pop_system)
        self.assertNotIn('这里不展开', pop_system)
        self.assertNotEqual(tech_user, pop_user)

    def test_rejects_bad_teaching_style(self):
        from services.workflow import manuscript as m
        with self.assertRaises(ProviderError):
            m.generate_manuscript('题', self.settings(), MagicMock(), teaching_style='nope')


class ManuscriptApiOfflineTests(unittest.TestCase):
    def test_route_validates_and_maps_errors(self):
        from fastapi.testclient import TestClient
        from services.api.app import create_app
        from unittest.mock import patch, MagicMock
        from services.workflow.providers import ProviderError
        store = MagicMock()
        app = create_app(store, authentication=False)
        app.state.jobs = MagicMock()
        client = TestClient(app, base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000))
        bad = client.post('/api/manuscripts/generate', json={'title': ''})
        self.assertIn(bad.status_code, (400, 422))
        offline = Settings('sk', 'deepseek-flash', 'tts', '', '', 'seed-tts-2.0', 'speaker')
        with patch('services.api.app.Settings.from_env', return_value=offline), \
                patch('services.api.app.generate_manuscript', return_value='讲稿正文') as gen:
            ok = client.post('/api/manuscripts/generate', json={
                'title': '蒸发', 'audience': '初中', 'duration_hint': '3分钟', 'outline': '定义'})
            self.assertEqual(ok.status_code, 200)
            self.assertEqual(ok.json(), {'text': '讲稿正文'})
            gen.assert_called_once()
            self.assertEqual(gen.call_args.args[0], '蒸发')
            self.assertEqual(gen.call_args.kwargs['audience'], '初中')
            self.assertEqual(gen.call_args.kwargs['duration_hint'], '3分钟')
            self.assertEqual(gen.call_args.kwargs['outline'], '定义')
        with patch('services.api.app.Settings.from_env', return_value=offline), \
                patch('services.api.app.generate_manuscript', side_effect=ProviderError('manuscript', 'output_limit', 'too long')):
            over = client.post('/api/manuscripts/generate', json={'title': '蒸发'})
            self.assertEqual(over.status_code, 422)
            self.assertEqual(over.json()['code'], 'output_limit')
        with patch('services.api.app.Settings.from_env', return_value=offline), \
                patch('services.api.app.generate_manuscript', side_effect=ProviderError('config', 'missing_setting', 'DEEPSEEK_API_KEY')):
            missing = client.post('/api/manuscripts/generate', json={'title': '蒸发'})
            self.assertEqual(missing.status_code, 503)
            self.assertEqual(missing.json()['code'], 'missing_setting')
        with patch('services.api.app.Settings.from_env', return_value=offline), \
                patch('services.api.app.generate_manuscript', side_effect=ProviderError('manuscript', 'transport_error', 'down')):
            down = client.post('/api/manuscripts/generate', json={'title': '蒸发'})
            self.assertEqual(down.status_code, 502)
            self.assertEqual(down.json()['code'], 'transport_error')
        store.create_project.assert_not_called()
        if hasattr(app.state.jobs, 'submit_generate'):
            app.state.jobs.submit_generate.assert_not_called()
