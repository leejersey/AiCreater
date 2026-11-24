import json
import logging
import unittest
from unittest.mock import MagicMock, patch

from services.workflow.providers import ProviderError, Settings


class ManuscriptHelperTests(unittest.TestCase):
    def setUp(self):
        # No DNS in unit tests: the destination check answers with a public address.
        patcher = patch('services.workflow.destination.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 443))])
        patcher.start(); self.addCleanup(patcher.stop)

    def test_an_account_model_is_called_at_its_own_url_with_its_key_and_no_deepseek_switch(self):
        from services.workflow import manuscript as m
        client = MagicMock()
        client.post.return_value = MagicMock(status_code=200, content=b'{}',
            json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': '正文。'}}]})
        m.generate_manuscript('蒸发', self.settings(base_url='https://api.example.com/v1', api_key='own', model='deepseek-flash', source='account'), client)
        args, kwargs = client.post.call_args
        self.assertEqual(args[0], 'https://93.184.216.34/v1/chat/completions')
        self.assertEqual((kwargs['headers']['Host'], kwargs['headers']['Authorization']), ('api.example.com', 'Bearer own'))
        self.assertNotIn('thinking', kwargs['json'])  # same model name, but not DeepSeek's endpoint
        m.generate_manuscript('蒸发', self.settings(), client)
        self.assertEqual(client.post.call_args.kwargs['json']['thinking'], {'type': 'disabled'})
        with self.assertRaises(ProviderError):
            m.generate_manuscript('蒸发', self.settings(api_key=''), client)

    def settings(self, **change):
        from services.accounts.model_settings import LLM
        return LLM(**{'base_url': 'https://api.deepseek.com', 'api_key': 'sk', 'model': 'deepseek-flash', 'source': 'env', 'version': None, **change})

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
        app.state.jobs = MagicMock(); app.state.store = store  # no lifespan here; resolve_llm is patched below
        client = TestClient(app, base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000))
        bad = client.post('/api/manuscripts/generate', json={'title': ''})
        self.assertIn(bad.status_code, (400, 422))
        offline = Settings('sk', 'deepseek-flash', 'tts', '', '', 'seed-tts-2.0', 'speaker')
        with patch('services.api.app.resolve_llm', return_value=offline), \
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
        with patch('services.api.app.resolve_llm', return_value=offline), \
                patch('services.api.app.generate_manuscript', side_effect=ProviderError('manuscript', 'output_limit', 'too long')):
            over = client.post('/api/manuscripts/generate', json={'title': '蒸发'})
            self.assertEqual(over.status_code, 422)
            self.assertEqual(over.json()['code'], 'output_limit')
        with patch('services.api.app.resolve_llm', return_value=offline), \
                patch('services.api.app.generate_manuscript', side_effect=ProviderError('config', 'missing_setting', 'DEEPSEEK_API_KEY')):
            missing = client.post('/api/manuscripts/generate', json={'title': '蒸发'})
            self.assertEqual(missing.status_code, 503)
            self.assertEqual(missing.json()['code'], 'missing_setting')
        with patch('services.api.app.resolve_llm', return_value=offline), \
                patch('services.api.app.generate_manuscript', side_effect=ProviderError('manuscript', 'transport_error', 'down')):
            down = client.post('/api/manuscripts/generate', json={'title': '蒸发'})
            self.assertEqual(down.status_code, 502)
            self.assertEqual(down.json()['code'], 'transport_error')
        store.create_project.assert_not_called()
        if hasattr(app.state.jobs, 'submit_generate'):
            app.state.jobs.submit_generate.assert_not_called()


class DocumentRetryTests(unittest.TestCase):
    """A storyboard that fails the document check is asked for once more, with the reason."""
    def setUp(self):
        patcher = patch('services.workflow.destination.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 443))])
        patcher.start(); self.addCleanup(patcher.stop)

    def llm(self):
        from services.accounts.model_settings import LLM
        return LLM('https://api.deepseek.com', 'sk', 'deepseek-flash', 'env', None)

    def reply(self, payload):
        content = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        return MagicMock(status_code=200, content=b'{}', json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': content}}]})

    def test_a_document_with_a_blank_field_is_asked_for_again_with_the_reason(self):
        from services.workflow import manuscript as m
        from services.tests.test_manuscript_document import SECTIONS
        blank = {'sections': [{**SECTIONS[0], 'materials': ''}]}
        client = MagicMock(); client.post.side_effect = [self.reply(blank), self.reply({'sections': SECTIONS})]
        result = m.convert_article_to_manuscript('一篇关于依赖管理的长文' * 5, self.llm(), client, duration_hint='3分钟')
        self.assertIn('## [s1] 添加依赖', result['text']); self.assertEqual(result['title'], '添加依赖')
        retry = client.post.call_args.kwargs['json']['messages']
        self.assertEqual(retry[-2]['role'], 'assistant'); self.assertIn('段 s1 有空字段', retry[-1]['content'])
        first_prompt = client.post.call_args_list[0].kwargs['json']['messages'][1]['content']
        self.assertIn('口播合计约 900 字', first_prompt); self.assertIn('分 4–7 段', first_prompt)

    def test_two_bad_documents_fail_with_a_clear_reason_and_the_route_reports_a_provider_error(self):
        from services.workflow import manuscript as m
        client = MagicMock(); client.post.side_effect = [self.reply('不是 JSON'), self.reply({'sections': []})]
        with self.assertRaises(ProviderError) as ctx:
            m.generate_manuscript('题', self.llm(), client, manuscript_format='markdown')
        self.assertEqual(ctx.exception.code, 'invalid_response'); self.assertIn('sections 须为 1–20 段', str(ctx.exception))
        self.assertEqual(client.post.call_count, 2)
        # The route maps it as a provider failure (502), not as an invalid request (422): ProviderError is a ValueError.
        from fastapi.testclient import TestClient
        from services.api.app import create_app
        with patch('services.api.app.resolve_llm', return_value=self.llm()), \
             patch('services.api.app.convert_article_to_manuscript', side_effect=ctx.exception):
            with TestClient(create_app(MagicMock(), authentication=False), base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000)) as api:
                response = api.post('/api/manuscripts/from-article', json={'article_text': '一篇足够长的文章内容，至少要有二十个字符才行。'})
        self.assertEqual((response.status_code, response.json()['code']), (502, 'invalid_response'))

    def test_far_too_long_a_script_is_asked_once_to_compress_and_the_second_reply_is_kept(self):
        from services.workflow import manuscript as m
        section = lambda i, n: {'id': f's{i}', 'title': f'第{i}段', 'narration': '字' * n, 'materials': '无', 'visual_intent': '画面'}
        long = {'sections': [section(i, 400) for i in range(1, 5)]}      # 1600 chars for a 3-minute (900) budget
        fits = {'sections': [section(i, 220) for i in range(1, 5)]}      # 880
        client = MagicMock(); client.post.side_effect = [self.reply(long), self.reply(fits)]
        result = m.convert_article_to_manuscript('一篇关于依赖管理的长文' * 5, self.llm(), client, duration_hint='3分钟')
        self.assertEqual(result['text'].count('字' * 220), 4)
        self.assertIn('口播合计 1606 字', client.post.call_args.kwargs['json']['messages'][-1]['content'])
        client = MagicMock(); client.post.side_effect = [self.reply(long), self.reply(long)]
        self.assertEqual(m.convert_article_to_manuscript('一篇关于依赖管理的长文' * 5, self.llm(), client)['text'].count('字' * 400), 4)
        client = MagicMock(); client.post.side_effect = [self.reply(fits)]
        m.convert_article_to_manuscript('一篇关于依赖管理的长文' * 5, self.llm(), client)
        self.assertEqual(client.post.call_count, 1)  # within budget: one call

    def test_a_field_that_reads_back_as_a_new_heading_is_named_in_the_retry(self):
        from services.workflow import manuscript as m
        from services.tests.test_manuscript_document import SECTIONS
        heading = {'sections': [{**SECTIONS[0], 'materials': '对比\n### 画面意图\n伪造的标题'}]}
        client = MagicMock(); client.post.side_effect = [self.reply(heading), self.reply({'sections': SECTIONS})]
        m.convert_article_to_manuscript('一篇关于依赖管理的长文' * 5, self.llm(), client)
        self.assertIn('以 # 开头的行', client.post.call_args.kwargs['json']['messages'][-1]['content'])
