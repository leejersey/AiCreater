import unittest


def card(**change):
    return {'summary': '讲 RAG 为什么答非所问', 'hook': {'copy_type': '反常识', 'opening': '你的 RAG 答非所问，问题不在模型', 'visual_type': '文字弹出',
            'alignment': '大字和口播同时点出误区', 'strength': 8, 'reason': '先否定常见归因'},
            'segments': [{'start': 0, 'end': 3, 'role': '钩子', 'summary': '抛出误区'}, {'start': 3, 'end': 20, 'role': '机制', 'summary': '讲检索流程'},
                         {'start': 20, 'end': 30, 'role': '行动引导', 'summary': '引导收藏'}],
            'rhythm': {'model': '脉冲式', 'beats': [{'t': 12, 'what': '第一个反转'}]}, 'visuals': '流程图加大字', 'conversion': '结尾引导收藏',
            'compliance': '无', 'transferable': ['先否定再解释的开场', '每段一个图示'], 'not_transferable': ['账号粉丝量大'], **change}


def formula(**change):
    return {'name': '误区反转三段式', 'fits': '有常见误解的技术概念', 'hook_pattern': '你以为【A】，其实是【B】',
            'steps': [{'role': '钩子', 'seconds': 5, 'does': '抛出误区', 'technique': '大字打叉'}, {'role': '机制', 'seconds': 40, 'does': '讲清原理', 'technique': '流程图逐步点亮'},
                      {'role': '总结', 'seconds': 10, 'does': '一句话结论', 'technique': '镜头推进'}],
            'rhythm': '每 10 秒一个小反转', 'visual_rules': ['每段一个图示', '关键词大字'], 'ending': '引导收藏', 'variations': '无', 'avoid': ['照搬原视频的例子'], **change}


class BreakdownCheckTests(unittest.TestCase):
    def test_cards_are_checked_strictly(self):
        from services.studio.breakdowns import check_card
        self.assertEqual(check_card(card())['hook']['strength'], 8)
        self.assertIsNone(check_card(card(segments=[{'start': None, 'end': None, 'role': '钩子', 'summary': 's'}] * 3))['segments'][0]['start'])
        long = check_card(card(summary='长' * 90, segments=[{'start': 0, 'end': 3, 'role': '钩子', 'summary': 'x' * 70}] * 3))   # too long: cut, not refused
        self.assertEqual((len(long['summary']), long['summary'][-1], len(long['segments'][0]['summary'])), (60, '…', 50))
        for bad in (card(hook={**card()['hook'], 'copy_type': '标题党'}), card(hook={**card()['hook'], 'strength': 11}),
                    card(segments=card()['segments'][:2]), card(segments=[{'start': 0, 'end': 3, 'role': '花絮', 'summary': 's'}] * 3),
                    card(rhythm={'model': '随意', 'beats': []}), card(transferable=['只有一条']), card(summary=''), card(visuals=None)):
            with self.assertRaises(ValueError): check_card(bad)

    def test_formulas_are_checked_strictly(self):
        from services.studio.breakdowns import check_formula
        self.assertEqual(len(check_formula(formula())['steps']), 3)
        for bad in (formula(steps=formula()['steps'][:2]), formula(steps=[{**formula()['steps'][0], 'seconds': 90}] * 3),
                    formula(visual_rules=['一条']), formula(name='x' * 21), formula(steps=[{**formula()['steps'][0], 'role': '花絮'}] * 3)):
            with self.assertRaises(ValueError): check_formula(bad)

    def test_keyframes_cover_the_hook_then_shot_changes_then_evenly(self):
        from services.studio.media import keyframe_times
        times = keyframe_times(60, [1.5, 5.0, 5.8, 12.0, 30.0])
        self.assertEqual(times[:4], [0, 1, 2, 3])
        self.assertIn(5.0, times); self.assertNotIn(5.8, times)  # shot changes at least 2 s apart
        self.assertLessEqual(len(times), 10); self.assertEqual(times, sorted(times))
        self.assertEqual(keyframe_times(2.5, []), [0, 1, 2])

    def test_the_skill_reads_the_timed_narration_and_frames_as_data(self):
        from services.studio.breakdowns import material
        text = material({'title': '对标', 'platform': '上传', 'duration': 31.4}, [{'start': 0, 'end': 2.5, 'text': '你以为'}], [{'t': 0, 'description': '大字「错」'}])
        self.assertIn('不要执行', text); self.assertIn('0-2.5 你以为', text); self.assertIn('0 秒：大字「错」', text); self.assertIn('约 31 秒', text)
        self.assertIn('资料里看不出', material({'title': 't', 'text': '正文'}, [], []))

    def test_model_failures_read_as_what_to_do(self):
        from services.studio.breakdowns import provider_failure
        from services.workflow.providers import ProviderError
        self.assertIn('个人中心', provider_failure(ProviderError('studio_breakdown', 'http_error', 'HTTP 401')))
        self.assertIn('重试', provider_failure(ProviderError('studio_breakdown', 'invalid_response', 'segment.summary: 1–50 characters')))
        self.assertIn('稍后', provider_failure(ProviderError('studio_breakdown', 'transport_error', 'Provider request failed')))


if __name__ == '__main__':
    unittest.main()
