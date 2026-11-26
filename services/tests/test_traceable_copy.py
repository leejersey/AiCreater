"""P4: copy written from a topic card, a confirmed formula and the evidence pack, each fact cited as [E…] for the review."""
import json
import unittest
from unittest.mock import MagicMock, patch

from services.workflow.providers import ProviderError


def brief():
    from services.tests.test_review import BRIEF
    return dict(BRIEF)


class TraceableCopyTests(unittest.TestCase):
    def setUp(self):
        patcher = patch('services.workflow.destination.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 443))])
        patcher.start(); self.addCleanup(patcher.stop)

    def llm(self):
        from services.accounts.model_settings import LLM
        return LLM('https://api.deepseek.com', 'sk', 'deepseek-flash', 'env', None)

    def reply(self, payload):
        content = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        return MagicMock(status_code=200, content=b'{}', json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': content}}]})

    def test_facts_carry_the_same_numbers_as_the_course_evidence_pack(self):
        from services.workflow.research import brief_lines, check_brief
        from services.workflow.review import evidence_from_brief
        lines = brief_lines(check_brief(brief()))
        ids = [e['id'] for e in evidence_from_brief(brief())]
        self.assertEqual(ids, ['E1', 'E2'])
        self.assertTrue(any(l.startswith('- E1 RAG由Meta AI') for l in lines)); self.assertTrue(any(l.startswith('- E2 离线包括') for l in lines))

    def test_a_storyboard_from_research_and_a_formula_cites_its_facts_and_follows_the_steps(self):
        from services.workflow import manuscript as m
        from services.tests.test_breakdowns import formula
        section = {'id': 's1', 'title': '开场', 'narration': '2020年Meta AI和斯坦福联合提出了RAG。', 'materials': '时间线\n依据：[E1]', 'visual_intent': '画面'}
        client = MagicMock(); client.post.side_effect = [self.reply({'sections': [section]})]
        text = m.generate_manuscript('RAG', self.llm(), client, manuscript_format='markdown', research=brief(), formula=formula())
        self.assertIn('依据：[E1]', text)
        user = client.post.call_args.kwargs['json']['messages'][1]['content']
        self.assertIn('依据：[E1][E3]', user); self.assertIn('narration 里绝不出现', user)
        self.assertIn('【爆款公式「误区反转三段式」', user); self.assertIn('1. 钩子，约 5 秒：抛出误区；手法：大字打叉', user)
        with self.assertRaises(ProviderError) as ctx:
            m.generate_manuscript('RAG', self.llm(), client, manuscript_format='markdown', formula={'name': 'x'})
        self.assertEqual(ctx.exception.code, 'input_limit')

    def test_an_evidence_id_read_aloud_is_sent_back_once(self):
        from services.workflow import manuscript as m
        bad = {'id': 's1', 'title': '开场', 'narration': '2020年提出[E1]。', 'materials': '时间线', 'visual_intent': '画面'}
        good = {**bad, 'narration': '2020年提出。', 'materials': '时间线\n依据：[E1]'}
        client = MagicMock(); client.post.side_effect = [self.reply({'sections': [bad]}), self.reply({'sections': [good]})]
        m.generate_manuscript('RAG', self.llm(), client, manuscript_format='markdown', research=brief())
        self.assertIn('口播里有证据编号', client.post.call_args.kwargs['json']['messages'][-1]['content'])

    def test_the_outline_follows_the_formula(self):
        from services.workflow import ideation
        from services.tests.test_ideation import FOUR, outline
        from services.tests.test_breakdowns import formula
        with patch.object(ideation, 'call_json', return_value=ideation.check_outline(outline())) as run:
            ideation.generate_outline(self.llm(), MagicMock(), topic='RAG', angle=FOUR[0], formula=formula())
        self.assertIn('章节按公式的步骤安排', run.call_args.args[3])
        origin = ideation.check_origin({'topic': 'RAG', 'angle': FOUR[0], 'outline': outline(), 'formula': formula()})
        self.assertEqual(origin['formula']['name'], '误区反转三段式')
        with self.assertRaises(ValueError): ideation.check_origin({'topic': 'RAG', 'angle': FOUR[0], 'outline': outline(), 'formula': {'name': 'x'}})

    def test_the_review_tries_the_evidence_a_section_cites_and_flags_unknown_ids(self):
        from services.workflow.review import review
        evidence = [{'id': 'E1', 'text': '公开研究显示，2020年后检索增强能把幻觉减少30%'},
                    {'id': 'E2', 'text': '据阿里云《RAG 实践白皮书》，2020年后检索增强能把幻觉减少30%'}]
        doc = ('## [s1] 第1段\n\n### 口播\n2020年后检索增强能把幻觉减少30%。\n\n### 画面素材\n柱状图\n依据：[E2][E9]\n\n### 画面意图\n画面')
        result = review(doc, 'markdown', evidence)
        claim = result['claims'][0]
        self.assertEqual((claim['evidence_id'], claim['cited_by_section'], claim['status']), ('E2', True, 'sourced'))  # the cited, better-sourced one
        bad = next(i for i in result['items'] if i['kind'] == 'bad_ref')
        self.assertEqual((bad['severity'], bad['text']), ('warn', 'E9'))
        uncited = review(doc.replace('依据：[E2][E9]', ''), 'markdown', evidence)['claims'][0]
        self.assertFalse(uncited['cited_by_section'])

    def test_the_agent_never_sees_evidence_ids(self):
        from services.visual.contract import measured_input
        text = '2020年提出。'
        row = {'id': 's1', 'state': 'ready', 'revision': 1, 'scene': {'narration': {'text': text, 'audio_asset_id': 'v'}, 'duration_frames': 60,
               'captions': [{'text': text, 'start_frame': 0, 'end_frame': 60}]}}
        section = {'id': 's1', 'title': '开场', 'narration': text, 'materials': '时间线：2020[E1]\n依据：[E1][E3]', 'visual_intent': 'v'}
        project = {'title': 't', 'config': {'assets': [{'id': 'v', 'checksum': 'c'}], 'manuscript': {'sections': [section]}}}
        self.assertEqual(measured_input(project, row)['brief']['materials'], ['时间线：2020'])


if __name__ == '__main__':
    unittest.main()
