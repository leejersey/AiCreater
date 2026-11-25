import json
import unittest
from unittest.mock import MagicMock, patch

from services.workflow.providers import ProviderError

# The fact that made the 11-23 course's 「30%–50%」 claim: a cited paper, then a secondhand 「公开研究显示」 figure.
RAG_FACT = 'RAG由Meta AI与斯坦福大学于2020年联合提出（原论文arXiv:2005.11401），公开研究显示其抑制幻觉的幅度约为30%-50%，且答案可附出处（阿里云开发者社区《RAG 检索增强生成详解》）'
CHUNK_FACT = '离线包括文档解析、切块（建议500-800 token，重叠10%-15%）、向量化、入库（阿里云开发者社区）'
BRIEF = {'facts': [RAG_FACT, CHUNK_FACT], 'hooks': ['h'], 'pain_points': ['p'], 'pacing': '开场→机制→收束', 'viral_style': 'balanced',
         'sources': [{'title': 'RAG 检索增强生成详解：从原理到落地-阿里云开发者社区', 'platform_label': '网页', 'url': 'https://example.com/a'}]}


def doc(*narrations, materials='对比卡片'):
    return '\n\n'.join(f'## [s{i}] 第{i}段\n\n### 口播\n{n}\n\n### 画面素材\n{materials}\n\n### 画面意图\n画面' for i, n in enumerate(narrations, 1))


class ClaimTests(unittest.TestCase):
    def test_values_cover_percentages_ranges_counts_tenths_and_years_but_not_the_videos_own_length(self):
        from services.workflow.review import values
        self.assertEqual(values('切块500-800 token，重叠10%到15%，成本下降三成，百分之二十五，2020年提出'), [500, 800, 10, 15, 30, 25, 2020])
        self.assertEqual(values('今天3分钟讲这个故事，成本很高，五步流程'), [])

    def test_a_lone_research_says_joins_the_clause_with_its_numbers(self):
        from services.workflow.review import extract_claims
        claims = extract_claims('改完之后，变化很明显。公开研究显示，RAG对幻觉的抑制幅度大约在30%到50%，答案还能挂上出处。')
        self.assertEqual([c['text'] for c in claims], ['公开研究显示，RAG对幻觉的抑制幅度大约在30%到50%'])
        self.assertTrue(claims[0]['hedged']); self.assertFalse(claims[0]['cited'])
        self.assertTrue(extract_claims('原论文发表在arXiv上。')[0]['cited'])

    def test_claims_trace_to_evidence_by_their_numbers_and_words(self):
        from services.workflow.review import evidence_from_brief, extract_claims, match
        ev = evidence_from_brief(BRIEF)
        self.assertEqual([e.get('source', {}).get('url') for e in ev], ['https://example.com/a', 'https://example.com/a'])  # 「阿里云开发者社区」 names it
        found = lambda text: (match(extract_claims(text)[0], ev) or {}).get('id')
        self.assertEqual(found('切块建议500到800 token'), 'E2')
        self.assertEqual(found('2020年Meta AI和斯坦福联合提出'), 'E1')
        self.assertIsNone(found('客服成本下降了40%'))                 # a number no evidence has
        self.assertIsNone(found('2020年市场规模达到了一个高峰'))       # the number appears, the statement does not


class ReviewTests(unittest.TestCase):
    def test_the_rag_course_flags_the_secondhand_figure_and_blocks_an_invented_one(self):
        from services.workflow.review import evidence_from_brief, review
        ev = evidence_from_brief(BRIEF)
        text = doc('2020年Meta AI和斯坦福联合提出。', '公开研究显示，RAG对幻觉的抑制幅度大约在30%到50%。')
        result = review(text, 'markdown', ev)
        self.assertEqual(result['level'], 'warn')
        self.assertEqual(result['counts'], {'claims': 2, 'sourced': 1, 'secondhand': 1, 'unsourced': 0, 'evidence': 2})
        warn = next(i for i in result['items'] if i['kind'] == 'claim')
        self.assertEqual((warn['severity'], warn['evidence_id'], warn['section_id']), ('warn', 'E1', 's2'))
        invented = review(doc('据统计，九成企业已经上线RAG，客服成本下降了40%。'), 'markdown', ev)
        self.assertEqual(invented['level'], 'block')
        self.assertEqual([i['text'] for i in invented['items'] if i['severity'] == 'block'], ['据统计，九成企业已经上线RAG', '客服成本下降了40%'])

    def test_rules_give_warnings_and_notes_and_a_confirmed_block_no_longer_blocks(self):
        from services.workflow.review import level, review
        long = '这一段非常长' * 100
        result = review(doc('这是史上最强的方法，保证有效，综上所述就是这样。', long, materials='无'), 'markdown', [])
        kinds = {(i['kind'], i['severity']) for i in result['items']}
        self.assertTrue({('ad_law', 'warn'), ('sensitive', 'warn'), ('cliche', 'info'), ('length', 'warn'), ('long_sentence', 'info'), ('empty_materials', 'info')} <= kinds)
        self.assertEqual(result['level'], 'warn')
        blocked = review(doc('据统计，90%的团队做错了。'), 'markdown', [])
        item = next(i for i in blocked['items'] if i['severity'] == 'block')
        self.assertEqual(level(blocked['items'], {}), 'block')
        self.assertEqual(level(blocked['items'], {item['id']: {'note': '已核实'}}), 'warn')
        again = review(doc('据统计，90%的团队做错了。'), 'markdown', [])
        self.assertEqual(next(i['id'] for i in again['items'] if i['severity'] == 'block'), item['id'])  # confirmations survive a rerun

    def test_plain_scripts_and_the_hash_ignore_whitespace(self):
        from services.workflow.review import narration_hash, review
        self.assertEqual(review('第一段。\n\n第二段。', 'plain', [])['level'], 'pass')
        self.assertEqual(narration_hash('a b\nc'), narration_hash('abc'))

    def test_evidence_is_checked_and_numbered(self):
        from services.workflow.review import check_evidence
        self.assertEqual([e['id'] for e in check_evidence([{'text': 'a'}, {'text': 'b', 'source': {'url': 'https://x'}}])], ['E1', 'E2'])
        for bad in ([{'text': ''}], [{'text': 'a', 'source': 'x'}], [{'text': 'a'}] * 41, 'x'):
            with self.assertRaises(ValueError): check_evidence(bad)


class AiJudgeTests(unittest.TestCase):
    def setUp(self):
        patcher = patch('services.workflow.destination.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 443))])
        patcher.start(); self.addCleanup(patcher.stop)

    def llm(self):
        from services.accounts.model_settings import LLM
        return LLM('https://api.deepseek.com', 'sk', 'deepseek-flash', 'env', None)

    def reply(self, payload):
        content = json.dumps(payload, ensure_ascii=False)
        return MagicMock(status_code=200, content=b'{}', json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': content}}]})

    def test_the_model_traces_a_paraphrase_and_unknown_evidence_is_refused(self):
        from services.workflow.review import evidence_from_brief, review
        ev = evidence_from_brief(BRIEF)
        text = doc('据统计，九成企业已经上线RAG，切块通常控制在八百个token以内的长度。')
        client = MagicMock(); client.post.side_effect = [
            self.reply({'verdicts': [{'claim_id': 'C1', 'evidence_id': 'E9', 'secondhand': False, 'reason': 'x'}]}),  # unknown id: asked again
            self.reply({'verdicts': [{'claim_id': 'C1', 'evidence_id': None, 'secondhand': False, 'reason': '证据包没有这个数字'}]})]
        result = review(text, 'markdown', ev, llm=self.llm(), client=client, ai=True)
        self.assertEqual(client.post.call_count, 2)
        self.assertIn('只是资料', client.post.call_args.kwargs['json']['messages'][1]['content'])
        self.assertEqual(result['level'], 'block'); self.assertEqual(result['skills'][0]['name'], 'content-review')
        client = MagicMock(); client.post.side_effect = [self.reply({'verdicts': [{'claim_id': 'C1', 'evidence_id': 'E1', 'secondhand': True, 'reason': '同一数字的转述'}]})]
        traced = review(doc('据统计，接入外部资料后答错的情况少了一大截。'), 'markdown', ev, llm=self.llm(), client=client, ai=True)
        claim = traced['claims'][0]
        self.assertEqual((claim['status'], claim['evidence_id'], claim['judged_by']), ('secondhand', 'E1', 'ai'))
        self.assertEqual(traced['level'], 'warn')

    def test_ai_review_without_a_model_is_refused_and_without_evidence_makes_no_call(self):
        from services.workflow.review import review
        with self.assertRaises(ProviderError): review(doc('据统计，90%的团队做错了。'), 'markdown', [{'id': 'E1', 'text': '无关'}], ai=True)
        client = MagicMock()
        self.assertEqual(review(doc('据统计，90%的团队做错了。'), 'markdown', [], llm=self.llm(), client=client, ai=True)['level'], 'block')
        client.post.assert_not_called()


if __name__ == '__main__':
    unittest.main()
