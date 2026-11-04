import json
import unittest
from unittest.mock import MagicMock

from services.workflow.providers import ProviderError, Settings
from services.workflow import manuscript_document as m
from services.workflow.manuscript import generate_manuscript


SECTIONS = [{'id': 's1', 'title': '添加依赖', 'narration': '接下来添加依赖。',
             'materials': '```bash\nuv add requests\n```', 'visual_intent': '说到添加依赖时展示命令。'}]


class ManuscriptDocumentTests(unittest.TestCase):
    def test_round_trip_isolates_narration(self):
        self.assertTrue(hasattr(m, 'format_document'), 'Markdown document contract is missing')
        text = m.format_document({'sections': SECTIONS})
        doc = m.parse_document(text)
        self.assertEqual(doc['sections'], SECTIONS)
        self.assertEqual(m.narration_text(doc), '接下来添加依赖。')
        self.assertNotIn('uv add', m.narration_text(doc))

    def test_json_generation_returns_editable_markdown(self):
        client = MagicMock()
        client.post.return_value = MagicMock(status_code=200, content=b'{}', json=lambda: {
            'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({'sections': SECTIONS})}}]})
        from unittest.mock import patch
        from services.accounts.model_settings import LLM
        with patch('services.workflow.destination.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 443))]):
            text = generate_manuscript('uv', LLM('https://api.deepseek.com', 'sk', 'deepseek-flash', 'env', None), client,
                                       manuscript_format='markdown')
        self.assertEqual(m.parse_document(text)['sections'], SECTIONS)
        self.assertEqual(client.post.call_args.kwargs['json']['response_format'], {'type': 'json_object'})

    def test_malformed_documents_never_fall_back_to_narration(self):
        self.assertTrue(hasattr(m, 'parse_document'), 'Markdown parser is missing')
        good = m.format_document({'sections': SECTIONS})
        for bad in [good.replace('### 口播', '### 旁白'), good + '\n```',
                    good + '\n\n' + good, 'plain text',
                    good.replace('接下来添加依赖。', '```bash\nuv add requests\n```')]:
            with self.subTest(bad=bad), self.assertRaises(ProviderError):
                m.parse_document(bad)

    def test_fenced_headings_are_material_not_sections(self):
        self.assertTrue(hasattr(m, 'format_document'), 'Markdown contract is missing')
        sections = [{**SECTIONS[0], 'materials': '```markdown\n## [s2] 标题\n### 口播\n不是旁白\n```'}]
        self.assertEqual(m.parse_document(m.format_document({'sections': sections}))['sections'], sections)

    def test_document_limits_and_json_types(self):
        for doc in [None, {'sections':[]}, {'sections':SECTIONS,'extra':True},
                    {'sections':[{**SECTIONS[0],'narration':'字'*4001}]},
                    {'sections':[{**SECTIONS[0],'materials':'x'*24000}]},
                    {'sections':[{**SECTIONS[0],'id':str(i)} for i in range(21)]},
                    {'sections':[{**SECTIONS[0],'materials':None}]},
                    {'sections':[{**SECTIONS[0],'title':'bad\nheading'}]}]:
            with self.subTest(doc=str(doc)[:50]), self.assertRaises(ProviderError):
                m.format_document(doc)
