import json
import unittest
from unittest.mock import MagicMock, patch

from services.workflow.providers import ProviderError


def angle(structure='problem', depth='intro', title=None, **change):
    return {'title': title or f'{structure} 的方向', 'hook': '你问它昨天的新闻，它答得头头是道。', 'audience': '刚接触大模型的人',
            'takeaway': '说清 RAG 解决什么问题', 'structure': structure, 'depth': depth, 'duration_min': 3,
            'chapters': ['幻觉从哪来', '外挂知识库', '检索再生成'], **change}


def outline(*seconds):
    return {'sections': [{'title': f'第{i}章', 'points': ['要点'], 'picture': '答题的模型，答案被划掉', 'seconds': s}
                         for i, s in enumerate(seconds or (40, 50), 1)]}


def reply(payload, finish='stop'):
    content = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    return MagicMock(status_code=200, content=b'{}', json=lambda: {'choices': [{'finish_reason': finish, 'message': {'content': content}}]})


FOUR = [angle('problem', 'intro'), angle('journey', 'intro'), angle('myth', 'intermediate'), angle('history', 'advanced')]


class IdeationTests(unittest.TestCase):
    def setUp(self):
        patcher = patch('services.workflow.destination.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 443))])
        patcher.start(); self.addCleanup(patcher.stop)

    def llm(self, **change):
        from services.accounts.model_settings import LLM
        return LLM(**{'base_url': 'https://api.deepseek.com', 'api_key': 'sk', 'model': 'deepseek-flash', 'source': 'env', 'version': None, **change})

    def client(self, *replies):
        client = MagicMock(); client.post.side_effect = list(replies); return client

    def test_four_distinct_angles_from_one_json_call(self):
        from services.workflow import ideation
        client = self.client(reply({'angles': FOUR}))
        angles = ideation.generate_angles(self.llm(), client, topic='RAG', notes='讲给做客服系统的同事', audience='开发者',
                                          teaching_style='technical', exclude=['什么是 RAG'])
        self.assertEqual([a['structure'] for a in angles], ['problem', 'journey', 'myth', 'history'])
        self.assertTrue(all(a['scope'] == 'single' for a in angles))
        body = client.post.call_args.kwargs['json']
        self.assertEqual((body['response_format'], body['thinking']), ({'type': 'json_object'}, {'type': 'disabled'}))
        user = body['messages'][1]['content']
        for text in ('选题：RAG', '补充想法：讲给做客服系统的同事', '受众：开发者', '知识干货', '什么是 RAG', '请给出 4 个方向'):
            self.assertIn(text, user)
        self.assertIn('互不相同', body['messages'][0]['content'])

    def test_a_reply_that_repeats_a_structure_is_asked_for_once_more(self):
        from services.workflow import ideation
        repeated = [angle('problem', 'intro'), angle('problem', 'intermediate', title='另一个'), FOUR[2], FOUR[3]]
        client = self.client(reply({'angles': repeated}), reply({'angles': FOUR}))
        self.assertEqual(len(ideation.generate_angles(self.llm(), client, topic='RAG')), 4)
        self.assertEqual(client.post.call_count, 2)
        retry = client.post.call_args.kwargs['json']['messages']
        self.assertEqual(retry[2]['role'], 'assistant'); self.assertIn('structures must differ', retry[3]['content'])

    def test_two_failed_replies_fail_the_call_without_half_a_result(self):
        from services.workflow import ideation
        one_depth = [angle(s, 'intro', title=s) for s in ('problem', 'journey', 'myth', 'history')]
        for bad in ('不是 JSON', {'angles': FOUR[:3]}, {'angles': one_depth}, {'angles': [angle(duration_min=30)] + FOUR[1:]}):
            client = self.client(reply(bad), reply(bad))
            with self.assertRaises(ProviderError) as ctx:
                ideation.generate_angles(self.llm(), client, topic='RAG')
            self.assertEqual(ctx.exception.code, 'invalid_response')
            self.assertEqual(client.post.call_count, 2)
        with self.assertRaises(ProviderError):  # cut off: treated as a failed reply, asked again, then fails
            ideation.generate_angles(self.llm(), self.client(reply({'angles': FOUR}, 'length'), reply('', 'length')), topic='RAG')

    def test_the_persons_own_direction_and_a_merge_each_make_one_card(self):
        from services.workflow import ideation
        client = self.client(reply({'angles': [angle('howto')]}))
        self.assertEqual(ideation.generate_angles(self.llm(), client, topic='RAG', custom='用客服工单举例')[0]['structure'], 'howto')
        self.assertIn('用户自己想到的方向：用客服工单举例', client.post.call_args.kwargs['json']['messages'][1]['content'])
        client = self.client(reply({'angles': [angle('story')]}))
        ideation.generate_angles(self.llm(), client, topic='RAG', merge=[FOUR[0], FOUR[2]])
        self.assertIn('融合', client.post.call_args.kwargs['json']['messages'][1]['content'])

    def test_outline_checks_seconds_and_carries_previous_version_and_feedback(self):
        from services.workflow import ideation
        client = self.client(reply(outline(40, 60, 50)))
        result = ideation.generate_outline(self.llm(), client, topic='RAG', angle=FOUR[0], previous=outline(40, 50), feedback='第 2 章换成客服例子')
        self.assertEqual([s['seconds'] for s in result['sections']], [40, 60, 50])
        user = client.post.call_args.kwargs['json']['messages'][1]['content']
        self.assertIn('上一版大纲', user); self.assertIn('修改意见：第 2 章换成客服例子', user)
        for bad in (outline(120), outline(*[110] * 8), {'sections': []}, outline(40) | {'sections': [{'title': 't', 'points': [], 'picture': 'p', 'seconds': 40}]}):
            with self.assertRaises(ValueError): ideation.check_outline(bad)

    def test_a_missing_key_fails_before_any_call(self):
        from services.workflow import ideation
        client = self.client()
        with self.assertRaises(ProviderError) as ctx: ideation.generate_angles(self.llm(api_key=''), client, topic='RAG')
        self.assertEqual(ctx.exception.code, 'missing_setting'); client.post.assert_not_called()

    def test_origin_is_single_video_only_for_now(self):
        from services.workflow import ideation
        origin = {'topic': 'RAG', 'notes': '', 'angle': FOUR[0], 'outline': outline()}
        self.assertEqual(ideation.check_origin(origin)['series_id'], None)
        self.assertIsNone(ideation.check_origin(None))
        for bad in ({**origin, 'scope': 'series'}, {**origin, 'series_id': 'x'}, {**origin, 'angle': angle(scope='series')}, {**origin, 'notes': 'x' * 301}):
            with self.assertRaises(ValueError): ideation.check_origin(bad)
        line = ideation.direction_line(ideation.check_origin(origin))
        self.assertIn('本课方向', line); self.assertIn('问题驱动', line); self.assertIn('入门', line)

    def test_a_chosen_plan_steers_the_manuscript_chapter_by_chapter(self):
        from services.workflow import manuscript as m
        client = MagicMock()
        client.post.return_value = reply('口播。')
        m.generate_manuscript('RAG', self.llm(), client, plan={'angle': FOUR[0], 'outline': outline(40, 50)})
        user = client.post.call_args.kwargs['json']['messages'][1]['content']
        self.assertIn('必须按这份大纲写', user); self.assertIn('1. 第1章（约 40 秒）', user); self.assertIn('画面构想：答题的模型', user)
        with self.assertRaises(ProviderError) as ctx:
            m.generate_manuscript('RAG', self.llm(), client, plan={'angle': FOUR[0], 'outline': outline(400)})
        self.assertEqual(ctx.exception.code, 'input_limit')

    def test_the_agent_brief_carries_the_course_direction_and_old_courses_are_unchanged(self):
        from services.visual.contract import measured_input
        from services.workflow import ideation
        text = '大模型会编造答案。'
        row = {'id': 's1', 'state': 'ready', 'revision': 1, 'scene': {'narration': {'text': text, 'audio_asset_id': 'v'}, 'duration_frames': 60,
               'captions': [{'text': text, 'start_frame': 0, 'end_frame': 60}]}}
        project = {'title': 'RAG', 'config': {'assets': [{'id': 'v', 'checksum': 'c'}]}}
        plain = measured_input(project, row)['brief']['visualGoal']
        self.assertNotIn('本课方向', plain)
        project['config']['origin'] = ideation.check_origin({'topic': 'RAG', 'angle': FOUR[2], 'outline': outline()})
        goal = measured_input(project, row)['brief']['visualGoal']
        self.assertTrue(goal.startswith(plain)); self.assertIn('本课方向', goal); self.assertIn('误区纠正', goal)


if __name__ == '__main__':
    unittest.main()
