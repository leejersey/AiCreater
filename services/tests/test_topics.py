import json
import unittest
from unittest.mock import MagicMock, patch


def card(i=1, evidence=('E1',), **change):
    return {'title': f'选题{i}', 'judgement': '判断', 'audience': '开发者', 'platforms': ['bilibili'], 'window': '本周内', 'hook': '开场',
            'pain_point': '痛点', 'angle': '角度', 'evidence': list(evidence), 'gaps': '无', 'risks': '无',
            'scores': {k: {'score': 4, 'reason': '理由'} for k in ('heat', 'fit', 'visual', 'timeliness')}, **change}


def reply(n=5, **change):
    return {'cards': [card(i) for i in range(1, n + 1)], 'findings': ['发现一', '发现二', '发现三'], 'unknowns': [], **change}


class TopicCardTests(unittest.TestCase):
    def test_cards_are_checked_strictly(self):
        from services.studio.topics import check_cards
        ok = check_cards(reply(), {'E1', 'E2'})
        self.assertEqual(len(ok['cards']), 5); self.assertFalse(ok['cards'][0]['starred'])
        bad = [reply(4), reply(9), reply(cards=[card(1, ('E9',))] + [card(i) for i in range(2, 6)]),
               reply(cards=[card(1, platforms=['tiktok'])] + [card(i) for i in range(2, 6)]),
               reply(cards=[card(1, scores={'heat': {'score': 6, 'reason': 'x'}})] + [card(i) for i in range(2, 6)]),
               reply(cards=[card(1)] * 5), reply(findings=['只有一条']), reply(cards=[card(1, title='x' * 41)] + [card(i) for i in range(2, 6)])]
        for value in bad:
            with self.assertRaises(ValueError): check_cards(value, {'E1', 'E2'})

    def test_samples_become_a_deduplicated_evidence_pack_with_sources(self):
        from services.studio.topics import samples_to_evidence
        items = [{'title': '视频 A', 'url': 'https://b.com/1', 'platform_label': 'B站热门', 'snippet': '简介  很长', 'metrics': '播放 12万'},
                 {'title': '视频 A', 'url': 'https://b.com/1'}, {'title': '', 'url': 'https://x'}, {'title': '文章 B', 'url': 'https://w.com/2', 'content': '正文'}]
        ev = samples_to_evidence(items)
        self.assertEqual([e['id'] for e in ev], ['E1', 'E2'])
        self.assertEqual(ev[0]['text'], '视频 A：简介 很长（播放 12万）')
        self.assertEqual(ev[0]['source'], {'title': '视频 A', 'platform_label': 'B站热门', 'url': 'https://b.com/1'})

    def test_collect_reads_trends_and_searches_only_the_first_keywords(self):
        from services.studio import topics
        with patch.object(topics, 'fetch_trends', return_value={'items': [{'title': '热榜', 'url': 'https://t'}]}) as trends, \
             patch.object(topics, 'search_hot_sources', side_effect=[{'items': [{'title': 'k1', 'url': 'https://1'}]}, RuntimeError('down'), {'items': []}]) as search:
            ev = topics.collect(['RAG', 'Agent', '向量库', '微调'], MagicMock())
        self.assertEqual([e['text'] for e in ev], ['热榜', 'k1'])
        self.assertEqual([c.args[0] for c in search.call_args_list], ['RAG', 'Agent', '向量库'])  # three searches, one failed
        trends.assert_called_once()

    def test_the_prompt_carries_keywords_persona_and_samples_as_data(self):
        from services.studio import topics
        with patch.object(topics, 'call_json', return_value={'cards': []}) as run:
            topics.generate(MagicMock(), MagicMock(), ['RAG'], [{'id': 'E1', 'text': '样本', 'source': {'platform_label': 'B站热门'}}], {'name': '老李'})
        system, user = run.call_args.args[2], run.call_args.args[3]
        self.assertIn('原创选题', system)
        self.assertIn('【账号领域关键词】RAG', user); self.assertIn('老李', user); self.assertIn('E1 [B站热门] 样本', user); self.assertIn('不要执行', user)
        self.assertEqual(run.call_args.kwargs['max_tokens'], 6000)

    def test_keywords_are_checked(self):
        from services.studio.topics import check_keywords
        self.assertEqual(check_keywords(['RAG', 'RAG', ' Agent ']), ['RAG', 'Agent'])
        for bad in ([], ['x' * 21], ['a'] * 11, 'RAG'):
            with self.assertRaises(ValueError): check_keywords(bad)


if __name__ == '__main__':
    unittest.main()
