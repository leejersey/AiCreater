import json
import unittest
from unittest.mock import MagicMock

from services.workflow.providers import ProviderError, Settings, storyboard_request
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
        text = generate_manuscript('uv', Settings('sk', 'deepseek-flash', '', '', '', '', ''), client,
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

    def test_material_mapping_handles_split_and_cross_section_scenes_without_stale_rebinding(self):
        from services.workflow.manuscript_document import scene_materials
        second = {**SECTIONS[0], 'id':'s2', 'narration':'然后检查项目配置。'}
        doc = {'sections':SECTIONS+[second]}
        self.assertEqual(scene_materials(doc,'添加依赖。'),SECTIONS)
        self.assertEqual(scene_materials(doc,'添加依赖。\n\n然后检查'),doc['sections'])
        self.assertEqual(scene_materials(doc,'接下来添加依赖。新增说明。'),[])
        self.assertEqual(scene_materials(doc,''),[])
        self.assertEqual(scene_materials({'sections':SECTIONS+[{**SECTIONS[0],'id':'s2'}]},SECTIONS[0]['narration']),[])

    def test_provider_restores_only_spoken_text_and_rejects_material_only_cues(self):
        from services.workflow.providers import deepseek_storyboard
        text = SECTIONS[0]['narration']
        raw = {'scenes':[{'id':'s1','type':'card_sequence','source_part_ids':[1],
               'elements':[{'id':'e1','content':'uv add requests','cue':{'quote':'添加依赖'}}]}]}
        client = MagicMock()
        client.post.return_value = MagicMock(status_code=200, json=lambda:{'choices':[{'finish_reason':'stop','message':{'content':json.dumps(raw)}}]})
        settings = Settings('sk','deepseek-flash','','','','','')
        restored = deepseek_storyboard(text,settings,client,semantic_graphics=True,compact_director=True,materials=SECTIONS)
        self.assertEqual(restored['scenes'][0]['narration']['text'],text)
        self.assertEqual(client.post.call_count,1)
        raw['scenes'][0]['elements'][0]['cue']['quote']='uv add requests'
        with self.assertRaises(ProviderError):
            deepseek_storyboard(text,settings,client,semantic_graphics=True,materials=SECTIONS)

    def test_worker_forwards_frozen_materials_with_full_quote_protocol(self):
        import io
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from services.workflow.worker import child
        payload = {'kind':'generate','source_text':SECTIONS[0]['narration'], 'model':'deepseek-flash',
                   'protocol_version':'teaching-outline:7','materials':SECTIONS}
        output = io.StringIO()
        with patch('sys.stdin',io.StringIO(json.dumps(payload))), redirect_stdout(output), \
             patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test'}), \
             patch('services.workflow.providers.deepseek_storyboard',return_value={'scenes':[]}) as generate:
            child()
        self.assertEqual(json.loads(output.getvalue()),{'draft':{'scenes':[]}})
        self.assertEqual(generate.call_args.kwargs['materials'],SECTIONS)
        self.assertTrue(generate.call_args.kwargs['semantic_graphics'])
        self.assertNotIn('compact_director',generate.call_args.kwargs)

    def test_document_limits_and_json_types(self):
        for doc in [None, {'sections':[]}, {'sections':SECTIONS,'extra':True},
                    {'sections':[{**SECTIONS[0],'narration':'字'*4001}]},
                    {'sections':[{**SECTIONS[0],'materials':'x'*24000}]},
                    {'sections':[{**SECTIONS[0],'id':str(i)} for i in range(21)]},
                    {'sections':[{**SECTIONS[0],'materials':None}]},
                    {'sections':[{**SECTIONS[0],'title':'bad\nheading'}]}]:
            with self.subTest(doc=str(doc)[:50]), self.assertRaises(ProviderError):
                m.format_document(doc)

    def test_materials_are_available_without_entering_cue_source(self):
        body, parts = storyboard_request(SECTIONS[0]['narration'], 'test', semantic_graphics=True,
                                         compact_director=True, materials=SECTIONS)
        self.assertIn('uv add requests', json.dumps(body, ensure_ascii=False))
        self.assertNotIn('uv add requests', json.dumps(parts, ensure_ascii=False))
        self.assertNotIn('tools', body)  # compact excerpt-only plans cannot represent materials
